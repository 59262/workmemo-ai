# 语迹 WorkMemo AI 原型

这是基于 PRD 制作的 Web/H5 MVP 原型，包含前端页面和本地后端 API。

## 打开方式

推荐启动本地后端服务：

```powershell
cd prototype
python server.py
```

也可以双击/运行：

```powershell
.\start-server.ps1
```

密钥会从项目根目录的 `secrets\workmemo.env` 自动读取，不需要写进前端。

然后打开：

`http://localhost:5173/`

也可以直接用浏览器打开静态页面，但无法使用后端 API：

`prototype/index.html`

## 已覆盖流程

- 工作台：首页入口、场景快捷入口、今日待整理、本周摘要
- 记录：真实麦克风录音、暂停/继续、结束保存、回放、上传/文本入口、场景模板、录音告知、重点标记
- 语音录入库：录音音频保存到浏览器 IndexedDB，可在页面内回放
- 转写：优先使用浏览器原生语音识别生成中文转写，浏览器不支持时可手动输入或粘贴
- 说话人识别：录音中会定时调用后端模型做实时智能分人，自动估计本场人数，默认最多使用说话人 1 到说话人 6；录音结束后再次自动校正，结果页可继续手动改名
- 本地后端：支持上传音频、调用阿里百炼转写任务、调用 DeepSeek 结构化分析
- 处理：模拟转写、说话人区分、结构化、档案建议
- 结果：摘要、关键结论、风险置信度、档案更新、报告、来源片段
- 记忆库：客户/项目/创意/报告分类、搜索、保存演示
- AI 问答：基于样例记录返回答案和来源
- 报告：销售跟进、项目周报、创意复盘
- 设置：隐私、本地存储、敏感记录、删除策略

## 后续可接入

- OSS / 公网音频 URL，用于阿里百炼云端拉取录音文件
- 本地数据库或浏览器 IndexedDB
- 导出 Markdown、Word、Excel

## 麦克风说明

如果直接打开 HTML 时浏览器拒绝麦克风，可以启动本地服务后访问：

`python server.py`

然后打开：

`http://localhost:5173`

## API 说明

- `POST /api/audio/upload`：上传浏览器录音到本地 `uploads/`
- `POST /api/asr/transcribe-file`：把浏览器录音直接发给本地后端，再调用阿里百炼音频模型转写
- `POST /api/asr/transcribe`：调用阿里百炼 Paraformer 录音文件识别
- `GET /api/asr/task/{task_id}`：查询百炼转写任务
- `POST /api/analyze/structure`：调用 DeepSeek 生成结构化记录
- `POST /api/analyze/correct-transcript`：调用 DeepSeek 对语音识别文本做错字、断句和口语化纠错
- `POST /api/analyze/speakers`：调用 DeepSeek 将转写文本切分为说话人分段
- `POST /api/analyze/ask`：调用 DeepSeek 基于已保存工作记录、纠错原文和结构化结果回答追问
- `GET /api/health`：检查后端和环境变量状态

## 录音结束后的 AI 处理链路

1. 阿里百炼：把录音文件转成原始文字。
2. DeepSeek 纠错：修正明显识别错字、断句、标点和口语化噪声，不做总结、不添加新事实。
3. DeepSeek 分人：根据上下文判断说话人，不强制两个人，默认最多展示说话人 1 到说话人 6。
4. DeepSeek 结构化分析：根据当前场景专属提示词生成一句话总结、关键结论、风险、下一步动作、入库建议和可复制报告。
5. DeepSeek 问答：用户在“继续追问 / AI 问答”里提问时，会把相关记录作为上下文交给 DeepSeek 分析后回答；DeepSeek 不可用时才退回本地兜底答案。

## 结果页按钮说明

- `应用修改`：只保存当前页面手动编辑过的说话人与原文，不会调用 AI。
- `重新 AI 纠错并总结`：对当前记录重新调用 DeepSeek，依次完成原文纠错、说话人整理、全文总结和事项分析。状态显示为 `DeepSeek 已处理` 时，说明当前结果来自 AI 分析；显示 `本地兜底 / 待 AI` 时，说明还没有成功跑过 DeepSeek。
- 结果页和 AI 问答不再展示系统规则型总结。DeepSeek 未连接或调用失败时，只显示待 AI 分析/调用失败提示，不伪装成 AI 答案。
- `保存`：会把当前记录归档到记忆库，包含录音回放、AI 分析报告和关键摘要。录音保存在浏览器 IndexedDB，报告保存在本地记忆库数据中。

阿里百炼录音文件识别需要公网可访问音频 URL。本地 `localhost` 不能被云端访问，所以只配置 Key 还不够；需要再配置 `PUBLIC_BASE_URL`，通常来自 OSS 签名 URL、内网穿透地址或正式部署域名。

本地开发优先走 `/api/asr/transcribe-file`，它会把录音文件转成 base64 后调用 `DASHSCOPE_AUDIO_MODEL`，默认是 `qwen-audio-turbo-latest`。如果模型或账号不支持 base64 音频输入，再切换到 OSS / `PUBLIC_BASE_URL` 的 Paraformer 文件转写链路。
## AI 分析模板

当前工作台的五个任务卡片会带入不同 DeepSeek 分析模板：销售拜访、项目会议、管理沟通、创意讨论、自由记录。所有模板都会保留公共模块：摘要、重点、待办、风险、可复制报告、记忆库更新建议；同时按任务类型生成专属 `template_output`，并在结果页的“模板分析结果”区域展示。管理沟通默认启用轻量敏感模式，只记录事实、困难、支持和承诺，不生成员工好坏评价或主观绩效结论。
