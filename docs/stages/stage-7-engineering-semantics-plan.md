# Stage 7 实施计划 — 工程语义注入（S 系列）

> 本文承接 [codegen vs preview 对比报告](../reports/codegen-vs-preview-fidelity-run-2026-06-11.md)
> 的根因 E「工程语义缺失（形似而无魂）」（PR #93）。G 系列（G1–G4）修「形」（像素保真）；
> 本计划是 S 系列，注「魂」：让生成包从「用 DOM 渲染的截图」变成工程师能接手的代码 ——
> 领域抽象（定义复用 + 调用点数据，而非 N 份快照）、数据与视图分离（props）、
> 语义化标签、领域命名。
>
> 前置：本 PR **stack 在 #93 上**（依赖其报告文件）；#93 合并后需把本 PR base
> retarget 回 master 再合（GitHub 不自动 retarget，stacked merge 已有踩坑记录）。
> 与 G 系列并行不冲突（G 改样式映射，S 改结构规划）；若同时进行，先合者先行，后者 rebase。
>
> **不可协商约束（沿用既有）**：所有 PR 保留 #77 child-import guard 及其回归测试；
> codegen 坐标永远 parent-relative 直接定位（勿回退 fidelity PR-1）；
> codegen 不重判契约（mode/boundary 来自 approved plan，Stage 6 原则不变）。

---

## 1. 范围

**做**

- 5C `deriveComponentPlan` 增加**三分建模**（见 §3.3）：`componentDefinitions`
  （按 symbol master / 结构指纹复用实现）、`componentInvocations`（保留每个原
  semantic node 的调用点：caller、顺序、placement、bindings）、`collections`
  （**仅**同一父节点下的 5A `repeatedPattern` 才聚成集合）。
- codegen 消费三分模型：同 definition 只生成一份组件文件 + props 接口；各
  invocation 传各自 bindings；collection 输出 `items.map(...)` + `*.data.ts`。
- content props 补全：未折叠组件的写死文本/图片提升为带默认值的可选 props。
- 新增按 `semanticNodeId` 索引的 **element plan**（`img` / `p` / `ul` / `li`），
  codegen 据此选择 JSX 元素 + 基础 a11y（见 §3.4，不复用组件级 `renderAs`）。
- 确定性领域命名强化（消费 `source.name` 里已有的中文领域名）+ 人工覆写通道；
  LLM 起草后置且只起草（架构原则：LLM 仅在判断性环节当起草助手，落盘前过
  schema 校验 + 人工门禁）。
- 5A 布局推断覆盖率扩展（当前真实稿 101 个 layoutCandidates 仅 2 个非 absolute）。

**不做**

- **不改 normalize / IR schema**：symbol master 身份已存在
  （`visualNode.symbol.masterId` + `designIr.semantic.candidates[].symbolMasterId`），
  直接消费，零 golden/hash 变更（§3.2）。
- 不改 5A `SemanticNode` 的 kind 枚举（不加 `list`/`listItem` node kind）——
  折叠是**规划决策**，落在 5C；5A 信号（`repeatedPatterns`、symbol evidence）已够用。
- 不做交互行为接线（interactive mode 全链另案）；`button`/`input` 元素映射
  需要交互信号，同步后置。
- 不引第三方运行时依赖；生成包仍是纯 React + TS + CSS Modules。
- 不在本轮引入 LLM 调用；命名 PR 只建确定性规则 + 覆写机制。

**标准**：S 系列完成后，对真实 `d2c.sketch` 重跑全管线，生成包满足：
同 master **全等**实例共享一份组件定义（收紧判定下实测 2 组收敛：StatusBar×2、
Icon×3；其余 4 组带几何/结构差异，确定性回退逐实例 + warning——文本驱动几何
的组留给后置 style binding/响应式，结构不等的酒店卡留给后置 slot/variant）；
同父重复结构以 `items.map(...)` 渲染；可变文本/图片
全部可经 props 注入（写死文案数 41 → 0）；媒体节点是 `<img>`；**248 个语义节点
在 DOM 全部可定位**（节点追踪经 invocation `nodeMap` 保持，harness 全 present）
且渲染结果与改造前**逐节点指标一致**（harness 全绿，含 G4 新增的可见内容
metric）。

