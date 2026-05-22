# 术语速查表

> 第一次读 `SKILL.md` 卡在生词时，回这里查一句话定义。每条术语：**一句话解释 + 一个具体例子 + 在哪个文件出现**。
>
> 按字母顺序排列，搜「Cmd+F」直接定位。

---

## 核心概念

### contract（契约）

**一句话**：阶段间传递的、机器可校验的事实文件，YAML 格式。

**例子**：`contracts/ui-schema.yaml` 是阶段一的契约，记录"设计稿里有哪些组件、什么状态"。

**出现在**：所有文档。design-to-spec 的核心架构原则就是「契约是事实源，markdown 是产物」。

---

### deterministic generation（确定性生成）

**一句话**：阶段四不调用 LLM 推断，只用 Node 脚本读取三份 YAML 机械填充模板，保证多次跑结果完全一样。

**例子**：`scripts/generate-output.js` 是确定性脚本；同一份契约跑 100 次，输出字节级一致。

**对比**：阶段一/二/三是 LLM 推断（非确定性），阶段四是确定性生成。这种"非确定性 → 确定性"切换是 design-to-spec 防幻觉的关键。

---

### golden sample（金样）

**一句话**：用于回归测试的标准产物对照集，验证生成脚本输出没漂移。

**例子**：`examples/today-windvane/` 和 `examples/price-card/` 都是 golden sample。`npm test` 会从它们的契约重新生成产物，与已落盘的版本逐字节比对。

**对比**：`samples/design-to-spec/search-panel/` 是「手动验证 sample」，包含 `inputs/` + `walkthrough.md` + 可运行 `src/`，目的不同。

---

### harness

**一句话**：执行 skill 的宿主环境（Claude Code、OpenCode、Cursor、Cline 等）。

**例子**：「OpenCode 原生支持 AGENTS.md 持久化项目上下文」中的 OpenCode 就是一种 harness。

**为什么重要**：不同 harness 对 skill 的支持机制不同（slash command / system prompt / plugin），影响安装与触发方式。

---

### OpenSpec

**一句话**：一种行为驱动的规格描述格式，用 `Requirement` + `Scenario` 组织可测试需求。

**例子**：

```markdown
## Requirement: User can submit search

### Scenario: Empty input shows validation error

WHEN user clicks submitBtn with empty searchInput
THEN renders .input-error with text "请输入关键词"
```

**为什么用它**：`Requirement` / `Scenario` / `WHEN` / `THEN` 是可测试关键字，下游 BDD 框架（Cucumber 等）能直接消费。

---

### state machine（状态机）

**一句话**：组件从一个状态到另一个状态的转换图，每条转换包含 `from / event / to / render_assertion`。

**例子**：

```yaml
state_machine:
  - from: idle
    event: submitBtn.onClick
    to: loading
    render_assertion: 'renders loadingState'
```

**出现在**：`mapping-logic.yaml` 的 `state_machine[]`。阶段四把每条转换生成一条 Scenario。

---

### trace anchor（trace 锚点）

**一句话**：写在 markdown 里的 ID 引用注释（`<!-- trace: state:loading -->`），让 `validate-output.js` 校验产物没丢契约引用。

**4 类锚点**：

| 锚点                          | 出现位置                | 引用的契约字段                        |
| ----------------------------- | ----------------------- | ------------------------------------- |
| `component:<id>`              | notes.md 组件分解节     | `ui.components[].id`                  |
| `binding:<index>:<direction>` | notes.md 数据契约节     | `mapping.bindings[]`（1-based 顺序）  |
| `state:<id>`                  | spec.md Scenario        | `ui.states[].id`（required: true）    |
| `request:<id>`                | data-fetching.md 请求节 | `mapping.data_fetching.requests[].id` |

**反模式**：润色 markdown 时把 trace 当装饰删掉。

---

## 字段术语（按契约分组）

### UI_Schema 字段

#### `confidence`

**一句话**：阶段一对每个元素打的置信度标签，三档。

| 值                  | 含义                                                    |
| ------------------- | ------------------------------------------------------- |
| `identified`        | 设计稿里 affordance 直接可见，无歧义                    |
| `inferred`          | 行业惯例推断（如表单 → 必有 submit）                    |
| `needs_human_input` | 真正模糊，需人工拍板。**必须配对一条 `open_questions`** |

