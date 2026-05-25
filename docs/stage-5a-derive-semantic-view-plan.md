# Stage 5A 实施计划 — `derive-semantic-view` + SemanticViewBody schema

> 本文是 [Stage 5 蓝图](./stage-5-component-contract-outline.md) §10 的 **5A** 子段——
> Stage 5 拆出的第一段：收紧 `SemanticViewSchema.body`、实现 `derive-semantic-view`
> 与单测。5B/5C/5D 不在本文范围。
>
> 前置：PR #26 / #27 / #28 / #29 全部已合（Batch 2 + codegen 两档 mode 契约 + Stage 5 蓝图）。

---

## 1. 范围

**做**

- 新建 `packages/d2c-core/src/semantic/`：`schema.ts`、`derive.ts`、`evidence.ts`、`index.ts`。
- 把 `packages/d2c-core/src/ir/views.ts` 里的 `SemanticViewSchema.body` 从
  `z.record(z.unknown())` 替换为 5A 定义的 `SemanticViewBodySchema`。
- 给 `GeneratedFromSchema` 加 `visualViewHash`（可选→在 semantic-view 上下文强制必填）。
- 实现 `deriveSemanticView({ designIr, visualView }) → { semanticView, warnings }`。
- 扩 Sketch fixture(s)：至少覆盖 symbol 实例 / 重复 sibling / 低置信 group 三类场景。
- 单测覆盖 schema 正反例、derive 行为、确定性、hash 一致性。

**不做**

- 不动 `interaction-spec` / `component-plan` schema(只 5B/5C 才动)。
- 不写 CLI `contract` 子命令(5D 才加)。
- 不接 `runContract` 薄入口(5D)。
- 不实现完整的"四层证据"合并(显式标注层、项目规则层留 schema 入口,首版不引入复杂规则引擎)。
  5A 只实现 Design IR semantic candidates + Visual evidence 两层;标注 / 规则层做"零实现可扩展"。
- 不动 Stage 4 visual-view 输出形态(只读)。
- 不动 Stage 3 IR 形态(只读)。

**标准**:5A 完成后,任一已通过 Gate 1 的 fixture 都能产出一份 schema 合法的
`semantic-view` 对象,内容可解释、确定性可复跑、warnings 真实反映推断置信度的缺口。

## 2. 输入 / 输出

```text
输入:
  designIr      : 已经 validateDesignIR() 过的 DesignIR
  visualView    : Stage 4 deriveVisualView() 的 VisualView
                  (含 generatedFrom.designIrHash;5A 强制要求)

输出:
  semanticView  : SemanticView,kind === 'semantic-view',
                  generatedFrom.designIrHash + generatedFrom.visualViewHash 必填
  warnings      : Warning[](严重度 / 类别 / 关联 nodeId / 文案)

约束:
  同输入 → 同输出,字节级可复跑(包括 warnings 顺序、id 生成)。
```

`deriveSemanticView` 是纯函数,不读文件、不发网络、不写磁盘。

## 3. 核心决策

### 3.1 `SemanticEvidence` / `Warning` 的形态在 5A 落地

蓝图 §5/§7 引用了这两个类型但没给定义。5A 必须给出 Zod schema,否则后续 5B/5C/5D
都没法稳定 import。建议:

```ts
// SemanticEvidence
type SemanticEvidence =
  | { kind: 'visual-node'; nodeId: string; reason: string }
  | { kind: 'design-ir-candidate'; candidateName: string; nodeId: string; reason: string }
  | { kind: 'annotation'; annotationKey: string; nodeId: string; reason: string }
  | { kind: 'project-rule'; ruleName: string; reason: string };

// Warning
type Warning = {
  code: string;          // 稳定枚举,例如 'low-confidence-component'
  severity: 'info' | 'warn' | 'error';
  message: string;
  nodeIds?: string[];
};
```

