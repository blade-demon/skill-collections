---
name: design-to-spec
metadata:
  version: 0.5.1
description: |
  将 UI mockup 图片转换为三份结构化产物：notes.md（设计决策 + 数据契约）、data-fetching.md（数据获取逻辑设计）、spec.md（OpenSpec 行为规格）。

  分析前先通过交互式步骤 0 主动收集：接口文档（决定数据契约准确度）、字段映射含枚举值全量（决定枚举展开深度）、数据获取方式的开放式描述（决定 data-fetching.md 内容深度）。三种输入各司其职：接口文档回答「数据是什么」，mockup 回答「数据如何展示」，用户描述回答「数据怎么拿到」。

  触发条件：用户提供 UI 图片，并讨论实现方案、组件拆分、数据结构、props 设计或布局策略。触发词包括「设计稿」「mockup」「wireframe」「UI 图」「帮我把这张图做成组件」「from this screenshot, plan the implementation」等。

  不触发：纯美学反馈（"好看吗"）、像素级 CSS 提取、没有实现意图的浏览性讨论。
---

# design-to-spec

将单个 UI mockup 图片转换为结构化的规格包，使另一个 AI（或人类）能够可靠地实现。输出在核心层面有意**与技术栈无关**，并在其上叠加可选的特定技术栈提示，因此同一技能可用于微信小程序、React、Vue、Flutter 等。

## 为什么存在这个技能

原始的 mockup 是一份糟糕的实现简报：它告诉你事物看起来怎么样，但没有告诉你它们*做什么*、需要什么数据结构、它们如何适应更大的系统、或哪些部分是可复用的。要求 AI「从图片构建这个」通常会产生能编译但悄悄发明数据字段、错过交互、并重新发明代码库中已存在组件的代码。

这个技能通过强制执行一个有纪律的流程来缩小这个差距 —— **交互式输入收集（接口文档 / 字段映射 / 数据获取描述）→ 视觉枚举 → 歧义标记 → 契约推导（含枚举展开）→ 数据获取逻辑推导 → 组件分解 → 规格实体化** —— 并生成下游工具（特别是 OpenSpec 与 Superpowers `plan`）可以在不重新推导相同上下文的情况下使用的产物。`data-fetching.md` 是专门给实现开发者的自包含文档，回答"数据层怎么写"这个 `notes.md` 和 `spec.md` 都不直接回答的问题。

## 输出

三份文件，固定结构：

```
<workspace>/design-spec/<component-name>/
├── notes.md                         # 为什么 + 决策 + 数据契约 + 置信度 + 开放问题 + 计划提示
├── data-fetching.md                 # 数据获取逻辑设计（触发时机 + 请求链路 + 错误分级 + 状态机）
└── specs/<capability>/spec.md       # OpenSpec 增量（Requirements + Scenarios）
```

信息密度足够供 Superpowers `plan` 消费，`spec.md` 路径兼容 OpenSpec 工具链。`data-fetching.md` 是独立的工程设计文档，可直接交给实现开发者而无需阅读 `notes.md` 全文。不生成 `proposal.md` / `design.md` / `tasks.md` —— 这些要么是 `notes.md` 已覆盖的子集，要么是下游 plan 阶段会重新生成的中间产物。

## 何时使用

当用户提供（或引用）UI mockup 图片并想要以下任一项时使用此技能：

- 实现规格、契约或计划
- 组件分解 / props 设计 / 数据模型
- 向现有系统添加组件的变更提案
- 供另一个 AI agent 或开发者使用的交接文档

如果用户只想要 HTML/CSS 像素匹配而没有行为、数据、集成 —— 跳过此技能并直接写 markup。如果用户只想要设计反馈（「UX 好吗」），跳过此技能。

## 输入

当此技能触发时，以下输入通过两个渠道收集：**用户主动提供**（已在对话中）和**步骤 0 的交互式询问**（工作流开始前主动发起）。只有图片是硬性前提，其余通过步骤 0 的分支引导获取。

