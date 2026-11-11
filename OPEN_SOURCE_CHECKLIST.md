# 发布前检查清单

## 隐私和数据

- [ ] `prototype/uploads/` 不含真实录音、转写、截图或导出数据。
- [ ] `prototype.zip` 等压缩包、缓存和构建产物未被提交。
- [ ] `.obsidian/`、PRD 和示例中没有私人 Vault 内容、真实路径或身份信息。
- [ ] 示例数据全部为虚构内容，录音告知和第三方处理范围已写入文档。

## 凭证和历史

- [ ] `secrets/workmemo.env`、`.env`、Token、Cookie、私钥和数据库凭证未被提交。
- [ ] 已检查待提交文件和 Git 历史；如凭证曾经外泄，已完成轮换。
- [ ] 只提交 `.env.example` 或 `secrets/workmemo.env.example`，且其中没有真实值。

## 代码和依赖

- [ ] 已复核 CORS、认证、上传大小、路径校验、错误响应和公网绑定。
- [ ] 已确认 Python/浏览器依赖及其许可证；当前项目没有锁定的第三方包清单。
- [ ] 已评估第三方 API、模型、图片、字体和数据集条款。

## 验证

- [ ] `python -m py_compile prototype/server.py`
- [ ] `node --check prototype/app.js`
- [ ] 使用虚构文本和合成音频完成一次本地流程。
- [ ] `git status`、`git diff` 和 `git diff --cached` 已人工复核。

## 作者确认

- [ ] 许可证已选择并添加 `LICENSE`。
- [ ] 是否允许公开 PRD、Obsidian 配置和示例模板。
- [ ] 是否仅保留本机原型定位，或已完成生产级安全改造。
