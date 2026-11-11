import json
import mimetypes
import os
import re
import base64
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, parse, request


ROOT = Path(__file__).resolve().parent
SECRETS_FILE = ROOT.parent / "secrets" / "workmemo.env"
UPLOAD_DIR = ROOT / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def load_env_file(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip().lstrip("\ufeff")
        value = value.strip().strip('"').strip("'")
        if value and not os.environ.get(key):
            os.environ[key] = value


load_env_file(SECRETS_FILE)

DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY", "")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")
DASHSCOPE_ASR_MODEL = os.environ.get("DASHSCOPE_ASR_MODEL", "paraformer-v2")
DASHSCOPE_AUDIO_MODEL = os.environ.get("DASHSCOPE_AUDIO_MODEL", "qwen-audio-turbo-latest")


def json_bytes(payload):
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def read_json(handler):
    length = int(handler.headers.get("Content-Length", "0") or "0")
    raw = handler.rfile.read(length) if length else b"{}"
    return json.loads(raw.decode("utf-8") or "{}")


def parse_multipart_audio(handler):
    content_type = handler.headers.get("Content-Type", "")
    match = re.search(r"boundary=([^;]+)", content_type)
    if not match:
        raise ValueError("缺少 multipart boundary")
    boundary = match.group(1).strip().strip('"').encode("utf-8")
    length = int(handler.headers.get("Content-Length", "0") or "0")
    body = handler.rfile.read(length)
    marker = b"--" + boundary

    for part in body.split(marker):
        if b'name="audio"' not in part:
            continue
        header_blob, _, file_blob = part.partition(b"\r\n\r\n")
        if not file_blob:
            continue
        filename_match = re.search(rb'filename="([^"]+)"', header_blob)
        filename = filename_match.group(1).decode("utf-8", errors="replace") if filename_match else "audio.webm"
        file_blob = file_blob.rstrip(b"\r\n-")
        return filename, file_blob
    raise ValueError("缺少 audio 文件字段")


def api_error(handler, status, message, **extra):
    handler.send_json({"ok": False, "error": message, **extra}, status=status)


def http_json(method, url, payload=None, headers=None, timeout=60):
    body = json_bytes(payload) if payload is not None else None
    req = request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
      req.add_header(key, value)
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{exc.code} {detail}") from exc
    except error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(f"网络连接失败：{reason}") from exc


def submit_dashscope_transcription(audio_url):
    if not DASHSCOPE_API_KEY:
        raise RuntimeError("缺少 DASHSCOPE_API_KEY 环境变量")

    payload = {
        "model": DASHSCOPE_ASR_MODEL,
        "input": {
            "file_urls": [audio_url]
        },
        "parameters": {
            "language_hints": ["zh"]
        }
    }
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "X-DashScope-Async": "enable"
    }
    return http_json(
        "POST",
        "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription",
        payload,
        headers=headers,
        timeout=60,
    )


def transcribe_dashscope_audio_file(filename, data):
    if not DASHSCOPE_API_KEY:
        raise RuntimeError("缺少 DASHSCOPE_API_KEY 环境变量")

    mime_type = mimetypes.guess_type(filename)[0] or "audio/webm"
    audio_base64 = base64.b64encode(data).decode("ascii")
    audio_data_url = f"data:{mime_type};base64,{audio_base64}"
    payload = {
        "model": DASHSCOPE_AUDIO_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "请完整转写这段音频中的中文内容，并尽量区分不同说话人。输出格式必须是逐行文本，例如：说话人 1：内容。说话人 2：内容。不要总结，不要解释。"
                    },
                    {
                        "type": "audio_url",
                        "audio_url": {
                            "url": audio_data_url
                        }
                    }
                ]
            }
        ],
        "temperature": 0
    }
    headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}
    response = http_json(
        "POST",
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        payload,
        headers=headers,
        timeout=120,
    )
    return response["choices"][0]["message"]["content"].strip()