1. **图片**（必需）—— mockup 本身。作为图片附件已在对话上下文中。
2. **组件名称**（推荐）—— 例如 `today-windvane`。如果缺失，从 mockup 的可见标题或用户的措辞推断，然后在输出中确认。
3. **目标技术栈提示**（可选）—— `miniprogram` / `react` / `vue` / `flutter` / agnostic。如果缺失，默认 agnostic，仅当捆绑的提示文件匹配时才发出特定技术栈提示。
4. **设计系统提示**（可选）—— `tdesign` / `nutui` / `vant` / `antd` / `shadcn` / 等。用于将原子组件建议偏向现有基础组件。
5. **能力名称**（可选）—— 此功能所属的 OpenSpec `capability`。如果缺失，默认组件名称。
6. **现有代码库提示**（可选）—— 如果用户的项目有可复用的原子组件（例如现有的 `vertical-scroll` 组件），在分解中引用它们，以便输出不会重新发明它们。对 `components/` 或 `src/components/` 进行快速 `Glob` 通常就足够了。
7. **API 文档 / 接口契约 + 字段映射**（通过步骤 0 交互式收集）—— 见下方步骤 0 的两条分支。
8. **数据获取方式补充说明**（可选）—— 接口调用的行为约束，接口文档通常不写但实现必须知道的信息，例如：
   - 何时调用（挂载时自动 fetch / 用户触发 / 父组件控制）
   - 轮询间隔或实时推送方式（WebSocket / SSE / 长轮询）
   - 分页方案（page+pageSize / cursor / 无限滚动偏移量）
   - 竞态处理需求（搜索框防抖、旧请求取消）
   - 缓存策略（SWR / TTL / 不缓存）
   - 鉴权方式（Bearer Token / Cookie / 无需）
   - 开发阶段 Mock 方案（MSW / 本地 fixture / 已有 mock server）

   如果用户未主动提供且组件明显需要调接口，在收集输入阶段通过 **AskUserQuestion** 询问这些关键点（不要一次列出所有问题，优先问触发时机和分页方案）。纯展示型组件（数据完全由父组件 Props 传入）可跳过此输入。

不要因缺失可选输入而阻塞。使用合理的默认值并在置信度地图中标记假设。

## 工作流程 —— 按顺序执行这些步骤

顺序很重要。步骤 0 是交互式输入收集，必须在任何分析之前完成；步骤 1-2 是证据收集，必须在综合*之前*进行，以防止模型虚构元素。

### 步骤 0：接口文档与数据来源确认（交互式，阻塞）

**在开始任何视觉分析之前执行此步骤。** 通过 `AskUserQuestion` 主动询问，等待用户回复后再继续。不要跳过、也不要把问题合并到输出文件里——这是一次真正的人机交互停顿。

#### 步骤 0a：询问接口文档

用以下措辞（或等效中文）通过 `AskUserQuestion` 提问：

> 在开始分析之前，请问您是否有该组件对应的**接口文档**？
>
> 支持的格式：OpenAPI/Swagger YAML、Markdown 接口文档、Postman Collection、TypeScript 类型定义、GraphQL Schema 等。
>
> - **有** → 请直接粘贴内容（或描述接口结构），我会根据文档生成更准确的数据契约
> - **暂无 / 跳过** → 直接回复「跳过」，我将根据截图推断组件所需字段

等待用户回复，根据回复走对应分支：

---

#### 步骤 0b-A：用户提供了接口文档

读取用户提供的接口文档内容，然后**再次通过 `AskUserQuestion`** 询问字段映射：

> 收到接口文档，谢谢！
>
> 为了更准确地对应截图中的 UI 展示，请您提供**接口响应字段 → UI 数据含义**的映射关系。
>
> 格式示例（无需严格按表格，文字描述也可以）：
>
> | 接口字段名 | 类型 | 枚举值（如有） | UI 中展示为 | 备注 |
> |-----------|------|--------------|------------|------|
> | `fundName` | string | — | 基金名称（卡片标题） | |
> | `nav` | number | — | 最新净值，保留 4 位小数 | |
> | `yearChange` | number | — | 年涨跌幅，带正负号和百分比符号 | 前端派生还是后端直出？ |
> | `status` | string | `ACTIVE` / `SUSPENDED` / `CLOSED` | 状态标签，ACTIVE 显示绿色「正常」，其余显示灰色「暂停」 | |
> | `riskLevel` | integer | `1`=低风险 / `2`=中风险 / `3`=高风险 | 风险等级图标 | |
>
> **枚举字段请务必列出所有枚举值及其 UI 展示含义**，这直接影响状态枚举和 Scenario 生成。
>
> 如果字段名和枚举值语义已足够清晰，回复「字段名即含义」即可，我会自行推断。

