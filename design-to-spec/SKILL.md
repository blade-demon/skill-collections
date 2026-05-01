---
name: design-to-spec
metadata:
  version: 0.10.0
description: Use when a user provides a UI screenshot, mockup, wireframe, or component tree and wants implementation specs, component decomposition, API-field mapping, data-fetching behavior, or OpenSpec scenarios. Do not use for pure visual critique, pixel-level CSS extraction, or browsing-only design discussion.
---

# design-to-spec — OpenSpec 智能向导

将单个 UI 设计稿转换为可供 AI 或人类可靠实现的规格包。架构核心：用确定性的状态机包住不确定性的 LLM 推断，通过 YAML 契约传递阶段间事实，防止幻觉在链路中累积。

## 系统架构

```
WAITING_FOR_UI → WAITING_FOR_API → WAITING_FOR_MAPPING → GENERATING_SPEC
       ↓                 ↓                   ↓                    ↓
 UI_Schema.yaml    API_Schema.yaml   Mapping_Logic.yaml    contracts/ + 3 份输出文件
```

**控制流规则**：阶段顺序不可跳过；每阶段先做内部分析（不向用户展示），再输出干净的 YAML 代码块；第四阶段读取三份 YAML 机械填充模板，不重新分析图片或文档。

## 输出

```
<workspace>/design-spec/<component-name>/
├── contracts/
│   ├── ui-schema.yaml      — 阶段一事实契约
│   ├── api-schema.yaml     — 阶段二事实契约
│   └── mapping-logic.yaml  — 阶段三事实契约
├── notes.md            — 设计决策 + 数据契约 + 开放问题 + 计划提示
├── data-fetching.md    — 数据获取逻辑设计（实现开发者直接入口）
└── specs/<cap>/spec.md — OpenSpec 行为规格（Requirements + Scenarios）
```

---

## YAML 契约定义

三份契约是阶段间的唯一通信协议。字段级说明、填写规则和示例不要保留在主 skill 中；按需读取：

- `templates/ui-schema.yaml` + `schemas/ui-schema.json` — 阶段一输出参考和机器校验规则
- `templates/api-schema.yaml` + `schemas/api-schema.json` — 阶段二输出参考和机器校验规则
- `templates/mapping-logic.yaml` + `schemas/mapping-logic.json` — 阶段三输出参考和机器校验规则
- `references/contracts.md` — 字段语义、反漂移约束、校验命令

仅当你需要确认字段含义、契约约束或校验命令时读取 `references/contracts.md`；常规执行阶段优先读取对应模板和 schema。

---

## 启动话术

**触发时机**：skill 首次被调用、用户提供了设计稿、尚未开始阶段一内部分析前，先原文输出以下文本块，再进入分析。续跑场景（用户提供了 `contracts/` 路径跳过前三阶段）不输出。

```
📐 design-to-spec 启动
─────────────────────────────────────────
流程：4 个阶段，每阶段你确认后才进入下一步

✓ 设计稿        已收到，开始分析
? 接口文档      阶段二时粘贴（没有也可以继续）
? 交互说明      阶段三时用一两句话描述

输出位置：design-spec/<组件名>/
中途中断：contracts/ 已落盘，新会话可从任意阶段接续
─────────────────────────────────────────
```

---

## 阶段一：视觉提纯（WAITING_FOR_UI）

**系统话术：** "第一步：请上传设计稿截图（或直接描述组件树）。"

**内部分析协议**：执行以下分析，不向用户展示推理过程：

1. 逐一枚举所有可见元素：相对位置、文本内容**逐字包括省略号**、颜色/强调、是否可交互
2. 加载 `references/visual-analysis-checklist.md` 并线性过一遍（此后不再引用）
3. 建立层次结构：容器 → 区域 → 行 → 原子；识别复用原子候选（出现 ≥ 2 次或有通用特征）
4. 为每个可能交互的元素打置信度标签：`identified`（affordance 直接可见）/ `inferred`（惯例推断）/ `needs_human_input`（真正模糊）
5. 强制补全四个基础状态（loading / empty / success / error），设计稿未画的一律标 `needs_human_input`
6. 为复杂控件保留真实语义：基础 `type` 不够时用 `type: Custom` + `semantic_type`；局部状态必须填写 `scope` / `scope_components`

**输出协议**：内部分析完成后，输出：

```yaml
# UI_Schema
ui:
  name: ...
  components: [...]
  states: [...]
  layout: { ... }
```

