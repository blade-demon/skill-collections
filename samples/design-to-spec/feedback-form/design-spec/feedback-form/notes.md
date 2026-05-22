# FeedbackForm — 设计笔记

> 由 `design-to-spec/scripts/generate-output.js` 根据 YAML 契约生成。此文件是协作草稿，`needs_human_input` 和开放问题需要人类确认。
>
> **节标记说明**：`<!-- CONTRACT_DERIVED -->` 节由脚本从 YAML 契约机械生成，4B 阶段 **不得修改**字段名、类型、枚举值、trace anchor；`<!-- NARRATIVE -->` 节允许 LLM 补充背景、决策理由、项目上下文，但不得引入契约中不存在的组件、状态或接口。

<!-- NARRATIVE -->
## 为什么

`FeedbackForm` 将设计稿中的可见结构、接口字段和交互状态固化为可实现规格。

<!-- NARRATIVE -->
## 决策

- **契约优先** — 本文仅使用 `contracts/*.yaml` 中的事实，不重新分析设计稿或接口文档。
- **状态可测试** — `required: true` 的状态会进入 OpenSpec Scenario。

<!-- CONTRACT_DERIVED -->
## 数据契约

```ts
interface FeedbackFormData {
  // data.feedback_id: string;  // source: api — 后端生成的反馈 ID；前端在 success 态显示「参考编号 #{id}」
  // data.submitted_at: string;  // source: api — ISO 8601 时间戳；UI 不展示，仅用于客户端日志
}
```

### 接口字段映射表

| 接口字段名 | 接口类型 | 枚举值（全量） | UI 中展示为 | 来源标注 | 备注 |
|-----------|---------|--------------|------------|---------|------|
| `data.feedback_id` | `string` | — | 由 Mapping_Logic.bindings 指定 | `api` | 后端生成的反馈 ID；前端在 success 态显示「参考编号 #{id}」 |
| `data.submitted_at` | `string` | — | 由 Mapping_Logic.bindings 指定 | `api` | ISO 8601 时间戳；UI 不展示，仅用于客户端日志 |

### 请求体字段映射表

| request_body 字段 | 类型 | 必填 | 可空 | 枚举值 | 说明 |
| ----------------- | ---- | ---- | ---- | ------ | ---- |
| `rating` | `1 \| 2 \| 3 \| 4 \| 5` | true | false | 1 / 2 / 3 / 4 / 5 | 整数 1-5 星；1=非常差，5=非常好 |
| `comment` | `string` | true | false | — | trim 后长度 5-500；前端校验 + 后端兜底 |
| `email` | `string` | false | true | — | 可选；为空时省略；非空时必须匹配邮箱 regex（前端 + 后端双层校验） |

### 接口元信息

| endpoint | auth_required | cache_key_fields | pagination | status_codes |
| -------- | ------------- | ---------------- | ---------- | ------------ |
| `POST /api/v1/feedback` | true | — | none | 200 |

### 错误结构映射表

| code | message_field | retryable | ui_state | notes |
| ---- | ------------- | --------- | -------- | ----- |
| `VALIDATION_FAILED` | `message` | false | `validationFailed` | 字段级校验失败；data.field_errors 是 {field: message} 映射；UI 在对应字段下显示红字 + 顶部错误条 |
| `RATE_LIMITED` | `message` | true | `rateLimited` | 提交过于频繁；submitBtn 禁用 30s（带倒计时数字 — 待确认 1） |
| `NETWORK_ERROR` | `message` | true | `error` | 网络层失败；顶部错误条 + 字段值保留；按钮恢复可点 |
| `FORBIDDEN` | `message` | false | `error` | 未登录或 token 过期；前端跳 /login，不展示错误条 |
| `INTERNAL_ERROR` | `message` | false | `error` | 服务端未分类错误；顶部错误条文案 '服务暂时不可用' |

<!-- CONTRACT_DERIVED -->
## 数据获取方式

| 接口/方法名 | 调用时机 | 请求关键参数 | 响应关键字段 | 缓存策略 | 补充说明 |
| --------- | ------- | ---------- | ---------- | ------- | ------- |
| `POST /api/v1/feedback` | `submitBtn.onClick AND 前端校验全部通过` | 无 | data.feedback_id, data.submitted_at | 待项目确认 | request `submitRequest`, call_type `user_triggered` |

<!-- CONTRACT_DERIVED -->
## 状态枚举

