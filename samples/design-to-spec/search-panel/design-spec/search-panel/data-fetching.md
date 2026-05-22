# SearchPanel — 数据获取逻辑设计

> 由 `design-to-spec/scripts/generate-output.js` 根据 YAML 契约生成。
>
> **节标记说明**：`<!-- CONTRACT_DERIVED -->` 节由脚本从 YAML 契约机械生成，4B 阶段**不得修改**；`<!-- NARRATIVE -->` 节允许 LLM 补充数据流文字描述，但不得引入契约中不存在的请求或接口。

<!-- NARRATIVE -->
## 数据流向

```
contracts/api-schema.yaml
  -> contracts/mapping-logic.yaml
    -> component state / props
      -> UI components
```

<!-- CONTRACT_DERIVED -->
## 触发时机与条件

| 触发事件 | 前提条件 | 备注 |
|---------|---------|------|
| `submitBtn.onClick OR searchInput.onEnterKey` | endpoint `searchAll` 可用 | call_type `user_triggered` |

<!-- CONTRACT_DERIVED -->
## 请求链路

### 请求清单

| request id | trace_id | 接口 | 触发时机 | call_type | 依赖 | 用途 |
| ---------- | -------- | ---- | -------- | --------- | ---- | ---- |
| `searchRequest` | `request:searchRequest` | `GET /api/v1/search` | `submitBtn.onClick OR searchInput.onEnterKey` | `user_triggered` | 无 | page pagination |

### 请求参数

#### `searchRequest`

| 参数名 | 来源 | 类型 | 是否必传 | 说明 |
|-------|------|------|---------|------|
| `keyword` | Mapping_Logic.bindings | `string` | 是 | 长度 1-32；前后空格自动 trim |
| `page` | Mapping_Logic.bindings | `number` | 否 | 1-based 页码；默认 1 |
| `page_size` | Mapping_Logic.bindings | `number` | 否 | 每页条数；默认 10，最大 50 |

**响应关键字段**：data.results, data.results[].id, data.results[].title, data.results[].summary, data.results[].score, data.total, data.page, data.page_size。

<!-- CONTRACT_DERIVED -->
## 接口元信息

| endpoint | auth_required | cache_key_fields | pagination | error_shape |
| -------- | ------------- | ---------------- | ---------- | ----------- |
| `GET /api/v1/search` | true | keyword, page | page | INVALID_KEYWORD, RATE_LIMITED, NETWORK_ERROR, FORBIDDEN, INTERNAL_ERROR |
<!-- CONTRACT_DERIVED -->
## 分页与无限滚动

| endpoint | type | request_fields | response_fields | notes |
| -------- | ---- | -------------- | --------------- | ----- |
| `GET /api/v1/search` | page | page, page_size | total, page, page_size | v1 仅展示第 1 页；total 用于显示「共 N 条结果」；分页 UI 留给 v2 |

<!-- CONTRACT_DERIVED -->
## 缓存与复用策略

- **strategy**: none
- **notes**: 每次提交都重新请求；不做客户端缓存

<!-- CONTRACT_DERIVED -->
## 重试策略

- **strategy**: auto_on_rate_limited
- **max_attempts**: 1
- **backoff**: fixed 5s
- **notes**: 仅 RATE_LIMITED 错误码触发自动重试 1 次；其他错误码由用户手动点 retryButton

<!-- CONTRACT_DERIVED -->
## 竞态与并发处理

- **abortable**: true
- **stale_response**: ignore
- **notes**: loading 中改 keyword 再次提交应 abort 上一次请求；旧请求若在 abort 后才到达必须丢弃，不渲染

<!-- CONTRACT_DERIVED -->
## 错误分级与降级策略

