# 贡献指南

1. 先阅读 README、SECURITY_AUDIT.md 和 SECURITY.md。
2. 使用虚构文本和合成音频验证，不提交真实录音、客户资料、日志或密钥。
3. 修改后运行：

   ```powershell
   python -m py_compile prototype\server.py
   node --check prototype\app.js
   ```

4. 在提交说明中写清影响范围、手工验证步骤和已知限制。
5. 不要擅自改变 AI 输出 schema、数据结构、隐私承诺或第三方服务配置。

当前项目没有固定的代码格式化工具、测试框架或 CI；后续可在引入依赖时补充锁文件和自动化检查。