后两种 evidence kind(`annotation`、`project-rule`)5A 仅留 schema 入口,不在
derive 里产出——为 5B 之后接入显式标注 / 规则引擎留口子,避免后期改 schema。

### 3.2 hash 链:`visualViewHash` 在 5A 加入 `GeneratedFromSchema`

现状:`GeneratedFromSchema.designIrHash` 已存在但可选。5A 需要:

1. `visualViewHash?: string` 加到 `GeneratedFromSchema`。
2. `deriveSemanticView` **必须**写 `designIrHash` 和 `visualViewHash`(从 input 拷过来 +
   重算校验,见 §6.2)。
3. 不动 `interaction-spec` / `component-plan` 的 hash 字段(5B/5C 各自加自己上游的 hash)。

理由:`GeneratedFromSchema` 是 envelope,加可选字段是 patch-level 兼容变更,不破坏 Stage 4。

### 3.3 SemanticViewBody 用 discriminated union(`SemanticNode.kind`)

蓝图 §5 列出 9 种 kind(`screen / region / component / repeated-item / text / media /
icon / control / decorative`)。5A 落地用 Zod `z.discriminatedUnion('kind', [...])`,
让运行期校验直接报"哪种 kind 的哪个字段缺失",而不是返回模糊的 union 错误。

各 kind 共享的字段(id / name / primaryVisualNodeId / visualNodeIds / parentId /
childIds / bounds / confidence / evidence / source)用 `z.object({...}).extend({ kind: z.literal(...) })`
的 base 拼,避免 9 份重复定义。

### 3.4 首版 derive 算法保守

5A 算法只产出这些候选,**且全部不升格成 component 除非有证据**:

- **component candidate** 仅来自:(a) symbol 实例(VisualNode.symbol.instanceId 存在);
  (b) `design-ir` `semantic.candidates` 中已经标的;(c) 命中前缀约定(暂硬编码
  `组件/` / `Component/` / `comp:` 三种,留 schema 入口给后续可配规则)。
- **repeated pattern** 仅在**同父节点**下,**3 个及以上** sibling 满足"相同 kind +
  主轴 gap 双阈值通过 + 文本/asset 槽位结构同形"时产出。
  - **双阈值**:对每对相邻 sibling 的主轴 gap,与该序列平均 gap 比,
    `absDelta <= 2px` 或 `relDelta <= 15%` 任一成立即视为稳定。两条都不满足才记
    "spacing irregular"。
  - **比较口径写死**:仅在同父级 sibling 序列内,按主轴坐标排序后比较;
    跨父级、跨主轴方向不比较。这样 stability test 出现 1px 抖动时能明确解释。
  - 引入双阈值是为了挡住:小间距下相对误差被放大、整数像素舍入抖动、
    Batch 2 symbol scale 后小数残差等场景。
- **layout candidate** 默认 `'absolute'`;只有"重复 sibling 等间距 + 同尺寸"才升格为
  `'stack'` 或 `'inline'`;`'grid'` / `'overlay'` 5A **不产出**(留蓝图 §6 caveat)。
- **decorative kind** 给"无文本、无 asset、面积极小、无名字"的叶子节点;不会被
  componentCandidates 引用。

任何高于 `medium` 置信都需要"两层及以上 evidence"才可写。低置信结论保留为普通
`SemanticNode`,**不升格**——这是蓝图 §3 反复强调的底线。

### 3.5 deterministic id

所有 id 复用 `stableSha256(stableJson(input))`(Stage 4 已在
`packages/d2c-core/src/preview/derive-visual-view.ts:25` 用同款工具计算
`designIrHash`)。这样 5A 不引新 hash 实现,且 hash 输入永远是 canonical JSON,
key 顺序由工具保证。

**小重构(随 5A-PR-1 一起做)**:把
`packages/d2c-core/src/preview/stable-json.ts` 提到
`packages/d2c-core/src/utils/stable-json.ts`,因为 5A 起 semantic 模块也要 import,而
semantic 不应该 import preview(语义层向下依赖反了)。改动只涉及 `derive-visual-view.ts`
与对应测试的 import 路径,行为不变。