## 2. 现状实证（2026-06-11 真实运行，全部已核实）

「魂」的原料**已经在数据里**，断点在 5C 规划与 codegen 消费：

| 机制        | 现状（真实 d2c.sketch）                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 断点                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| symbol 身份 | **master id 已保留**：`visualNode.symbol.masterId`（IR `SymbolTraceSchema`，36 个实例全带）+ `semantic.candidates[].symbolMasterId`；6 个 master 多实例。**可折叠性已按收紧判定实测（§3.3）**：仅 2 组全等可折叠——StatusBar×2、Icon×3（7823A381）；SuggestedPrompt×3 根宽 181.11/182/247、文本宽 98/98/154（文本驱动几何）、ArrowIcon×3 位置随父宽位移、Icon×2 为 20×20 vs 15×15 缩放实例、酒店卡 ×4 节点数 8/9/6/8 且嵌套异构 AI master——**4 组几何/结构不等，均回退** | 5C 不按 master 分组：43 个候选 1:1 变 43 个独立组件                                                                                      |
| 重复检测    | 5A `repeatedPatterns` 已检出 2 组（axis y×3、x×5，similarity 1.0）+ 1 个 `repeat-pattern` 候选（`semantic/derive.ts` 的 repeated-pattern 推导）。**成员构成（已实测）**：y×3 是 decorative Rectangle、x×5 是普通 region group，成员均无 symbol、非 candidate                                                                                                                                                                                                            | 5C **不消费**：无折叠、无集合；且 pattern 成员走不了 symbol 分组（§3.2、S-PR-3）                                                         |
| props 通道  | 5C 有 `props`/`dataBindings` 字段与 deferred 注释挂点（`derive-component-plan.ts:384`）；codegen `textExpression` 已支持 `prop.name ?? fallback`（`react/generate.ts:247`）                                                                                                                                                                                                                                                                                             | deferred 模式 interaction body 为空 → **0 props**，41 条文案写死                                                                         |
| 元素语义    | plan 有组件级 `renderAs` 字段，但 5C **拒绝**把 text/media/icon 等 primitive 提升为组件（`derive-component-plan.ts:315` 显式 throw）；codegen 遍历 primitive 一律输出 `<div>`（`generate.ts:297`）                                                                                                                                                                                                                                                                      | 组件级字段够不到 primitive；**缺按节点索引的 element 维度**（§3.4）                                                                      |
| 节点追踪    | 同 master 实例的子树 semantic/visual ID **刻意隔离**（normalize `visual.ts` 以 instancePath 加作用域，注释明言避免实例间子节点 ID 碰撞）；codegen 从 semantic id 生成 class 与 `data-d2c-node-id`（`generate.ts:271`）                                                                                                                                                                                                                                                  | 共享 definition 文件若硬编码代表实例的子树 ID，其余 invocation 的节点 ID 将从 DOM 消失 → harness「248 节点全 present」破（§3.3 nodeMap） |
| 布局意图    | 5A 产 101 个 layoutCandidates（stack 1 / inline 1 / absolute 99）；plan `layoutPlan` 47 条（45 absolute）；codegen flex 投影已有（fidelity PR-3）                                                                                                                                                                                                                                                                                                                       | **检测覆盖率**低：等距规则太窄                                                                                                           |
| 命名        | `source.name` 即领域名（`组件/导航栏`、`icon/首页/星星备份`）；`normalize/names.ts` 已做部分转换                                                                                                                                                                                                                                                                                                                                                                        | 不同 master 撞通用名（星星/声音关都叫 `Icon`）→ 数字后缀                                                                                 |

## 3. 核心决策

### 3.1 折叠落在 5C，5A 与 normalize 不动

折叠（复用定义 + 调用点）是**组件规划决策**，与 boundary/mode 同级，归 5C。
5A 的 `repeatedPatterns`、IR 的 `symbol.masterId` 已是足够输入；不加 node kind、
不改 normalize/IR schema，避免无意义的 golden/hash 重铸。

### 3.2 分组键：既有 `visualNode.symbol.masterId`，零 schema 变更

