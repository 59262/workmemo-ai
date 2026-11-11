# 使用说明

## 本地启动

```powershell
cd prototype
python server.py
```

默认地址为 `http://127.0.0.1:5173/`。服务启动时会读取仓库外观上的 `secrets/workmemo.env`；推荐从根目录 `.env.example` 复制后再填写。

## 典型流程

1. 在浏览器打开“记录”，填写标题和场景。
2. 勾选录音告知后开始录音，或选择上传音频/粘贴文本。
3. 结束后检查原文和说话人分段。
4. 如已配置 AI，按需运行纠错、分人和结构化分析。
5. 人工核对摘要、风险、待办和报告，再保存到记忆库。
6. 不再需要时，使用设置页清空浏览器本地数据，并删除服务器 `uploads/` 中的临时文件。

## API 端点

- `GET /api/health`：查看是否配置了 AI 凭证和公网音频地址。
- `POST /api/audio/upload`：将音频保存到本地 `prototype/uploads/`。
- `POST /api/asr/transcribe-file`：把音频内容发送到百炼音频模型。
- `POST /api/asr/transcribe`：提交公网音频 URL 到百炼文件转写。
- `GET /api/asr/task/{task_id}`：查询百炼异步任务。
- `POST /api/analyze/structure`：生成结构化记录。
- `POST /api/analyze/correct-transcript`：纠正转写文本。
- `POST /api/analyze/speakers`：识别说话人分段。
- `POST /api/analyze/ask`：基于已选记录进行问答。

API 输入包含录音、转写和工作记录时，应按敏感数据处理。不要把本地服务暴露在公共网络上。

## 云端转写注意事项

百炼文件转写需要云端可访问的音频 URL。`PUBLIC_BASE_URL` 不能指向包含未授权访问的公共目录；正式部署应使用带权限、过期时间和 HTTPS 的对象存储或受控网关。直接上传文件到 `/api/asr/transcribe-file` 会把音频内容发送给第三方模型服务。
