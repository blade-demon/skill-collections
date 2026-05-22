# feedback-form — add-feedback-form 的增量规格

<!-- CONTRACT_DERIVED: 此文件由 generate-output.js 从 YAML 契约机械生成。4B 阶段 LLM 不得添加契约中不存在的 Requirement 或 Scenario，不得修改 state: / request: trace anchor。-->

## ADDED Requirements

### Requirement: FeedbackForm 状态覆盖

The system SHALL render each contract-defined required state with observable output.

#### Scenario: submitting state after submitBtn.onClick AND rating > 0 AND comment....

- WHEN submitBtn.onClick AND rating > 0 AND comment.trim().length >= 5 AND (email === '' OR email regex pass)
- THEN renders submitBtn 半透明 with 加载圆环; ratingGroup, commentField, emailField disabled (`submitting`)
- AND trace id `state:submitting`

#### Scenario: success state after api_success（code === 0）

- WHEN api_success（code === 0）
- THEN renders successIcon, successTitle, successBody, feedbackIdText with data.feedback_id, resetButton; hides form fields (`success`)
- AND trace id `state:success`

#### Scenario: validationFailed state after api_error AND code === VALIDATION_FAILED

- WHEN api_error AND code === VALIDATION_FAILED
- THEN renders errorBanner with message; per-field hints filled from data.field_errors; submitBtn re-enabled; field values preserved (`validationFailed`)
- AND trace id `state:validationFailed`

#### Scenario: rateLimited state after api_error AND code === RATE_LIMITED

- WHEN api_error AND code === RATE_LIMITED
- THEN renders submitBtn disabled with 30s countdown text; toast 「提交过于频繁，请 30 秒后再试」 (`rateLimited`)
- AND trace id `state:rateLimited`

#### Scenario: error state after api_error AND code in (NETWORK_ERROR, INTERNA...

- WHEN api_error AND code in (NETWORK_ERROR, INTERNAL_ERROR)
- THEN renders errorBanner; field values preserved; submitBtn re-enabled (`error`)
- AND trace id `state:error`

#### Scenario: idle state after api_error AND code === FORBIDDEN

- WHEN api_error AND code === FORBIDDEN
- THEN navigates to /login (not visible in component) (`idle`)
- AND trace id `state:idle`

#### Scenario: idle state after user edits any field

- WHEN user edits any field
- THEN clears errorBanner and per-field hints; submitBtn enabled if前端校验全过 (`idle`)
- AND trace id `state:idle`

#### Scenario: submitting state after submitBtn.onClick AND 前端校验通过

- WHEN submitBtn.onClick AND 前端校验通过
- THEN clears errorBanner; renders submitBtn 加载状态 (`submitting`)
- AND trace id `state:submitting`

#### Scenario: idle state after 30s countdown elapsed

- WHEN 30s countdown elapsed
- THEN renders submitBtn enabled again; clears countdown text (`idle`)
- AND trace id `state:idle`

#### Scenario: idle state after resetButton.onClick

- WHEN resetButton.onClick
- THEN clears all field values; renders empty form (`idle`)
- AND trace id `state:idle`

#### Scenario: emailInvalid state after emailField.onBlur AND emailField.value !== ''...

- WHEN emailField.onBlur AND emailField.value !== '' AND email regex fails
- THEN renders emailField with red border; renders emailHint '邮箱格式不正确' (`emailInvalid`)
- AND trace id `state:emailInvalid`

#### Scenario: commentInvalid state after commentField.onBlur AND commentField.value.tr...

- WHEN commentField.onBlur AND commentField.value.trim().length < 5
- THEN renders commentField with red border; renders commentHint '评论至少 5 个字符' (`commentInvalid`)
- AND trace id `state:commentInvalid`

#### Scenario: idle state after emailField.onInput

- WHEN emailField.onInput
- THEN clears emailHint and red border; submitBtn re-evaluates 前端校验 (`idle`)
- AND trace id `state:idle`

#### Scenario: idle state after commentField.onInput

- WHEN commentField.onInput
- THEN clears commentHint and red border (`idle`)
- AND trace id `state:idle`

### Requirement: FeedbackForm 事件输出

The system SHALL emit contract-defined UI events without inventing navigation or write-side effects.

#### Scenario: tap-feedback-submit event

- WHEN 用户触发 `tap-feedback-submit` 对应的 UI 行为
- THEN 组件派发 `tap-feedback-submit` 事件 1 次

#### Scenario: tap-feedback-reset event

- WHEN 用户触发 `tap-feedback-reset` 对应的 UI 行为
- THEN 组件派发 `tap-feedback-reset` 事件 1 次