收到映射信息后，将其缓存到「接口字段映射表」，在步骤 5（数据契约推导）时作为首要事实源使用，字段来源标注升级为 `source: api (mapped)`。

**若用户跳过映射**（回复「字段名即含义」或类似措辞）：直接进入步骤 1，在步骤 2 从接口文档中抽取字段四元组，并在数据契约注释里标 `source: api`。

---

#### 步骤 0b-B：用户跳过 / 暂无接口文档

通过 `AskUserQuestion` 询问：

> 好的，我将根据截图推断组件所需的数据字段（Props）。
>
> 推断出的 Props 接口后续可以作为**后端 Java DTO 的参考依据**。请问是否需要在输出中同时生成一份面向后端的 **Java DTO 草稿**（`record` 或 `class` 结构）？
>
> - **需要** → 我会在 `notes.md` 中额外输出一节 Java DTO 草稿（字段名转 camelCase，类型映射到 Java 基础类型）
> - **不需要** → 仅输出 TypeScript Props，跳过 Java 部分

根据用户回复设置标志位 `generate_java_dto = true/false`，在步骤 7 写 `notes.md` 时据此决定是否输出「Java DTO 草稿」节。

所有从截图推断的字段在数据契约中标 `source: api (inferred)`，并在开放问题里添加「请后端确认接口字段名与类型，可参考 notes.md 中的 Props 推断」。

---

#### 步骤 0c：开放式数据获取描述（两条分支后统一执行）

无论用户是否提供了接口文档，都执行此步骤。通过 `AskUserQuestion` 发起一次**开放式提问**，让用户用自己的语言描述数据获取逻辑，而不是填空或选择。

> 最后一个问题：请**用自己的话**描述一下这个组件是怎么拿到数据的？
>
> 不需要固定格式，自然描述即可。比如想想这几个方向：
>
> - 数据从哪来？（某个接口 / 父组件传进来 / 本地缓存 / 多个来源聚合）
> - 什么时候会去请求？（页面一打开 / 用户点了某个按钮 / 滚动到底部触发）
> - 如果请求失败了，组件怎么处理？
> - 有没有缓存、轮询、或者实时推送的需求？
>
> 如果这个组件不需要请求接口（比如纯展示、数据完全由父组件传入），直接说「不需要」即可。

**等待用户回复。** 不论回复详略，都进入步骤 1；从用户描述中提取以下信号，缓存备用（步骤 5.5 时消费）：

| 信号维度 | 从描述中捕获的关键词 / 短语 | 不确定时的默认值 |
|---------|------------------------|---------------|
| 是否直接调接口 | 「接口」「请求」「fetch」vs「父组件传」「props」 | 假设调接口，标 `inferred` |
| 触发时机 | 「打开」「挂载」「点击」「滚动」「切换 tab」 | 挂载时，标 `inferred` |
| 失败处理 | 「重试」「提示」「兜底」「toast」「回退」 | 标 `needs_human_input` |
| 特殊机制 | 「缓存」「轮询」「WebSocket」「SSE」「分页」「防抖」 | 无，标 `identified`（用户明确说没有） |

若用户回复「不需要」或描述为纯展示组件，设置 `data_source = props_only`，步骤 5.5 中「数据获取方式」节写「由父组件传入，无直接接口调用」，`data-fetching.md` 仅输出简化版（只含「数据流向」和「父组件约定」两节）。

---

**步骤 0 完成后**，继续进入步骤 1。

### 步骤 1：视觉枚举通道

在任何解释之前，列出你能在图片中实际看到的每个元素。这是最重要的步骤 —— 跳过它是 mockup-based AI 工作出错的方式。

对于每个元素，捕获：相对于父元素的位置、文本内容**逐字包括省略号和截断**、颜色/强调（例如橙色 CTA、灰色次要文本），以及它是否看起来可交互（按钮、箭头、标签）。

阅读 `references/visual-analysis-checklist.md` 并线性浏览它。不要因为检查项「明显缺失」而跳过 —— 明确的缺失本身就是信号。

### 步骤 2：技术栈和上下文解析

从输入和对话中确定目标技术栈和设计系统。如果存在匹配的 `references/stack-hints/<stack>.md` 文件，立即阅读 —— 它列出了要融入笔记的特定技术栈注意事项。如果没有匹配，保持技术栈无关。

