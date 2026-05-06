# FeedbackForm — 接口文档

> 后端虚构接口，仅用于 sample 演示。

## POST /api/v1/feedback

提交一条用户反馈。FeedbackForm 是该接口的唯一前端消费者。

### Auth

`auth_required: true`。匿名提交需要先登录；未登录请求收到 `FORBIDDEN`，前端跳登录。

### Request Body

`Content-Type: application/json`

| 字段 | 类型 | 必填 | 可空 | 枚举 / 范围 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `rating` | number | true | false | 1, 2, 3, 4, 5 | 整数 1-5 星，1 = 非常差，5 = 非常好 |
| `comment` | string | true | false | 长度 5-500 | 用户评论；前后空格 trim 后的长度参与校验 |
| `email` | string | false | true | 标准邮箱格式 | 用于回访；不填即匿名 |

### Response (200 OK)

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "feedback_id": "FB-3142",
    "submitted_at": "2026-05-01T10:23:45Z"
  }
}
```

#### Response Fields

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data.feedback_id` | string | false | 后端生成的反馈 ID；前端在 success 态显示「参考编号 #{id}」 |
| `data.submitted_at` | string | false | ISO 8601 时间戳；UI 不展示，仅用于客户端日志 |

### Error Response

```json
{
  "code": "VALIDATION_FAILED",
  "message": "邮箱格式不正确",
  "data": {
    "field_errors": {
      "email": "邮箱格式不正确"
    }
  }
}
```

#### Error Codes

| code | retryable | UI 处理 | 说明 |
| --- | --- | --- | --- |
| `VALIDATION_FAILED` | false | 字段下方红字 + 顶部错误条 | 后端字段级校验失败；`data.field_errors` 是 `{field_name: message}` 映射 |
| `RATE_LIMITED` | true | 顶部 Toast「提交过于频繁，请稍后再试」+ 30s 后自动允许重提 | 同一 IP 短期内重复提交 |
| `NETWORK_ERROR` | true | 顶部红色错误条 + 「请检查网络后重试」 | 网络层失败 |
| `FORBIDDEN` | false | 跳登录页 | 未登录或 token 过期 |
| `INTERNAL_ERROR` | false | 顶部红色错误条 + 「服务暂时不可用」 | 服务端未分类错误 |

### Idempotency

不保证幂等。前端必须确保在 `submitting` 态内不允许重复点击。

### Cache

不缓存（写操作）。

### Status Codes

- `200`：业务正常 + 业务错误（看 `code`）
- `5xx`：归到 `NETWORK_ERROR`
