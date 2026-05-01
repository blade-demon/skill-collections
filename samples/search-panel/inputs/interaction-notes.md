# SearchPanel — 交互说明

> 阶段三粘进 skill 的自然语言描述。下面这段就是直接交给 AI 的原文。

---

SearchPanel 是搜索框 + 提交按钮 + 结果列表的组合。

**触发**：用户在 `searchInput` 输入关键词后，点击 `submitBtn` 或按 Enter 键，发起 `GET /api/v1/search`。请求参数 `keyword` 来自 `searchInput.value`，trim 前后空格。`page` 固定传 1（v1 不分页）。

**输入校验**：

- 关键词为空时，按钮置灰且不发请求；用户点击时不做提示，按钮不响应
- 关键词长度超过 32 时，按钮可点但发请求，依赖后端返回 `INVALID_KEYWORD`，UI 在 `searchInput` 下方显示红字
- 不做前端 debounce（每次点击立刻发请求）

**状态机**：

- 初始：`idle`，结果区显示「请输入关键词后点击搜索」引导文案
- 点击提交后：`loading`，结果区渲染 3 行骨架占位；`submitBtn` 半透明禁用，显示加载圆环
- 接口返回成功且 `data.results.length > 0`：`success`，渲染结果列表 + 顶部「共 N 条结果」
- 接口返回成功且 `data.results.length === 0`：`empty`，结果区中央显示放大镜图标 + 「未找到相关结果」
- 接口返回业务错误或网络错误（`code !== 0`）：`error`，结果区显示红色感叹号 + 文案 + 重试按钮

**重试**：`error` 态显示 `retryButton`。点击后用最近一次的 `keyword` 重新发起请求；不允许在 `loading` 态显示重试。

**并发与 abort**：

- 当 `loading` 中用户改了 `searchInput.value` 后再次点击 `submitBtn`，应当 abort 上一个请求，发起新的
- 不做 keyword 去重（用户可能想重新搜同一个词，比如想换页 — 虽然 v1 没分页）
- 过期响应（abort 后才到达的旧请求）必须丢弃，不渲染

**鉴权**：

- `FORBIDDEN` 错误码不进 error 态，直接跳登录页（前端路由 `/login`）
- 登录回来 `searchInput` 空，回到 `idle`

**错误码具体处理**：

- `INVALID_KEYWORD`：搜索框下方红字提示后端 message，不进 error 态（searchInput 仍可编辑）
- `RATE_LIMITED`：顶部 Toast「请求过于频繁，请稍后再试」+ 5 秒后自动重试一次（最多 1 次）
- `NETWORK_ERROR`：标准 error 态 + 重试按钮，由用户手动触发重试
- `FORBIDDEN`：跳登录，见上
- `INTERNAL_ERROR`：error 态 + 文案改为「服务异常，请联系管理员」+ 重试按钮（虽然不太可能成功）

**埋点**：

- `tap-search-submit`：用户点击 submit 时上报，参数 `keyword`、`keyword_length`
- `view-search-result`：success 态首次渲染时上报，参数 `keyword`、`result_count`
- `view-search-empty`：empty 态首次渲染时上报，参数 `keyword`
- `view-search-error`：error 态首次渲染时上报，参数 `keyword`、`error_code`

**待确认**：

1. `INVALID_KEYWORD` 的红字提示样式（位置、字号、颜色）设计稿没画，待设计签收 — P0
2. `RATE_LIMITED` 自动重试 5 秒的倒计时是否要可视化（进度条 / 数字）— P1
3. 登录回来后是否保留之前的 keyword（产品诉求 vs 安全考虑）— P1