| 错误类型 | 触发条件 | UI 表现 | 是否可重试 | 备注 |
|---------|---------|---------|----------|------|
| 请求失败 | `api_error` 或 request reject | 进入 `error` 状态 | 是，若存在 retry 交互 | 以 Mapping_Logic.state_machine 为准 |
| 数据为空 | `api_success` 但数据满足 empty 条件 | 进入 `empty` 状态 | — | 不作为错误处理 |
| `INVALID_KEYWORD` | `message` | `invalidKeyword` | 否 | 关键词为空或超长；UI 在 searchInput 下方红字显示后端 message |
| `RATE_LIMITED` | `message` | `error` | 是 | 触发限流；顶部 Toast 提示 + 5s 后自动重试 1 次 |
| `NETWORK_ERROR` | `message` | `error` | 是 | 网络层失败（HTTP 5xx / 超时 / 断网）；error 态 + 重试按钮 |
| `FORBIDDEN` | `message` | `error` | 否 | 未登录或 token 过期；前端跳转 /login，不进 error 态 |
| `INTERNAL_ERROR` | `message` | `error` | 否 | 服务端未分类错误；error 态 + 「服务异常，请联系管理员」文案 + 重试按钮 |

<!-- CONTRACT_DERIVED -->
## 状态机

| from | event | to | render_assertion |
| ---- | ----- | -- | ---------------- |
| `idle` | submitBtn.onClick AND searchInput.value.trim().length > 0 | `loading` | renders 3 skeletonRow placeholders; submitBtn 半透明禁用 |
| `loading` | api_success AND data.results.length > 0 | `success` | renders resultCount with data.total, resultList with data.results[].title and .summary |
| `loading` | api_success AND data.results.length === 0 | `empty` | renders emptyIcon and emptyText '未找到相关结果'; hides resultList |
| `loading` | api_error AND code in (NETWORK_ERROR, RATE_LIMITED, INTERNAL_ERROR) | `error` | renders errorIcon, errorText, retryButton; text varies per code |
| `loading` | api_error AND code === INVALID_KEYWORD | `invalidKeyword` | renders validationHint with backend message; resultsRegion stays in idle layout |
| `loading` | api_error AND code === FORBIDDEN | `idle` | navigates to /login (not visible in component); searchInput keeps value while in flight |
| `error` | retryButton.onClick | `loading` | renders 3 skeletonRow placeholders; submitBtn 半透明禁用 |
| `success` | submitBtn.onClick AND searchInput.value 已变更 | `loading` | abort previous request; renders skeletonRow placeholders |
| `invalidKeyword` | submitBtn.onClick | `loading` | renders skeletonRow placeholders; clears validationHint |

<!-- CONTRACT_DERIVED -->
## 父组件约定

若契约中无直接请求，父组件负责传入数据、loading、error 和交互回调。

<!-- CONTRACT_DERIVED -->
## 待确认项汇总

| # | 待确认内容 | 需确认对象 | 优先级 |
|---|-----------|----------|-------|
| 1 | data.results[].score 字段当前 UI 不展示，是否在 v1 就保留以便未来排序？或按 YAGNI 在 v2 再加？ | PM / 设计 / 后端 | P1 |
| 2 | FORBIDDEN 跳登录后是否应当通过 query 携带原 keyword（用户登录回来后重填）？产品诉求待确认（interaction-notes 待确认 3） | PM / 设计 / 后端 | P2 |
| 3 | INVALID_KEYWORD 红字提示的样式（位置/字号/颜色）设计稿未画，待设计签收（也登记在 ui.validationHint.confidence: needs_human_input） | PM / 设计 / 后端 | P0 |
| 4 | RATE_LIMITED 5s 自动重试是否需要倒计时可视化（进度条 / 数字）？产品待定 | PM / 设计 / 后端 | P1 |
| 5 | FORBIDDEN 跳登录后回来是否保留 keyword？产品 vs 安全权衡待定（关联 api.open_questions[api-q2]） | PM / 设计 / 后端 | P1 |
| 6 | tap-search-submit 在 keyword 为空时按钮置灰不响应，是否需要单独埋点 tap-search-submit-disabled 来追踪误点？数据团队待评估 | PM / 设计 / 后端 | P2 |