def fetch_dashscope_task(task_id):
    if not DASHSCOPE_API_KEY:
        raise RuntimeError("缺少 DASHSCOPE_API_KEY 环境变量")

    headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}
    return http_json(
        "GET",
        f"https://dashscope.aliyuncs.com/api/v1/tasks/{parse.quote(task_id)}",
        headers=headers,
        timeout=60,
    )


def flatten_dashscope_text(task_result):
    output = task_result.get("output", {})
    results = output.get("results") or output.get("transcription_result") or []
    if isinstance(results, dict):
        results = [results]

    texts = []
    for item in results:
        for key in ("transcription", "text", "sentence", "content"):
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                texts.append(value.strip())
        sentences = item.get("sentences") or []
        for sentence in sentences:
            text = sentence.get("text") or sentence.get("sentence")
            if text:
                texts.append(text.strip())
    return "。".join(dict.fromkeys(texts))


def deepseek_structure(payload):
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("缺少 DEEPSEEK_API_KEY 环境变量")

    transcript = payload.get("transcript", "")
    scene_type = payload.get("scene_type", "free")
    analysis_template = payload.get("analysis_template") or {}
    template_guides = {
        "sales": {
            "template_name": "销售拜访分析模板",
            "purpose": "把销售沟通转成客户画像、需求判断、成交机会和跟进计划。",
            "template_output_schema": {
                "customer_profile": "客户是谁、所属行业/角色、当前背景，不明确写未明确",
                "needs": ["显性需求", "隐性需求", "触发原因"],
                "objections": ["异议", "顾虑", "风险证据"],
                "budget_and_decision": "预算、价格敏感度、决策链、采购流程",
                "deal_judgement": "成交概率、推进阶段、判断依据、置信度",
                "follow_up_plan": ["下一步动作", "负责人", "截止时间", "沟通材料"],
                "sales_daily": "可复制的销售日报"
            }
        },
        "project": {
            "template_name": "项目会议分析模板",
            "purpose": "把项目会议转成会议纪要、任务清单、风险提醒、项目周报和项目记忆。",
            "template_output_schema": {
                "meeting_minutes": "正式会议纪要，沿用用户 PDF 模板风格",
                "decisions": ["已确认结论", "决策依据", "相关说话人"],
                "task_list": ["任务", "负责人", "DDL", "状态"],
                "risks": ["风险", "影响", "证据", "建议动作"],
                "blockers": ["阻塞点", "依赖方", "下一步确认"],
                "requirement_changes": ["新增/变化需求", "影响范围", "是否已确认"],
                "project_weekly": "可复制的项目周报",
                "project_memory": "建议沉淀到项目记忆库的内容"
            }
        },
        "management": {
            "template_name": "管理沟通分析模板",
            "purpose": "把管理沟通转成沟通备忘、成员状态、承诺事项、风险提醒和下次沟通建议。",
            "safety": "轻量敏感模式：只记录事实、状态、困难、支持需求和承诺，不做员工好坏评价，不输出主观绩效结论。",
            "template_output_schema": {
                "communication_memo": "沟通备忘，按事实记录",
                "member_status": "成员状态，只写对方表达或原文证据支持的状态",
                "difficulties": ["困难", "压力来源", "需要支持"],
                "commitments": ["承诺事项", "负责人", "时间"],
                "support_needed": ["管理者需要提供的支持"],
                "risk_reminders": ["风险提醒", "证据", "建议"],
                "next_communication": "下次沟通建议和需要追问的问题"
            }
        },
        "creative": {
            "template_name": "创意讨论分析模板",
            "purpose": "把创意讨论转成创意方向、关键词库、反馈修改、脚本/分镜初稿和创意资产。",
            "template_output_schema": {
                "creative_directions": ["方向名称", "核心表达", "优点", "风险"],
                "keywords": ["关键词", "情绪词", "风格词", "禁用/不建议方向"],
                "feedback": ["客户反馈", "团队反馈", "分歧点"],
                "modification_list": ["修改意见", "原因", "优先级"],
                "script_or_storyboard": "如原文足够，输出脚本/分镜初稿；不足则写需要补充的信息",
                "creative_assets": "可复用的创意资产、素材线索和表达句"
            }
        },
        "free": {
            "template_name": "自由记录通用模板",
            "purpose": "不强行归类，把任何输入整理成可读、可搜、可追踪、可沉淀的通用工作记录。",
            "template_output_schema": {
                "auto_category": "自动判断这条记录更接近哪类工作",
                "summary": "简要摘要",
                "key_points": ["重点"],
                "action_items": ["待办", "负责人", "时间"],
                "questions": ["待确认问题"],
                "generic_report": "可复制通用报告",
                "memory_suggestions": "建议沉淀到记忆库的内容"
            }
        }
    }
    selected_template = template_guides.get(scene_type, template_guides["free"])
    title = payload.get("title", "未命名记录")
    scene_guides = {
        "sales": "销售拜访：重点识别客户需求、隐藏需求、预算/价格敏感度、异议、决策风格、成交机会、下一步跟进动作。",
        "project": "项目会议：重点识别会议结论、任务、责任人、截止时间、进度、阻塞、需求变更、风险、下周计划。",
        "management": "管理沟通：重点识别成员状态、压力来源、困难、需要支持、承诺事项、下次沟通提醒；避免绩效评判和监控语气。",
        "creative": "创意讨论：重点识别创意关键词、方案方向、优缺点、被否原因、客户/团队反馈、修改意见、可复用创意资产。",
        "free": "自由记录：重点识别摘要、关键点、行动项、待确认问题、可沉淀记忆。"
    }
    scene_guide = scene_guides.get(scene_type, scene_guides["free"])
    prompt = f"""
你是语迹 WorkMemo AI 的结构化分析引擎。请根据 PRD 的工作记录产品定位，把转写文本整理成可直接进入产品结果页的 JSON。

要求：
1. 不要编造转写中没有的信息。
2. 不确定的字段写“未明确”。
3. 不要输出“本次记录已完成结构化整理”这类空话，要提炼真实内容。
4. 对错别字、口语和识别错误，按上下文理解，但不要改变事实。
5. 重要结论尽量保留来自哪位说话人的依据。
6. 输出必须是 JSON，不要包裹 Markdown。
7. 字段包含：
   - summary.one_sentence: 一句话总结，必须具体
   - summary.key_points: 关键结论数组
   - summary.keywords: 关键词数组
   - risks: 风险数组，每项含 description、level、confidence、evidence
   - suggestions: 下一步动作数组，每项含 action、owner、due_date、confidence
   - memory_updates: 建议入库内容数组，每项含 type、entity_id、content
   - report_text: 可复制中文报告，按“一、关键结论 / 二、风险与待确认 / 三、下一步动作”组织
   - confidence.overall 和 confidence.low_confidence_fields
8. 当前场景是：{scene_type}，标题是：{title}。
9. 场景分析规则：{scene_guide}

转写文本：
{transcript}
""".strip()
    prompt += """

额外模块要求：
请务必在 JSON 中额外返回这些字段，供结果页直接展示：
{
  "corrected_transcript": "AI 纠错后的完整对话原文，保留说话人标签",
  "participants": [{"name": "说话人 1", "role_or_identity": "能从原文判断则填写，否则写未明确"}],
  "participant_actions": [
    {"speaker": "说话人 1", "title": "这个人主要说了什么/做了什么", "detail": "基于原文的简短说明", "evidence": "对应原文片段"}
  ],
  "resolved_items": [
    {"title": "已经解决或已达成一致的事项", "detail": "如何解决/谁确认的", "owner": "责任人或未明确", "evidence": "对应原文片段"}
  ],
  "unresolved_items": [
    {"title": "没有解决、需要继续确认的问题", "detail": "卡点/待确认点", "owner": "责任人或未明确", "status": "待确认/待处理/有风险", "evidence": "对应原文片段"}
  ],
  "major_issues": [
    {"title": "重要的大事项", "detail": "为什么重要", "owner": "责任人或未明确", "status": "已解决/未解决/待确认"}
  ],
  "minor_issues": [
    {"title": "小事项或零散信息", "detail": "简短说明", "status": "记录/待处理/已完成"}
  ],
  "meeting_minutes": {
    "overview": "开头一段总述，概括本次会议主要讨论了什么、形成了什么要求或方向",
    "topic_title": "本次会议的核心主题标题，例如：视频内容点评与创作指导",
    "sections": [
      {
        "heading": "一级标题，例如：视频内容点评与创作指导",
        "subsections": [
          {"heading": "二级标题，例如：小杨视频反馈", "bullets": ["要点1", "要点2"]}
        ]
      }
    ],
    "action_items": [
      {"owner": "@责任人或@全体成员", "task": "具体待办事项", "ddl": "截止时间或持续执行"}
    ],
    "meeting_analysis": {
      "core_theme": "核心主旨",
      "logic_analysis": "逻辑分析",
      "key_points": ["关键重点1", "关键重点2"],
      "subtext_trends": "潜台词与趋势"
    }
  }
}
所有字段都必须基于原文，不要编造。没有内容时返回空数组，不要返回模板废话。
会议纪要模板要求：
1. meeting_minutes 必须模仿用户提供的会议纪要风格：先一段总述，再按主题分层展开，最后在确有内容时给出“待办事项”和“会议分析”。
2. sections 里允许根据实际内容自动命名栏目，不要固定写“视频内容点评”，除非原文确实在讨论视频。
3. action_items 只有原文出现明确待办、责任对象或截止时间时才写；没有待办就返回空数组，不要写“暂无”。
4. meeting_analysis 只有原文足以支持分析时才写对应字段；没有依据的字段留空，不要为了凑模板生成空话。
5. report_text 必须使用同样模板排版，方便复制成正式会议纪要；没有内容的章节不要出现在 report_text 里。
6. 参考结构示例：开头总述 → 主题一（若干二级要点）→ 主题二（若干二级要点）→ 待办事项（可选）→ 会议分析（可选）。
7. 分析要充分展开，不能只写短句或标题式摘要。每个重要观点至少写 2-4 句，包含“原文依据/原因解释/影响判断/后续建议”中的至少两项。
8. sections.subsections.bullets 不要写成几个词的短项目；每条 bullet 应是一句完整判断，通常 30-80 个中文字符。重要主题可以写 3-6 条 bullet。
9. overview 建议写 120-220 个中文字符，说明本次记录讨论了什么、核心结论是什么、对后续工作的意义是什么。
10. meeting_analysis 中的 core_theme、logic_analysis、subtext_trends 要写成完整段落，不能只写一个词或一句空泛判断；key_points 每条也要解释为什么重要。
""".strip()

    template_prompt = {
        "selected_template": selected_template,
        "frontend_template": analysis_template,
        "required_common_blocks": [
            "summary",
            "key_points",
            "suggestions",
            "risks",
            "report_text",
            "memory_updates"
        ],
        "strict_output_fields": [
            "analysis_template",
            "template_output"
        ]
    }
    prompt += "\n\nAI 分析模板要求：\n"
    prompt += json.dumps(template_prompt, ensure_ascii=False, indent=2)
    prompt += """

请严格按当前任务模板生成结果：
1. analysis_template 返回当前模板的名称、目标和模块列表。
2. template_output 必须使用 selected_template.template_output_schema 中的字段名，不要只返回通用总结。
3. 每个字段都要基于原文内容；没有依据时写“未明确”或返回空数组，不要编造。
4. 销售拜访重点输出客户画像、需求、异议、预算决策链、成交判断和跟进计划。
5. 项目会议重点输出会议纪要、结论决策、任务清单、风险阻塞、需求变更、项目周报和项目记忆。
6. 管理沟通使用轻量敏感模式，只做事实记录和支持建议，不评价员工好坏，不给绩效结论。
7. 创意讨论重点输出创意方向、关键词库、反馈、修改意见、脚本/分镜和创意资产。
8. 自由记录使用通用模板，自动分类后整理摘要、重点、待办、问题、通用报告和记忆库建议。
9. 结果页优先展示 meeting_minutes；请让 meeting_minutes 像正式文章，而不是表格清单。没有内容的一级标题、二级标题、待办、会议分析字段必须省略或返回空值。
10. 请输出“深度分析版”而不是“简短摘要版”：关键结论、任务分析、风险、待办、记忆库建议都要说明判断依据和业务含义。除关键词外，避免只写 10 个字以内的短句。
11. 对明显重要的事实，不只复述原文，还要说明它意味着什么、可能带来什么影响、下一步应如何处理；但所有推断必须标注“AI 推测/需人工确认”。
""".strip()

    body = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "你只输出合法 JSON。"},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }
    headers = {"Authorization": f"Bearer {DEEPSEEK_API_KEY}"}
    response = http_json(
        "POST",
        f"{DEEPSEEK_BASE_URL.rstrip('/')}/v1/chat/completions",
        body,
        headers=headers,
        timeout=90,
    )
    content = response["choices"][0]["message"]["content"]
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            parsed.setdefault("analysis_template", analysis_template or selected_template)
            parsed.setdefault("template_output", parsed.get("structured_result") or parsed.get("fields") or {})
        return parsed
    except json.JSONDecodeError:
        return {"raw": content}