5C 内通过 `semanticNode.primaryVisualNodeId → visualNode.symbol.masterId` 分组
同 master 实例。**结构指纹**（非 symbol 的同构子树）的适用范围分两档：
被 5A `repeatedPattern` 覆盖的成员在 **S-PR-3 内派生**——实测两组真实 pattern
的成员均无 symbol、非 candidate（y×3 decorative、x×5 region），symbol 分组
覆盖不到它们，没有这一步 collections 验收不可达；pattern 之外的通用结构指纹
折叠仍后置。**不用 `source.name` 当分组键**（可被设计师重命名）。
本决策替代早先草案的「normalize 补 `source.symbolId`」——该信息已以
`symbol.masterId` 形式存在，重复新增是冗余契约。

### 3.3 三分建模：definition / invocation / collection

**组件复用 ≠ 列表渲染**：同一 symbol 可出现在不同父节点（如 header 与
footer 各一个图标），共享定义但不构成列表。模型上分开（plan body 三个
**可选**新字段，旧 plan 仍合法；schema 细节在 S-PR-1 以 spike 锁定）：

```ts
componentDefinitions?: Array<{
  id: string;                        // 确定性:master id 或结构指纹派生
  source:
    | { kind: 'symbol-master'; masterId: string }    // S-PR-1
    | { kind: 'structural'; fingerprint: string };   // S-PR-3,仅 repeatedPattern 成员
  componentId: string;               // components[] 中保留的代表组件
  propSchema: Array<{ name: string; type: 'text' | 'assetRef'; defaultValue: string }>;
}>;
componentInvocations?: Array<{
  id: string;
  definitionId: string;
  semanticNodeId: string;            // 原实例根节点,保留可追溯
  caller:                            // 具体父:能区分同一父 definition 的多个实例
    | { kind: 'component'; componentId: string }    // 父是未折叠 planned component
    | { kind: 'invocation'; invocationId: string }; // 父是某 definition 的具体实例
  order: number;                     // caller 内稳定顺序
  placement: { x: number; y: number; width: number; height: number }; // parent-relative
  bindings: Record<string, string>;  // propName → 实例值(文本/assetRef)
  childInvocations: Array<{          // 渲染传输的正向边:父渲染域内每个子组件边界的具体挂接
    boundarySemanticNodeId: string;  // 模板渲染域中的子组件边界节点
    invocationId: string;            // 本实例在该边界处的子 invocation
  }>;
  nodeMap: Record<string, string>;   // 模板(代表实例)节点 semanticNodeId → 本实例 semanticNodeId
                                     // 同构校验的副产物;双射,只覆盖 definition 自身渲染域——
                                     // 在子组件/子 invocation 边界停止,子树由子 invocation 接管
                                     // (与 codegen 在 planned component 边界停止递归一致,generate.ts:280)
}>;
collections?: Array<{
  id: string;
  caller:                            // 集合的唯一具体父(同 invocation.caller 判别式)
    | { kind: 'component'; componentId: string }
    | { kind: 'invocation'; invocationId: string };
  definitionId: string;
  invocationIds: string[];           // 有序;全部 caller(深比较)相同才合法
  evidence: { axis: 'x' | 'y'; itemSemanticNodeIds: string[] }; // 来自 5A repeatedPattern
}>;
```

- **definition**：同 master（S-PR-1）或 repeatedPattern 成员的结构指纹
  （S-PR-3）**全等**实例 → 一份实现；`propSchema` 由实例间 diff（文本、assetRef）
  确定性派生。**折叠条件（收紧）**：结构双射成立，**且除可绑定字段（文本内容、
  assetRef）外全部相等**——每节点相对实例根的几何（x/y/width/height）、样式
  声明指纹（fills/borders/effects/cornerRadius/字体属性）、嵌套 definition 身份。
  节点数一致只证明形状接近，不证明实现可共享（实测反例：SuggestedPrompt×3
  根宽 181.11/182/247，文本驱动内部定位位移）。文本变化导致宽度/内部定位变化
  的组，在引入 style binding 或响应式布局（后置）之前一律回退。
  不满足 → 不产 definition，保持逐实例生成 + warning（确定性回退，永不猜测）。