---

#### `interactive`

**一句话**：组件是否有用户交互（点击、输入、滑动等）。

**例子**：`searchInput.interactive: true`，`titleText.interactive: false`。

**为什么重要**：阶段四遍历 `interactive: true` 的组件生成 Requirement。

---

#### `parent_id`

**一句话**：父组件的 id，用来表达组件层级；顶层组件写 `root`。

**例子**：

```yaml
- id: searchPanel
  parent_id: root
- id: searchInput
  parent_id: searchPanel
```

阶段一确认时的 ASCII 图表就是从 `parent_id` 生成的。

---

#### `render_assertion`

**一句话**：可被自动测试断言的 DOM/事件结果，描述"这个状态下用户应该看到什么"。

**例子**：`"renders .empty-state and hides .result-list"`。

**反例**：`"正确显示"`、`"优雅降级"`（这两种会触发 `validate-output --strict` 报错）。

---

#### `repeat_source`

**一句话**：列表项绑定的数据源路径，表达 v-for / map 重复结构。

**例子**：`orderItem.repeat_source: "data.orders[]"`，意思是 orderItem 会按 `data.orders` 数组重复渲染。

**非重复组件**：写空字符串 `""`。

---

#### `role`

**一句话**：组件在交互层级里的语义角色，6 选 1。

| 值           | 用法                       |
| ------------ | -------------------------- |
| `primary`    | 主操作按钮、主输入框       |
| `secondary`  | 次操作（取消、查看更多）   |
| `action`     | 单次触发的图标按钮、菜单项 |
| `decoration` | 纯视觉装饰                 |
| `container`  | 布局容器                   |
| `data_field` | 纯数据展示字段（无交互）   |

---

#### `scope` / `scope_components`

**一句话**：状态的作用范围，避免局部 loading 被误写成整组件 loading。

**例子**：表格行内编辑时只锁定单元格：

```yaml
- id: cellLoading
  scope: element
  scope_components: [cell_3_5]
```

**4 个值**：`component`（默认） / `region` / `element` / `global`。

---

#### `semantic_type`

**一句话**：当 `type` 是 `Custom` 或基础类型不足以表达真实控件时，填写业务语义。

**例子**：`type: Custom, semantic_type: "date-range-picker"`。

---

### API_Schema 字段

#### `auth_required`

**一句话**：该接口是否需要鉴权；如果鉴权失败会改变 UI 分支（如跳登录、显示未登录 CTA）则必须 true。

**对比**：通用的 Header 鉴权字段（如 token）默认过滤；`auth_required` 是布尔标志，影响 UI 状态。

---

#### `cache_key_fields`

**一句话**：参与缓存命中判断的请求字段。

**例子**：搜索结果按 `[keyword, cursor]` 缓存，则 `cache_key_fields: [keyword, cursor]`。

---

#### `error_shape`

**一句话**：业务错误的结构化定义，每条包含 code / 提示字段路径 / 是否可重试 / 对应 UI 状态。

**例子**：

```yaml
error_shape:
  - code: NETWORK_ERROR
    message_field: error.message
    retryable: true
    ui_state: error
```

---

#### `pagination`

**一句话**：分页类型 + 涉及字段。

**4 种 type**：`none` / `page` / `cursor` / `offset` / `unknown`。

**例子**：

```yaml
pagination:
  type: cursor
  request_fields: [cursor, limit]
  response_fields: [data.nextCursor, data.hasMore]
```

---

### Mapping_Logic 字段

#### `binding direction`

**一句话**：UI 与 API 的数据流向，3 选 1。

| direction     | 含义                          | 必填字段                     |
| ------------- | ----------------------------- | ---------------------------- |
| `ui_to_api`   | 用户输入 → 请求参数           | `source_ui` + `target_api`   |
| `api_to_ui`   | 响应字段 → UI 展示            | `source_api` + `target_ui`   |
| `ui_to_event` | UI 触发组件事件，不直接调 API | `source_ui` + `target_event` |

---

#### `call_type`

**一句话**：请求触发模式，4 选 1。

| 值               | 例子                 |
| ---------------- | -------------------- |
| `user_triggered` | 用户点击搜索按钮     |
| `on_mount`       | 进页面立即拉数据     |
| `polling`        | 定时刷新             |
| `realtime`       | WebSocket / SSE 推送 |

---