| 状态 | 触发条件 | UI 表现 | required | source | scope | scope_components | render_assertion |
| ---- | -------- | ------- | -------- | ------ | ----- | ---------------- | ---------------- |
| `idle` | 表单初始挂载，或 success 后用户点击 resetButton，或 error 态用户编辑字段 | identified | true | visible | component | — | renders ratingGroup, commentField, emailField, submitBtn (disabled until valid); hides errorBanner, successIcon |
| `submitting` | 用户点击 submitBtn 后，请求未返回前 | identified | true | visible | component | — | renders submitBtn 半透明 with 加载圆环; ratingGroup, commentField, emailField disabled |
| `success` | api_success（code === 0） | identified | true | visible | component | — | renders successIcon, successTitle '感谢您的反馈！', successBody, feedbackIdText with data.feedback_id, resetButton; hides ratingGroup, commentField, emailField, submitBtn |
| `error` | api_error with code in (NETWORK_ERROR, INTERNAL_ERROR) | identified | true | visible | component | — | renders errorBanner with code-specific text; preserves field values; submitBtn re-enabled |
| `validationFailed` | api_error with code === VALIDATION_FAILED | identified | true | visible | component | — | renders errorBanner with backend message; per-field hints filled from data.field_errors; submitBtn re-enabled |
| `rateLimited` | api_error with code === RATE_LIMITED | needs_human_input | false | policy | element | submitBtn | renders submitBtn disabled with 30s countdown text; toast 「提交过于频繁，请 30 秒后再试」 dismissed automatically |
| `emailInvalid` | emailField.onBlur AND emailField.value !== '' AND email regex fails | identified | true | visible | element | emailField, emailHint | renders emailField with red border; renders emailHint '邮箱格式不正确' |
| `commentInvalid` | commentField.onBlur AND commentField.value.trim().length < 5 | identified | true | visible | element | commentField, commentHint | renders commentField with red border; renders commentHint '评论至少 5 个字符' |

<!-- CONTRACT_DERIVED -->
## 组件分解

| 组件 | type | semantic_type | parent_id | role | repeat_source | 目的 | 复用信号 |
| ---- | ---- | ------------- | --------- | ---- | ------------- | ---- | -------- |
| `feedbackForm` | `Form` | `` | `root` | `container` | `` | 顶层表单容器；包含 errorBanner（条件）+ formTitle + 3 字段区 + submitBtn | component-local |
| `errorBanner` | `Toast` | `` | `feedbackForm` | `secondary` | `` | 顶部红色条；error 态出现；文案根据 errorCode 切换 | component-local |
| `formTitle` | `Text` | `` | `feedbackForm` | `primary` | `` | 表单标题；600 weight 13px | component-local |
| `ratingGroup` | `Custom` | `rating-stars` | `feedbackForm` | `container` | `` | 5 星评分组；点击同一颗第二次可取消；hover 高亮（hover 不进契约）；rating > 0 才视为有值 | component-local |
| `ratingLabel` | `Text` | `` | `ratingGroup` | `secondary` | `` | 字段标签；红色星号表示必填 | component-local |
| `commentField` | `Input` | `textarea` | `feedbackForm` | `primary` | `` | 多行 textarea；placeholder「告诉我们您的想法…」；trim 后 5-500 长度 | component-local |
| `commentLabel` | `Text` | `` | `commentField` | `secondary` | `` | 字段标签；红色星号 | component-local |
| `commentHint` | `Text` | `` | `commentField` | `secondary` | `` | 字段下方的红字提示；commentField blur 后长度不足时显示 | component-local |
| `emailField` | `Input` | `` | `feedbackForm` | `primary` | `` | 单行邮箱输入；placeholder「name@example.com」；可选字段；blur 后做前端 regex 校验 | component-local |
| `emailLabel` | `Text` | `` | `emailField` | `secondary` | `` | 字段标签；不带必填星号 | component-local |
| `emailHint` | `Text` | `` | `emailField` | `secondary` | `` | 字段下方的红字提示；emailField blur 后非空且格式错误时显示 | component-local |
| `submitBtn` | `Button` | `` | `feedbackForm` | `action` | `` | 主提交按钮；rating + comment 满足前端校验时才 enabled；submitting 态半透明 + 加载圆环；rate_limited 后倒计时显示在按钮上（待确认 1） | component-local |
| `successIcon` | `Icon` | `` | `feedbackForm` | `decoration` | `` | success 态绿色对勾图标；圆形浅绿底 | component-local |
| `successTitle` | `Text` | `` | `feedbackForm` | `primary` | `` | success 态标题文案 | component-local |
| `successBody` | `Text` | `` | `feedbackForm` | `secondary` | `` | success 态副文案 | component-local |
| `feedbackIdText` | `Text` | `` | `feedbackForm` | `secondary` | `` | success 态显示 data.feedback_id；样式（是否可复制 / 字号 / 颜色）待设计签收 | component-local |
| `resetButton` | `Button` | `` | `feedbackForm` | `action` | `` | success 态按钮；点击后清空所有字段并回到 idle | component-local |

