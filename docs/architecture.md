# 架构说明

## 组件

```text
浏览器（index.html + app.js + styles.css）
   ├─ localStorage：记录、报告、设置
   ├─ IndexedDB：录音 Blob
   └─ HTTP API（prototype/server.py）
         ├─ 本地 uploads/：临时音频文件
         ├─ 阿里云百炼：音频转写
         └─ DeepSeek 兼容 API：纠错、分人、结构化和问答
```

后端使用 Python 标准库 `http.server`，不包含数据库、用户系统或任务队列。前端负责展示和本地状态；后端只处理上传、调用第三方 API 和返回结果。

## 数据边界

- 仅浏览器内处理时，数据留在当前浏览器的 IndexedDB/localStorage。
- 调用后端上传时，音频会写入 `prototype/uploads/`。
- 调用百炼或 DeepSeek 时，音频、转写和所选记录上下文会离开本机，具体保留和训练策略由服务商条款决定。
- 服务器返回的音频 URL 在当前实现中没有认证；因此默认只允许本机绑定和本机使用。

## 发布前的架构工作

若要用于多人或公网环境，需要单独设计认证、授权、租户隔离、加密存储、上传大小限制、限流、审计日志、密钥托管、删除策略、CORS 白名单和第三方数据处理协议。上述能力不属于当前原型范围。