**用户确认**：将 YAML 转换为 Markdown 展示，必须先给用户一个 ASCII 图表预览，再给结构化清单。可视化预览不得替代 YAML 契约；它只是帮助用户快速确认层级、交互和不确定点。

展示规则：

- ASCII 图表必须提供：从 `components[].parent_id` 生成 `text` 代码块，用缩进表达父子层级，节点文案格式为 `id [type]`。
- 图表只使用普通 ASCII 字符连接层级，例如 `|--`、`` `-- ``、`|`、空格；不要使用需要额外渲染能力的图表语法。
- 用 `*` 标 interactive，用 `?` 标 `needs_human_input`；节点数量 > 12 时只展示到区域/行级，并把剩余原子组件折叠为 `...`。
- 清单中按容器/区域/原子分组，不要只输出平铺列表；状态覆盖和待确认项保留在图表之后。
- ASCII 图表只能来自阶段一 YAML，不允许重新看图新增组件。

````
━━ 阶段 1 / 4：视觉提纯 ━━

✅ 识别到以下 UI 组件：

```text
SearchPanel [Container]
|-- * searchInput [Input] - 搜索输入框
|-- * submitBtn [Button primary] - 搜索提交
`-- ? errorState [Toast] - 错误态视觉待确认
```

组件清单：
- 容器: SearchPanel
- 交互: searchInput(Input), submitBtn(Button primary)
- 待确认: errorState(Toast)

状态覆盖：loading(inferred) / empty(inferred) / success(identified) / error(⚠️ needs_human_input)

⚠️ 待确认：error 态的视觉设计未在设计稿中体现，实现前需补充。

确认后进入阶段二（接口提纯）。
如有遗漏，直接说：还有 [位置] 的 [组件类型]，我会更新后再继续。
````

等待用户确认 → 状态流转至 `WAITING_FOR_API`。

**落盘规则**：用户确认后，立即写入 `<workspace>/design-spec/<component-name>/contracts/ui-schema.yaml`。后续阶段只读取该文件或其内存副本，不重新分析原始设计稿。

**若无接口文档**：询问是否纯展示组件（数据全由父组件传入），若是以 `API_Schema = {endpoints: []}` 直接进入阶段三，并立即写入 `<workspace>/design-spec/<component-name>/contracts/api-schema.yaml`。

---

## 阶段二：接口提纯（WAITING_FOR_API）

**系统话术：** "第二步：请粘贴接口文档（OpenAPI/Swagger、Markdown、TypeScript 类型、Postman Collection 均可）。"

**文档截断（进入推理前执行）**：若用户输入 > 2000 字，先用规则压缩：

- 删除所有 HTML 标签
- 删除 Base64 字符串（`[A-Za-z0-9+/]{50,}={0,2}`）
- 只保留含字段定义的段落
- 压制到 ≤ 4000 Token

**内部分析协议**：执行以下分析，不向用户展示推理过程：

1. 识别核心接口 URL + HTTP 方法（过滤掉 Header、鉴权等通用字段）
2. 提取入参和请求体（字段名 / 类型 / 必填性 / 可空性 / 枚举）
3. 提取出参（字段名 / 类型 / 可空性 / 枚举值），枚举值必须完整列出
4. 与 UI_Schema 做 diff：接口有但 UI 不消费的字段不放入 API_Schema
5. 保留影响 UI 的 `auth_required`、`cache_key_fields`、`pagination`、`status_codes`、`error_shape`
6. 标记不确定的枚举值为 `[UNKNOWN]` 并加入 `api.open_questions`

**输出协议**：

```yaml
# API_Schema
api:
  endpoints: [...]
  open_questions: [...]
```

**用户确认**：

```
━━ 阶段 2 / 4：接口提纯 ━━

✅ 识别到以下接口：
- GET /api/v1/search?keyword=...
  入参: keyword(string, required)
  出参: data.results(array), data.total(number)
  错误码: NETWORK_ERROR | NOT_FOUND | FORBIDDEN

确认后进入阶段三（逻辑映射）。
如需调整：
- 字段过多 → 回复"只保留 [字段A / 字段B]，其余删除"
- 字段缺失 → 回复"补一个字段 [name]([type])"
```

等待用户确认 → 状态流转至 `WAITING_FOR_MAPPING`。