**id 输入必须是 canonical record,字段固定枚举,不留笼统 `extra`。** 现期形态:

| id 类型              | 前缀  | hash 输入 record                                                                  |
| -------------------- | ----- | --------------------------------------------------------------------------------- |
| `SemanticNode.id`    | `s_`  | `{ form: 'node', primaryVisualNodeId, kind }`                                     |
| `ComponentCandidate.id` | `cc_` | `{ form: 'candidate', rootSemanticNodeId, boundary }`                          |
| `RepeatedPattern.id` | `rp_` | `{ form: 'pattern', parentSemanticNodeId, axis, itemSemanticNodeIds: [..sorted] }` |
| `LayoutCandidate.id` | `lc_` | `{ form: 'layout', semanticNodeId, kind }`                                        |

公式:`<prefix> + stableSha256(stableJson(input)).slice(0, 12)`。

**`form` 字段是规范化命名空间标记**:不同 form 永远算出不同 hash,避免未来扩展时的 id 撞车。
后续若引入新 SemanticNode 来源(例如 slot 派生节点、显式合并节点),新增新的 form 串(例如
`'node-slot'` / `'node-merged'`)并在本表登记;**不要**给旧 form 加字段,否则会让既有
fixture 的 id 全体漂移、stability test 失效。

不用 `crypto.randomUUID()` 也不用计数器——前者破坏确定性,后者破坏"插入新节点不影响旧 id"。

## 4. SemanticViewBody Schema(Zod 具体形态)

```ts
// packages/d2c-core/src/semantic/schema.ts

export const ConfidenceSchema = z.enum(['low', 'medium', 'high', 'developer-provided']);

export const SemanticEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('visual-node'),         nodeId: z.string(), reason: z.string() }).strict(),
  z.object({ kind: z.literal('design-ir-candidate'), candidateName: z.string(), nodeId: z.string(), reason: z.string() }).strict(),
  z.object({ kind: z.literal('annotation'),          annotationKey: z.string(), nodeId: z.string(), reason: z.string() }).strict(),
  z.object({ kind: z.literal('project-rule'),        ruleName: z.string(), reason: z.string() }).strict(),
]);

export const WarningSchema = z.object({
  code: z.string(),
  severity: z.enum(['info', 'warn', 'error']),
  message: z.string(),
  nodeIds: z.array(z.string()).optional(),
}).strict();

const BoundsSchema = z.object({
  x: z.number(), y: z.number(), width: z.number(), height: z.number(),
}).strict();

const SemanticSourceSchema = z.object({
  nodeIds: z.array(z.string()).min(1),
  provider: z.string().optional(),
}).strict();

const SemanticNodeBase = {
  id: z.string(),
  name: z.string(),
  role: z.string().optional(),
  primaryVisualNodeId: z.string(),
  visualNodeIds: z.array(z.string()).min(1),
  parentId: z.string().optional(),
  childIds: z.array(z.string()),
  bounds: BoundsSchema,
  confidence: ConfidenceSchema,
  evidence: z.array(SemanticEvidenceSchema).min(1),
  source: SemanticSourceSchema,
};

export const SemanticNodeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('screen'),         ...SemanticNodeBase }).strict(),
  z.object({ kind: z.literal('region'),         ...SemanticNodeBase }).strict(),
  z.object({ kind: z.literal('component'),      ...SemanticNodeBase }).strict(),
  z.object({ kind: z.literal('repeated-item'),  ...SemanticNodeBase }).strict(),
  z.object({ kind: z.literal('text'),           ...SemanticNodeBase }).strict(),
  z.object({ kind: z.literal('media'),          ...SemanticNodeBase }).strict(),
  z.object({ kind: z.literal('icon'),           ...SemanticNodeBase }).strict(),
  z.object({ kind: z.literal('control'),        ...SemanticNodeBase }).strict(),
  z.object({ kind: z.literal('decorative'),     ...SemanticNodeBase }).strict(),
]);

export const ComponentCandidateSchema = z.object({
  id: z.string(),
  rootSemanticNodeId: z.string(),
  suggestedName: z.string(),
  boundary: z.enum(['symbol', 'annotation', 'repeat-pattern', 'visual-region', 'developer-provided']),
  confidence: ConfidenceSchema,
  evidence: z.array(SemanticEvidenceSchema).min(1),
}).strict();

export const RepeatedPatternSchema = z.object({
  id: z.string(),
  itemSemanticNodeIds: z.array(z.string()).min(3),  // 至少 3 个,见 §3.4
  axis: z.enum(['x', 'y', 'grid', 'unknown']),
  itemCount: z.number().int().min(3),
  similarity: z.number().min(0).max(1),
  confidence: ConfidenceSchema,
  evidence: z.array(SemanticEvidenceSchema).min(1),
}).strict();

export const LayoutCandidateSchema = z.object({
  id: z.string(),
  semanticNodeId: z.string(),
  kind: z.enum(['absolute', 'stack', 'inline', 'grid', 'overlay']),
  confidence: ConfidenceSchema,
  constraints: z.array(z.string()),
  caveats: z.array(z.string()),
}).strict();

export const SemanticScreenSchema = z.object({
  semanticNodeId: z.string(),
  name: z.string(),
}).strict();

export const SemanticViewBodySchema = z.object({
  screen: SemanticScreenSchema,
  nodes: z.array(SemanticNodeSchema).min(1),
  componentCandidates: z.array(ComponentCandidateSchema),
  repeatedPatterns: z.array(RepeatedPatternSchema),
  layoutCandidates: z.array(LayoutCandidateSchema),
  warnings: z.array(WarningSchema),
}).strict();
```