- **invocation**：每个原实例一条，保留 caller、顺序与 parent-relative placement，
  渲染语义与今日逐像素一致；只是实现共享了。
- **节点追踪（nodeMap）**：实例子树 ID 在 normalize 已刻意隔离（§2「节点追踪」行），
  共享 definition 文件不能硬编码代表实例的子树 ID。codegen 的 CSS class 以模板
  id 生成（样式共享），但 `data-d2c-node-id` 按 invocation 的 `nodeMap` 注入
  （实现取向：definition 组件接受内部节点 id 映射、缺省为模板自身，S-PR-2 锁定），
  保证每个原实例节点在 DOM 仍可定位——harness「248 节点全 present」是硬验收。
  **nodeMap 只覆盖 definition 自身渲染域**：在嵌套的子组件/子 invocation 边界
  停止（codegen 本就在 planned component 边界停止递归），子树映射由对应的
  子 invocation 接管。
- **caller 是具体实例，不是 definition**：嵌套 definition 时，子 invocation
  必须能区分自己属于哪个父实例——`caller` 用判别式（`component` = 未折叠
  planned component；`invocation` = 某 definition 的具体实例），collection
  聚合按 caller 深比较，**绝不跨父实例聚合**。
- **渲染传输靠正向边 `childInvocations`**：caller 只解决归属（反向边），
  共享父 definition 的 JSX 只生成一次，每个父 invocation 拥有不同的子
  invocation 与子 nodeMap——父 invocation 以 `childInvocations`
  （模板边界节点 → 本实例子 invocationId）显式列出每个子组件边界的挂接。
  codegen 在模板边界位置渲染 `<Child {...slot}/>`，slot 数据（子 bindings +
  子 nodeMap 注入）按本边在父的调用点组装下传（内部 props 方案，S-PR-2
  锁定实现形态）。**同构嵌套（同 definition 身份）是 S-PR-1/2 的立即能力**；
  多态替换（不同实例嵌不同子类型，如酒店卡）才是后置 slot/variant。
  收紧判定后真实稿暂无「折叠 definition 嵌套折叠 definition」案例
  （Icon×3 的父 SuggestedPrompt 不折叠），该路径用合成 fixture 测试钉住。
- **同 master 但非同构 → 不折叠（实测：酒店卡）**：`24E4F568`×4 的子树为
  8/9/6/8 个节点且各嵌套不同 AI master，`text | assetRef` 的 propSchema 表达
  不了子组件替换——S-PR-1 对它**确定性回退为逐实例生成 + warning**，并作为
  非同构回退的回归用例。表达子组件替换需要 component/slot binding 与 variant
  模型，后置（见「后置」节）。
- **export 所有权（definition 级唯一 export）**：非代表实例不再进入
  `components[]` / `exports[]`；`exports` 收敛为 definitions 代表 ∪ 未折叠组件 ∪
  root。**不为旧名提供 re-export alias**——生成包公共 API 由 plan 派生，
  presentational 阶段无跨重生成的兼容承诺。barrel 由 `exports[]` 遍历生成
  （`generate.ts` `packageBarrel`），S-PR-2 测试钉死「每个 export 都有对应
  生成文件、无悬挂引用」。
- **collection**：**仅**同一具体 caller 下、被 5A `repeatedPattern`
  覆盖的 invocations 才聚合；codegen 对它输出 `items.map(...)` + `*.data.ts`。
  跨 caller（含同一父 definition 的不同实例）的同 definition invocations
  永不进同一 collection。
- integrity 校验扩展：definition/invocation/collection 的 id 引用闭合
  （含 caller 判别式引用）、collection 的 invocations 同 caller（深比较）、
  bindings 键 ⊆ propSchema、`nodeMap` 双射且键集 = definition 代表
  **渲染域**（到子组件边界为止）的全部 semanticNodeId、
  **`childInvocations` 边界集 = 模板渲染域内全部子组件边界**（一一对应、
  无遗漏无重叠）且被引子 invocation 的 caller 反向引用一致（父子渲染域
  并集完整、交集为空）、exports 无悬挂（每个 export 对应存活组件）。