**落盘规则**：用户确认后，立即写入 `<workspace>/design-spec/<component-name>/contracts/api-schema.yaml`。若无接口文档，也必须落盘 `api.endpoints: []` 和 `api.open_questions`，不要省略此文件。

---

## 阶段三：逻辑映射（WAITING_FOR_MAPPING）

**系统话术：** "第三步：请用自然语言描述这些组件和接口是怎么交互的？（触发时机、失败处理、缓存、分页等）"

**必须注入前两阶段产物**：推理时 context 中包含完整的 UI_Schema YAML 和 API_Schema YAML。

**内部分析协议**：注入前两阶段 YAML 上下文，执行以下分析，不向用户展示推理过程：

1. 逐一处理 `interactive: true` 的组件：触发哪些 request？每个 request 对应哪个 endpoint？传入哪些参数？
2. 建立绑定表：UI 字段 → API 参数 / request body；API 响应 → UI 展示；UI 操作 → 组件事件（标注是否有转换逻辑）
3. 遍历 UI_Schema.states，为每个状态推导状态机转换（尽量引用具体字段值如 `data.results.length === 0`）
4. 提取用户描述中的触发时机、错误处理、缓存、分页、重试、并发/abort 等信号，写入 `cache_policy` / `retry_policy` / `concurrency_policy`
5. 不确定项打入 `open_questions`，不猜测

**输出协议**：

```yaml
# Mapping_Logic
mapping:
  component: ...
  data_fetching: { requests: [...] }
  bindings: [...]
  state_machine: [...]
  open_questions: [...]
```

**用户确认**：

```
━━ 阶段 3 / 4：逻辑映射 ━━

✅ 状态机转换：
- idle → loading：submitBtn.onClick
- loading → success：api_success && data.results.length > 0
- loading → empty：api_success && data.results.length === 0
- loading → error：api_error

✅ 字段绑定：
- searchInput.value → GET /search.keyword (ui_to_api)
- data.results → resultList.items (api_to_ui)

确认后进入阶段四（自动生成规格文件）。
如需补充：直接说"还有一种情况：[条件] 时 [行为]"
```

等待用户确认 → 状态流转至 `GENERATING_SPEC`。

**落盘规则**：用户确认后，立即写入 `<workspace>/design-spec/<component-name>/contracts/mapping-logic.yaml`。阶段四必须从 `contracts/` 目录读取三份契约。

---

## 阶段四：规格组装（GENERATING_SPEC）

**此阶段不使用 LLM 进行新的推断。** 仅读取三份 YAML 契约，机械填充模板。

**进入阶段四时先输出状态行**：

```
━━ 阶段 4 / 4：规格组装（自动生成中）━━
开始读取三份契约并生成 notes.md / data-fetching.md / spec.md...
```

**默认生成路径**：先运行契约校验，再运行确定性生成脚本生成基线文件：

```bash
node design-to-spec/scripts/validate-contracts.js \
  --ui <out>/contracts/ui-schema.yaml \
  --api <out>/contracts/api-schema.yaml \
  --mapping <out>/contracts/mapping-logic.yaml

node design-to-spec/scripts/generate-output.js \
  --ui <out>/contracts/ui-schema.yaml \
  --api <out>/contracts/api-schema.yaml \
  --mapping <out>/contracts/mapping-logic.yaml \
  --out-dir <out>
```

脚本会写入 `contracts/*.yaml`、`notes.md`、`data-fetching.md`、`specs/<capability>/spec.md`。LLM 只允许在脚本产物基础上补充人类可读措辞、开放问题摘要和项目上下文；不得新增契约中没有的接口、状态、字段或交互。修订后必须运行 `scripts/validate-output.js --strict`。

### 4.1 变更类型判定（代码逻辑，不依赖 LLM）

```
Glob 检查是否存在同名组件文件或已有 spec
├── 找到 → 改造模式（templates/spec-modified.md）
└── 没找到 → 新建模式（templates/spec.md）
```

判定信号（任意命中即按「改造」处理）：Glob 找到同名组件 / 存在对应 spec / 用户描述含"改""加一个""调整""v2"等词。

### 4.2 数据映射规则

从三份 YAML 直接读取，不二次加工：

