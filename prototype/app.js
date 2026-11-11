const STORAGE_KEY = "workmemo_mvp_state_v2";
const AUDIO_DB_NAME = "workmemo_audio_db";
const AUDIO_STORE = "audio_blobs";
const API_BASE_URL = location.protocol === "file:" ? "http://127.0.0.1:5173" : "";

const scenes = [
  {
    id: "sales",
    name: "销售拜访",
    entityType: "客户",
    desc: "客户画像、异议、预算、跟进建议",
    fields: ["客户需求", "异议与风险", "下一步动作", "销售日报"]
  },
  {
    id: "project",
    name: "项目会议",
    entityType: "项目",
    desc: "进度、任务、风险、周报草稿",
    fields: ["本次结论", "项目进度", "风险提醒", "项目周报"]
  },
  {
    id: "management",
    name: "管理沟通",
    entityType: "团队",
    desc: "状态、困难、承诺、下次提醒",
    fields: ["近期状态", "困难与支持", "成长与承诺", "下次提醒"]
  },
  {
    id: "creative",
    name: "创意讨论",
    entityType: "创意",
    desc: "关键词、方案方向、反馈、复盘",
    fields: ["创意关键词", "方案方向", "反馈修改", "创意资产"]
  },
  {
    id: "free",
    name: "自由记录",
    entityType: "记录",
    desc: "通用总结、备忘、行动项",
    fields: ["摘要", "行动项", "待确认问题", "备忘"]
  }
];

const analysisTemplates = {
  sales: {
    name: "销售拜访分析模板",
    goal: "将销售沟通转化为客户档案、需求分析、成交判断、跟进计划和销售日报。",
    modules: ["客户画像", "显性/隐性需求", "异议与风险", "预算与决策链", "成交机会判断", "跟进计划", "销售日报"]
  },
  project: {
    name: "项目会议分析模板",
    goal: "将项目沟通转化为会议纪要、任务清单、风险提醒、项目周报和项目记忆。",
    modules: ["会议纪要", "结论与决策", "任务清单", "风险与阻塞", "需求变更", "项目周报", "项目记忆"]
  },
  management: {
    name: "管理沟通分析模板",
    goal: "将管理沟通转化为沟通备忘、成员状态记录、承诺事项、风险提醒和下次沟通建议。",
    modules: ["沟通备忘", "成员状态", "困难与支持", "承诺事项", "风险提醒", "下次沟通建议"],
    safety: "轻量敏感模式：不做员工好坏评价，不生成主观绩效结论。"
  },
  creative: {
    name: "创意讨论分析模板",
    goal: "将创意讨论转化为创意方向、关键词库、客户反馈、修改意见、脚本/分镜初稿和创意资产沉淀。",
    modules: ["创意方向", "关键词库", "客户/团队反馈", "修改意见", "脚本或分镜初稿", "创意资产"]
  },
  free: {
    name: "自由记录通用模板",
    goal: "不强行归类，将任何输入整理成可读、可搜、可追踪、可沉淀的通用工作记录。",
    modules: ["自动分类", "摘要", "重点", "待办", "待确认问题", "通用报告", "记忆库建议"]
  }
};

const sampleTranscript = {
  sales: "今天和客户 A 沟通，对方希望先降低手工整理成本，重点关注自动化和交付稳定。客户提到预算还没有最终确认，但希望周五前看到相似案例。主要异议是担心 AI 总结不准确，以及数据是否会上传到云端。下一步由我明天发送案例材料，并约下周二继续沟通。",
  project: "本次视频项目例会确认脚本范围不再扩大，拍摄清单今天完成。素材供应商可能晚一天交付，剪辑初版会受到影响。客户反馈轮次可能从两轮增加到三轮，验收口径还需要项目经理在周五前确认。下周重点是素材交付、初剪和风险同步。",
  management: "这次 1on1 主要聊成员最近压力比较大，原因是两个项目并行导致时间被切碎。他希望我帮忙协调需求优先级，也希望下周减少临时插单。本次承诺是周三前整理阻塞清单，我下次沟通要关注压力是否下降。",
  creative: "创意讨论围绕品牌短片展开，大家保留真实感、轻科技和自然工作流三个关键词。A 方向适合客户提案，视觉克制但容易落地。B 方向视觉更强，不过执行成本高。被否掉的是过度未来感方向，因为不符合客户行业气质。需要补充办公场景参考和脚本文案方向。",
  free: "今天整理了几个工作事项：上午完成客户材料，下午推进项目例会，晚上需要复盘创意讨论。待确认问题包括预算范围、素材交付时间和下周会议安排。"
};

const seedState = {
  records: [
    createSeedRecord("sales", "客户 A 拜访记录", sampleTranscript.sales, "saved"),
    createSeedRecord("project", "视频项目例会", sampleTranscript.project, "reviewing"),
    createSeedRecord("creative", "品牌短片创意讨论", sampleTranscript.creative, "saved")
  ],
  memoryItems: [],
  reports: [],
  consentLogs: []
};

const state = loadState();
let activeScene = "project";
let inputMode = "recording";
let expandedMemoryGroupId = "";
let resultReturnView = "memory";
let seconds = 0;
let timerId = null;
let currentResult = null;
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let currentAudioBlob = null;
let currentAudioId = "";
let currentAudioMimeType = "";
let postRecordTranscriptionPromise = null;
let hasRecordingDraft = false;
let speechRecognition = null;
let speechRecognitionRunning = false;
let speechRecognitionShouldRun = false;
let speechRestartTimer = null;
let liveSpeechRestartEnabled = true;
let speechRestartAttempts = 0;
const MAX_SPEECH_RESTART_ATTEMPTS = 8;
let speechFinalText = "";
let speechInterimText = "";
let liveSpeakerSegments = [];
let speakerSegmentationTimer = null;
let speakerSegmentationInFlight = false;
let lastSpeakerSegmentedText = "";
let backendStatus = {
  ok: false,
  dashscope_ready: false,
  deepseek_ready: false,
  public_base_url: null
};
let selectedMicDeviceId = "";

const pageTitles = {
  desk: "工作台",
  record: "记录",
  result: "结构化结果",
  memory: "记忆库",
  ask: "AI 问答",
  reports: "报告",
  settings: "设置"
};

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function todayText() {
  return new Date().toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function createSeedRecord(sceneType, title, transcriptText, status) {
  const record = {
    record_id: uid("rec"),
    title,
    scene_type: sceneType,
    analysis_template_id: sceneType,
    source_type: "text",
    created_at: new Date().toISOString(),
    source_path: "",
    status,
    consent_confirmed: true,
    transcript: {
      language: "zh-CN",
      speaker_segments: splitTranscript(transcriptText)
    },
    result: null
  };
  record.result = generateStructuredResult(record);
  return record;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return ensureState(parsed);
    } catch (error) {
      console.warn("本地数据损坏，已使用样例数据。", error);
    }
  }
  const seeded = ensureState(seedState);
  saveState(seeded);
  return seeded;
}

function ensureState(nextState) {
  const normalized = {
    records: nextState.records || [],
    memoryItems: nextState.memoryItems || [],
    reports: nextState.reports || [],
    consentLogs: nextState.consentLogs || []
  };

  if (!normalized.memoryItems.length) {
    normalized.records
      .filter((record) => record.status === "saved")
      .forEach((record) => {
        normalized.memoryItems.push(...memoryFromRecord(record));
      });
  }

  if (!normalized.reports.length) {
    normalized.reports.push(buildReport("weekly", normalized.records));
  }

  return normalized;
}

function saveState(nextState = state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function openAudioDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持 IndexedDB，无法本地保存音频。"));
      return;
    }

    const request = indexedDB.open(AUDIO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: "audio_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveAudioBlob(audioItem) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    tx.objectStore(AUDIO_STORE).put(audioItem);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getAudioBlob(audioId) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const request = tx.objectStore(AUDIO_STORE).get(audioId);
    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function getAllAudioBlobs() {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const request = tx.objectStore(AUDIO_STORE).getAll();
    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function checkBackendStatus() {
  try {
    const response = await fetch(apiUrl("/api/health"));
    if (!response.ok) throw new Error("后端未启用");
    backendStatus = await response.json();
    const parts = [
      backendStatus.deepseek_ready ? "DeepSeek 已连接" : "DeepSeek 未配置",
      backendStatus.dashscope_ready ? "百炼已连接" : "百炼未配置",
      backendStatus.public_base_url ? "公网音频 URL 已配置" : "本地音频仅保存"
    ];
    updateSpeechHint(parts.join(" / "));
  } catch (error) {
    backendStatus = {
      ok: false,
      dashscope_ready: false,
      deepseek_ready: false,
      public_base_url: null
    };
    updateSpeechHint("本地模式，未连接后端 API");
  }
}

async function uploadAudioToBackend(blob, title) {
  if (!blob) return null;
  const formData = new FormData();
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("wav") ? "wav" : "webm";
  formData.append("audio", blob, `${title || "workmemo-audio"}.${ext}`);
  const response = await fetch(apiUrl("/api/audio/upload"), {
    method: "POST",
    body: formData
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "上传音频失败");
  }
  return data;
}

async function transcribeWithDashScope(uploadInfo) {
  if (!uploadInfo?.public_url) {
    throw new Error("没有公网音频 URL，无法调用百炼云端转写");
  }
  const response = await fetch(apiUrl("/api/asr/transcribe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_url: uploadInfo.public_url,
      wait: true
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "百炼转写失败");
  }
  return data.text || "";
}

async function transcribeAudioFileDirectWithAli(blob, title) {
  if (!blob) return "";
  const formData = new FormData();
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("wav") ? "wav" : "webm";
  formData.append("audio", blob, `${title || "workmemo-audio"}.${ext}`);
  const response = await fetch(apiUrl("/api/asr/transcribe-file"), {
    method: "POST",
    body: formData
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "阿里百炼转写失败");
  }
  return data.text || "";
}

async function transcribeCurrentAudioWithAli({ force = false } = {}) {
  if (!currentAudioBlob) return "";
  if (!force && $("#noteInput").value.trim()) return $("#noteInput").value.trim();
  await checkBackendStatus();
  if (!backendStatus.dashscope_ready) {
    setLiveTranscriptStatus("百炼未连接，等待手动输入", "error");
    return "";
  }

  const titleForAudio = $("#recordTitleInput").value.trim() || "workmemo-audio";
  $("#recordStatus").textContent = "阿里百炼转写中";
  $("#recordHint").textContent = "正在调用阿里百炼识别录音";
  setLiveTranscriptStatus("阿里百炼转写中", "ok");
  const transcribedText = await transcribeAudioFileDirectWithAli(currentAudioBlob, titleForAudio);
  if (transcribedText.trim()) {
    setTranscriptFromText(transcribedText.trim());
    setLiveTranscriptStatus("阿里转写完成", "ok");
    $("#recordHint").textContent = "转写完成，可生成结构化结果";
  } else {
    setLiveTranscriptStatus("阿里未返回文本，可手动输入", "error");
  }
  return transcribedText;
}

async function structureWithDeepSeek(record) {
  const response = await fetch(apiUrl("/api/analyze/structure"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: record.title,
      scene_type: record.scene_type,
      analysis_template: templateOf(record.scene_type),
      transcript: textOfRecord(record)
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "DeepSeek 分析失败");
  }
  return data.result;
}

async function correctTranscriptWithDeepSeek(transcript) {
  const response = await fetch(apiUrl("/api/analyze/correct-transcript"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "DeepSeek 转写纠错失败");
  }
  return data.text || transcript;
}

async function segmentSpeakersWithDeepSeek(transcript, maxSpeakerCount = 6) {
  const response = await fetch(apiUrl("/api/analyze/speakers"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript,
      max_speaker_count: maxSpeakerCount
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "自动说话人识别失败");
  }
  const segments = data.result?.speaker_segments || [];
  if (!Array.isArray(segments) || !segments.length) {
    throw new Error("自动说话人识别没有返回分段");
  }
  return normalizeSpeakerSegments(segments.map((segment, index) => ({
    speaker: segment.speaker || `说话人 ${index + 1}`,
    start_time: `00:${String(index * 18).padStart(2, "0")}`,
    end_time: `00:${String(index * 18 + 14).padStart(2, "0")}`,
    text: segment.text || ""
  })).filter((segment) => segment.text.trim()));
}

async function askDeepSeek(question, records) {
  const response = await fetch(apiUrl("/api/analyze/ask"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, records })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "DeepSeek 问答失败");
  }
  return data.answer || "";
}