### 3.4 元素语义：按 `semanticNodeId` 索引的 element plan，不复用组件级 `renderAs`

组件级 `renderAs` 够不到 primitive：5C 明确拒绝把 text/media/icon 提升为组件
（`derive-component-plan.ts:315`），codegen 遍历 primitive 一律出 `<div>`
（`generate.ts:297`）。因此新增 plan 级可选字段：

```ts
elementPlan?: Array<{
  semanticNodeId: string;            // 指向任意 semantic node(含 primitive)
  element: 'img' | 'p' | 'ul' | 'li'; // v1 集合;缺省 = div(现状)
  a11y?: { alt?: string; ariaLabel?: string };
}>;
```

5C 按 semantic kind 派生：media→`img`（沿用 assetPlan 资产通道，`alt` 取节点名）、
collection 容器→`ul` / 项→`li`、独立 text 段落→`p`。`button`/`input` 需要交互
信号，后置 interactive 链路（presentational 不臆造可点击性）。codegen 按
elementPlan 选元素；`img` 从背景图改 `<img src>`（同资产同几何，harness 验证
不回退）。组件级 `renderAs` 保持现状不动。

### 3.5 命名：确定性优先，LLM 只起草

v1 确定性强化：definition 级命名取 `source.name` 的领域路径段
（`icon/首页/星星备份` → `IconStar` 类规则：分段、去通用前缀、按既有
`names.ts` 转换表扩展），同 definition 的 invocations 共享组件名，消除数字
后缀的主要来源。配套人工覆写：`contract` 后、`approve` 前可提供
`name-overrides.json`（`{ componentId: name }`），CLI 受控重写 plan + manifest
（与 `approve` 同构）。LLM 起草建议文件是其后续（产出同格式 overrides，
仍走人工确认），本轮不实现。

### 3.6 schema 演进与 golden 边界

`componentDefinitions` / `componentInvocations` / `collections` / `elementPlan`
全部是**可选字段**，旧 artifact 解析不受影响；但 derive 输出变化 ⇒ artifact
hash 变 ⇒ **contract golden 与 codegen golden 按刀重生成**（每个 PR 只重生成
自己影响的 golden，diff 必须可解释、可 review）。IR 与 normalize 零变更（§3.2），
其 golden 不动。哈希口径沿用 Option A（整 artifact），不动 hash 原语。

## 4. PR 拆分（依赖序）

### S-PR-1 — 5C 三分模型 schema + definitions/invocations derive