| 目标字段                     | 来源                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 数据契约字段名 / 类型 / 枚举 | `API_Schema.response_fields`（直接抄写，不改名）                                                                                  |
| 字段来源标注                 | `Mapping_Logic.bindings.direction`：`ui_to_api` → `source: prop`；`api_to_ui` → `source: api`；`ui_to_event` → `Events`；有 `transform` → `source: derived` |
| 状态枚举触发条件             | `Mapping_Logic.state_machine`（逐条读取 event 值）                                                                                |
| 状态可断言结果               | `Mapping_Logic.state_machine.render_assertion`，缺失时回退到 `UI_Schema.states[].render_assertion`                                |
| 开放问题                     | `API_Schema.open_questions` + `Mapping_Logic.open_questions`（直接搬运，不二次加工）                                              |
| 数据获取请求                 | `Mapping_Logic.data_fetching.requests[]` + cache/retry/concurrency policy                                                        |
| API 元信息                   | `API_Schema.request_body` + `pagination` + `error_shape` + `cache_key_fields` + `auth_required`                                  |
| 组件分解表                   | `UI_Schema.components`（id + parent_id + type + semantic_type + role + interactive + repeat_source）                             |

### 4.3 Scenario 生成规则

遍历 `Mapping_Logic.state_machine`，每条转换生成一个 Scenario：

- `WHEN`：引用 `event` 字段值（具体字段条件，如 `data.results.length === 0`）
- `THEN`：引用该转换的 `render_assertion`；若缺失，引用 `to` 状态在 `UI_Schema.states[].render_assertion` 中的值

若两处都没有 `render_assertion`，不要重新看图补猜；在 `open_questions` 增加 P0，并生成 `needs_human_input` 占位 Scenario。

遍历 `API_Schema.response_fields` 中有 `enums` 的字段，每个枚举值自动生成独立 Scenario。

遍历 `UI_Schema.components` 中 `interactive: true` 的组件，每个主交互生成一个 Requirement（2-4 条 Scenario）。

**写 spec.md 前必读**：`references/scenario-writing-guide.md` 和 `references/openspec-format.md`（仅此处加载一次）。

### 4.4 分阶段写入

每阶段写完立即调用写文件工具，然后压缩为锚点保留在 context：

**阶段 A** — 运行 `scripts/generate-output.js` 写入三份基线输出；如需增强文案，再修订 `notes.md` §为什么 + §决策 + §数据契约 + §数据获取方式
→ 写入后提炼「数据锚点」（≤ 8 行）；释放：原始 API 文档、UI_Schema / API_Schema 完整 YAML

**阶段 B** — 写 `data-fetching.md`（基于数据锚点，不重读 notes.md）
→ 写入后提炼「待确认锚点」（每条 ≤ 1 行）；释放：data-fetching.md 完整内容

**阶段 C** — 追加写 `notes.md` §状态枚举 + §组件分解 + §布局陷阱 + §置信度地图 + §开放问题 + §计划提示 + §交叉引用 + §埋点锚点
→ 写入后提炼「状态锚点」（每状态 ≤ 1 行）；释放：步骤 1-3 分析过程

**阶段 D** — 写 `spec.md`（基于状态锚点 + 数据锚点，不重读已生成文件）

**锚点示例**（context 中保持 ≤ 15 行）：

```
[数据锚点] request: searchRequest; endpoint: GET /api/v1/search?keyword; trigger: submitBtn.onClick; call_type: user_triggered
Props: results(array), total(number), error.code(NETWORK_ERROR|NOT_FOUND|FORBIDDEN)

[状态锚点]
idle: 初始态
loading: submitBtn.onClick 后 → api_call_pending
success: api_success && data.results.length > 0
empty: api_success && data.results.length === 0
error: api_error（FORBIDDEN 处理待确认 P0）

[待确认锚点]
⚠️ error.FORBIDDEN 跳转逻辑(P0)  ⚠️ error 态视觉设计(P0)  ⚠️ 分页方案(P1)
```

### 4.5 上下文预算门控

| 剩余 context | 策略                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| < 30K        | 跳过 annotated SVG                                                        |
| < 20K        | `data-fetching.md` 只写「数据流向 + 错误分级 + 待确认」三节               |
| < 10K        | **停止**，输出「⚠️ context 不足，已生成内容已写入磁盘，请开启新会话继续」 |

---

## 错误处理与重试

**每阶段 YAML 输出不合法时**（格式错误 / 缺少必填 key）：

1. 不向用户暴露错误细节
2. 携带错误信息重新请求一次：「你生成的 YAML 格式有误：{error}，请只修复 YAML 代码块后重新输出」
3. 最多重试 2 次
4. 2 次失败后才提示用户：

   > ⚠️ YAML 生成连续失败，请用自然语言描述以下信息，我来重新提取：
   > 组件名 / 主要交互是什么 / 接口数量和主要字段

