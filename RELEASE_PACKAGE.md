# GitHub 发布包说明

本目录是从本地工作区生成的净化发布候选包，保留产品运行逻辑、前端、后端、配置示例、产品需求和架构文档。

## 已排除内容

- `secrets/workmemo.env` 等真实密钥和凭证
- `prototype/uploads/` 中的真实或未知来源音频
- `prototype.zip` 原始压缩包
- 运行日志、缓存、`.pyc`、`.edge-test` 和浏览器临时文件
- `.obsidian/` 私人工作区配置

## 发布前仍需作者确认

- 选择并添加正式 `LICENSE` 文件。
- 用 Git 初始化后检查 `git status` 和 `git diff --cached`。
- 确认示例、PRD、字体、图片和第三方服务条款允许公开。
- 如果要公网部署，先完成认证、授权、CORS、上传限制和错误脱敏。

## 本地运行

```powershell
Copy-Item .env.example secrets\workmemo.env
# 编辑 secrets\workmemo.env 后运行
cd prototype
python server.py
```

打开 `http://127.0.0.1:5173/`。
