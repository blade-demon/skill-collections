# FeedbackForm — 交互说明

> 阶段三粘进 skill 的自然语言描述。

---

FeedbackForm 是一个三字段表单：评分（rating，1-5 星）+ 评论（comment，textarea）+ 邮箱（email，可选）。提交触发 `POST /api/v1/feedback`。

**字段交互**：

- **rating**：5 颗星图标，鼠标悬停时高亮，点击锁定。点击同一颗第二次可取消（回到无评分）
- **comment**：textarea，trim 后长度必须在 5-500 之间。用户输入时不展示字符计数；超长由后端拦截
- **email**：可选；用户开始输入后做前端格式校验（标准 email regex）；为空时不校验

**前端校验**（提交前）：

- rating：必须有值（1-5 整数）
- comment：trim 后长度 ≥ 5
- email：要么为空，要么是合法邮箱

任一不通过：submitBtn 保持灰化禁用状态，**不展示字段级红字**。只有当用户主动 blur 某个字段时才展示对应的字段级 hint（避免用户刚开始输入就被红字打断）。

**字段级状态**：

- email blur 后值非空且格式不合法：邮箱框边框变红 + 下方红字「邮箱格式不正确」
- comment blur 后 trim 后长度 < 5：textarea 边框变红 + 下方红字「评论至少 5 个字符」
- rating 没有"blur"概念，所以前端不单独提示；submit 时若仍为空，按钮置灰即可

**提交时机**：

- submitBtn 在以下条件**全部**满足时才可点击（disabled = false）：
  1. rating > 0
  2. comment.trim().length >= 5
  3. email 为空 OR 通过 email regex
- 满足条件后点击：进入 `submitting` 状态，按钮半透明 + 加载圆环；3 个输入字段都禁用编辑

**响应处理**：

- `code === 0`：进入 `success` 态。整个表单被替换为：绿色对勾 + 「感谢您的反馈！」+ 「参考编号 #{feedback_id}」+ 「再提交一条」按钮。点击「再提交一条」回到 `idle`，所有字段清空
- `code === "VALIDATION_FAILED"`：顶部插入红色错误条显示 `message`；同时根据 `data.field_errors` 给对应字段加红字（覆盖前端校验提示）。状态回到 `idle`，按钮重新可用
- `code === "RATE_LIMITED"`：顶部 Toast「提交过于频繁，请 30 秒后再试」；按钮禁用 30 秒（按钮上显示倒计时数字），到时恢复
- `code === "NETWORK_ERROR"` / `INTERNAL_ERROR`：进入 `error` 态。顶部红色错误条；表单字段保留原值（不要清空）；按钮恢复可点（用户可再试）
- `code === "FORBIDDEN"`：跳登录页 `/login`，不显示错误条

**并发与 abort**：

- submitting 态内按钮禁用，物理上无法重复触发
- 用户切换页面（unmount）时如果请求未完成，应当 abort，但不需要在重新挂载时恢复状态（每次新会话都是新 idle）

**埋点**：

- `tap-feedback-submit`：点击 submitBtn 时上报，参数 `rating`、`comment_length`、`email_provided`（boolean）
- `view-feedback-success`：进入 success 态时上报，参数 `feedback_id`、`rating`
- `view-feedback-error`：进入 error 或 invalid 态时上报，参数 `error_code`、`field_errors`（数组）

**待确认**：

1. RATE_LIMITED 30 秒倒计时的视觉（按钮上数字 / 进度条 / 灰化无提示）— P1
2. success 态 `参考编号 #{feedback_id}` 的字号和颜色 mockup 是按"普通副文案"画的，但参考编号一般要可复制 — 待设计签收 P1
3. 是否需要"提交确认弹窗"（比如点击 submit 后弹一个 modal「确认提交吗？」）— 产品方未明确 P2