**运行时常见问题——出现时主动输出以下提示，不要等用户翻文档：**

| 触发条件 | 输出给用户的补救提示 |
|---|---|
| 阶段一确认后用户说"漏了某个元素" | `直接告诉我：还有 [位置] 的 [组件类型]，我会更新 ui-schema 后继续。` |
| 阶段二提取了用户不需要的字段 | `回复：只保留 [字段A / 字段B / 字段C]，其余删除。` |
| 阶段三状态机缺少某条转换 | `回复补充条件，例如："还有一种情况：data.results.length > 100 时显示分页提示"` |
| spec.md 的 Scenario THEN 子句太空泛 | `⚠️ render_assertion 缺失导致 THEN 无法断言。请在 contracts/ui-schema.yaml 的对应 state 下补写 render_assertion（如 renders .empty-state），然后重跑 generate-output.js。` |
| validate-output 报 trace 锚点缺失 | `⚠️ trace 锚点（state:<id> / component:<id>）被误删。请把对应锚点加回 notes.md 或 spec.md，它们是机器校验用的，不是装饰。` |
| context 不足（门控触发或会话无响应） | `⚠️ context 不足，已停止生成。三份契约已落盘。请开新会话并发送：把 design-spec/<组件名>/contracts/ 目录路径告诉我，我从阶段四接续。` |

---

## 输出呈现

契约和三份文件写完后输出摘要：

```
━━ ✅ 完成（4 / 4）━━

📁 contracts/        — UI/API/Mapping 三份事实契约
📄 notes.md          — 设计决策 + 数据契约 + 开放问题
📄 data-fetching.md  — 数据获取逻辑（实现开发者直接入口）
📄 specs/.../spec.md — OpenSpec 行为规格

⚠️ 关键待确认：{API_Schema.open_questions + Mapping_Logic.open_questions 中 P0 条目，≤ 2 条}

建议下一步：将整个 design-spec/<component>/ 目录输入 /plan，传入 --target <stack>
```

显式告知用户：`contracts/` 是事实源；生成的 Markdown 是协作草稿，`⚠️ 待确认` 和 `needs_human_input` 是期待人类编辑的锚点。

---

## Annotated SVG（可选）

仅在以下任一条件命中时生成，不默认输出：

- 用户明确要求「视觉锚点图」
- 识别到较多 `needs_human_input`，需要可视化让 PM / 设计确认
- 组件跨多个角色协作（设计 ↔ 工程 ↔ 产品）

格式：左侧 mockup 缩略图 + 编号圆圈（映射到 UI_Schema component id），右侧 Legend 面板映射到 spec.md Requirements。
颜色约定：`#1664FF` 蓝 = identified、`#7B61FF` 紫 = inferred、`#FF7D00` 橙 = needs_human_input。

---

## 捆绑资源

按需加载，用完即释放，不跨阶段保留：

- `references/visual-analysis-checklist.md` — 视觉枚举检查清单（**仅阶段一**）
- `references/stack-hints/miniprogram.md` — 微信小程序注意事项（**仅阶段一，技术栈匹配时**）
- `references/stack-hints/web.md` — 通用 Web 注意事项（**仅阶段一，技术栈匹配时**）
- `references/scenario-writing-guide.md` — Scenario 写作纪律（**仅阶段四写 spec.md 前**，必读）
- `references/openspec-format.md` — OpenSpec 格式规则（**仅阶段四写 spec.md 前**）
- `references/contracts.md` — 三份 YAML 契约字段语义和校验命令（**字段含义不确定时读取**）
- `templates/ui-schema.yaml` — UI_Schema 契约模板（阶段一输出参考）
- `templates/api-schema.yaml` — API_Schema 契约模板（阶段二输出参考，含 `api.open_questions`）
- `templates/mapping-logic.yaml` — Mapping_Logic 契约模板（阶段三输出参考）
- `templates/notes.md` — notes 模板（阶段四 A）
- `templates/data-fetching.md` — 数据获取逻辑模板（阶段四 B）
- `templates/spec.md` — 新建组件规格模板（阶段四 D，新建时）
- `templates/spec-modified.md` — 改造组件规格模板（阶段四 D，改造时）
- `schemas/ui-schema.json` — UI_Schema JSON Schema（校验组件、状态、布局结构）
- `schemas/api-schema.json` — API_Schema JSON Schema（校验接口、参数、响应字段、开放问题）
- `schemas/mapping-logic.json` — Mapping_Logic JSON Schema（校验请求、绑定、状态机、开放问题）
- `examples/today-windvane/` — golden sample（**按需读取特定节，不整文件加载**）：
  - `notes.md` — 仅在风格校准时读「数据契约」或「埋点锚点」节
  - `specs/today-windvane/spec.md` — 仅在校准 Scenario 风格时读前两个 Requirement
  - `data-fetching.md` — 仅在需要参照七节结构时读
  - `contracts/ui-schema.yaml` — 阶段一 YAML 契约的填写示例（LLM 内部协议，非用户输出）
  - `contracts/api-schema.yaml` — 阶段二 YAML 契约的填写示例
  - `contracts/mapping-logic.yaml` — 阶段三 YAML 契约的填写示例
