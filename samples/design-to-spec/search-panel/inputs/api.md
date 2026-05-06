# SearchPanel — 接口文档

> 后端虚构接口，仅用于 sample 演示。生产环境替换为团队真实 API。

## GET /api/v1/search

按关键词检索条目。SearchPanel 是该接口的唯一前端消费者。

### Query Parameters

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `keyword` | string | 是 | 搜索关键词，长度 1–32，前后空格自动 trim |
| `page` | number | 否 | 页码，1-based，默认 1 |
| `page_size` | number | 否 | 每页条数，默认 10，最大 50 |

### Response (200 OK)

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "results": [
      {
        "id": "r-001",
        "title": "useEffect 入门指南",
        "summary": "React 副作用钩子的使用…",
        "score": 0.92
      }
    ],
    "total": 3,
    "page": 1,
    "page_size": 10
  }
}
```

#### Response Fields

| 字段 | 类型 | 可空 | 枚举 / 范围 | 说明 |
| --- | --- | --- | --- | --- |
| `data.results` | array | false | — | 匹配条目列表；可能为空数组（empty 态） |
| `data.results[].id` | string | false | — | 条目唯一 ID |
| `data.results[].title` | string | false | — | 条目标题；前端单行截断 |
| `data.results[].summary` | string | true | — | 条目摘要；可能为空字符串或 null |
| `data.results[].score` | number | false | 0.0 – 1.0 | 相关性评分；UI 暂不展示，未来用于排序 |
| `data.total` | number | false | — | 命中总数；用于显示「共 N 条结果」 |
| `data.page` | number | false | — | 当前页码 |
| `data.page_size` | number | false | — | 每页条数 |

### Error Response

业务错误统一返回 200 + `code !== 0`，`code` 字段是字符串枚举：

```json
{
  "code": "INVALID_KEYWORD",
  "message": "关键词长度必须在 1–32 之间",
  "data": null
}
```

#### Error Codes

| code | retryable | UI 处理 | 说明 |
| --- | --- | --- | --- |
| `INVALID_KEYWORD` | false | 输入框下方红字提示 | 关键词为空或超长 |
| `RATE_LIMITED` | true | 顶部 Toast「请求过于频繁，请稍后再试」+ 5s 后自动重试 | 触发限流 |
| `NETWORK_ERROR` | true | error 态 + 重试按钮 | 网络层失败（HTTP 5xx / 超时 / 断网） |
| `FORBIDDEN` | false | 跳转登录页 | 未登录或 token 过期 |
| `INTERNAL_ERROR` | false | error 态 + 「联系管理员」文案 | 服务端未分类错误 |

### Pagination

`type: page`，1-based。前端请求 `page=N`，响应回 `total` 决定是否显示加载更多 / 翻页。SearchPanel v1 仅展示第 1 页，`total` 仅用于显示计数；分页 UI 留给 v2。

### Auth

`auth_required: true`。未登录请求收到 `FORBIDDEN`，前端跳登录页（不显示 error 态）。

### Cache

不缓存。每次提交都重新请求。

### Status Codes

- `200`：业务正常 + 业务错误（看 `code`）
- `5xx`：网络层错误，归到 `NETWORK_ERROR`