`SemanticScreen` 是顶层屏指针,引用 `nodes` 中 `kind === 'screen'` 的那个节点(精确一个);
schema 不在 type 层强制单一性(避免膨胀),由 `deriveSemanticView` 保证 + 单测覆盖。

## 5. evidence 模型

```ts
// packages/d2c-core/src/semantic/evidence.ts

export function evidenceFromVisualNode(nodeId: string, reason: string): SemanticEvidence;
export function evidenceFromDesignIrCandidate(
  candidateName: string, nodeId: string, reason: string,
): SemanticEvidence;

// 5A 留入口但 derive 不产出:
export function evidenceFromAnnotation(annotationKey: string, nodeId: string, reason: string): SemanticEvidence;
export function evidenceFromProjectRule(ruleName: string, reason: string): SemanticEvidence;
```

构造器都很薄,只是带类型的对象字面量。意义在于:用 evidence 构造器作为"产生 evidence
的唯一入口"——后续 grep `evidenceFromVisualNode(` 就能列出所有视觉证据来源。

## 6. derive-semantic-view 算法

### 6.1 输入校验

```ts
function deriveSemanticView(input: {
  designIr: DesignIR;
  visualView: VisualView;
}): { semanticView: SemanticView; warnings: Warning[] }
```

- `validateDesignIR(designIr)` 必须成功(deriveSemanticView 不做完整校验,由 caller 保证)。
- `visualView.generatedFrom.designIrHash` 必须存在且与 `stableSha256(stableJson(designIr))` 一致;
  不一致 → 抛 `Error('visual-view designIrHash mismatch')`(这是 hash 链断裂,不是普通 warning)。

### 6.2 hash 写入

输出 `semanticView.generatedFrom`:

```ts
{
  schemaVersion: designIr.schemaVersion,
  designIrHash: visualView.generatedFrom.designIrHash,           // 透传(已校验一致)
  visualViewHash: stableSha256(stableJson(visualView)),          // 本步计算
  sourceRef: visualView.generatedFrom.sourceRef,                  // 透传(可选)
}
```