<!-- NARRATIVE -->
## 布局陷阱

- 卡片内部垂直堆叠：errorBanner（条件）→ formTitle → ratingGroup → commentField（含 commentLabel + commentHint）→ emailField（含 emailLabel + emailHint）→ submitBtn；success 态替换为 successIcon + successTitle + successBody + feedbackIdText + resetButton

<!-- CONTRACT_DERIVED -->
## 置信度地图

| 元素 / 行为 | 状态 | 备注 |
| ----------- | ---- | ---- |
| `feedbackForm` | identified | 顶层表单容器；包含 errorBanner（条件）+ formTitle + 3 字段区 + submitBtn |
| `errorBanner` | identified | 顶部红色条；error 态出现；文案根据 errorCode 切换 |
| `formTitle` | identified | 表单标题；600 weight 13px |
| `ratingGroup` | identified | 5 星评分组；点击同一颗第二次可取消；hover 高亮（hover 不进契约）；rating > 0 才视为有值 |
| `ratingLabel` | identified | 字段标签；红色星号表示必填 |
| `commentField` | identified | 多行 textarea；placeholder「告诉我们您的想法…」；trim 后 5-500 长度 |
| `commentLabel` | identified | 字段标签；红色星号 |
| `commentHint` | identified | 字段下方的红字提示；commentField blur 后长度不足时显示 |
| `emailField` | identified | 单行邮箱输入；placeholder「name@example.com」；可选字段；blur 后做前端 regex 校验 |
| `emailLabel` | identified | 字段标签；不带必填星号 |
| `emailHint` | identified | 字段下方的红字提示；emailField blur 后非空且格式错误时显示 |
| `submitBtn` | identified | 主提交按钮；rating + comment 满足前端校验时才 enabled；submitting 态半透明 + 加载圆环；rate_limited 后倒计时显示在按钮上（待确认 1） |
| `successIcon` | identified | success 态绿色对勾图标；圆形浅绿底 |
| `successTitle` | identified | success 态标题文案 |
| `successBody` | identified | success 态副文案 |
| `feedbackIdText` | needs_human_input | success 态显示 data.feedback_id；样式（是否可复制 / 字号 / 颜色）待设计签收 |
| `resetButton` | identified | success 态按钮；点击后清空所有字段并回到 idle |
| `idle` | identified | 表单初始挂载，或 success 后用户点击 resetButton，或 error 态用户编辑字段 |
| `submitting` | identified | 用户点击 submitBtn 后，请求未返回前 |
| `success` | identified | api_success（code === 0） |
| `error` | identified | api_error with code in (NETWORK_ERROR, INTERNAL_ERROR) |
| `validationFailed` | identified | api_error with code === VALIDATION_FAILED |
| `rateLimited` | needs_human_input | api_error with code === RATE_LIMITED |
| `emailInvalid` | identified | emailField.onBlur AND emailField.value !== '' AND email regex fails |
| `commentInvalid` | identified | commentField.onBlur AND commentField.value.trim().length < 5 |

<!-- CONTRACT_DERIVED -->
## 开放问题

1. [P2] VALIDATION_FAILED 的 data.field_errors 当前 schema 描述为 {field: string}，但前端展示需要的是逐字段处理。后端是否能保证 field 名与前端字段名一致（rating / comment / email）？
2. [P2] data.submitted_at 当前 UI 不展示，是否在 v1 schema 中保留？同 search-panel.api-q1 风格选择 '保留 + 标注'
3. [P1] RATE_LIMITED 30s 倒计时的视觉（按钮上数字 / 进度条 / 灰化无提示）；同 search-panel.mapping-q2 风格
4. [P1] feedbackIdText 是否需要支持点击复制？「参考编号」一般要可被用户记下来，但 mockup 按普通副文案画的，待设计签收
5. [P2] 是否需要提交确认弹窗？产品方未明确表态；倾向不做以减少摩擦，但若反馈是公开可见（如评论区）可能需要
6. [P2] rating 取消（点击同一颗第二次回到 0）的语义是否需要在 spec.md 里有 Scenario？目前隐含在 ratingGroup 内部不构成顶层状态转换

<!-- CONTRACT_DERIVED -->
## 计划提示