- `scripts/validate-contracts.js` — 先按 JSON Schema 校验三份契约结构，再校验跨文件引用关系（阶段四前可运行）
- `scripts/generate-output.js` — 从三份 YAML 契约确定性生成 `contracts/`、`notes.md`、`data-fetching.md`、`spec.md` 基线（阶段四默认入口）
- `scripts/validate-output.js` — 校验 `notes.md` / `data-fetching.md` / `spec.md` 是否覆盖契约中的必需状态、请求 endpoint、事件名和关键章节（阶段四后可运行）
- `scripts/tests/generate-output.test.js` — 使用 golden sample 回归验证生成脚本和输出校验链路

---

## 输出质量内联校准信号

对照检查，无需加载示例文件：

**数据契约**

- 字段数量 ≈ `API_Schema.response_fields` 中组件实际消费的字段数（接口有 UI 没用的不进 Props）
- 枚举字段展开为字面量联合类型，每个值有 inline UI 含义注释，无裸 `string` / `number`
- 所有字段有 `source: api | derived | prop | ui-only` 标注，无遗漏

**状态覆盖**

- `notes.md §状态枚举`：loading / empty / success / error 四个基础状态全部出现
- `spec.md`：每个 `required: true` 状态至少 1 条 Scenario；非 happy-path Scenario 数量 ≥ 1

**Scenario 质量**

- WHEN：引用具体字段值（`data.results.length === 0`），不用「无数据时」「接口失败时」
- THEN：指向可断言的 DOM/事件（`renders .empty-state`），不用「正确显示」「优雅降级」
- 每个 Requirement 2–4 条 Scenario

**埋点锚点**

- 所有 `tap-` / `view-` 前缀事件在表中至少出现 1 行
- 不埋点的显式标 `not-tracked`，不要漏行

**Traceability**

- `notes.md`：必须包含 `## Traceability`，列出 `component:<id>`、`binding:<index>:<direction>`、`state:<id>`
- `data-fetching.md`：每个 request 必须包含 `request:<id>`
- `spec.md`：每个 `required: true` 状态对应 Scenario 必须包含 `state:<id>` trace
- `scripts/validate-output.js --strict` 会校验上述 trace；不要手动删除

---

## 反模式

- **不要跳过阶段顺序。** 每份 YAML 契约是后续阶段的唯一事实源，跳过会导致幻觉在链路中累积。
- **不要在第四阶段重新推断。** 已有三份 YAML，直接读取填写模板；重新看图 / 重新读文档是浪费 context 且会引入不一致。
- **不要把 `needs_human_input` 静默猜测。** 打标记、进 `api.open_questions` 或 `mapping.open_questions`，在用户确认步骤处理，不要悄悄选一个答案。
- **不要跳过 YAML 用户确认。** 每阶段的 Markdown 确认是人机协作检查点，确保事实在进入下一阶段前已被用户验证。
- **不要全量保留接口文档原文。** 超长文档先截断到 ≤ 4000 Token，再进入 YAML 提取。
- **不要写可运行的组件代码。** 此技能生成规格，TypeScript 类型定义 / 伪代码可以，JSX / WXML 组件实现不可以。
- **不要用接口文档替代视觉枚举。** 接口回答「数据是什么」，设计稿回答「数据如何展示」，阶段一必须跑完再进阶段二。
- **不要把复合图片资产拆成代码绘制节点。** 渐变背景 + 堆叠文字 + 规则边界 → 默认 `Image` 组件 + URL 字段，不拆 rect + text。
