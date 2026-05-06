# FeedbackForm — 数据获取逻辑设计

> 由 `design-to-spec/scripts/generate-output.js` 根据 YAML 契约生成。

## 数据流向

```
contracts/api-schema.yaml
  -> contracts/mapping-logic.yaml
    -> component state / props
      -> UI components
```

## 触发时机与条件

| 触发事件 | 前提条件 | 备注 |
|---------|---------|------|
| `submitBtn.onClick AND 前端校验全部通过` | endpoint `submitFeedback` 可用 | call_type `user_triggered` |

## 请求链路

### 请求清单

| request id | trace_id | 接口 | 触发时机 | call_type | 依赖 | 用途 |
| ---------- | -------- | ---- | -------- | --------- | ---- | ---- |
| `submitRequest` | `request:submitRequest` | `POST /api/v1/feedback` | `submitBtn.onClick AND 前端校验全部通过` | `user_triggered` | 无 | 主数据请求 |

### 请求参数

#### `submitRequest`

| 参数名 | 来源 | 类型 | 是否必传 | 说明 |
|-------|------|------|---------|------|
| — | — | — | — | 无请求参数 |

**请求体字段**：

- `rating` (`1 \| 2 \| 3 \| 4 \| 5`, required) — 整数 1-5 星；1=非常差，5=非常好
- `comment` (`string`, required) — trim 后长度 5-500；前端校验 + 后端兜底
- `email` (`string`, optional) — 可选；为空时省略；非空时必须匹配邮箱 regex（前端 + 后端双层校验）

**响应关键字段**：data.feedback_id, data.submitted_at。

## 接口元信息

| endpoint | auth_required | cache_key_fields | pagination | error_shape |
| -------- | ------------- | ---------------- | ---------- | ----------- |
| `POST /api/v1/feedback` | true | — | none | VALIDATION_FAILED, RATE_LIMITED, NETWORK_ERROR, FORBIDDEN, INTERNAL_ERROR |
## 分页与无限滚动

不涉及，除非契约中的请求或开放问题另有说明。

## 缓存与复用策略

- **strategy**: none
- **notes**: 写操作不缓存

## 重试策略

- **strategy**: none
- **notes**: 不自动重试；NETWORK_ERROR / INTERNAL_ERROR 由用户手动再次点击；RATE_LIMITED 走倒计时禁用，30s 后允许

## 竞态与并发处理

- **abortable**: true
- **stale_response**: ignore
- **notes**: submitting 态按钮禁用，物理上不会重复触发；组件 unmount 时 abort 当前请求

## 错误分级与降级策略

| 错误类型 | 触发条件 | UI 表现 | 是否可重试 | 备注 |
|---------|---------|---------|----------|------|
| 请求失败 | `api_error` 或 request reject | 进入 `error` 状态 | 是，若存在 retry 交互 | 以 Mapping_Logic.state_machine 为准 |
| 数据为空 | `api_success` 但数据满足 empty 条件 | 进入 `empty` 状态 | — | 不作为错误处理 |
| `VALIDATION_FAILED` | `message` | `validationFailed` | 否 | 字段级校验失败；data.field_errors 是 {field: message} 映射；UI 在对应字段下显示红字 + 顶部错误条 |
| `RATE_LIMITED` | `message` | `rateLimited` | 是 | 提交过于频繁；submitBtn 禁用 30s（带倒计时数字 — 待确认 1） |
| `NETWORK_ERROR` | `message` | `error` | 是 | 网络层失败；顶部错误条 + 字段值保留；按钮恢复可点 |
| `FORBIDDEN` | `message` | `error` | 否 | 未登录或 token 过期；前端跳 /login，不展示错误条 |
| `INTERNAL_ERROR` | `message` | `error` | 否 | 服务端未分类错误；顶部错误条文案 '服务暂时不可用' |

## 状态机

| from | event | to | render_assertion |
| ---- | ----- | -- | ---------------- |
| `idle` | submitBtn.onClick AND rating > 0 AND comment.trim().length >= 5 AND (email === '' OR email regex pass) | `submitting` | renders submitBtn 半透明 with 加载圆环; ratingGroup, commentField, emailField disabled |
| `submitting` | api_success（code === 0） | `success` | renders successIcon, successTitle, successBody, feedbackIdText with data.feedback_id, resetButton; hides form fields |
| `submitting` | api_error AND code === VALIDATION_FAILED | `validationFailed` | renders errorBanner with message; per-field hints filled from data.field_errors; submitBtn re-enabled; field values preserved |
| `submitting` | api_error AND code === RATE_LIMITED | `rateLimited` | renders submitBtn disabled with 30s countdown text; toast 「提交过于频繁，请 30 秒后再试」 |
| `submitting` | api_error AND code in (NETWORK_ERROR, INTERNAL_ERROR) | `error` | renders errorBanner; field values preserved; submitBtn re-enabled |
| `submitting` | api_error AND code === FORBIDDEN | `idle` | navigates to /login (not visible in component) |
| `validationFailed` | user edits any field | `idle` | clears errorBanner and per-field hints; submitBtn enabled if前端校验全过 |
| `error` | submitBtn.onClick AND 前端校验通过 | `submitting` | clears errorBanner; renders submitBtn 加载状态 |
| `rateLimited` | 30s countdown elapsed | `idle` | renders submitBtn enabled again; clears countdown text |
| `success` | resetButton.onClick | `idle` | clears all field values; renders empty form |
| `idle` | emailField.onBlur AND emailField.value !== '' AND email regex fails | `emailInvalid` | renders emailField with red border; renders emailHint '邮箱格式不正确' |
| `idle` | commentField.onBlur AND commentField.value.trim().length < 5 | `commentInvalid` | renders commentField with red border; renders commentHint '评论至少 5 个字符' |
| `emailInvalid` | emailField.onInput | `idle` | clears emailHint and red border; submitBtn re-evaluates 前端校验 |
| `commentInvalid` | commentField.onInput | `idle` | clears commentHint and red border |

## 父组件约定

若契约中无直接请求，父组件负责传入数据、loading、error 和交互回调。

## 待确认项汇总

| # | 待确认内容 | 需确认对象 | 优先级 |
|---|-----------|----------|-------|
| 1 | VALIDATION_FAILED 的 data.field_errors 当前 schema 描述为 {field: string}，但前端展示需要的是逐字段处理。后端是否能保证 field 名与前端字段名一致（rating / comment / email）？ | PM / 设计 / 后端 | P2 |
| 2 | data.submitted_at 当前 UI 不展示，是否在 v1 schema 中保留？同 search-panel.api-q1 风格选择 '保留 + 标注' | PM / 设计 / 后端 | P2 |
| 3 | RATE_LIMITED 30s 倒计时的视觉（按钮上数字 / 进度条 / 灰化无提示）；同 search-panel.mapping-q2 风格 | PM / 设计 / 后端 | P1 |
| 4 | feedbackIdText 是否需要支持点击复制？「参考编号」一般要可被用户记下来，但 mockup 按普通副文案画的，待设计签收 | PM / 设计 / 后端 | P1 |
| 5 | 是否需要提交确认弹窗？产品方未明确表态；倾向不做以减少摩擦，但若反馈是公开可见（如评论区）可能需要 | PM / 设计 / 后端 | P2 |
| 6 | rating 取消（点击同一颗第二次回到 0）的语义是否需要在 spec.md 里有 Scenario？目前隐含在 ratingGroup 内部不构成顶层状态转换 | PM / 设计 / 后端 | P2 |