def deepseek_correct_transcript(payload):
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("缺少 DEEPSEEK_API_KEY 环境变量")

    transcript = payload.get("transcript", "")
    prompt = f"""
你是中文会议/工作沟通转写校对助手。请修正下面语音识别文本中的错别字、断句和明显识别错误。

要求：
1. 保留原意，不要总结，不要扩写，不要加入新事实。
2. 保留说话人标签，例如“说话人 1：”。
3. 如果某句无法判断，保留原文并用“[疑似]”标记。
4. 修正标点和断句，让后续 AI 可以分析。
5. 只输出修正后的转写文本，不要输出解释。

原始转写：
{transcript}
""".strip()

    body = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "你只输出修正后的转写文本。"},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1
    }
    headers = {"Authorization": f"Bearer {DEEPSEEK_API_KEY}"}
    response = http_json(
        "POST",
        f"{DEEPSEEK_BASE_URL.rstrip('/')}/v1/chat/completions",
        body,
        headers=headers,
        timeout=90,
    )
    return response["choices"][0]["message"]["content"].strip()


def deepseek_speaker_segments(payload):
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("缺少 DEEPSEEK_API_KEY 环境变量")

    transcript = payload.get("transcript", "")
    max_speaker_count = int(payload.get("max_speaker_count", 6) or 6)
    prompt = f"""
请把下面这段多人对话转写文本切分成说话人分段。

要求：
1. 尽量识别说话轮次，保持同一个人的后续发言使用同一个 speaker。
2. 自动估计本场对话大概有几个人，不要强行固定为 2 人。
3. 最多使用“说话人 1”到“说话人 {max_speaker_count}”，除非文本中明确出现更多人，否则不要创建过多说话人。
4. 同一个人的后续发言必须尽量沿用同一个编号，不要因为再次发言就变成新的说话人。
5. 不要按句号、逗号或停顿机械地轮换说话人；一段连续发言即使有多个句子，也应归为同一个说话人。
6. 只有出现明显回应、称呼变化、问答切换、立场变化、语气转折或上下文表明换人时，才切换说话人。
7. 如果不确定是否换人，优先延续上一位说话人，不要制造新的 speaker。
8. 不要总结，不要改写原意。
9. 输出合法 JSON，格式：
{{
  "speaker_segments": [
    {{"speaker": "说话人 1", "text": "..." }},
    {{"speaker": "说话人 2", "text": "..." }}
  ]
}}

转写文本：
{transcript}
""".strip()

    body = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "你只输出合法 JSON。"},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"}
    }
    headers = {"Authorization": f"Bearer {DEEPSEEK_API_KEY}"}
    response = http_json(
        "POST",
        f"{DEEPSEEK_BASE_URL.rstrip('/')}/v1/chat/completions",
        body,
        headers=headers,
        timeout=90,
    )
    content = response["choices"][0]["message"]["content"]
    return json.loads(content)