如果可以访问用户的项目根目录，对 `components/`、`src/components/` 或等效目录进行快速 `Glob`，以发现组件应该复用的现有原子组件。按路径捕获它们，以便您可以在 `notes.md` 中引用它们。

**如果用户提供了 API 文档 / 接口契约**，在此步骤读取并提取以下四元组到内存（不必全文记忆）：

- 每个相关字段的 **名称**（业务语义名，如 `yearChange`、`fundCode`）
- **类型**（`string` / `number` / `string[]` / 嵌套对象等）
- **可空性**（`required` / `optional` / `nullable`）
- **枚举值或格式约束**（如 `error.code` 的具体枚举、日期格式、精度）

这四元组将在步骤 5（数据契约推导）成为事实源，让数据契约从猜测升级为抄写。

**如果用户提供了 API 文档 / 接口契约**（输入 #7），在本步骤一并摄取。提取每个接口返回体的「字段名 + 类型 + 可空 + 枚举值 + 单位/格式」五元组并缓存到临时结构。常见来源：OpenAPI YAML（`components.schemas`）、后端 TS 类型文件（`interface Foo { ... }`）、Markdown 接口文档的「响应字段表」、GraphQL schema 的 type 定义。**不要尝试对接口文档做业务语义改写**——字段名照抄（哪怕后端写得不够语义化），因为数据契约要和实际接口对齐，改名是实现层的事情。

### 步骤 3：信息分层

将枚举的元素分组为层次结构：**容器 → 区域 → 行 → 原子**。识别可复用原子组件的候选者（徽章、标签、微型图表、药丸按钮）。任何出现两次或以上 —— 或具有通用原始组件的视觉特征 —— 都是原子候选者。

### 步骤 4：交互推断与置信度标志

对于每个*可能*可交互的元素，将其分类为：

- **identified** —— 直接可见的 affordance（标有「购买」的按钮、`>` chevron、「点击」注释）
- **inferred** —— 按惯例它是可点击的但 mockup 没有说明（例如，整个卡片可能是可点击的，因为它是 feed 卡片）
- **needs_human_input** —— 真正模糊的（这一行是导航还是展开？）

将这些标志带到规格中 —— `inferred` 的成为带有 WHEN/THEN 子句的场景*并且*在置信度地图中注明；`needs_human_input` 的成为开放问题。

### 步骤 4.5：状态枚举

填写 `notes.md` 的「状态枚举」表。即使 mockup 只画了 success 态，**也必须显式列出 `loading` / `empty` / `error` 这三个 ✅ 必需状态** —— 在 mockup 没提供视觉时，写「mockup 未提供 → needs_human_input」并把对应问题加到「开放问题」小节。

跳过此步会导致 spec.md 只覆盖 happy-path，是当前 skill 最容易踩的回归。每个 ✅ 状态在步骤 7 都要变成 spec.md 中的至少一条 Scenario（详见 `references/scenario-writing-guide.md` 的「状态覆盖硬规则」）。

**如果有 API 文档**，状态的「触发条件」列可以升级为具体的接口契约：

- `loading` 的触发条件从「数据请求中」升级为「HTTP 请求未返回 && `props.loading === true`」
- `empty` 的触发条件从「内容为空」升级为「`data.items.length === 0` 且接口返回 2xx」
- `error` 的触发条件按接口文档定义的 `error.code` 枚举值展开（例如 `NETWORK_ERROR` / `VALIDATION_FAILED` / `FORBIDDEN` 各自是否独立展示）
- 这些具体触发条件在步骤 7 会直接变成 spec.md Scenario 里可断言的 `WHEN` 子句

### 步骤 5：数据契约推导

使用**业务语义字段名**生成 TypeScript 风格的接口，而不是视觉名称。优先使用 `yearChange` 而不是 `redText`；`hot` 而不是 `flameIcon`；`ctaLabel` 而不是 `buttonText`。

输入（props）、输出（事件）以及值得公开的任何内部状态都应单独枚举。明确标记可选字段。

**字段来源标注（必做）**：每个字段在 inline TS 注释中写明来源：

- `// source: api` —— 直接来自后端接口文档，字段名和类型必须与接口一致
- `// source: derived` —— 前端从其他字段派生（如 `yearChange = (currentNav - yearAgoNav) / yearAgoNav * 100`），注释里写出派生公式
- `// source: prop` —— 由父组件/宿主页面传入（如 `isLoggedIn`），不来自接口也非派生
- `// source: ui-only` —— UI 内部状态，不进 Props（如 `isExpanded`、`scrollY`），通常不在 Props interface，而在「内部状态」里