- `generated_from_contracts`
- `validate_output_required`

<!-- CONTRACT_DERIVED -->
## 交叉引用

- 输入契约：`./contracts/ui-schema.yaml`、`./contracts/api-schema.yaml`、`./contracts/mapping-logic.yaml`
- 规格增量：`./specs/feedback-form/spec.md`

<!-- NARRATIVE -->
## 建议的下一步

将完整输出目录交给规划或实现流程；下游不应重新阅读原始设计稿，而应消费本目录和 `contracts/*.yaml`。

<!-- CONTRACT_DERIVED -->
## Traceability

| trace_id | kind | source | target | notes |
| -------- | ---- | ------ | ------ | ----- |
| `component:feedbackForm` | component | `feedbackForm` | `root` | type `Form`, semantic `` |
| `component:errorBanner` | component | `errorBanner` | `feedbackForm` | type `Toast`, semantic `` |
| `component:formTitle` | component | `formTitle` | `feedbackForm` | type `Text`, semantic `` |
| `component:ratingGroup` | component | `ratingGroup` | `feedbackForm` | type `Custom`, semantic `rating-stars` |
| `component:ratingLabel` | component | `ratingLabel` | `ratingGroup` | type `Text`, semantic `` |
| `component:commentField` | component | `commentField` | `feedbackForm` | type `Input`, semantic `textarea` |
| `component:commentLabel` | component | `commentLabel` | `commentField` | type `Text`, semantic `` |
| `component:commentHint` | component | `commentHint` | `commentField` | type `Text`, semantic `` |
| `component:emailField` | component | `emailField` | `feedbackForm` | type `Input`, semantic `` |
| `component:emailLabel` | component | `emailLabel` | `emailField` | type `Text`, semantic `` |
| `component:emailHint` | component | `emailHint` | `emailField` | type `Text`, semantic `` |
| `component:submitBtn` | component | `submitBtn` | `feedbackForm` | type `Button`, semantic `` |
| `component:successIcon` | component | `successIcon` | `feedbackForm` | type `Icon`, semantic `` |
| `component:successTitle` | component | `successTitle` | `feedbackForm` | type `Text`, semantic `` |
| `component:successBody` | component | `successBody` | `feedbackForm` | type `Text`, semantic `` |
| `component:feedbackIdText` | component | `feedbackIdText` | `feedbackForm` | type `Text`, semantic `` |
| `component:resetButton` | component | `resetButton` | `feedbackForm` | type `Button`, semantic `` |
| `binding:1:ui_to_api` | binding | `ratingGroup` | `rating` | transform `1-5 integer; 0 means unset (前端校验拦截)` |
| `binding:2:ui_to_api` | binding | `commentField` | `comment` | transform `trim() before submit; length 5-500` |
| `binding:3:ui_to_api` | binding | `emailField` | `email` | transform `trim() before submit; if empty omit field; non-empty must match email regex` |
| `binding:4:api_to_ui` | binding | `data.feedback_id` | `feedbackIdText` | transform `format as '参考编号 #{feedback_id}'` |
| `binding:5:ui_to_event` | binding | `submitBtn` | `tap-feedback-submit` | transform `{ rating, comment_length: comment.length, email_provided: email !== '' }` |
| `binding:6:ui_to_event` | binding | `resetButton` | `tap-feedback-reset` | transform `{ feedback_id: lastFeedbackId }` |
| `state:idle` | state | `idle` | `component` | required `true` |
| `state:submitting` | state | `submitting` | `component` | required `true` |
| `state:success` | state | `success` | `component` | required `true` |
| `state:error` | state | `error` | `component` | required `true` |
| `state:validationFailed` | state | `validationFailed` | `component` | required `true` |
| `state:rateLimited` | state | `rateLimited` | `submitBtn` | required `false` |
| `state:emailInvalid` | state | `emailInvalid` | `emailField, emailHint` | required `true` |
| `state:commentInvalid` | state | `commentInvalid` | `commentField, commentHint` | required `true` |

<!-- CONTRACT_DERIVED -->
## 埋点锚点

| 锚点 ID | 触发 Scenario（对应 spec.md 标题或 Requirement） | 类型 | 关键参数（语义层） | 备注 |
| ------- | ----------------------------------------- | ---- | ---------------- | ---- |
| `tap-feedback-submit` | `tap-feedback-submit` | click | 由事件 detail 决定 | 从 `ui_to_event` 绑定生成 |
| `tap-feedback-reset` | `tap-feedback-reset` | click | 由事件 detail 决定 | 从 `ui_to_event` 绑定生成 |