function currentScene() {
  return scenes.find((scene) => scene.id === activeScene) || scenes[1];
}

function sceneOf(sceneType) {
  return scenes.find((scene) => scene.id === sceneType) || scenes[4];
}

function templateOf(sceneType) {
  return analysisTemplates[sceneType] || analysisTemplates.free;
}

function splitTranscript(text) {
  const speakerLines = text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(说话人\s*\d+|speaker\s*\d+|客户|我|主持人|项目经理|设计师|成员|[\u4e00-\u9fa5A-Za-z0-9_ -]{1,12})[：:]\s*(.+)$/i);
      if (!match) return null;
      return {
        speaker: match[1].trim(),
        text: match[2].trim()
      };
    })
    .filter(Boolean);

  if (speakerLines.length) {
    return speakerLines.map((item, index) => ({
      speaker: item.speaker,
      start_time: `00:${String(index * 18).padStart(2, "0")}`,
      end_time: `00:${String(index * 18 + 14).padStart(2, "0")}`,
      text: item.text
    }));
  }

  const parts = text
    .split(/[。！？\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return (parts.length ? parts : ["本次记录暂无转写内容"]).map((textPart, index) => ({
    speaker: index % 2 === 0 ? "说话人 A" : "说话人 B",
    start_time: `00:${String(index * 18).padStart(2, "0")}`,
    end_time: `00:${String(index * 18 + 14).padStart(2, "0")}`,
    text: textPart
  }));
}

function textOfRecord(record) {
  return record.transcript.speaker_segments
    .map((segment) => `${segment.speaker || "说话人"}：${segment.text}`)
    .join("\n");
}

function pickKeywords(text, sceneType) {
  const base = {
    sales: ["客户", "需求", "预算", "异议", "案例", "跟进", "交付", "数据"],
    project: ["项目", "脚本", "素材", "延期", "风险", "验收", "初剪", "下周"],
    management: ["压力", "支持", "困难", "承诺", "优先级", "下次", "沟通"],
    creative: ["创意", "关键词", "方向", "视觉", "反馈", "参考", "脚本"],
    free: ["事项", "待确认", "安排", "复盘", "行动"]
  };
  const selected = base[sceneType].filter((keyword) => text.includes(keyword));
  return Array.from(new Set(selected.length ? selected : base[sceneType].slice(0, 4)));
}

function extractByWords(text, words, fallback) {
  const sentences = text
    .split(/[。！？\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const matches = sentences.filter((sentence) => words.some((word) => sentence.includes(word)));
  return matches.length ? matches.slice(0, 4) : fallback;
}

function generateStructuredResult(record) {
  const scene = sceneOf(record.scene_type);
  const text = textOfRecord(record);
  const keywords = pickKeywords(text, record.scene_type);
  const risks = extractByWords(text, ["风险", "担心", "延期", "不准确", "未确认", "压力", "成本高"], ["暂无明确风险，建议人工复核关键承诺。"]);
  const actions = extractByWords(text, ["下一步", "明天", "周五", "下周", "需要", "确认", "发送", "整理"], ["建议确认责任人、截止时间和下一次沟通安排。"]);
  const keyPoints = extractByWords(text, ["确认", "希望", "重点", "保留", "完成", "承诺"], [
    "本次记录已完成结构化整理。",
    "建议保存到记忆库并补充来源信息。"
  ]);
  const oneSentence = makeOneSentence(record, keywords, risks);

  return {
    record_id: record.record_id,
    scene_type: record.scene_type,
    source_type: record.source_type,
    created_at: record.created_at,
    participants: ["说话人 A", "说话人 B"],
    transcript: record.transcript,
    summary: {
      one_sentence: oneSentence,
      key_points: keyPoints,
      keywords
    },
    analysis_template: templateOf(record.scene_type),
    template_output: makeStructuredResult(scene, text, keyPoints, risks, actions, keywords),
    structured_result: makeStructuredResult(scene, text, keyPoints, risks, actions, keywords),
    risks: risks.map((risk, index) => ({
      description: risk,
      level: index === 0 ? "high" : "medium",
      confidence: index === 0 ? "中" : "低"
    })),
    suggestions: actions.map((action, index) => ({
      action,
      owner: index === 0 ? "我" : "待确认",
      due_date: action.includes("周五") ? "本周五" : action.includes("明天") ? "明天" : "待确认",
      confidence: action.includes("确认") ? "中" : "低"
    })),
    report_text: makeReportText(scene, record.title, keyPoints, risks, actions),
    ai_analysis: {
      source: "local",
      corrected_transcript: text,
      participant_actions: keyPoints.map((point) => ({ title: point, owner: "待确认", status: "AI 兜底" })),
      resolved_items: keyPoints.slice(0, 2).map((point) => ({ title: point, status: "已提及，需人工确认是否解决" })),
      unresolved_items: actions.map((action) => ({ title: action, owner: "待确认", status: "待处理" })),
      major_issues: risks.map((risk) => ({ title: risk, status: "需关注" })),
      minor_issues: keywords.slice(0, 4).map((keyword) => ({ title: keyword, status: "关键词" }))
    },
    meeting_minutes: {
      overview: "",
      topic_title: "",
      sections: [],
      action_items: [],
      meeting_analysis: {}
    },
    memory_updates: [
      {
        type: scene.entityType,
        entity_id: normalizeEntityId(record.title),
        content: oneSentence,
        source_record_id: record.record_id
      },
      {
        type: "报告",
        entity_id: `${scene.id}_report`,
        content: makeReportText(scene, record.title, keyPoints, risks, actions),
        source_record_id: record.record_id
      }
    ],
    confidence: {
      overall: 0.78,
      low_confidence_fields: risks.length ? ["风险等级", "责任人", "截止时间"] : ["责任人"]
    }
  };
}

function applyExternalStructure(record, external) {
  if (!external || typeof external !== "object") return record;
  const result = record.result || generateStructuredResult(record);
  const summary = external.summary || {};
  const analysis = external.analysis || external.issue_analysis || {};
  const keyPoints = external.key_points || summary.key_points || result.summary.key_points;
  const risks = external.risks || result.risks;
  const suggestions = external.suggestions || result.suggestions;
  const memoryUpdates = external.memory_updates || result.memory_updates;

  result.summary = {
    one_sentence: summary.one_sentence || summary.oneSentence || external.one_sentence || result.summary.one_sentence,
    key_points: Array.isArray(keyPoints) ? keyPoints.map(String) : result.summary.key_points,
    keywords: Array.isArray(summary.keywords) ? summary.keywords.map(String) : result.summary.keywords
  };
  result.risks = Array.isArray(risks)
    ? risks.map((risk, index) => typeof risk === "string"
      ? { description: risk, level: index === 0 ? "high" : "medium", confidence: "中" }
      : {
        description: risk.description || risk.risk || risk.content || "未明确",
        level: risk.level || (index === 0 ? "high" : "medium"),
        confidence: risk.confidence || "中"
      })
    : result.risks;
  result.suggestions = Array.isArray(suggestions)
    ? suggestions.map((item) => typeof item === "string"
      ? { action: item, owner: "待确认", due_date: "待确认", confidence: "中" }
      : {
        action: item.action || item.content || item.suggestion || "待确认",
        owner: item.owner || "待确认",
        due_date: item.due_date || item.dueDate || "待确认",
        confidence: item.confidence || "中"
      })
    : result.suggestions;
  result.memory_updates = Array.isArray(memoryUpdates)
    ? memoryUpdates.map((item) => typeof item === "string"
      ? {
        type: sceneOf(record.scene_type).entityType,
        entity_id: normalizeEntityId(record.title),
        content: item,
        source_record_id: record.record_id
      }
      : {
        type: item.type || sceneOf(record.scene_type).entityType,
        entity_id: item.entity_id || normalizeEntityId(record.title),
        content: item.content || item.summary || result.summary.one_sentence,
        source_record_id: record.record_id
      })
    : result.memory_updates;
  result.confidence = external.confidence || result.confidence;
  result.structured_result = external.structured_result || external.fields || result.structured_result;
  result.analysis_template = external.analysis_template || templateOf(record.scene_type);
  result.template_output = external.template_output || external.structured_result || external.fields || result.template_output || result.structured_result;
  result.ai_analysis = {
    source: "deepseek",
    corrected_transcript: external.corrected_transcript || textOfRecord(record),
    participants: normalizeAnalysisItems(external.participants || analysis.participants || []),
    participant_actions: normalizeAnalysisItems(external.participant_actions || analysis.participant_actions || analysis.people_actions || []),
    resolved_items: normalizeAnalysisItems(external.resolved_items || analysis.resolved_items || analysis.solved || []),
    unresolved_items: normalizeAnalysisItems(external.unresolved_items || analysis.unresolved_items || analysis.unsolved || []),
    major_issues: normalizeAnalysisItems(external.major_issues || analysis.major_issues || analysis.important_items || []),
    minor_issues: normalizeAnalysisItems(external.minor_issues || analysis.minor_issues || analysis.small_items || [])
  };
  result.meeting_minutes = normalizeMeetingMinutes(external.meeting_minutes || external.minutes || {});
  result.report_text = external.report_text || external.report || meetingMinutesToText(result.meeting_minutes) || result.report_text;
  record.result = result;
  return record;
}

function makeOneSentence(record, keywords, risks) {
  const scene = sceneOf(record.scene_type);
  const riskText = risks[0] ? `，需关注${shorten(risks[0], 24)}` : "";
  return `${scene.name}「${record.title}」已提炼出 ${keywords.slice(0, 3).join("、")} 等重点${riskText}。`;
}

function makeStructuredResult(scene, text, keyPoints, risks, actions, keywords) {
  if (scene.id === "sales") {
    return {
      customer_profile: {
        customer_name: guessName(text, "客户 A"),
        customer_type: text.includes("预算") ? "价格敏感型" : "效率导向型",
        main_needs: extractByWords(text, ["需求", "希望", "关注"], ["未明确"]),
        objections: risks,
        deal_probability: text.includes("下周") ? "中高" : "中"
      },
      next_actions: actions,
      sales_report: makeReportText(scene, "销售拜访", keyPoints, risks, actions)
    };
  }

  if (scene.id === "project") {
    return {
      project_name: guessName(text, "视频项目"),
      decisions: keyPoints,
      progress: {
        completed: extractByWords(text, ["完成", "确认"], ["本次进展待人工补充"]),
        blocked: risks,
        changed_requirements: extractByWords(text, ["增加", "变更", "扩大"], ["暂无明确变更"])
      },
      weekly_report: makeReportText(scene, "项目周报", keyPoints, risks, actions)
    };
  }

  if (scene.id === "management") {
    return {
      member_name: "成员",
      recent_status: {
        work_status: text.includes("压力") ? "压力偏高" : "状态待确认",
        pressure_source: extractByWords(text, ["压力", "并行", "临时"], ["未明确"]),
        positive_changes: extractByWords(text, ["希望", "承诺"], ["暂无明确积极变化"])
      },
      support_needed: actions,
      next_communication_reminders: ["下次沟通前回顾本次承诺", "避免使用绩效判断表述"]
    };
  }

  if (scene.id === "creative") {
    return {
      creative_keywords: keywords,
      directions: [
        { name: "A 方向", description: "克制、真实、易落地", pros: ["适合提案"], cons: ["视觉冲击相对弱"] },
        { name: "B 方向", description: "视觉更强、成本更高", pros: ["记忆点强"], cons: ["执行成本高"] }
      ],
      rejected_ideas: extractByWords(text, ["否", "不符合", "成本高"], ["暂无明确被否想法"]),
      reusable_learnings: keyPoints
    };
  }

  return {
    summary: keyPoints,
    actions,
    risks,
    keywords
  };
}

function makeReportText(scene, title, keyPoints, risks, actions) {
  return [
    `【${scene.name}】${title}`,
    "",
    "一、关键结论",
    ...keyPoints.map((item) => `- ${item}`),
    "",
    "二、风险与待确认",
    ...risks.map((item) => `- ${item}`),
    "",
    "三、下一步动作",
    ...actions.map((item) => `- ${item}`)
  ].join("\n");
}

function buildReport(type = "weekly", recordsForReport = seedState.records) {
  const savedRecords = recordsForReport;
  const recentRecords = savedRecords.slice(0, 8);
  const allRisks = recentRecords.flatMap((record) => record.result?.risks || []);
  const title = type === "daily" ? "今日工作日报" : "本周自动周报";
  const content = [
    `【${title}】`,
    "",
    `共汇总 ${recentRecords.length} 条记录，覆盖 ${Array.from(new Set(recentRecords.map((record) => sceneOf(record.scene_type).name))).join("、")}。`,
    "",
    "重点进展：",
    ...recentRecords.slice(0, 4).map((record) => `- ${record.result?.summary.one_sentence || record.title}`),
    "",
    "风险提醒：",
    ...(allRisks.length ? allRisks.slice(0, 5).map((risk) => `- ${risk.description}`) : ["- 暂无明确风险"]),
    "",
    "建议动作：",
    "- 优先确认风险记录中的责任人与截止时间。",
    "- 将已确认结果保存到对应客户、项目或创意档案。"
  ].join("\n");

  return {
    report_id: uid("rep"),
    type,
    title,
    time_range: "最近 7 天",
    source_records: recentRecords.map((record) => record.record_id),
    content,
    created_at: new Date().toISOString()
  };
}

function memoryFromRecord(record) {
  const result = record.result || generateStructuredResult(record);
  const baseItems = result.memory_updates.map((item) => ({
    memory_id: uid("mem"),
    type: item.type,
    entity_id: item.entity_id,
    title: `${item.type} · ${record.title}`,
    content: item.content,
    source_record_id: record.record_id,
    created_at: new Date().toISOString(),
    tags: result.summary.keywords
  }));

  const archiveItems = [];
  if (record.audio_id || record.backend_audio_id || record.source_path) {
    archiveItems.push({
      memory_id: uid("mem"),
      type: "录音",
      entity_id: record.audio_id || record.backend_audio_id || normalizeEntityId(record.title),
      title: `录音 · ${record.title}`,
      content: `${sceneOf(record.scene_type).name} · ${new Date(record.created_at).toLocaleString("zh-CN")}`,
      source_record_id: record.record_id,
      audio_id: record.audio_id || "",
      backend_audio_id: record.backend_audio_id || "",
      source_path: record.source_path || "",
      public_audio_url: record.public_audio_url || "",
      created_at: new Date().toISOString(),
      tags: ["录音", sceneOf(record.scene_type).name]
    });
  }

  archiveItems.push({
    memory_id: uid("mem"),
    type: "分析报告",
    entity_id: `${record.record_id}_report`,
    title: `分析报告 · ${record.title}`,
    content: result.report_text || "尚未生成 AI 报告",
    source_record_id: record.record_id,
    report_text: result.report_text || "",
    created_at: new Date().toISOString(),
    tags: ["报告", ...(result.summary?.keywords || []).slice(0, 4)]
  });

  return [...archiveItems, ...baseItems];
}

function normalizeEntityId(text) {
  return text.replace(/\s+/g, "_").slice(0, 24) || uid("entity");
}

function guessName(text, fallback) {
  const match = text.match(/客户\s*[A-Z]|项目\s*[A-Z]|视频项目|品牌短片/);
  return match ? match[0] : fallback;
}

function shorten(text, length) {
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeAnalysisItems(items) {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list
    .map((item) => {
      if (typeof item === "string") return { title: item, detail: "", owner: "", status: "", evidence: "" };
      return {
        title: item.title || item.action || item.issue || item.description || item.content || item.name || "未命名事项",
        detail: item.detail || item.summary || item.reason || item.result || "",
        owner: item.owner || item.person || item.speaker || "",
        status: item.status || item.state || "",
        evidence: item.evidence || item.source || ""
      };
    })
    .filter((item) => item.title && item.title !== "未明确");
}

function normalizeMeetingMinutes(minutes) {
  const source = minutes && typeof minutes === "object" ? minutes : {};
  return {
    overview: source.overview || source.summary || "",
    topic_title: source.topic_title || source.title || "",
    sections: Array.isArray(source.sections) ? source.sections.map((section) => ({
      heading: section.heading || section.title || "会议内容",
      bullets: Array.isArray(section.bullets) ? section.bullets.map(String) : [],
      subsections: Array.isArray(section.subsections) ? section.subsections.map((subsection) => ({
        heading: subsection.heading || subsection.title || "要点",
        bullets: Array.isArray(subsection.bullets) ? subsection.bullets.map(String) : []
      })) : []
    })) : [],
    action_items: Array.isArray(source.action_items) ? source.action_items.map((item) => ({
      owner: item.owner || item.person || "@待确认",
      task: item.task || item.action || item.title || item.content || "待确认",
      ddl: item.ddl || item.due_date || item.deadline || "待确认"
    })) : [],
    meeting_analysis: {
      core_theme: source.meeting_analysis?.core_theme || source.analysis?.core_theme || "",
      logic_analysis: source.meeting_analysis?.logic_analysis || source.analysis?.logic_analysis || "",
      key_points: Array.isArray(source.meeting_analysis?.key_points) ? source.meeting_analysis.key_points.map(String) : [],
      subtext_trends: source.meeting_analysis?.subtext_trends || source.analysis?.subtext_trends || ""
    }
  };
}

function renderAnalysisList(selector, items, emptyText = "暂无明确内容") {
  const normalized = normalizeAnalysisItems(items);
  $(selector).innerHTML = normalized.length
    ? normalized.map((item) => `
      <article class="analysis-item">
        <strong>${escapeHtml(item.title)}</strong>
        ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}
        <div class="analysis-meta">
          ${item.owner ? `<span>${escapeHtml(item.owner)}</span>` : ""}
          ${item.status ? `<span>${escapeHtml(item.status)}</span>` : ""}
          ${item.evidence ? `<span>${escapeHtml(shorten(item.evidence, 44))}</span>` : ""}
        </div>
      </article>
    `).join("")
    : `<p class="empty">${emptyText}</p>`;
}

const templateFieldLabels = {
  customer_profile: "客户画像",
  needs: "需求分析",
  objections: "异议与风险",
  budget_and_decision: "预算与决策链",
  deal_judgement: "成交机会判断",
  follow_up_plan: "跟进计划",
  sales_daily: "销售日报",
  meeting_minutes: "会议纪要",
  decisions: "结论与决策",
  task_list: "任务清单",
  risks: "风险提醒",
  blockers: "阻塞问题",
  requirement_changes: "需求变更",
  project_weekly: "项目周报",
  project_memory: "项目记忆",
  communication_memo: "沟通备忘",
  member_status: "成员状态",
  difficulties: "困难与支持",
  support_needed: "需要支持",
  commitments: "承诺事项",
  risk_reminders: "风险提醒",
  next_communication: "下次沟通建议",
  creative_directions: "创意方向",
  keywords: "关键词库",
  feedback: "反馈整理",
  modification_list: "修改意见",
  script_or_storyboard: "脚本/分镜初稿",
  creative_assets: "创意资产",
  auto_category: "自动分类",
  summary: "摘要",
  key_points: "重点",
  action_items: "待办",
  questions: "待确认问题",
  generic_report: "通用报告",
  memory_suggestions: "记忆库建议"
};

function labelForTemplateField(key) {
  return templateFieldLabels[key] || String(key)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hasTemplateContent(value) {
  if (Array.isArray(value)) return value.some(hasTemplateContent);
  if (value && typeof value === "object") return Object.values(value).some(hasTemplateContent);
  return String(value || "").trim() !== "";
}

function renderTemplateValue(value) {
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return `<ul>${value.map((item) => `<li>${renderTemplateValue(item)}</li>`).join("")}</ul>`;
  }
  if (value && typeof value === "object") {
    const rows = Object.entries(value)
      .filter(([, item]) => hasTemplateContent(item))
      .map(([key, item]) => `
        <div class="template-row">
          <span>${escapeHtml(labelForTemplateField(key))}</span>
          <div>${renderTemplateValue(item)}</div>
        </div>
      `);
    return rows.length ? rows.join("") : "";
  }
  return escapeHtml(value || "");
}

function renderTemplateOutput(result, isAiResult) {
  if (!$("#templateOutput")) return;
  const template = result.analysis_template || templateOf(result.scene_type);
  const output = result.template_output || result.structured_result || {};
  $("#templateName").textContent = template.name || "AI 分析模板";

  if (!isAiResult) {
    $("#templateOutput").innerHTML = `
      <p class="empty">等待 DeepSeek 按“${escapeHtml(template.name || "通用模板")}”生成专属分析。</p>
      <div class="template-chip-row">
        ${(template.modules || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
    `;
    return;
  }

  const modules = Object.entries(output)
    .filter(([, value]) => hasTemplateContent(value))
    .map(([key, value]) => `
      <section class="template-module">
        <h3>${escapeHtml(labelForTemplateField(key))}</h3>
        <div>${renderTemplateValue(value)}</div>
      </section>
    `);

  $("#templateOutput").innerHTML = modules.length
    ? modules.join("")
    : `<p class="empty">DeepSeek 已完成分析，但没有返回可展示的模板字段。请点击重新 AI 纠错并总结再试一次。</p>`;
}

function renderMeetingMinutes(minutes, isAiResult) {
  if (!$("#minutesTemplate")) return;
  const normalized = normalizeMeetingMinutes(minutes);
  if (!isAiResult) {
    $("#minutesTemplate").innerHTML = `<p class="empty">等待 DeepSeek 按会议纪要模板生成内容。</p>`;
    return;
  }

  const sectionsHtml = normalized.sections.map((section) => `
    <section class="minutes-section">
      <h3>${escapeHtml(section.heading)}</h3>
      ${section.bullets.length ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${section.subsections.map((subsection) => `
        <div class="minutes-subsection">
          <h4>${escapeHtml(subsection.heading)}</h4>
          <ul>${subsection.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      `).join("")}
    </section>
  `).join("");

  const actionsHtml = normalized.action_items.length
    ? normalized.action_items.map((item) => `<li>${escapeHtml(item.owner)} ${escapeHtml(item.task)} <span>(DDL: ${escapeHtml(item.ddl)})</span></li>`).join("")
    : `<li>暂无明确待办事项</li>`;

  const analysis = normalized.meeting_analysis || {};
  $("#minutesTemplate").innerHTML = `
    ${normalized.overview ? `<p class="minutes-overview">${escapeHtml(normalized.overview)}</p>` : ""}
    ${normalized.topic_title ? `<h3>${escapeHtml(normalized.topic_title)}</h3>` : ""}
    ${sectionsHtml || `<p class="empty">AI 未生成分节内容。</p>`}
    <section class="minutes-section">
      <h3>待办事项</h3>
      <ul>${actionsHtml}</ul>
    </section>
    <section class="minutes-section">
      <h3>会议分析</h3>
      ${analysis.core_theme ? `<p><strong>核心主旨：</strong>${escapeHtml(analysis.core_theme)}</p>` : ""}
      ${analysis.logic_analysis ? `<p><strong>逻辑分析：</strong>${escapeHtml(analysis.logic_analysis)}</p>` : ""}
      ${analysis.key_points?.length ? `<p><strong>关键重点：</strong>${escapeHtml(analysis.key_points.join("；"))}</p>` : ""}
      ${analysis.subtext_trends ? `<p><strong>潜台词与趋势：</strong>${escapeHtml(analysis.subtext_trends)}</p>` : ""}
    </section>
  `;
}

function meetingMinutesToText(minutes) {
  const normalized = normalizeMeetingMinutes(minutes);
  const lines = [];
  if (normalized.overview) lines.push(normalized.overview, "");
  if (normalized.topic_title) lines.push(normalized.topic_title);
  normalized.sections.forEach((section) => {
    lines.push(section.heading);
    section.bullets.forEach((item) => lines.push(`• ${item}`));
    section.subsections.forEach((subsection) => {
      lines.push(subsection.heading);
      subsection.bullets.forEach((item) => lines.push(`• ${item}`));
    });
    lines.push("");
  });
  lines.push("待办事项");
  if (normalized.action_items.length) {
    normalized.action_items.forEach((item) => lines.push(`• ${item.owner} ${item.task} (DDL: ${item.ddl})`));
  } else {
    lines.push("• 暂无明确待办事项");
  }
  lines.push("", "会议分析");
  const analysis = normalized.meeting_analysis;
  if (analysis.core_theme) lines.push(`• 核心主旨: ${analysis.core_theme}`);
  if (analysis.logic_analysis) lines.push(`• 逻辑分析: ${analysis.logic_analysis}`);
  if (analysis.key_points?.length) lines.push(`• 关键重点: ${analysis.key_points.join("；")}`);
  if (analysis.subtext_trends) lines.push(`• 潜台词与趋势: ${analysis.subtext_trends}`);
  return lines.join("\n").trim();
}

function renderDocumentList(items, emptyText = "") {
  const normalized = normalizeAnalysisItems(items);
  if (!normalized.length) return emptyText ? `<p>${escapeHtml(emptyText)}</p>` : "";
  return `<ul>${normalized.map((item) => `
    <li>
      <strong>${escapeHtml(item.title)}</strong>${item.detail ? `：${escapeHtml(item.detail)}` : ""}
      ${item.owner || item.status ? `<span>（${escapeHtml([item.owner, item.status].filter(Boolean).join(" / "))}）</span>` : ""}
    </li>
  `).join("")}</ul>`;
}

function renderTemplateDocument(output) {
  if (!output || typeof output !== "object") return "";
  const modules = Object.entries(output).filter(([, value]) => hasTemplateContent(value));
  if (!modules.length) return "";
  return modules.map(([key, value]) => `
    <h3>${escapeHtml(labelForTemplateField(key))}</h3>
    <div class="document-block">${renderTemplateValue(value)}</div>
  `).join("");
}

function renderMeetingMinutesDocument(minutes) {
  const normalized = normalizeMeetingMinutes(minutes);
  if (!hasTemplateContent(normalized)) return "";
  const sections = normalized.sections.map((section) => `
    <h3>${escapeHtml(section.heading)}</h3>
    ${section.bullets.length ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    ${section.subsections.map((subsection) => `
      <h4>${escapeHtml(subsection.heading)}</h4>
      <ul>${subsection.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    `).join("")}
  `).join("");
  const actions = normalized.action_items.length
    ? `<h3>待办事项</h3><ul>${normalized.action_items.map((item) => `<li>${escapeHtml(item.owner)} ${escapeHtml(item.task)} <span>DDL: ${escapeHtml(item.ddl)}</span></li>`).join("")}</ul>`
    : "";
  const analysis = normalized.meeting_analysis || {};
  const analysisHtml = hasTemplateContent(analysis) ? `
    <h3>会议分析</h3>
    ${analysis.core_theme ? `<p><strong>核心主旨：</strong>${escapeHtml(analysis.core_theme)}</p>` : ""}
    ${analysis.logic_analysis ? `<p><strong>逻辑分析：</strong>${escapeHtml(analysis.logic_analysis)}</p>` : ""}
    ${analysis.key_points?.length ? `<ul>${analysis.key_points.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    ${analysis.subtext_trends ? `<p><strong>潜台词与趋势：</strong>${escapeHtml(analysis.subtext_trends)}</p>` : ""}
  ` : "";

  return `
    ${normalized.overview ? `<p class="document-lead">${escapeHtml(normalized.overview)}</p>` : ""}
    ${normalized.topic_title ? `<h2>${escapeHtml(normalized.topic_title)}</h2>` : ""}
    ${sections}
    ${actions}
    ${analysisHtml}
  `;
}

function renderAnalysisDocument(result, isAiResult) {
  const template = result.analysis_template || templateOf(result.scene_type);
  $("#templateName").textContent = isAiResult ? (template.name || "AI 分析") : "待 AI 分析";

  if (!isAiResult) {
    $("#analysisDocument").innerHTML = `
      <p class="document-lead">这条记录还没有成功调用 DeepSeek 总结。请点击“重新 AI 纠错并总结”后生成完整分析。</p>
    `;
    $("#reportText").value = "尚未生成 AI 报告。请点击“重新 AI 纠错并总结”。";
    return;
  }

  const analysis = result.ai_analysis || {};
  const minutesHtml = renderMeetingMinutesDocument(result.meeting_minutes);
  const templateHtml = renderTemplateDocument(result.template_output || result.structured_result || {});
  const keyPoints = result.summary?.key_points || [];

  if (minutesHtml) {
    $("#analysisDocument").innerHTML = minutesHtml;
  } else {
    const participantHtml = renderDocumentList(analysis.participant_actions || analysis.participants);
    const resolvedHtml = renderDocumentList(analysis.resolved_items);
    const unresolvedHtml = renderDocumentList(analysis.unresolved_items);
    const majorHtml = renderDocumentList(analysis.major_issues);
    const minorHtml = renderDocumentList(analysis.minor_issues);
    $("#analysisDocument").innerHTML = `
      ${result.summary?.one_sentence ? `<p class="document-lead">${escapeHtml(result.summary.one_sentence)}</p>` : ""}
      ${keyPoints.length ? `<h2>关键结论</h2><ul>${keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>` : ""}
      ${templateHtml ? `<h2>任务分析</h2>${templateHtml}` : ""}
      ${participantHtml ? `<h2>参与人与行为</h2>${participantHtml}` : ""}
      ${resolvedHtml ? `<h2>已解决事项</h2>${resolvedHtml}` : ""}
      ${unresolvedHtml ? `<h2>未解决 / 待确认事项</h2>${unresolvedHtml}` : ""}
      ${majorHtml || minorHtml ? `<h2>事项整理</h2>` : ""}
      ${majorHtml ? `<h3>重要事项</h3>${majorHtml}` : ""}
      ${minorHtml ? `<h3>小事项</h3>${minorHtml}` : ""}
    `;
  }
  $("#reportText").value = result.report_text || "";
}

function readSpeakerSegmentsFromResult() {
  const sourceText = $("#sourceText");
  if (sourceText) {
    const text = sourceText.value.trim();
    return text ? splitTranscript(text) : [];
  }

  return $all(".speaker-segment").map((node, index) => {
    const original = currentResult?.transcript?.speaker_segments?.[index] || {};
    return {
      speaker: node.querySelector(".speaker-name")?.value.trim() || `说话人 ${index + 1}`,
      start_time: original.start_time || `00:${String(index * 18).padStart(2, "0")}`,
      end_time: original.end_time || `00:${String(index * 18 + 14).padStart(2, "0")}`,
      text: node.querySelector(".speaker-text")?.value.trim() || ""
    };
  }).filter((segment) => segment.text);
}

function normalizeSpeakerSegments(segments) {
  const normalized = [];
  (segments || []).forEach((segment) => {
    const speaker = (segment.speaker || "待识别发言人").trim();
    const text = (segment.text || "").trim();
    if (!text) return;
    const last = normalized[normalized.length - 1];
    if (last && last.speaker === speaker) {
      last.text = `${last.text}${last.text.endsWith("。") ? "" : "。"}${text}`;
    } else {
      normalized.push({ ...segment, speaker, text });
    }
  });
  return normalized;
}

function createRecordFromInput() {
  const scene = currentScene();
  const title = $("#recordTitleInput").value.trim() || `${scene.name} · ${todayText()}`;
  const manualText = $("#noteInput").value.trim();
  const transcriptText = manualText;
  const audioFile = $("#audioInput").files[0];
  const record = {
    record_id: uid("rec"),
    title,
    scene_type: scene.id,
    analysis_template_id: scene.id,
    source_type: inputMode === "upload" ? "upload" : inputMode === "text" ? "text" : "recording",
    created_at: new Date().toISOString(),
    source_path: currentAudioId || (audioFile ? audioFile.name : ""),
    audio_id: currentAudioId,
    audio_mime_type: currentAudioMimeType,
    status: "transcribing",
    consent_confirmed: $("#consentInput").checked,
    transcript: {
      language: "zh-CN",
      speaker_segments: splitTranscript(transcriptText)
    },
    result: null
  };
  record.result = generateStructuredResult(record);
  return record;
}

function renderAll() {
  renderScenes();
  renderDesk();
  renderMemory();
  renderResult();
}

function renderScenes() {
  $("#sceneGrid").innerHTML = scenes.map((scene) => `
    <button class="scene-card ${scene.id === activeScene ? "active" : ""}" data-scene="${scene.id}">
      <strong>${scene.name}</strong>
      <span>${scene.desc}</span>
      <em>${(templateOf(scene.id).modules || []).slice(0, 3).map(escapeHtml).join(" / ")}</em>
    </button>
  `).join("");

  $("#sceneSelect").innerHTML = scenes.map((scene) => `
    <option value="${scene.id}" ${scene.id === activeScene ? "selected" : ""}>${scene.name}</option>
  `).join("");
}

function renderDesk() {
  const pending = state.records.filter((record) => record.status !== "saved");
  const risks = state.records.flatMap((record) => record.result?.risks || []);
  $("#pendingCount").textContent = pending.length;
  $("#metricRecords").textContent = state.records.length;
  $("#metricReports").textContent = state.reports.length;
  $("#metricRisks").textContent = risks.length;
  $(".storage-note strong").textContent = `${state.records.length} 条本地记录`;

  $("#pendingList").innerHTML = pending.length
    ? pending.slice(0, 5).map((record) => `
      <article data-open-record="${escapeHtml(record.record_id)}">
        <strong>${escapeHtml(record.title)}</strong>
        <span>${escapeHtml(sceneOf(record.scene_type).name)} · ${record.status === "reviewing" ? "待确认保存" : "待处理"}</span>
      </article>
    `).join("")
    : `<article><strong>暂无待整理</strong><span>新建记录后，未保存的结果会出现在这里。</span></article>`;
}

function renderResult(record = currentResult) {
  const target = record || state.records[0];
  if (!target) return;
  currentResult = target;
  const result = target.result || generateStructuredResult(target);
  const scene = sceneOf(target.scene_type);

  $("#resultType").textContent = scene.name;
  $("#resultTitle").textContent = `${target.title} · 结构化结果`;
  const aiSource = result.ai_analysis?.source;
  const isAiResult = aiSource === "deepseek";
  $("#aiProcessStatus").textContent = isAiResult ? "DeepSeek 已处理" : "待 DeepSeek 分析";
  const analysis = result.ai_analysis || {};
  $("#sourceList").innerHTML = (result.transcript.speaker_segments || []).map((segment, index) => `
    <section class="source-paragraph">
      <h3>${escapeHtml(segment.speaker || `说话人 ${index + 1}`)}</h3>
      <p>${escapeHtml(segment.text || "")}</p>
    </section>
  `).join("");

  if (!isAiResult) {
    renderAnalysisDocument(result, false);
    return;
  }

  renderAnalysisDocument(result, true);
}

function applySpeakerEdits() {
  if (!currentResult) return;
  const segments = readSpeakerSegmentsFromResult();

  if (!segments.length) {
    return;
  }

  currentResult.transcript.speaker_segments = segments;
  currentResult.result = generateStructuredResult(currentResult);
  $("#noteInput").value = textOfRecord(currentResult);
  const recordIndex = state.records.findIndex((record) => record.record_id === currentResult.record_id);
  if (recordIndex >= 0) state.records[recordIndex] = currentResult;
  saveState();
  renderAll();
  renderResult(currentResult);
  setLiveTranscriptStatus("说话人修改已应用", "ok");
}

async function rerunCurrentAiAnalysis() {
  if (!currentResult) return;
  await checkBackendStatus();
  if (!backendStatus.deepseek_ready) {
    window.alert("DeepSeek 未连接，请先确认本地后端已启动并读取到 API Key。");
    return;
  }

  const button = $("#rerunAiAnalysis");
  const status = $("#aiProcessStatus");
  button.disabled = true;
  button.textContent = "AI 处理中";
  status.textContent = "DeepSeek 纠错中";

  try {
    const editedSegments = readSpeakerSegmentsFromResult();
    if (editedSegments.length) currentResult.transcript.speaker_segments = editedSegments;

    const correctedText = await correctTranscriptWithDeepSeek(textOfRecord(currentResult));
    const correctedSegments = splitTranscript(correctedText);
    if (correctedSegments.length) currentResult.transcript.speaker_segments = correctedSegments;

    status.textContent = "DeepSeek 分人中";
    try {
      const segments = await segmentSpeakersWithDeepSeek(correctedText, 6);
      currentResult.transcript.speaker_segments = segments;
    } catch (error) {
      console.warn(error);
      status.textContent = "分人失败，继续总结";
    }

    status.textContent = "DeepSeek 总结中";
    currentResult.result = generateStructuredResult(currentResult);
    const external = await structureWithDeepSeek(currentResult);
    applyExternalStructure(currentResult, {
      ...external,
      corrected_transcript: textOfRecord(currentResult)
    });

    const recordIndex = state.records.findIndex((record) => record.record_id === currentResult.record_id);
    if (recordIndex >= 0) state.records[recordIndex] = currentResult;
    saveState();
    renderAll();
    renderResult(currentResult);
  } catch (error) {
    console.warn(error);
    status.textContent = "AI 处理失败";
    window.alert(`${error.message}。当前页面保留原内容，请检查后端服务是否已重启。`);
  } finally {
    button.disabled = false;
    button.textContent = "重新 AI 纠错并总结";
  }
}

function groupMemoryItems(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.source_record_id || item.memory_id;
    if (!groups.has(key)) {
      const record = state.records.find((entry) => entry.record_id === item.source_record_id);
      groups.set(key, {
        group_id: key,
        record,
        items: [],
        created_at: item.created_at
      });
    }
    const group = groups.get(key);
    group.items.push(item);
    if (!group.created_at || new Date(item.created_at) > new Date(group.created_at)) {
      group.created_at = item.created_at;
    }
  });
  return Array.from(groups.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renderMemory() {
  const query = ($("#memorySearch").value || $(".global-search").value || "").trim();
  const groups = groupMemoryItems(state.memoryItems);
  const filtered = groups.filter((group) => {
    const queryText = group.items.map((item) => `${item.title}${item.content}${item.tags?.join("")}`).join(" ");
    const recordText = group.record ? `${group.record.title}${sceneOf(group.record.scene_type).name}${textOfRecord(group.record)}` : "";
    const queryMatch = !query || `${queryText}${recordText}`.includes(query);
    return queryMatch;
  });

  $("#memoryList").innerHTML = filtered.length
    ? filtered.map(renderMemoryGroup).join("")
    : `<article class="memory-item"><strong>没有找到相关记忆</strong><span>保存结构化结果后，这里会按同一条记录合并展示语音、原文和分析报告。</span></article>`;

  hydrateMemoryAudioPlayers(filtered.flatMap((group) => group.items));
}

function renderMemoryGroup(group) {
  const record = group.record;
  const items = group.items;
  const audioItem = items.find((item) => item.type === "录音");
  const reportItem = items.find((item) => item.type === "分析报告" || item.report_text);
  const noteItems = items.filter((item) => item !== audioItem && item !== reportItem);
  const sceneName = record ? sceneOf(record.scene_type).name : (items[0]?.type || "记忆");
  const title = record?.title || items[0]?.title || "未命名记忆";
  const transcript = record ? textOfRecord(record) : "";
  const tags = Array.from(new Set(items.flatMap((item) => item.tags || []).filter(Boolean))).slice(0, 6);
  const isExpanded = expandedMemoryGroupId === group.group_id;
  const summaryText = record?.result?.summary?.one_sentence
    || noteItems[0]?.content
    || reportItem?.content
    || transcript
    || "暂无简介";
  const parts = [
    audioItem ? "语音" : "",
    transcript ? "原文" : "",
    reportItem ? "报告" : ""
  ].filter(Boolean);
  const deleteButton = `<button class="text-button memory-delete" data-delete-memory-group="${escapeHtml(group.group_id)}" title="删除整条档案">删除</button>`;

  return `
    <article class="memory-item memory-bundle ${isExpanded ? "expanded" : ""}" data-source-record="${escapeHtml(group.group_id)}">
      <div class="memory-head">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(sceneName)} · ${escapeHtml(new Date(group.created_at || Date.now()).toLocaleString("zh-CN"))}</span>
        </div>
        <div class="memory-actions">
          <button class="secondary-button memory-toggle" data-toggle-memory-group="${escapeHtml(group.group_id)}">${isExpanded ? "收起" : "查看详情"}</button>
          ${deleteButton}
        </div>
      </div>
      <p class="memory-brief">${escapeHtml(shorten(summaryText.replace(/\n/g, " "), 96))}</p>
      <div class="memory-part-row">
        ${parts.map((part) => `<span>${escapeHtml(part)}</span>`).join("") || "<span>记录</span>"}
      </div>
      ${isExpanded ? `
        <div class="memory-detail">
          ${audioItem ? `
            <section class="memory-section">
              <h4>语音</h4>
              <audio controls data-memory-audio="${escapeHtml(audioItem.audio_id || "")}" ${audioItem.source_path && audioItem.source_path.startsWith("/") ? `src="${apiUrl(audioItem.source_path)}"` : ""}></audio>
            </section>
          ` : ""}
          ${transcript ? `
            <section class="memory-section">
              <h4>语音原文</h4>
              <p>${escapeHtml(shorten(transcript.replace(/\n/g, " "), 360))}</p>
            </section>
          ` : ""}
          ${reportItem ? `
            <section class="memory-section">
              <h4>分析报告</h4>
              <textarea readonly>${escapeHtml(reportItem.report_text || reportItem.content)}</textarea>
            </section>
          ` : ""}
          ${noteItems.length ? `
            <section class="memory-section">
              <h4>记忆摘要</h4>
              <ul>${noteItems.slice(0, 4).map((item) => `<li>${escapeHtml(item.content)}</li>`).join("")}</ul>
            </section>
          ` : ""}
        </div>
      ` : ""}
      <em>${escapeHtml(tags.join(" / ") || "未标记")}</em>
    </article>
  `;
}

function renderMemoryItem(item) {
  const deleteButton = `<button class="text-button memory-delete" data-delete-memory="${escapeHtml(item.memory_id)}" title="删除记忆">删除</button>`;
  if (item.type === "录音") {
    return `
      <article class="memory-item memory-audio" data-source-record="${item.source_record_id}">
        <div class="memory-head"><strong>${escapeHtml(item.title)}</strong>${deleteButton}</div>
        <span>${escapeHtml(item.content)}</span>
        <audio controls data-memory-audio="${escapeHtml(item.audio_id || "")}" ${item.source_path && item.source_path.startsWith("/") ? `src="${apiUrl(item.source_path)}"` : ""}></audio>
        <em>${escapeHtml((item.tags || []).slice(0, 3).join(" / ") || "录音")}</em>
      </article>
    `;
  }

  if (item.type === "分析报告" || item.report_text) {
    return `
      <article class="memory-item memory-report" data-source-record="${item.source_record_id}">
        <div class="memory-head"><strong>${escapeHtml(item.title)}</strong>${deleteButton}</div>
        <textarea readonly>${escapeHtml(item.report_text || item.content)}</textarea>
        <em>${escapeHtml((item.tags || []).slice(0, 3).join(" / ") || "报告")}</em>
      </article>
    `;
  }

  return `
    <article class="memory-item" data-source-record="${item.source_record_id}">
      <div class="memory-head"><strong>${escapeHtml(item.title)}</strong>${deleteButton}</div>
      <span>${escapeHtml(item.content)}</span>
      <em>${escapeHtml((item.tags || []).slice(0, 3).join(" / ") || "未标记")}</em>
    </article>
  `;
}

async function hydrateMemoryAudioPlayers(items) {
  const audioItems = items.filter((item) => item.type === "录音" && item.audio_id);
  await Promise.all(audioItems.map(async (item) => {
    const player = document.querySelector(`[data-memory-audio="${CSS.escape(item.audio_id)}"]`);
    if (!player || player.getAttribute("src")) return;
    try {
      const audio = await getAudioBlob(item.audio_id);
      if (audio?.blob) player.src = URL.createObjectURL(audio.blob);
    } catch (error) {
      console.warn(error);
    }
  }));
}

function upsertMemoryForRecord(record) {
  if (!record) return;
  state.memoryItems = state.memoryItems.filter((item) => item.source_record_id !== record.record_id);
  state.memoryItems.unshift(...memoryFromRecord(record));
}

function deleteMemoryItem(memoryId) {
  const item = state.memoryItems.find((memory) => memory.memory_id === memoryId);
  if (!item) return;
  const ok = window.confirm(`确认删除这条记忆吗？\n${item.title}`);
  if (!ok) return;
  state.memoryItems = state.memoryItems.filter((memory) => memory.memory_id !== memoryId);
  saveState();
  renderMemory();
}

function deleteMemoryGroup(groupId) {
  const groupItems = state.memoryItems.filter((memory) => (memory.source_record_id || memory.memory_id) === groupId);
  if (!groupItems.length) return;
  const title = groupItems[0].title.replace(/^(录音|分析报告|报告|项目|客户|创意|记录)\s*·\s*/, "");
  const ok = window.confirm(`确认删除这条记忆档案吗？\n${title}\n\n会同时移除这个档案里的语音、原文摘要和分析报告。`);
  if (!ok) return;
  state.memoryItems = state.memoryItems.filter((memory) => (memory.source_record_id || memory.memory_id) !== groupId);
  saveState();
  renderMemory();
}

function renderSteps(doneCount = 0) {
  const steps = ["音频/文本转写", "说话人区分", "AI 结构化总结", "生成档案建议"];
  $("#stepList").innerHTML = steps.map((step, index) => `
    <div class="step ${index < doneCount ? "done" : ""}">
      <i>${index < doneCount ? "✓" : index + 1}</i>
      <strong>${step}</strong>
      <span>${index < doneCount ? "已完成" : index === doneCount ? "处理中" : "排队中"}</span>
    </div>
  `).join("");
}

function switchView(viewId, options = {}) {
  const previousView = document.querySelector(".view.active")?.id;
  if (viewId === "result" && previousView && previousView !== "result") {
    resultReturnView = previousView;
  } else if (viewId !== "result") {
    resultReturnView = viewId;
  }

  $all(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  const navView = viewId === "record" || viewId === "result" ? "desk" : viewId;
  $all(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === navView));
  $("#pageTitle").textContent = pageTitles[viewId] || "工作台";
  if (viewId === "record") showRecordSetup({ reset: Boolean(options.resetRecord) });
  if (viewId === "result") renderResult();
  if (viewId === "memory") renderMemory();
}

function setInputMode(mode) {
  inputMode = mode;
  $all(".mode-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.input === mode));
  $("#audioInput").disabled = mode !== "upload";
  $("#recordHint").textContent = mode === "upload" ? "等待上传音频" : mode === "text" ? "等待粘贴文本" : "准备记录";
  updateRecordWorkHeader();
}

function resetRecordingWorkspace({ keepConfig = true } = {}) {
  clearInterval(timerId);
  clearTimeout(speakerSegmentationTimer);
  clearTimeout(speechRestartTimer);
  stopSpeechRecognition();
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch (error) {
      console.warn(error);
    }
  }
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaRecorder = null;
  mediaStream = null;
  audioChunks = [];
  currentAudioBlob = null;
  currentAudioId = "";
  currentAudioMimeType = "";
  postRecordTranscriptionPromise = null;
  hasRecordingDraft = false;
  seconds = 0;
  speechFinalText = "";
  speechInterimText = "";
  liveSpeakerSegments = [];
  lastSpeakerSegmentedText = "";
  speakerSegmentationInFlight = false;
  $("#timer").textContent = "00:00:00";
  $("#noteInput").value = "";
  $("#liveTranscript").innerHTML = `<p class="empty">开始录音后，说话内容会实时显示在这里。</p>`;
  $("#liveTags").innerHTML = "";
  $("#audioPlayer").removeAttribute("src");
  $("#audioPreview").classList.remove("active");
  $("#audioMeta").textContent = "";
  $("#recordStatus").textContent = "未开始";
  $("#recordHint").textContent = "准备记录";
  $("#activeSpeakerLabel").textContent = "实时自动分人";
  setLiveTranscriptStatus("等待录音");
  setRecorderButtons("idle");
  if (!keepConfig) {
    $("#recordTitleInput").value = "";
    $("#audioInput").value = "";
  }
}

function showRecordSetup({ reset = false } = {}) {
  if (reset) resetRecordingWorkspace();
  $("#recordSetupStep").classList.add("active");
  $("#recordWorkStep").classList.remove("active");
  $("#processPanel").classList.remove("active");
}

function showRecordWork() {
  $("#recordSetupStep").classList.remove("active");
  $("#recordWorkStep").classList.add("active");
  updateRecordWorkHeader();
}

function updateRecordWorkHeader() {
  if (!$("#recordWorkTitle")) return;
  const scene = currentScene();
  const title = $("#recordTitleInput").value.trim() || `${scene.name} · ${todayText()}`;
  const modeText = inputMode === "upload" ? "上传音频" : inputMode === "text" ? "文本录入" : "语音录入";
  $("#recordWorkScene").textContent = scene.name;
  $("#recordWorkTitle").textContent = title;
  $("#recordWorkMode").textContent = modeText;
}

function enterRecorderStep() {
  if (!$("#consentInput").checked) {
    updateMicStatus("请先勾选录音告知，再进入录入。", "error");
    return;
  }
  showRecordWork();
  if (inputMode === "recording") {
    checkMicrophone();
  }
}

function formatTime(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function startTimer(reset = false) {
  if (reset) {
    seconds = 0;
    $("#timer").textContent = formatTime(seconds);
  }
  clearInterval(timerId);
  timerId = setInterval(() => {
    seconds += 1;
    $("#timer").textContent = formatTime(seconds);
  }, 1000);
  $(".recorder-face").classList.add("recording");
  $("#recordStatus").textContent = "记录中";
  $("#recordHint").textContent = "正在记录";
}

function stopTimer() {
  clearInterval(timerId);
  $(".recorder-face").classList.remove("recording");
}

function setRecorderButtons(status) {
  const isIdle = status === "idle";
  const isRecording = status === "recording";
  const isPaused = status === "paused";
  $("#startRecord").disabled = !isIdle;
  $("#pauseRecord").disabled = !isRecording;
  $("#resumeRecord").disabled = !isPaused;
  $("#stopRecord").disabled = isIdle;
}

function pickAudioMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/wav"
  ];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported(type)) || "";
}

async function startRecording() {
  if ((!mediaRecorder || mediaRecorder.state === "inactive") && (hasRecordingDraft || currentAudioBlob)) {
    resetRecordingWorkspace();
  }

  if (location.protocol === "file:") {
    $("#recordHint").textContent = "如果浏览器拒绝麦克风，请用本地服务打开页面";
  }

  if (!$("#consentInput").checked) {
    updateMicStatus("请先勾选录音告知，再开始录音。", "error");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    updateMicStatus("当前浏览器不支持麦克风录音。建议使用系统 Edge/Chrome，或改用上传音频/文本输入。", "error");
    return;
  }

  try {
    mediaStream = await requestMicAccess({ keepStream: true });
    audioChunks = [];
    speechFinalText = "";
    speechInterimText = "";
    speechRestartAttempts = 0;
    liveSpeakerSegments = [];
    lastSpeakerSegmentedText = "";
    clearTimeout(speakerSegmentationTimer);
    $("#activeSpeakerLabel").textContent = "结束后自动分人";
    renderLiveTranscript();
    setLiveTranscriptStatus("准备识别");
    currentAudioBlob = null;
    currentAudioId = "";
    currentAudioMimeType = pickAudioMimeType();
    mediaRecorder = new MediaRecorder(
      mediaStream,
      currentAudioMimeType ? { mimeType: currentAudioMimeType } : undefined
    );

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };
    mediaRecorder.onstop = finalizeRecording;
    mediaStream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          updateMicStatus("麦克风流被浏览器或系统中断，请结束本次录音后重新开始。", "error");
          $("#recordHint").textContent = "麦克风流已中断，已保留当前录音片段";
        }
      };
    });
    mediaRecorder.start(1000);
    startSpeechRecognition();
    startTimer(true);
    setInputMode("recording");
    setRecorderButtons("recording");
    $("#recordStatus").textContent = "录音中";
    $("#recordHint").textContent = "麦克风录音中";
  } catch (error) {
    console.error(error);
    updateMicStatus(`${describeMicError(error)} 也可以切换到“上传”或“文本”继续处理。`, "error");
  }
}

function handleAudioUpload() {
  const file = $("#audioInput").files[0];
  if (!file) return;
  currentAudioBlob = file;
  currentAudioId = "";
  currentAudioMimeType = file.type || "audio/*";
  $("#audioPlayer").src = URL.createObjectURL(file);
  $("#audioMeta").textContent = `${file.name} · ${Math.round(file.size / 1024)} KB · 上传预览`;
  $("#audioPreview").classList.add("active");
  $("#recordHint").textContent = "已选择上传音频，可补充转写文本后生成结果";
  updateSpeechHint("上传音频暂不自动转写，请手动粘贴文本");
}

function pauseRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;
  mediaRecorder.pause();
  clearInterval(timerId);
  pauseSpeechRecognition();
  clearTimeout(speakerSegmentationTimer);
  setRecorderButtons("paused");
  $("#recordStatus").textContent = "已暂停";
  $("#recordHint").textContent = "录音已暂停";
  setLiveTranscriptStatus("已暂停");
}

function resumeRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "paused") return;
  mediaRecorder.resume();
  startTimer(false);
  setRecorderButtons("recording");
  $("#recordStatus").textContent = "录音中";
  $("#recordHint").textContent = "麦克风录音中";
  updateSpeechHint("录音继续，结束后统一转写");
  setLiveTranscriptStatus("录音继续", "ok");
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  mediaRecorder.stop();
  stopTimer();
  stopSpeechRecognition();
  clearTimeout(speakerSegmentationTimer);
  runLiveSpeakerSegmentation();
  setRecorderButtons("idle");
  $("#recordStatus").textContent = "录音已保存";
  $("#recordHint").textContent = "录音完成，可回放或生成结构化结果";
  setLiveTranscriptStatus(speechFinalText ? "转写完成" : "等待手动修正", speechFinalText ? "ok" : "");
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

async function finalizeRecording() {
  currentAudioBlob = new Blob(audioChunks, { type: currentAudioMimeType || "audio/webm" });
  currentAudioId = uid("audio");
  hasRecordingDraft = true;
  const scene = currentScene();
  const title = $("#recordTitleInput").value.trim() || `${scene.name} · ${todayText()}`;
  currentAudioMimeType = currentAudioBlob.type || currentAudioMimeType || "audio/webm";

  const audioItem = {
    audio_id: currentAudioId,
    title,
    scene_type: scene.id,
    created_at: new Date().toISOString(),
    duration_seconds: seconds,
    mime_type: currentAudioMimeType,
    size: currentAudioBlob.size,
    blob: currentAudioBlob
  };

  try {
    await saveAudioBlob(audioItem);
    renderAudioPreview(audioItem);
    renderAudioLibrary();
    postRecordTranscriptionPromise = transcribeCurrentAudioWithAli().catch((error) => {
      console.warn(error);
      setLiveTranscriptStatus("阿里转写失败，可手动输入", "error");
      $("#recordHint").textContent = `${error.message}；可手动输入或稍后生成结构化结果`;
      return "";
    });
  } catch (error) {
    console.error(error);
    updateMicStatus("录音已生成，但保存到本地音频库失败。可以先回放并生成结构化结果。", "error");
  }
}

function renderAudioPreview(audioItem) {
  const url = URL.createObjectURL(audioItem.blob);
  $("#audioPlayer").src = url;
  $("#audioMeta").textContent = `${audioItem.title} · ${formatTime(audioItem.duration_seconds)} · ${Math.round(audioItem.size / 1024)} KB`;
  $("#audioPreview").classList.add("active");
}

async function renderAudioLibrary() {
  try {
    const audios = await getAllAudioBlobs();
    const sorted = audios.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    $("#audioList").innerHTML = sorted.length
      ? sorted.map((audio) => `
        <article class="audio-item" data-audio-id="${escapeHtml(audio.audio_id)}">
          <div>
            <strong>${escapeHtml(audio.title)}</strong>
            <span>${escapeHtml(sceneOf(audio.scene_type).name)} · ${formatTime(audio.duration_seconds)} · ${escapeHtml(new Date(audio.created_at).toLocaleString("zh-CN"))}</span>
          </div>
          <audio controls src="${URL.createObjectURL(audio.blob)}"></audio>
        </article>
      `).join("")
      : `<article class="audio-item"><div><strong>暂无本地录音</strong><span>勾选录音告知后点击“开始录音”，结束后会保存在这里。</span></div></article>`;
  } catch (error) {
    $("#audioList").innerHTML = `<article class="audio-item"><div><strong>无法读取录音库</strong><span>${escapeHtml(error.message)}</span></div></article>`;
  }
}

function speechApi() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function updateSpeechHint(message) {
  $("#speechHint").textContent = `语音识别：${message}`;
}

function setLiveTranscriptStatus(message, type = "") {
  const node = $("#liveTranscriptStatus");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("ok", type === "ok");
  node.classList.toggle("error", type === "error");
}

function renderLiveTranscript() {
  const container = $("#liveTranscript");
  if (!container) return;
  const interimText = speechInterimText.trim();
  const displaySegments = normalizeSpeakerSegments(
    liveSpeakerSegments.length
      ? liveSpeakerSegments
      : speechFinalText.trim()
        ? [{ speaker: "待识别发言人", text: speechFinalText.trim() }]
        : []
  );

  if (!displaySegments.length && !interimText) {
    container.innerHTML = `<p class="empty">开始录音后，说话内容会实时显示在这里。</p>`;
    return;
  }
  container.innerHTML = [
    ...displaySegments.map((segment) => `
      <div class="live-speaker-line">
        <span class="live-speaker-name">${escapeHtml(segment.speaker)}</span>
        <p>${escapeHtml(segment.text)}</p>
      </div>
    `),
    interimText ? `
      <div class="live-speaker-line interim-line">
        <span class="live-speaker-name">正在识别</span>
        <p>${escapeHtml(interimText)}</p>
      </div>
    ` : ""
  ].join("");
  container.scrollTop = container.scrollHeight;
}

function syncTranscriptTextarea() {
  const finalText = liveSpeakerSegments.length
    ? liveSpeakerSegments
      .filter((segment) => segment.text.trim())
      .map((segment) => `${segment.speaker}：${segment.text.trim()}`)
      .join("\n")
    : speechFinalText;
  const combined = `${finalText}${speechInterimText ? `\n${speechInterimText}` : ""}`.trim();
  if (combined) $("#noteInput").value = combined;
  renderLiveTranscript();
}

function appendFinalSpeech(text) {
  const clean = text.trim();
  if (!clean) return;
  speechFinalText = `${speechFinalText}${speechFinalText.endsWith("。") || !speechFinalText ? "" : "。"}${clean}`;
  scheduleLiveSpeakerSegmentation();
}

function setTranscriptFromText(text) {
  const segments = splitTranscript(text);
  liveSpeakerSegments = normalizeSpeakerSegments(segments.map((segment) => ({
    speaker: segment.speaker || "说话人 1",
    text: segment.text || ""
  })));
  speechFinalText = liveSpeakerSegments.map((segment) => `${segment.speaker}：${segment.text}`).join("\n");
  speechInterimText = "";
  syncTranscriptTextarea();
}

function scheduleLiveSpeakerSegmentation() {
  if (!backendStatus.deepseek_ready || !speechFinalText.trim()) return;
  clearTimeout(speakerSegmentationTimer);
  speakerSegmentationTimer = setTimeout(runLiveSpeakerSegmentation, 1800);
}

async function runLiveSpeakerSegmentation() {
  const text = speechFinalText.trim();
  if (!text || text === lastSpeakerSegmentedText || speakerSegmentationInFlight) return;
  speakerSegmentationInFlight = true;
  setLiveTranscriptStatus("实时分人中", "ok");
  try {
    const segments = await segmentSpeakersWithDeepSeek(text, 6);
    liveSpeakerSegments = normalizeSpeakerSegments(segments.map((segment) => ({
      speaker: segment.speaker || "说话人 1",
      text: segment.text
    })));
    lastSpeakerSegmentedText = text;
    $("#activeSpeakerLabel").textContent = "实时自动分人";
    setLiveTranscriptStatus("已实时分人", "ok");
    syncTranscriptTextarea();
  } catch (error) {
    console.warn(error);
    setLiveTranscriptStatus("实时分人失败，继续记录原文", "error");
  } finally {
    speakerSegmentationInFlight = false;
  }
}

function updateMicStatus(message, type = "") {
  const node = $("#micStatus");
  node.textContent = `麦克风状态：${message}`;
  node.classList.toggle("ok", type === "ok");
  node.classList.toggle("error", type === "error");
}

async function getMicrophonePermissionState() {
  if (!navigator.permissions?.query) return "unknown";
  try {
    const result = await navigator.permissions.query({ name: "microphone" });
    return result.state;
  } catch (error) {
    return "unknown";
  }
}

async function renderMicrophoneDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((device) => device.kind === "audioinput");
  $("#micDeviceSelect").innerHTML = [
    `<option value="">默认麦克风</option>`,
    ...mics.map((device, index) => `
      <option value="${device.deviceId}" ${device.deviceId === selectedMicDeviceId ? "selected" : ""}>
        ${device.label || `麦克风 ${index + 1}`}
      </option>
    `)
  ].join("");
}

function describeMicError(error) {
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
    return "浏览器拒绝了麦克风权限。请在地址栏左侧权限设置里允许麦克风，然后刷新页面；如果是内置浏览器，请改用系统 Edge/Chrome 打开 localhost。";
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "没有检测到可用麦克风，请确认设备已连接。";
  }
  if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    return "麦克风可能被其他软件占用，请关闭会议软件或录音软件后重试。";
  }
  if (error.name === "SecurityError") {
    return "当前页面安全策略不允许访问麦克风，请使用 http://localhost:5173/ 或 HTTPS。";
  }
  return `无法访问麦克风：${error.message || error.name}`;
}

async function requestMicAccess({ keepStream = false } = {}) {
  if (mediaStream && mediaStream.getAudioTracks().some((track) => track.readyState === "live")) {
    updateMicStatus("麦克风权限已确认，录音中会复用本次授权。", "ok");
    return keepStream ? mediaStream : null;
  }

  if (!window.isSecureContext) {
    updateMicStatus("当前页面不是安全上下文。请使用 http://localhost:5173/ 或 HTTPS。", "error");
    throw new Error("当前页面不是安全上下文");
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    updateMicStatus("当前浏览器不支持麦克风录音，建议使用桌面版 Chrome 或 Edge。", "error");
    throw new Error("当前浏览器不支持麦克风录音");
  }

  const constraints = {
    audio: selectedMicDeviceId ? { deviceId: { exact: selectedMicDeviceId } } : true
  };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    await renderMicrophoneDevices();
    updateMicStatus("权限已开启，可以录音。", "ok");
    if (keepStream) {
      mediaStream = stream;
      return stream;
    }
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch (error) {
    const message = describeMicError(error);
    updateMicStatus(message, "error");
    throw error;
  }
}

async function checkMicrophone() {
  const state = await getMicrophonePermissionState();
  if (state === "denied") {
    updateMicStatus("权限已被浏览器拒绝。请点地址栏左侧图标，手动允许麦克风后刷新。", "error");
    return;
  }
  try {
    await requestMicAccess({ keepStream: true });
  } catch (error) {
    console.warn(error);
  }
}

function setupSpeechRecognition() {
  const SpeechRecognition = speechApi();
  if (!SpeechRecognition) {
    updateSpeechHint("当前浏览器不支持，可手动输入转写");
    setLiveTranscriptStatus("浏览器不支持", "error");
    $("#liveTranscript").innerHTML = `<p class="empty">当前浏览器不支持实时语音识别。可以录音后上传转写，或在下方手动输入。</p>`;
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onstart = () => {
    speechRecognitionRunning = true;
    speechRestartAttempts = 0;
    updateSpeechHint("识别中");
    setLiveTranscriptStatus("实时识别中", "ok");
  };
  recognition.onerror = (event) => {
    speechRecognitionRunning = false;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      speechRecognitionShouldRun = false;
      clearTimeout(speechRestartTimer);
      updateSpeechHint("实时识别未授权，录音仍在继续");
      setLiveTranscriptStatus("识别未授权，录音继续", "error");
      return;
    }
    updateSpeechHint("实时识别中断，正在尝试恢复");
    setLiveTranscriptStatus("识别恢复中", "error");
  };
  recognition.onend = () => {
    speechRecognitionRunning = false;
    if (liveSpeechRestartEnabled && speechRecognitionShouldRun && mediaRecorder && mediaRecorder.state === "recording") {
      scheduleSpeechRecognitionRestart();
    } else {
      updateSpeechHint(mediaRecorder && mediaRecorder.state === "recording"
        ? "实时识别已暂停，录音仍在继续"
        : speechFinalText ? "已生成转写草稿" : "未生成转写，可手动输入");
      setLiveTranscriptStatus(mediaRecorder && mediaRecorder.state === "recording"
        ? "录音继续，结束后统一转写"
        : speechFinalText ? "已生成草稿" : "可手动输入", speechFinalText ? "ok" : "");
    }
  };
  recognition.onresult = (event) => {
    speechInterimText = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0].transcript;
      if (result.isFinal) {
        appendFinalSpeech(`${text.trim()}。`);
      } else {
        speechInterimText += text;
      }
    }
    syncTranscriptTextarea();
  };
  return recognition;
}

function scheduleSpeechRecognitionRestart() {
  clearTimeout(speechRestartTimer);
  speechRestartTimer = setTimeout(() => {
    if (!speechRecognitionShouldRun || speechRecognitionRunning) return;
    if (!mediaRecorder || mediaRecorder.state !== "recording") return;
    if (speechRestartAttempts >= MAX_SPEECH_RESTART_ATTEMPTS) {
      updateSpeechHint("实时识别暂不可用，录音仍在继续");
      setLiveTranscriptStatus("录音继续，结束后统一转写", "error");
      return;
    }
    speechRestartAttempts += 1;
    startSpeechRecognition();
  }, Math.min(1200 + speechRestartAttempts * 500, 4000));
}

function startSpeechRecognition() {
  if (!speechRecognition) speechRecognition = setupSpeechRecognition();
  if (!speechRecognition) return;
  speechRecognitionShouldRun = true;
  clearTimeout(speechRestartTimer);
  if (speechRecognitionRunning) return;
  try {
    speechRecognition.start();
  } catch (error) {
    updateSpeechHint("等待浏览器释放识别通道");
    if (liveSpeechRestartEnabled) scheduleSpeechRecognitionRestart();
  }
}

function pauseSpeechRecognition() {
  if (!speechRecognition) return;
  speechRecognitionShouldRun = false;
  clearTimeout(speechRestartTimer);
  try {
    speechRecognition.stop();
  } catch (error) {
    updateSpeechHint("已暂停");
  }
}

function stopSpeechRecognition() {
  if (!speechRecognition) return;
  speechRecognitionShouldRun = false;
  clearTimeout(speechRestartTimer);
  try {
    speechRecognition.stop();
  } catch (error) {
    updateSpeechHint("已结束");
  }
}

async function finishAndProcess() {
  if (!$("#consentInput").checked) {
    window.alert("请先确认已获得相关参与者同意，再进入处理流程。");
    return;
  }

  await checkBackendStatus();
  clearInterval(timerId);
  $(".recorder-face").classList.remove("recording");

  if (postRecordTranscriptionPromise && !$("#noteInput").value.trim()) {
    await postRecordTranscriptionPromise;
  }

  let uploadInfo = null;
  if (backendStatus.ok && currentAudioBlob) {
    try {
      const titleForAudio = $("#recordTitleInput").value.trim();
      if (!$("#noteInput").value.trim() && backendStatus.dashscope_ready) {
        await transcribeCurrentAudioWithAli();
      }
      $("#recordStatus").textContent = "上传录音中";
      $("#recordHint").textContent = "正在保存录音到本地后端";
      uploadInfo = await uploadAudioToBackend(currentAudioBlob, titleForAudio);
    } catch (error) {
      console.warn(error);
      $("#recordHint").textContent = `${error.message}；继续使用浏览器转写/手动文本`;
      setLiveTranscriptStatus("阿里转写失败，可手动修正", "error");
    }
  }

  if (backendStatus.deepseek_ready && $("#noteInput").value.trim()) {
    try {
      $("#recordStatus").textContent = "转写纠错中";
      $("#recordHint").textContent = "正在用 DeepSeek 修正识别错字和断句";
      setLiveTranscriptStatus("转写纠错中", "ok");
      const correctedText = await correctTranscriptWithDeepSeek($("#noteInput").value.trim());
      if (correctedText.trim()) {
        $("#noteInput").value = correctedText.trim();
        speechFinalText = correctedText.trim();
        speechInterimText = "";
        liveSpeakerSegments = [];
        lastSpeakerSegmentedText = "";
        renderLiveTranscript();
        $("#activeSpeakerLabel").textContent = "已完成纠错";
        setLiveTranscriptStatus("已完成纠错", "ok");
      }
    } catch (error) {
      console.warn(error);
      setLiveTranscriptStatus("转写纠错失败，已保留原始转写", "error");
    }
  }

  if (backendStatus.deepseek_ready && $("#noteInput").value.trim()) {
    try {
      $("#recordStatus").textContent = "自动分人中";
      $("#recordHint").textContent = "正在自动识别不同说话人";
      setLiveTranscriptStatus("自动分人中", "ok");
      const segments = await segmentSpeakersWithDeepSeek($("#noteInput").value.trim(), 6);
      const segmentedText = segments.map((segment) => `${segment.speaker}：${segment.text}`).join("\n");
      setTranscriptFromText(segmentedText);
      $("#activeSpeakerLabel").textContent = "已自动分人";
      setLiveTranscriptStatus("已自动分人", "ok");
    } catch (error) {
      console.warn(error);
      setLiveTranscriptStatus("自动分人失败，已保留原始转写", "error");
    }
  }

  if (!$("#noteInput").value.trim()) {
    $("#recordStatus").textContent = "等待转写";
    $("#recordHint").textContent = "当前没有转写文本，请等待阿里转写完成，或手动输入后再生成结果。";
    setLiveTranscriptStatus("暂无转写文本", "error");
    window.alert("当前没有转写文本，不能生成结构化结果。请等待阿里转写完成，或手动输入/粘贴内容。");
    return;
  }

  const record = createRecordFromInput();
  if (uploadInfo) {
    record.backend_audio_id = uploadInfo.audio_id;
    record.source_path = uploadInfo.local_url;
    record.public_audio_url = uploadInfo.public_url || "";
  }
  record.status = "saved";
  state.records.unshift(record);
  state.consentLogs.unshift({
    record_id: record.record_id,
    consent_confirmed: record.consent_confirmed,
    confirmed_at: new Date().toISOString()
  });
  currentResult = record;
  upsertMemoryForRecord(record);
  saveState();
  renderDesk();

  $("#recordStatus").textContent = backendStatus.deepseek_ready ? "DeepSeek 分析中" : "等待 AI 分析";
  $("#recordHint").textContent = backendStatus.deepseek_ready ? "正在调用 DeepSeek 生成结构化结果" : "DeepSeek 未连接，结果页不会生成规则型总结";
  $("#processPanel").classList.add("active");
  renderSteps(0);

  if (backendStatus.deepseek_ready) {
    try {
      const external = await structureWithDeepSeek(record);
      applyExternalStructure(record, external);
      record.status = "saved";
      upsertMemoryForRecord(record);
      saveState();
    } catch (error) {
      console.warn(error);
      $("#recordHint").textContent = `${error.message}；未生成 AI 总结，请在结果页重新 AI 纠错并总结`;
    }
  }

  [1, 2, 3, 4].forEach((count, index) => {
    setTimeout(() => {
      renderSteps(count);
      if (count === 4) {
        record.status = "saved";
        upsertMemoryForRecord(record);
        saveState();
        renderAll();
    $("#recordStatus").textContent = "已入库";
        switchView("result");
      }
    }, 520 * (index + 1));
  });
}

function saveCurrentToMemory() {
  if (!currentResult) return;
  currentResult.status = "saved";
  upsertMemoryForRecord(currentResult);
  saveState();
  renderAll();
  switchView("memory");
}

function exportCurrentResult() {
  if (!currentResult) return;
  const content = currentResult.result?.report_text || $("#reportText").value;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${currentResult.title}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function selectRelevantRecords(question, limit = 5) {
  const corpus = state.records.map((record) => ({
    record,
    text: `${record.title} ${textOfRecord(record)} ${record.result?.report_text || ""} ${JSON.stringify(record.result?.ai_analysis || {})}`
  }));
  const terms = question.match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) || [];
  const scored = corpus
    .map((item) => ({
      ...item,
      score: terms.reduce((sum, term) => sum + (item.text.includes(term) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score);
  return (scored[0]?.score ? scored : corpus).slice(0, limit).map((item) => item.record);
}

function recordsForAiContext(records) {
  return records.map((record) => ({
    title: record.title,
    scene_type: record.scene_type,
    created_at: record.created_at,
    corrected_transcript: record.result?.ai_analysis?.corrected_transcript || textOfRecord(record),
    summary: record.result?.summary || {},
    analysis: record.result?.ai_analysis || {},
    risks: record.result?.risks || [],
    suggestions: record.result?.suggestions || [],
    report_text: record.result?.report_text || ""
  }));
}

async function answerQuestion() {
  const question = $("#askInput").value.trim() || "视频项目最大的风险是什么？";
  const selected = selectRelevantRecords(question, 5);
  $("#answerBox").innerHTML = `
    <strong>${escapeHtml(question)}</strong>
    <p>AI 正在基于工作记录分析...</p>
  `;

  if (!backendStatus.deepseek_ready) {
    $("#answerBox").innerHTML = `
      <strong>${escapeHtml(question)}</strong>
      <p>DeepSeek 未连接，无法生成 AI 总结答案。请确认本地服务已重启并读取到 API Key。</p>
    `;
    return;
  }

  try {
    const answer = await askDeepSeek(question, recordsForAiContext(selected));
    $("#answerBox").innerHTML = `
      <strong>${escapeHtml(question)}</strong>
      <p>${escapeHtml(answer).replaceAll("\n", "<br>")}</p>
    `;
  } catch (error) {
    console.warn(error);
    $("#answerBox").innerHTML = `
      <strong>${escapeHtml(question)}</strong>
      <p>AI 回答生成失败：${escapeHtml(error.message)}。没有返回系统规则兜底答案。</p>
    `;
  }
}

function clearData() {
  const ok = window.confirm("确认清空本地记录、记忆库和报告吗？");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  const fresh = ensureState(seedState);
  state.records = fresh.records;
  state.memoryItems = fresh.memoryItems;
  state.reports = fresh.reports;
  state.consentLogs = fresh.consentLogs;
  currentResult = state.records[0];
  saveState();
  renderAll();
}

function bindEvents() {
  document.body.addEventListener("click", (event) => {
    const deleteMemoryGroupButton = event.target.closest("[data-delete-memory-group]");
    if (deleteMemoryGroupButton) {
      event.preventDefault();
      event.stopPropagation();
      deleteMemoryGroup(deleteMemoryGroupButton.dataset.deleteMemoryGroup);
      return;
    }

    const toggleMemoryGroupButton = event.target.closest("[data-toggle-memory-group]");
    if (toggleMemoryGroupButton) {
      event.preventDefault();
      event.stopPropagation();
      const groupId = toggleMemoryGroupButton.dataset.toggleMemoryGroup;
      expandedMemoryGroupId = expandedMemoryGroupId === groupId ? "" : groupId;
      renderMemory();
      return;
    }

    const deleteMemoryButton = event.target.closest("[data-delete-memory]");
    if (deleteMemoryButton) {
      event.preventDefault();
      event.stopPropagation();
      deleteMemoryItem(deleteMemoryButton.dataset.deleteMemory);
      return;
    }

    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      switchView(viewButton.dataset.view, { resetRecord: viewButton.dataset.view === "record" });
      if (viewButton.dataset.mode) setInputMode(viewButton.dataset.mode);
    }

    const sceneButton = event.target.closest("[data-scene]");
    if (sceneButton) {
      activeScene = sceneButton.dataset.scene;
      renderScenes();
    }

    const recordLink = event.target.closest("[data-open-record], [data-source-record]");
    if (recordLink) {
      const id = recordLink.dataset.openRecord || recordLink.dataset.sourceRecord;
      const record = state.records.find((item) => item.record_id === id);
      if (record) {
        currentResult = record;
        renderResult(record);
        switchView("result");
      }
    }
  });

  $("#sceneSelect").addEventListener("change", (event) => {
    activeScene = event.target.value;
    renderScenes();
    updateRecordWorkHeader();
  });
  $("#recordTitleInput").addEventListener("input", updateRecordWorkHeader);
  $("#enterRecorder").addEventListener("click", enterRecorderStep);
  $("#backToSetup").addEventListener("click", showRecordSetup);

  $all(".mode-tabs button").forEach((button) => {
    button.addEventListener("click", () => setInputMode(button.dataset.input));
  });

  $("#startRecord").addEventListener("click", startRecording);
  $("#pauseRecord").addEventListener("click", pauseRecording);
  $("#resumeRecord").addEventListener("click", resumeRecording);
  $("#stopRecord").addEventListener("click", stopRecording);
  $("#finishRecord").addEventListener("click", finishAndProcess);
  $("#markPoint").addEventListener("click", () => {
    const tag = document.createElement("span");
    tag.textContent = `重点 ${formatTime(seconds)}`;
    $("#liveTags").appendChild(tag);
  });
  $("#viewResult").addEventListener("click", () => switchView("result"));
  $("#backFromResult").addEventListener("click", () => switchView(resultReturnView || "memory"));
  $("#saveMemory").addEventListener("click", saveCurrentToMemory);
  $("#exportResult").addEventListener("click", exportCurrentResult);
  $("#applySpeakerEdits")?.addEventListener("click", applySpeakerEdits);
  $("#rerunAiAnalysis").addEventListener("click", rerunCurrentAiAnalysis);
  $("#memorySearch").addEventListener("input", renderMemory);
  $("#audioInput").addEventListener("change", handleAudioUpload);
  $("#checkMic").addEventListener("click", checkMicrophone);
  $("#micDeviceSelect").addEventListener("change", (event) => {
    selectedMicDeviceId = event.target.value;
    updateMicStatus(selectedMicDeviceId ? "已选择指定麦克风，点击检测确认权限。" : "已选择默认麦克风。");
  });
  $(".global-search").addEventListener("input", () => {
    switchView("memory");
    renderMemory();
  });
  $("#askButton").addEventListener("click", answerQuestion);
  $("#askInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") answerQuestion();
  });
  $all(".prompt-chips button").forEach((button) => {
    button.addEventListener("click", () => {
      $("#askInput").value = button.textContent;
      answerQuestion();
    });
  });
  $("#clearData").addEventListener("click", clearData);
  $("#refreshAudioLibrary").addEventListener("click", renderAudioLibrary);
}

function init() {
  currentResult = state.records[0];
  $(".hero-panel .eyebrow").textContent = `今天 ${todayText()}`;
  renderAll();
  renderSteps(0);
  bindEvents();
  setInputMode("recording");
  setRecorderButtons("idle");
  setupSpeechRecognition();
  checkBackendStatus();
  renderMicrophoneDevices();
  renderAudioLibrary();
}

init();