**接口文档 + mockup 双输入时的处理流程**：

1. **以接口文档字段为基线**，抄写字段名、类型、可空性 —— 不要猜
2. **枚举字段必须展开**（这是最容易被省略的一步）：
   - 在 TS interface 里用字符串字面量联合类型：`status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'`，而不是宽泛的 `string`
   - 每个枚举值在 inline 注释里写明 UI 展示规则，例如 `// ACTIVE → 绿色「正常」标签；SUSPENDED / CLOSED → 灰色「暂停」`
   - 如果接口文档枚举值不完整（仅写了部分示例），在开放问题里加「请确认 `<fieldName>` 的完整枚举值列表」，字段类型降级为 `string` 并标 `needs_human_input`
   - 整型枚举（如 `riskLevel: 1 | 2 | 3`）同样展开，注释里写每个值的含义，不要用 `number`
3. **和 mockup 做 diff**，找出两类异常：
   - **接口有 UI 没用** → 不放入 Props（Props 只放组件实际消费的字段），在 `notes.md` 决策里加一条「Props 为什么不透传 X 字段」，避免下游 AI 看到接口文档时自作主张加回来
   - **UI 有接口没有** → 标为 `source: derived` 或 `source: prop`，必须有明确来源解释；否则退化为 `needs_human_input` 并加开放问题
4. **可空性冲突**时以接口文档为准，mockup 里画了 fallback 视觉但接口字段是 `required` 的话，那个 fallback 视觉属于 `partial` 状态而非 `success` 状态
5. **新增 `backend_contract_required` 计划提示**到「计划提示」小节，让实现 AI 调真实接口时做二次校验——接口文档可能过时

**枚举字段与步骤 4.5（状态枚举）的联动**：每个枚举值都是潜在的独立 UI 状态。处理完枚举字段后，回头检查步骤 4.5 的状态枚举表——`status: 'ACTIVE' | 'SUSPENDED'` 这样的字段通常意味着至少需要两条独立 Scenario，而非用 `partial` 笼统覆盖。

**只有 mockup、没有接口文档时**：从视觉反推字段，所有字段标 `source: api (inferred)`，并在开放问题里加一条「请确认接口字段名与类型，以及所有枚举字段的完整取值列表」。

### 步骤 5.5：数据获取方式推导

本步骤同时负责两件事：（1）填写 `notes.md` 的「数据获取方式」表；（2）**生成独立的 `data-fetching.md` 文档**。

**信息来源优先级**（高 → 低）：

1. 步骤 0c 用户的开放式描述 → 最高优先级，视为 `identified`，是 `data-fetching.md` 的主要素材
2. API 文档（输入 #7）中的接口路径、HTTP 方法、query 参数 → 补充 `identified`，调用时机仍需推断
3. 从 mockup 的 UI 行为反推（如下拉刷新控件 → `pullToRefresh`，「加载更多」→ 分页）→ `inferred`
4. 无任何线索 → `needs_human_input`，加入「开放问题」

**从开放式描述中提炼结构化内容**：

用户的自然语言描述往往混杂了触发时机、错误处理、缓存、分页等多个维度。将其拆解到 `data-fetching.md` 对应节，不要直接复制原文。例如：

- 「页面打开就请求，失败了给个 toast 然后展示空态」
  → 触发时机：组件挂载（`onMounted`）；错误处理：toast 通知 + 降级到 `empty` 态（而非 `error` 态）
- 「用户点了刷新按钮才重新拉，有个 loading 转圈」
  → 触发时机：用户操作（`tap-refresh`）；需要 `loading` 中间态
- 「搜索框输入后 300ms 请求」
  → 竞态风险高，需防抖 + 旧请求取消；在「竞态处理」节展开

**生成 `data-fetching.md`**：从 `templates/data-fetching.md` 填写。**所有来自步骤 0c 用户描述的内容都要放进去**，不要遗漏——这是用户在整个流程中贡献原始知识最密集的时刻。模糊或矛盾的描述转化为 `⚠️ 待确认` 条目，不要静默忽略。

**与其他步骤的联动**：