def deepseek_answer_question(payload):
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("缺少 DEEPSEEK_API_KEY 环境变量")

    question = payload.get("question", "").strip()
    records = payload.get("records", [])
    if not question:
        raise RuntimeError("缺少 question")

    context = json.dumps(records[:8], ensure_ascii=False)
    prompt = f"""
你是语迹 WorkMemo AI 的工作记录问答助手。请只基于用户提供的记录上下文回答问题。

回答要求：
1. 必须先分析上下文，再回答用户问题。
2. 不要编造上下文里没有的信息；没有依据时明确说“当前记录里没有明确证据”。
3. 回答要简洁、可执行，适合工作场景。
4. 如果问题涉及总结、风险、待办、已解决/未解决事项，请按条目整理。
5. 最后给出“来源”，列出用到的记录标题。

用户问题：
{question}

记录上下文 JSON：
{context}
""".strip()

    body = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "你是严谨的工作记录分析助手，必须基于上下文回答。"},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }
    headers = {"Authorization": f"Bearer {DEEPSEEK_API_KEY}"}
    response = http_json(
        "POST",
        f"{DEEPSEEK_BASE_URL.rstrip('/')}/v1/chat/completions",
        body,
        headers=headers,
        timeout=90,
    )
    return response["choices"][0]["message"]["content"].strip()