### 6.3 主流程

1. **walk visualView.body.root**,构造 `SemanticNode` 候选(每个 VisualNode 至少映射出
   一个 SemanticNode,kind 由启发式选择,见 §6.4)。
2. **吸收 design-ir candidates**:对每个 `designIr.semantic.candidates[i]`,找到 `nodeId`
   对应的 SemanticNode,若 boundary 满足升格条件则产出 `ComponentCandidate`(见 §6.5)。
3. **重复 sibling 检测**:每个父节点下的 children,按 §6.6 检测 repeated pattern。
4. **layout 推断**:每个 region/component 节点,按 §6.7 选 layoutCandidate。
5. **screen 节点**:`visualView.body.root` 一定映射为 `kind === 'screen'`,作为
   `body.screen.semanticNodeId`。
6. **warnings**:汇总过程中所有低置信结论、被丢弃的候选、未升格的视觉聚类等。

### 6.4 VisualNode.kind → SemanticNode.kind 启发式

| VisualNode               | SemanticNode.kind | 条件                                                    |
| ------------------------ | ----------------- | ------------------------------------------------------- |
| `frame` 根               | `screen`          | 是 `visualView.body.root`                               |
| `frame` / `group` 有子   | `region`          | 默认                                                    |
| `frame` / `group` 命前缀 | `component`       | 见 §3.4 前缀约定                                        |
| 任意有 `symbol.instanceId` | `component`     | symbol 实例                                             |
| `text`                   | `text`            |                                                         |
| `image`                  | `media`           |                                                         |
| `image` 且 size < 32px   | `icon`            | 启发式,带 warning                                       |
| `vector` / `shape` 叶子  | `decorative`      | 无文本、无 asset、无 symbol、无子                       |
| `vector` 大面积或带 fill | `media`           | 启发式;由 derive 函数决定,带 warning                    |

`control` kind 5A 不主动产出(button / tab / input 识别 5B 起做 interaction draft 时再说)。

### 6.5 ComponentCandidate 升格规则

| boundary                | 触发条件                                                   | confidence            |
| ----------------------- | ---------------------------------------------------------- | --------------------- |
| `symbol`                | `VisualNode.symbol.instanceId` 存在                        | `high`                |
| `annotation`            | 5A 不产出                                                  | —                     |
| `repeat-pattern`        | 由 §6.6 的 repeated pattern 升格而来,**且**所有 item 的 `SemanticNode.kind` ∈ `{region, component, repeated-item}` | `medium`              |
| `visual-region`         | 命中前缀约定(§3.4)                                        | `medium`              |
| `developer-provided`    | 5A 不产出(开发者契约 5B/5C 才能传入)                     | —                     |

任何 boundary 不满足 → 不产出 ComponentCandidate,只留 SemanticNode。warning 写
`low-confidence-component`。

**repeat-pattern 升格的 kind 白名单**:`text` / `icon` / `media` / `decorative` /
`control` 永远**不**升格成 ComponentCandidate,哪怕重复结构再规整。一组重复文案、
重复图标、重复装饰条本身是"重复内容",不是"重复组件"。
碰到这些情况,只产出 `RepeatedPattern`(§6.6 仍会产出)+ `LayoutCandidate`,**不**产出
`ComponentCandidate`,并记 warning `repeated-pattern-not-promoted`,说明被白名单挡掉。
这与"保守 derive、没证据不升格"的主基调一致。

### 6.6 RepeatedPattern 检测

对每个父节点的 children,**只在同父序列内、只比主轴 gap**(不跨父级、不混合轴向):

1. **筛同 kind**:至少 3 个同 SemanticNode.kind 的 sibling。
2. **定主轴**:对 sibling bounds 比较,主轴 = 中心点散布方差更大的轴。若两轴接近、
   且看起来像 grid → 5A **不识别**,记 warning `repeated-pattern-grid-skipped`。