文件：`packages/d2c-core/src/contract/component-plan-schema.ts`（三个可选字段 +
integrity 扩展）、`derive-component-plan.ts`（按 `symbol.masterId` 分组、同构
校验、propSchema/bindings/**nodeMap** 派生、**exports 收敛**）与测试。要点：
§3.3 sketch 在本刀以真实 schema 锁定（spike 落地）；折叠判定按 §3.3 收紧
条件（结构双射 + 除可绑定字段外几何/样式/嵌套身份全等），不满足 → 不折叠 +
warning；nodeMap 是全等校验的副产物（双射、只覆盖代表**渲染域**、子组件
边界停止，integrity 强制）；`childInvocations` 正向边进 schema + integrity
（边界一一对应、caller 反向一致）；**export 所有权**在本刀拍板并测试——
非代表实例移出 `components[]` / `exports[]`，无旧名 alias；本刀**不产
collections**（字段进 schema、derive 留空）。
验收：真实稿 **2 组全等 master 折叠为 definitions（StatusBar×2、Icon×3）**+
对应 invocations（含 nodeMap、判别式 caller、childInvocations）；
**四组回退各有 warning 且语义可读**：酒店卡 ×4（结构不等）、SuggestedPrompt×3 /
ArrowIcon×3（文本驱动几何）、Icon×2（缩放实例）——全部作为收紧判定的回归
用例；exports 收敛且无悬挂；两跑字节稳定；contract golden 重生成且 diff 可解释。

### S-PR-2 — codegen 消费 definition/invocation

文件：`packages/d2c-core/src/codegen/react/generate.ts` + 测试。要点：同
definition 单组件文件 + props 接口（由 propSchema 生成）；各 invocation 按
placement/order 渲染并传 bindings；**`data-d2c-node-id` 按 invocation 的
nodeMap 注入**（CSS class 仍用模板 id，样式共享；映射实现取向见 §3.3）；
barrel 按收敛后的 `exports[]` 生成，测试钉死每个 export 都有对应文件、无
悬挂引用；#77 import guard 测试扩展到 definition 路径；**嵌套渲染传输按
`childInvocations` 正向边**：父 definition JSX 在模板边界渲染子组件，
slot 数据（子 bindings + 子 nodeMap）在父调用点按边组装下传——收紧判定后
真实稿无「折叠嵌折叠」案例，该路径以合成 fixture 钉死。验收：真实稿
**2 组全等实例的重复源文件消失**（StatusBar×2、Icon×3 → 各 1 份；跨 master
撞名的 `Icon`/`Icon2` 由 S-PR-6 命名解决，4 组回退保持逐实例）；
**248 语义节点在 DOM 全部可定位（harness 全 present）**且逐节点指标与
改造前一致（折叠组逐像素不变是收紧判定的直接推论，专项断言）；
codegen golden 重生成。

### S-PR-3 — collections（同父 repeatedPattern → map + data.ts）

文件：`derive-component-plan.ts`（**为 repeatedPattern 成员派生结构指纹
definition/invocation**，再消费 `repeatedPatterns` 仅同 caller 聚合）、
`react/generate.ts`（`items.map(...)` + `*.data.ts`）+ 测试。要点：实测两组
真实 pattern 的成员均无 symbol、非 candidate（§2），S-PR-1 的 symbol 分组
覆盖不到——结构指纹派生（范围**仅限 pattern 成员**，含 nodeMap 与 export
收敛同规则）必须在本刀内，否则验收不可达；跨父 invocations 永不聚合
（回归测试钉死）；data 与视图分离。验收：真实稿 x×5 region 组成为
collection 并 map 渲染（y×3 decorative 组依同构判定，不强求）；
pattern 成员子树节点仍全 present；harness 指标不回退。

### S-PR-4 — content props 补全（未折叠部分归零写死文案）

文件：`derive-component-plan.ts`（未折叠组件的唯一文本/图片 → 带默认值可选
prop）、`react/generate.ts`（props 接口；text/img 消费已有 `prop.name ??
fallback` 通道）+ 测试。要点：deferred 模式也产 content props。验收：真实稿
写死文案数 41 → 0；根组件可用外部数据整体换文案/图片。

### S-PR-5 — element plan（语义化标签 + a11y）

文件：`component-plan-schema.ts`（`elementPlan` 可选字段）、
`derive-component-plan.ts`（kind→element 派生）、`react/generate.ts`
（元素选择、`<img>`、alt）+ 测试。验收：真实稿 media 全部 `<img>`、
collection `ul/li`；harness 全绿（几何与可见性不回退）。

### S-PR-6 — 确定性命名强化 + 覆写通道

文件：`normalize/names.ts` 或 5C 命名段、`cli.ts`（`name-overrides` 支持）
与测试。要点：definition 级命名 + invocations 共享；覆写文件受控重写
plan/manifest。验收：数字后缀仅在真撞名时出现；覆写经 CLI 生效且两跑字节稳定。

### S-PR-7 — 布局推断覆盖率（5A 规则扩展）

文件：`packages/d2c-core/src/semantic/derive.ts`（推断规则）+ 测试 +
harness 覆盖率指标。要点：放宽等距容差、单轴有序非等距识别（gap 序列
逐项发 flex gap 而非 mean-gap）、padding 推导；codegen 投影沿用 PR-3
的「逐像素复刻才发 flex」护栏。验收：真实稿 absolute 占比从 98% 降至
明确阈值（在 PR 内以实测定数），harness 零回退。

### 后置（不进 S 系列本轮）

- **component/slot binding 与 variant 模型**：表达「实例内子组件替换」，解锁
  酒店卡 `24E4F568`×4 这类嵌套异构实例的折叠（子树 8/9/6/8、各嵌套不同 AI
  master，`text | assetRef` propSchema 表达不了）；在 S-PR-1 的非同构回退
  warning 数据上立项。
- **style binding / 响应式布局**：表达「文本驱动的宽度与内部定位差异」，解锁
  SuggestedPrompt×3（根宽 181.11/182/247、文本宽 98/98/154）、ArrowIcon×3
  （位置随父宽位移）、Icon×2（20×20 vs 15×15 缩放）这类几何不等组的折叠。
- pattern 之外的通用结构指纹折叠（§3.2）。
- `button` / `input` 等需要交互信号的元素映射（随 interactive 链路）。
- LLM 命名起草（产出 `name-overrides.json` 同格式建议，仍走人工门禁）。

> 每刀实施时按惯例在 `docs/superpowers/plans/` 落细粒度 TDD 执行计划
> （如 fidelity PR-3 的 `2026-06-07-react-codegen-layout-plan.md`）。

## 5. 测试矩阵

| 范围           | 测试点                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5C 三分模型    | 同 master **全等**（收紧判定：结构双射 + 除绑定字段外几何/样式/嵌套身份相等）→ definition + invocations（数量、propSchema、bindings、**nodeMap 双射且只覆盖渲染域、子组件边界停止**、**childInvocations 边界一一对应 + caller 反向一致**）；**不满足拒折叠 + warning（真实回归用例：酒店卡结构不等、SuggestedPrompt/ArrowIcon 文本驱动几何、Icon 缩放实例）**；**exports 收敛**（非代表实例无 export、无悬挂引用）；integrity：id 引用闭合、bindings ⊆ propSchema；两跑一致 |
| 5C collections | 仅同一具体 caller 的 repeatedPattern 聚合；**跨 caller（含同父 definition 的不同实例）永不聚合**（回归钉死）；**pattern 成员结构指纹派生**（无 symbol 成员产 definition/invocation/nodeMap）；evidence 与 5A pattern 对账                                                                                                                                                                                                                                                   |
| codegen        | definition 单文件 + invocation 传值字节稳定；**`data-d2c-node-id` 按 nodeMap 注入，真实稿 248 节点全 present**；**嵌套传输按 childInvocations（合成 fixture：折叠嵌折叠）**；折叠组渲染逐像素不变（全等判定推论，专项断言）；barrel 与文件系统一致（每 export 有对应文件）；map + data.ts 分离；#77 guard 含 definition 路径；elementPlan 元素选择；`<img>` 资产引用                                                                                                        |
| props          | 实例 diff → propSchema/bindings/默认值；deferred 模式产 content props；无差异字段不产 prop                                                                                                                                                                                                                                                                                                                                                                                  |
| 命名           | definition 级命名确定性；覆写文件生效 + manifest 同步；撞名仍报错不静默                                                                                                                                                                                                                                                                                                                                                                                                     |
| 布局           | 新规则单测（容差、非等距、padding）；「逐像素复刻才发 flex」护栏回归                                                                                                                                                                                                                                                                                                                                                                                                        |
| 端到端         | 真实稿全管线重跑：harness 全绿；写死文案归零；重复源文件消失可解释；golden 按刀重生成且 diff 可 review                                                                                                                                                                                                                                                                                                                                                                      |

## 6. 边界与依赖

- **与 #93/G 系列**：本 PR stack 在 #93 上（文档链接依赖）；#93 合并后
  retarget 本 PR 到 master。G 系列实现与 S 系列实现并行；S-PR-2/3/5 的
  harness 验收依赖 G4 的可见内容 metric 先行更稳，但不硬阻塞。
- **与 interactive 链路**：S 系列全部在 presentational 范围内；`button` 等
  交互元素映射、handler props 留给 interactive 切片。
- **schema 演进**：plan 层全可选字段；IR/normalize 零变更；golden 重铸
  按刀进行（§3.6）。

## 7. 验证命令

每个实现 PR 至少跑：

```bash
npm run test:d2c
npm run test:sketch
npm run typecheck
npm run lint
npm run format:check
npm run check:full
```

端到端验收（S-PR-2 起每刀都跑）：真实 `d2c.sketch` 全管线 + harness，
命令见对比报告「复现」一节（含 candidate viewer scaffold）。
