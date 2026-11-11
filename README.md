# 语迹 WorkMemo AI

语迹 WorkMemo AI 是一个本地优先的工作记录原型：把录音或文字整理为可检索的工作记录、会议纪要、行动项和报告。项目目前定位为个人/小范围内测原型，不是可直接暴露到公网的生产服务。

## 功能和边界

- 浏览器录音、上传音频或手动粘贴文字。
- 使用浏览器语音识别、阿里云百炼和 DeepSeek（可选）完成转写与结构化分析。
- 在浏览器 IndexedDB 和 localStorage 中保存录音与工作记录。
- 支持销售拜访、项目会议、管理沟通、创意讨论和自由记录模板。
- 当前不提供账号体系、权限管理、租户隔离、审计日志、生产级队列或数据库迁移。

## 项目结构

```text
.
├── prototype/              # Web/H5 前端与 Python 标准库后端
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── server.py
│   ├── .env.example
│   ├── start-server.ps1
│   └── start-server.bat
├── docs/                   # 使用与架构说明
├── 语迹 WorkMemo AI.md      # 产品需求与数据结构草案
├── .obsidian/              # 原始 Obsidian 工作区配置，发布前需人工复核
└── secrets/                # 本地密钥目录，禁止提交真实文件
```

`prototype/uploads/`、`*.log`、`prototype.zip` 和 `__pycache__/` 属于本地产物或真实数据，不应进入公开仓库。

## 环境要求

- Python 3.10+（仅使用标准库）。
- 支持 MediaRecorder、IndexedDB 和麦克风权限的现代浏览器（推荐 Chrome/Edge）。
- AI 功能需要自行申请并配置阿里云百炼和/或 DeepSeek 凭证。

## 安装和运行

```powershell
cd prototype
Copy-Item ..\.env.example ..\secrets\workmemo.env
# 编辑 secrets\workmemo.env，填入自己的配置；不要把真实值提交到 Git
python server.py
```

然后打开 <http://127.0.0.1:5173/>。也可以运行 `prototype\start-server.ps1`。直接打开 `index.html` 可以查看静态页面，但无法使用后端 API。

## 配置

根目录 `.env.example` 与 `prototype/.env.example` 列出支持的变量，包括：

- `DASHSCOPE_API_KEY`、`DEEPSEEK_API_KEY`：可选的第三方 API 凭证。
- `PUBLIC_BASE_URL`：仅在使用百炼公网文件转写链路时需要；必须是受控的 HTTPS 地址。
- `DEEPSEEK_BASE_URL`、模型名、`HOST`、`PORT`：按需覆盖默认值。

后端默认绑定 `127.0.0.1`。不要在未增加认证、访问控制、限流和 HTTPS 的情况下设置为 `0.0.0.0` 或部署到公网。

## 使用示例

1. 进入“记录”，选择场景并确认录音告知。
2. 录音结束后检查原文、说话人和 AI 输出，再保存到记忆库。
3. 在“设置”中清空本地记录，或在浏览器站点设置中删除 IndexedDB/localStorage。
4. 不需要云端能力时，可只使用浏览器录音和手动文字，不配置 API Key。

更完整的 API 和流程说明见 [docs/usage.md](docs/usage.md)，数据流见 [docs/architecture.md](docs/architecture.md)。

## 测试和检查

当前没有自动化测试套件、锁定的第三方依赖或 CI。可执行基础语法检查：

```powershell
python -m py_compile prototype\server.py
node --check prototype\app.js
```

## 数据和隐私

录音、转写文本、会议内容和 AI 结果可能包含个人信息、客户信息、健康/绩效讨论或商业机密。浏览器本地数据不会自动因为 Git 被提交，但启用 AI 后，相关音频或文本会发送到所配置的第三方服务。使用前应取得录音参与者同意，确认第三方服务的区域、保留期和合同条款，并在公开发布前移除仓库中的真实音频、日志、密钥和压缩包。

## 已知限制

- 后端 API 没有认证，CORS 当前允许 `*`，只适合本机开发。
- 上传大小、请求体和并发控制仍不完善；错误响应可能包含上游服务详情。
- 浏览器语音识别、音频格式和云端模型可用性取决于浏览器、账号和地区。
- 结构化结果由模型生成，必须人工核对；不能用于自动绩效、医疗、法律或财务决策。

## 贡献

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。提交前运行语法检查，不提交真实录音、导出数据、密钥、日志、缓存或个人 Obsidian 内容。

## 许可证

本项目当前没有选定许可证。公开发布前请作者确认许可证及 PRD、图片、字体、第三方数据和模型条款的授权范围，见 [LICENSE_SELECTION.md](LICENSE_SELECTION.md)。