3. **按主轴坐标排序**,计算相邻 gap 序列 `[g_0, g_1, ..., g_{n-2}]` 与 `mean = avg(gaps)`。
4. **双阈值校验**:对每个 `g_i`,`absDelta = abs(g_i - mean)`,`relDelta = absDelta / mean`。
   `g_i` 稳定 ⇔ `absDelta <= 2px` 或 `relDelta <= 0.15`。**所有 gap 都稳定**才算通过;
   任一不通过 → 不产出 pattern,记 warning `repeated-pattern-spacing-irregular`,附 nodeIds。
5. **结构同形校验**:每个 item subtree 的(text 节点数 / asset 节点数 / 最深嵌套层数)
   必须完全相等。任一不等 → 不产出 pattern,记 warning `repeated-pattern-shape-mismatch`。
6. 全部满足 → 产出 RepeatedPattern:
   - `axis`:主轴方向(`'x'` / `'y'`,grid 在 step 2 已挡)。
   - `similarity`:`1 - max(absDelta) / max(mean, 2px)`,夹到 `[0, 1]`。分母取 max 防 0 除。
   - `confidence`:**5A 始终给 `'medium'`**。high 留给后续接 annotation/project-rule 后再升。

**comparator 必须确定性**:排序时若主轴坐标相同,用 SemanticNode.id 字典序断 ties。

### 6.7 LayoutCandidate 选择

- 默认每个 region/component `'absolute'`,`confidence: 'high'`,无 caveats。
- 若该节点包含至少一个 repeated pattern,`'stack'`(axis=y) 或 `'inline'`(axis=x),
  `confidence: 'medium'`,caveats 写 "spacing variance N%"。
- `'grid'` / `'overlay'` 不产出。

### 6.8 确定性保证

- 任何 `Array.sort()` 调用必须用确定性 comparator(不依赖原数组顺序)。
- id 生成只用输入字段 hash(§3.5),不用 `Date.now()` / `Math.random()`。
- warnings 数组按"先深度优先遍历顺序、同节点按 code 字典序"输出。

## 7. 文件落点

```
packages/d2c-core/
  src/
    semantic/
      index.ts              # barrel: schema + evidence + validate + derive
      schema.ts             # Zod schemas (§4) - shape only
      evidence.ts           # evidence constructors (§5)
      validate.ts           # assertSemanticViewIntegrity (§7.1) - graph-level
      derive.ts             # deriveSemanticView (§6); 内部调 validate 自检
    ir/
      views.ts              # 改:SemanticViewSchema.body 用 SemanticViewBodySchema
                            #    GeneratedFromSchema 加 visualViewHash
```

barrel(`src/index.ts`)更新:从 `src/semantic` re-export `deriveSemanticView`、
`SemanticViewBodySchema`、`SemanticNodeSchema`、`SemanticEvidenceSchema`、`WarningSchema`、
`assertSemanticViewIntegrity`。

### 7.1 schema-level vs graph-level 分工

`SemanticViewBodySchema`(§4)只承担 **shape 级**校验:字段存在、类型正确、enum 合法、
discriminated union 选对、`min(1)` 等基本约束。Zod 天然能拒的就到此为止。

**graph 级约束**——节点 id 唯一、父子互指、跨节点引用解析、screen 指针指向正确
kind 的节点等——独立放 `semantic/validate.ts`,导出:

```ts
export function assertSemanticViewIntegrity(view: SemanticView): void;
// 失败抛 Error,带具体违规位置(node id / 字段路径 / 原因)。
```

`deriveSemanticView` 在产出 SemanticView 后**强制调用一次** `assertSemanticViewIntegrity`,
任何 graph 级错误都是 derive bug,直接 throw(不写 warning)。
未来 5B/5C/外部消费者手工构造 SemanticView 时也用这个 helper 自检。

这样 Zod 错误信息保持精准(指向具体字段),graph 检查的失败也有专门函数和测试边界,
不会把跨节点约束的责任错挂在 schema 上。