- 「调用时机 = 挂载时」→ 在步骤 4.5 的 `loading` 触发条件里补充「组件挂载即发起请求」
- 「分页 / 无限滚动」→ 在状态枚举里确认是否需要 `fetchingMore` 中间态
- 「竞态风险」→ 在`data-fetching.md` 竞态节展开，并在「计划提示」里加 `race_condition_handling` 标签
- 「缓存策略」→ 影响 `stale` 状态是否需要在状态枚举中保留

**纯展示组件的处理**（`data_source = props_only`）：`notes.md` 的「数据获取方式」节只写一行「由父组件传入，无直接接口调用」；`data-fetching.md` 输出简化版（仅「数据流向」+「父组件约定」两节，其余节省略）。

### 步骤 6：组件分解

提出包含三列的组件树：**名称**、**目的**、**复用信号**（以下之一：`business-specific`、`feature-shared`、`atom-candidate`、`existing:{path}`）。

如果在步骤 2 中找到了现有原子组件，使用 `existing:{path}` 引用它们，以便实现者不会重新发明它们。

### 步骤 6.5：判定变更类型（新建 vs 改造）

在生成 `spec.md` 前，回答一个问题：**这是新建组件，还是改造既有组件？**

判定信号（任意一条命中即按"改造"处理）：

1. 步骤 2 的 Glob 找到了同名或职责重叠的现有组件
2. 仓库里已有对应 spec（`openspec/specs/<capability>/spec.md` 或 `design-spec/<component>/specs/<capability>/spec.md`）
3. 用户描述里出现"改"、"加一个"、"调整"、"v2"、"重做"、"优化"、"迁移" 等词
4. mockup 与既有版本明显是同一组件的迭代

**模糊时优先按"改造"处理** —— 漏判改造比漏判新建代价高（漏判改造会写出与既有 spec 冲突的全新需求集，下游需要返工对齐）。

分支选择：

- **新建** → 用 `templates/spec.md`（仅 `## ADDED Requirements`）
- **改造** → 用 `templates/spec-modified.md`（`## MODIFIED` + 可选 `## ADDED` + 可选 `## REMOVED`）；必须在文件头引用既有 spec 路径，且 `### Requirement:` 标题**逐字**与原 spec 一致

详细的 ADDED / MODIFIED / REMOVED 判定规则见 `references/openspec-format.md` 末尾。

### 步骤 7：规格实体化

**在写任何 Scenario 之前**，先读 `references/scenario-writing-guide.md`。它列出了四个最容易犯的错（fits/overflows 样板重复、vibes 结果、把 CSS 属性当 Scenario、只覆盖 happy path），以及每个 Requirement 应该有几条 Scenario（2–4 条）。跳过这一步，生成出来的 spec 会是「看起来像规格但不能当测试读」的那种——返工成本比读一次 guide 高得多。

从 `templates/notes.md` 填写 `notes.md`。spec 模板根据步骤 6.5 的判定结果选择：**新建** 用 `templates/spec.md`（仅 ADDED）；**改造** 用 `templates/spec-modified.md`（MODIFIED + 可选 ADDED/REMOVED）。最终都写入 `specs/<capability>/spec.md`。

**数据契约节的条件输出**：

- 如果用户在步骤 0b-A 提供了接口文档和字段映射 → 填写「接口字段映射表」，数据契约字段来源标 `source: api (mapped)`
- 如果用户在步骤 0b-B 选择了「需要 Java DTO」（`generate_java_dto = true`）→ 填写「Java DTO 草稿」节；否则整节省略，不留空占位
- 两者皆无 → 只输出 TS interface，字段标 `source: api (inferred)`

`notes.md` 按顺序包含：**为什么** → **决策**（3-5 条，每条带一句理由）→ **数据契约**（TS interface + 可选接口字段映射表 + 可选 Java DTO 草稿）→ **数据获取方式**（接口调用表 + 补充说明，纯展示组件写「由父传入」）→ **状态枚举**（loading/empty/success/error 等，✅ 必需的状态全部列出）→ **组件分解** → **布局陷阱**（只列真正会踩的）→ **置信度地图** → **开放问题** → **计划提示**（snake_case 标签）→ **交叉引用** → **埋点锚点**（供 design-to-track 等下游 skill 消费）。

`spec.md` 使用 OpenSpec 格式：每个行为能力一个 `### Requirement:`，每个后面跟随 **2–4 个** `#### Scenario:` 块，采用 `- WHEN` / `- THEN` 项目符号形式。每个 Requirement 至少有一个非-happy-path Scenario（零值、极值、缺字段、异常输入）。结果描述必须可断言（DOM 节点、事件 detail、textContent、属性值），禁止用「正确渲染」「优雅显示」这类形容词。