#### `concurrency_policy`

**一句话**：并发请求处理策略：能不能取消、按什么 key 去重、过期响应怎么办。

**例子**：搜索框每次输入都发请求，要 abort 上一次：

```yaml
concurrency_policy:
  abortable: true
  dedupe_key: keyword
  stale_response: ignore
```

---

#### `transform`

**一句话**：binding 时是否对数据做加工。

| 值       | 例子                                   |
| -------- | -------------------------------------- |
| `none`   | 直接绑                                 |
| `format` | 日期 `2026-05-04` → `5月4日`           |
| `derive` | 从多字段计算（折扣率 = 1 - 现价/原价） |

---

## 流程术语

### 状态机的 4 个阶段

| 状态                  | 触发                   | 负责                       |
| --------------------- | ---------------------- | -------------------------- |
| `WAITING_FOR_UI`      | skill 启动             | 阶段一：视觉提纯           |
| `WAITING_FOR_API`     | 用户确认 ui-schema     | 阶段二：接口提纯           |
| `WAITING_FOR_MAPPING` | 用户确认 api-schema    | 阶段三：逻辑映射           |
| `GENERATING_SPEC`     | 用户确认 mapping-logic | 阶段四：规格组装（确定性） |

---

### `open_questions` 优先级

| 优先级 | 含义                            | 处理时机           |
| ------ | ------------------------------- | ------------------ |
| `P0`   | 阻塞 coding。未关闭不能进入实现 | 评审会必须解决     |
| `P1`   | 阻塞具体场景但不阻塞主流程      | 编码中或评审后跟进 |
| `P2`   | 优化项                          | 待办池，不绑时间   |

---

### 阶段四的 4 个写入子阶段（A / B / C / D）

| 子阶段 | 写什么                     | 释放什么 context                       |
| ------ | -------------------------- | -------------------------------------- |
| A      | 三份契约 + notes.md 部分节 | 原始 API 文档、UI/API_Schema 完整 YAML |
| B      | data-fetching.md           | data-fetching.md 完整内容              |
| C      | notes.md 剩余节            | 步骤 1-3 分析过程                      |
| D      | spec.md                    | （已基本释放完，靠状态/数据锚点写）    |

详见 `SKILL.md §4.4 分阶段写入`。

---

## 易混淆术语对照

### `needs_human_input` vs `open_questions`

|        | `needs_human_input`                                                  | `open_questions`                         |
| ------ | -------------------------------------------------------------------- | ---------------------------------------- |
| 是什么 | 字段级标签                                                           | 列表级条目（含 id + content + priority） |
| 答的是 | 「**哪里**不确定」                                                   | 「**要决定什么**，谁来定」               |
| 关系   | **必须配对**：每个 `needs_human_input` 字段对应一条 `open_questions` |

详见 `references/contracts.md §needs_human_input 与 open_questions 使用规则`。

---

### `examples/` vs `samples/`

|          | `examples/`（skill 目录内）        | `samples/`（仓库根）                                   |
| -------- | ---------------------------------- | ------------------------------------------------------ |
| 用途     | 回归测试金样                       | 手动验证全流程                                         |
| 内容     | `contracts/` + 生成的 markdown     | `inputs/` + `design-spec/` + `src/` + `walkthrough.md` |
| 谁会读   | `npm test` / 字段填写参考          | 第一次使用 skill 的同事                                |
| 当前数量 | 2 份（today-windvane, price-card） | 2 份（search-panel, feedback-form）                    |

---

### `validate-contracts.js` vs `validate-output.js`

|            | `validate-contracts.js`      | `validate-output.js`                     |
| ---------- | ---------------------------- | ---------------------------------------- |
| 何时跑     | 阶段四前                     | 阶段四后                                 |
| 输入       | 三份 yaml                    | 三份 yaml + 三份 markdown                |
| 检查什么   | YAML 结构 + 跨契约引用一致性 | markdown 是否覆盖契约必需项 + trace 锚点 |
| `--strict` | 无                           | 把 warning 升级成错误                    |

---

## 相关文档

- `SKILL.md` — 工作原理、4 阶段架构（最权威定义）
- `references/contracts.md` — 字段语义和约束的完整版
- `references/troubleshooting.md` — 卡住时按症状查
- `ONBOARDING.md` — 第一次接触 skill 的 3 分钟决策