## 8. Fixture 计划

现有 `skills/sketch-to-component/scripts/src/__tests__/fixtures/sketch-raw.min.json` 太瘦,
无法测 5A。新增/扩两套 fixture(放 `packages/d2c-core/src/semantic/__tests__/fixtures.ts`,
**内联 TS 而非 JSON**——与现有约定一致,见 `preview/__tests__/fixtures.ts`):

| Fixture | 内容 | 覆盖的 5A 行为 |
| --- | --- | --- |
| `makeSymbolHeavyView()` | 1 root + 2 symbol 实例(不同 master,带 text override) | symbol → ComponentCandidate(boundary='symbol', confidence='high') |
| `makeListView()` | 1 root + 5 同 kind 同结构 sibling(等间距 y 轴) | RepeatedPattern(axis='y', similarity≈1) + LayoutCandidate(kind='stack') |
| `makeAmbiguousGroupView()` | 1 root + 2 frame group(无前缀、无 symbol、无 description) | 不产出 ComponentCandidate,产出 SemanticNode region + warning('low-confidence-component') |
| `makeDecorativeBgView()` | 1 root + 1 大面积 vector + 1 文本 | vector → media(带 warning), text → text |
| `makeFullChatView()`(可选) | 综合:header / list / input | 端到端 smoke,验证整体 schema |

不需要拿真 `.sketch` 文件;5A 测试用 `makeDesignIR()` + `makeVisualView()` 直接造内存对象。

真 fixture 留到 5D(CLI + 端到端)再做。

## 9. 测试矩阵

文件 `packages/d2c-core/src/semantic/__tests__/`:

| 文件 | 测试点 |
| --- | --- |
| `schema.test.ts` | **仅 shape 级约束**(Zod 能拒的)。正例;反例:缺 source、空 evidence、非法 confidence、缺 screen、`min(1)` 字段为空、SemanticEvidence discriminator 缺 `kind`。不测跨节点引用 |
| `evidence.test.ts` | 四个 constructor 返回结构 + discriminated union 校验 |
| `validate.test.ts` | **graph 级约束**(由新 `semantic/validate.ts` 强制)。反例:重复 `SemanticNode.id`、`childIds` 引用不存在的 id、`parentId` 与 `childIds` 不互指、`body.screen.semanticNodeId` 指向的不是 kind=screen 节点、`primaryVisualNodeId` 不在 `visualNodeIds` 里 |
| `derive-symbol.test.ts` | makeSymbolHeavyView → 验证 component candidates 数量、boundary、confidence、id 稳定 |
| `derive-list.test.ts` | makeListView → 验证 repeated pattern + layout candidate |
| `derive-ambiguous.test.ts` | makeAmbiguousGroupView → 不升格 + warning |
| `derive-determinism.test.ts` | 同输入跑 3 次,深度 equal;输入打乱 children 顺序后,id 与输出仍稳定 |
| `derive-hash.test.ts` | designIrHash 不匹配 → throw;visualViewHash 与输入一致;输出可被 SemanticViewSchema parse |
| `views-integration.test.ts` | `SemanticViewSchema.safeParse(deriveSemanticView(...).semanticView)` 全部 fixture 通过 |

测试约定:用 `vitest`,沿用 `packages/d2c-core/src/preview/__tests__/` 同款 inline TS fixture
模式(见调研报告 §6)。

## 10. 出口标准

- `packages/d2c-core/src/semantic/` 四份文件全部就位,内部 import 清晰。
- `SemanticViewSchema.body` 已替换为 `SemanticViewBodySchema`,不再是 `z.record(z.unknown())`。
- `GeneratedFromSchema.visualViewHash` 已加(可选字段,patch 兼容)。
- `deriveSemanticView` 对所有 5 个 fixture 都能产出合 schema 的 semantic-view。
- `npm run test:d2c` 全绿,本批新增至少 ~30 用例。
- `npm run typecheck:d2c` 全绿(注意:`semantic/index.ts` 必须导出新类型,主 barrel 同步)。
- 同输入跑 3 次,`JSON.stringify(deriveSemanticView(input))` 字节级一致。
- hash 不匹配场景有明确 error,不是模糊 fail。
- 文档:`packages/d2c-core/README.md` 加一节 "Semantic View(Stage 5A)" 描述本期能力 + 已知限制(grid 不识别、annotation/project-rule evidence 留入口未实现)。