阅读 `references/openspec-format.md` 获取确切的格式规则。

最后填写 `notes.md` 的「埋点锚点」表。原则：**所有 spec.md 中带 `tap-` / `view-` / `enter-` / `submit-` 等前缀的事件，以及任何主转化 / 主曝光路径，都至少要有一行埋点锚点**。即使决定不埋点也必须显式标 `not-tracked`，不要漏 —— 这一节是下游 `design-to-track` skill 的唯一输入接口，漏掉等于让它重新看一遍 mockup，破坏 skill 群的"单一事实源"分工。

**写文件顺序**：`notes.md` → `data-fetching.md` → `spec.md`。`data-fetching.md` 在 `notes.md` 数据获取方式节写完后立即生成，不要拖到最后——它的「待确认项」可能影响 spec.md 里 Scenario 的 WHEN 子句。

### 步骤 8：呈现输出

写完三份文件后，用 `computer://` 链接呈现它们，按以下格式给出摘要：

```
📄 notes.md          — 设计决策 + 数据契约 + 开放问题
📄 data-fetching.md  — 数据获取逻辑设计（实现开发者的直接入口）
📄 specs/.../spec.md — OpenSpec 行为规格
```

摘要正文突出：(a) 最重要的 1-2 个开放问题，(b) `data-fetching.md` 中标了 `⚠️ 待确认` 的关键项（这是最容易被遗忘但影响最大的），(c) 建议的下一步（通常是：将 `notes.md` + `data-fetching.md` 一起输入 Superpowers `/plan`，传递 `--target <stack>`）。

显式告诉用户：**生成的文件是协作草稿，鼓励迭代修订**。`data-fetching.md` 中的 `⚠️ 待确认` 和 `notes.md` 中的 `needs_human_input` 就是期待人类编辑的锚点。

### 步骤 8.5（可选）：生成 annotated SVG

仅在以下任一条件命中时才生成，不要默认输出：

- 用户明确要求一张「视觉锚点图」给 PM / 设计评审
- 组件跨多个角色协作（设计 ↔ 工程 ↔ 产品）且担心 mockup 本身无法表达 spec 映射
- 本次识别出较多 `inferred` / `needs_human_input`，需要把置信度在图上显式化

输出格式（参考 `examples/today-windvane/input-annotated.svg`）：

- 左侧：简化后的 mockup（或直接嵌入原稿缩略图），编号圆圈 ①②... 叠在关键视觉元素上
- 右侧：Legend 面板，把每个编号映射到 spec.md 的 `### Requirement:` 或 `#### Scenario:` 标题
- 颜色约定（与 `notes.md` 置信度地图共享）：`#1664FF` 蓝 = identified、`#7B61FF` 紫 = inferred、`#FF7D00` 橙 = needs_human_input

**边界原则**：

- SVG **只承载** spec 映射。埋点信息、完整数据契约、开放问题都留在 `notes.md`，SVG 里用注释指向「详见 notes.md」即可
- notes.md 是 canonical source，SVG 是 derived view。改动先在 notes.md 上做，SVG 后同步。避免两份文件漂移
- 如果预期频繁编辑（每周多次改参数），不要手维双份，用 notes.md 单表 + 让 review 人口头找元素位置即可

## 捆绑资源

- `references/visual-analysis-checklist.md` —— 强制枚举检查清单（在步骤 1 中阅读）
- `references/openspec-format.md` —— OpenSpec spec 格式参考（在步骤 7 中阅读）
- `references/scenario-writing-guide.md` —— Scenario 写作纪律：反模式 + 自检清单（在步骤 7 中阅读，**必读**）
- `references/stack-hints/miniprogram.md` —— 微信小程序（glass-easel / WXML / WXSS）注意事项
- `references/stack-hints/web.md` —— 通用 Web（React/Vue/HTML）注意事项
- `templates/notes.md` —— 合并笔记模板（含状态枚举、埋点锚点等小节）
- `templates/data-fetching.md` —— 数据获取逻辑设计文档模板（在步骤 5.5 中填写）
- `templates/spec.md` —— OpenSpec 增量模板（**新建**组件用，仅 `## ADDED Requirements`）
- `templates/spec-modified.md` —— OpenSpec 增量模板（**改造**既有组件用，含 MODIFIED / ADDED / REMOVED 三块）
- `examples/today-windvane/` —— golden sample：
  - `notes.md` + `specs/today-windvane/spec.md` —— 必读，校准输出风格和深度
  - `input.svg` —— 干净版示例输入 mockup（零版权、零品牌风险）
  - `input-annotated.svg` —— 标注版：左侧 mockup + 右侧 Legend，编号圆圈把每个视觉元素映射到 spec.md 的 Requirement / Scenario。颜色约定：`#1664FF` 蓝 = identified、`#7B61FF` 紫 = inferred、`#FF7D00` 橙 = needs_human_input（与 notes.md 置信度地图共享一套配色）