class WorkMemoHandler(BaseHTTPRequestHandler):
    server_version = "WorkMemoLocal/0.1"

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def send_json(self, payload, status=200):
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_cors_headers()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        path = parse.urlparse(self.path).path
        if path == "/api/health":
            self.send_json({
                "ok": True,
                "dashscope_ready": bool(DASHSCOPE_API_KEY),
                "deepseek_ready": bool(DEEPSEEK_API_KEY),
                "public_base_url": PUBLIC_BASE_URL or None,
                "dashscope_audio_model": DASHSCOPE_AUDIO_MODEL
            })
            return

        if path.startswith("/api/asr/task/"):
            task_id = path.rsplit("/", 1)[-1]
            try:
                task = fetch_dashscope_task(task_id)
                self.send_json({
                    "ok": True,
                    "task": task,
                    "text": flatten_dashscope_text(task)
                })
            except Exception as exc:
                api_error(self, 502, str(exc))
            return

        self.serve_static(path)

    def do_POST(self):
        path = parse.urlparse(self.path).path
        if path == "/api/audio/upload":
            self.handle_audio_upload()
            return
        if path == "/api/asr/transcribe":
            self.handle_asr_transcribe()
            return
        if path == "/api/asr/transcribe-file":
            self.handle_asr_transcribe_file()
            return
        if path == "/api/analyze/structure":
            self.handle_analyze_structure()
            return
        if path == "/api/analyze/speakers":
            self.handle_analyze_speakers()
            return
        if path == "/api/analyze/correct-transcript":
            self.handle_correct_transcript()
            return
        if path == "/api/analyze/ask":
            self.handle_analyze_ask()
            return
        api_error(self, 404, "接口不存在")

    def handle_audio_upload(self):
        try:
            original_name, data = parse_multipart_audio(self)
        except ValueError as exc:
            api_error(self, 400, str(exc))
            return
        if not data:
            api_error(self, 400, "缺少 audio 文件字段")
            return

        original_name = Path(original_name).name
        ext = Path(original_name).suffix or ".webm"
        audio_id = f"audio_{uuid.uuid4().hex}"
        filename = f"{audio_id}{ext}"
        target = UPLOAD_DIR / filename
        target.write_bytes(data)

        local_url = f"/uploads/{filename}"
        public_url = f"{PUBLIC_BASE_URL.rstrip('/')}{local_url}" if PUBLIC_BASE_URL else ""
        self.send_json({
            "ok": True,
            "audio_id": audio_id,
            "filename": filename,
            "size": len(data),
            "local_url": local_url,
            "public_url": public_url,
            "note": "阿里百炼转写需要公网可访问 public_url；本地 localhost 无法被云端拉取。"
        })

    def handle_asr_transcribe(self):
        payload = read_json(self)
        audio_url = payload.get("audio_url") or payload.get("public_url")
        wait = bool(payload.get("wait", True))
        if not audio_url:
            api_error(
                self,
                400,
                "缺少 audio_url。阿里百炼需要公网可访问的音频 URL，请配置 PUBLIC_BASE_URL 或传入 OSS 签名 URL。"
            )
            return
        try:
            submitted = submit_dashscope_transcription(audio_url)
            task_id = submitted.get("output", {}).get("task_id")
            if not wait or not task_id:
                self.send_json({"ok": True, "submitted": submitted, "task_id": task_id})
                return

            task = submitted
            for _ in range(24):
                time.sleep(2)
                task = fetch_dashscope_task(task_id)
                status = task.get("output", {}).get("task_status")
                if status in ("SUCCEEDED", "FAILED", "CANCELED"):
                    break
            self.send_json({
                "ok": True,
                "submitted": submitted,
                "task": task,
                "task_id": task_id,
                "text": flatten_dashscope_text(task)
            })
        except Exception as exc:
            api_error(self, 502, str(exc))

    def handle_asr_transcribe_file(self):
        try:
            original_name, data = parse_multipart_audio(self)
        except ValueError as exc:
            api_error(self, 400, str(exc))
            return
        if not data:
            api_error(self, 400, "缺少 audio 文件字段")
            return

        try:
            text = transcribe_dashscope_audio_file(original_name, data)
            self.send_json({
                "ok": True,
                "text": text,
                "model": DASHSCOPE_AUDIO_MODEL,
                "filename": Path(original_name).name,
                "size": len(data)
            })
        except Exception as exc:
            api_error(
                self,
                502,
                str(exc),
                note="如果当前百炼音频模型不支持 base64 音频，请改用 OSS/PUBLIC_BASE_URL 的 Paraformer 文件转写链路。"
            )

    def handle_analyze_structure(self):
        payload = read_json(self)
        if not payload.get("transcript"):
            api_error(self, 400, "缺少 transcript")
            return
        try:
            structured = deepseek_structure(payload)
            self.send_json({"ok": True, "result": structured})
        except Exception as exc:
            message = str(exc) or exc.__class__.__name__
            api_error(self, 502, message, error_type=exc.__class__.__name__)

    def handle_analyze_speakers(self):
        payload = read_json(self)
        if not payload.get("transcript"):
            api_error(self, 400, "缺少 transcript")
            return
        try:
            result = deepseek_speaker_segments(payload)
            self.send_json({"ok": True, "result": result})
        except Exception as exc:
            api_error(self, 502, str(exc))

    def handle_correct_transcript(self):
        payload = read_json(self)
        if not payload.get("transcript"):
            api_error(self, 400, "缺少 transcript")
            return
        try:
            text = deepseek_correct_transcript(payload)
            self.send_json({"ok": True, "text": text})
        except Exception as exc:
            api_error(self, 502, str(exc))

    def handle_analyze_ask(self):
        payload = read_json(self)
        if not payload.get("question"):
            api_error(self, 400, "缺少 question")
            return
        try:
            answer = deepseek_answer_question(payload)
            self.send_json({"ok": True, "answer": answer})
        except Exception as exc:
            api_error(self, 502, str(exc))

    def serve_static(self, path):
        if path == "/":
            path = "/index.html"
        relative = Path(path.lstrip("/"))
        target = (ROOT / relative).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            self.send_error(404)
            return
        if not target.exists() or target.is_dir():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_cors_headers()
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5173"))
    server = ThreadingHTTPServer((host, port), WorkMemoHandler)
    print(f"WorkMemo local server: http://{host}:{port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