## 11. 执行顺序(5A 内的小步)

拆 **3 个 PR**(2 个太糊、4 个最后一个信息密度不够):

1. **5A-PR-1 — schema + evidence + validate + utils move**:`semantic/schema.ts`、
   `semantic/evidence.ts`、`semantic/validate.ts`、`semantic/index.ts`(初版导出
   schema/evidence/validate)+ `__tests__/schema.test.ts`、`__tests__/evidence.test.ts`、
   `__tests__/validate.test.ts`。**不动 views.ts**。
   同 PR 顺手把 `preview/stable-json.ts` → `utils/stable-json.ts`(见 §3.5),改
   `derive-visual-view.ts` 与对应测试的 import 路径,行为不变。
   Review 重点:Zod 形态、字段命名、`SemanticEvidence` discriminated union 是否够用、
   §3.5 id 表是否覆盖所有 5A 需求、schema/validate 分工是否清晰、utils 提升是否破坏
   Stage 4 测试。
2. **5A-PR-2 — derive(walker + promotion + heuristics)**:`semantic/derive.ts` 完整实现
   §6 全套(walker / hash 校验 / kind 启发式 / component 升格 / repeated pattern /
   layout candidate)+ `__tests__/fixtures.ts`(5 个 maker)+ derive 行为单测
   (`derive-symbol` / `derive-list` / `derive-ambiguous` / `derive-determinism` /
   `derive-hash`)。`semantic/index.ts` 同步导出 `deriveSemanticView`。
   Review 重点:双阈值是否符合直觉、grid skip warning 是否合理、确定性测试是否到位。
3. **5A-PR-3 — wiring + barrel + docs**:`ir/views.ts` 替换 `SemanticViewSchema.body`、
   `GeneratedFromSchema` 加 `visualViewHash`、主 barrel(`src/index.ts`)同步、
   `views-integration.test.ts`、`packages/d2c-core/README.md` 加 "Semantic View(Stage 5A)" 节。
   Review 重点:跨模块 import 是否清晰、对 Stage 4 视觉链是否真做了 patch-level 兼容
   (`schemaVersion` 不变、`visualViewHash` 在 Stage 4 输出不写也能 parse)。

PR-1 合掉后,5B/5C 的 schema 设计就能并行起草(消费 `SemanticNode` / `SemanticEvidence` /
`Warning`)。PR-2 与 PR-3 顺序不可换:PR-3 的 integration test 直接依赖 PR-2 的 derive
能跑通真 fixture。

## 12. 已知限制 / 后置

- **grid layout 不识别**:网格结构(混合 x+y 等间距)5A 留 warning,留给 5A+ 增强或
  Stage 7 校验拒收时回看。
- **annotation 来源未消费**:Sketch description / pluginData 抽取 5A 不做。需要在
  `design-ir` IR 里先有抽取产物(Stage 3 阶段补),5B 起再消费。
- **project-rule evidence 留入口**:命名约定、组件粒度偏好等规则引擎 5A 不做,
  schema 留口。后续如果加规则,只动 derive,不动 schema。
- **真 Sketch fixture**:5A 用合成 fixture 测确定性 + schema 正确性;真 `.sketch` 端到端
  留到 5D(CLI + Gate 2 信号),那时配合真预览门禁一并跑。
- **Batch 3 mask/clipping**:不阻断 5A;但落 schema 时若发现 layoutCandidate 的 caveats
  需要记录"mask 影响 component boundary",在 §6.7 增量改即可。