## 校准：阅读 golden sample

最有价值的单个校准步骤是完整阅读 `examples/today-windvane/notes.md` 和 `examples/today-windvane/specs/today-windvane/spec.md`。它展示了此技能「好」是什么样子：数据契约中的细节深度、交互歧义如何标记、特定技术栈提示如何嵌入，以及 `notes.md` 如何为规划阶段服务。

除非输入 mockup 明显更简单或更复杂，否则请匹配其深度和结构进行新输出。

## 应避免的反模式

- **不要跳过枚举通道。**直接从图片到规格是虚构字段、遗漏交互和技术栈不匹配建议渗入的方式。
- **不要假装歧义不存在。**安静地猜测每个未知数的规格比标记 5 个开放问题的规格更糟糕 —— 后者可以在 60 秒内审查。
- **不要写代码。**此技能生成规格，不是实现。除非作为特定布局陷阱的单一说明性微示例，否则将 WXML/JSX 等代码片段排除在 `notes.md` 之外。
- **不要把行为塞进 `notes.md`。**行为属于 `spec.md` 场景。`notes.md` 用于技术决策、数据契约、布局陷阱、置信度与开放问题。
- **不要生成 `tasks.md`。**Superpowers `plan` 会基于 `notes.md` + `spec.md` 重新生成任务分解，此阶段的任务列表是多余的中间产物。
- **不要为输出写单独的 README。**`notes.md` 是入口点；README 是多余的。
- **不要把复合图片资产拆成代码绘制节点。**看到「渐变背景 + 堆叠文字 + 规则边界」的视觉单元（徽章、角标、标志性图标）时，默认假设它是**单一设计交付图片**（PNG/WebP）。数据契约用 URL 字段（如 `badgeIconUrl` / `iconUrl`），spec 的 Scenario 断言 DOM 是 `<image>` 且不存在独立文本节点兜底。把它拆成 rect + text 会导致跨端字体渲染漂移，且活动换图被迫发版。只有当设计明确说「这是代码绘制的药丸/按钮」时才按 primitives 拆。
- **不要用接口文档替代视觉枚举。**接口文档回答「数据是什么」，mockup 回答「数据如何展示」——两者不互相替代。有接口文档时仍然要跑步骤 1（视觉枚举），只是名字换成「UI 字段枚举」，跑完后和接口文档做 diff。跳过视觉枚举会丢失截断/省略号/颜色/交互 affordance 这些 mockup 独有的信息，数据契约会变成「接口全透传 Props」——这是一个反模式，因为接口往往返回 20 个字段而 UI 只用 8 个，全透传会让组件耦合到后端数据形状。
- **不要盲信接口文档的可空性。**接口文档里的 `optional` 经常是后端为了向前兼容留的口子，真实调用时基本都会传。如果 UI 行为依赖某字段必存在（例如 `hotspot.title` 渲染逻辑没有 null 分支），在数据契约里标为 `required` 并加一句注释「接口标 optional 但业务保证存在，为空时视为 error 态」，同时在开放问题里加一条请后端确认。

## 格式提醒

- `spec.md` 使用 `### Requirement:`（H3）和 `#### Scenario:`（H4）—— 这些确切的标题级别是 OpenSpec 验证器查找的内容。
- 场景使用纯 `- WHEN ...` / `- THEN ...` 项目符号，而不是 `Given/When/Then`。
- 对于变更增量（添加到现有能力时），将需求包装在 `## ADDED Requirements`、`## MODIFIED Requirements` 或 `## REMOVED Requirements` 下。
- `notes.md` 的「计划提示」使用 `snake_case` 标签，以便下游工具可以用正则表达式解析。
