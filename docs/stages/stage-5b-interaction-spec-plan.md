# Stage 5B 实施计划 — `deriveInteractionSpec` + InteractionSpecBody schema

> 本文是 [Stage 5 蓝图](./stage-5-component-contract-outline.md) §10 的 **5B** 子段——
> 在 Stage 5A(`semantic-view`)之上,定义 `interaction-spec` 的 5 档 status / body
> schema,实现保守的 draft 起草 + `omitted` / `deferred` 显式审批通道。5C(component-plan)
> 与 5D(CLI + Gate 2 信号)不在本文范围。
>
> 前置:5A 全部已合(#30 / #31 / #32 / #33)。`semantic-view` body 已收紧,
> `GeneratedFromSchema.visualViewHash` 已加,`SemanticView`/`SemanticNode`/
> `SemanticEvidence`/`Warning` 可作为 5B 输入与共享原语。

---

## 1. 范围

**做**

- 新建 `packages/d2c-core/src/contract/`:`interaction-schema.ts`、
  `interaction-validate.ts`、`derive-interaction.ts`、`index.ts`。
- 把 `packages/d2c-core/src/ir/views.ts` 里的 `InteractionSpecSchema.body` 从
  `z.record(z.unknown())` 替换为 `InteractionSpecBodySchema`。
- 新增 `InteractionStatusSchema = z.enum(['draft', 'in-review', 'approved',
'omitted', 'deferred'])`,改 `InteractionSpecSchema.status` 引用它。
  **不动** `ContractStatusSchema`(component-plan 仍是 3 档)。
- 给 `GeneratedFromSchema` 加 `semanticViewHash`(可选;5B derive 强制写入)。
- 实现
  `deriveInteractionSpec({ designIr, visualView, semanticView, mode? }) → { interactionSpec, warnings }`。
  - 默认 `mode === 'draft'`,从 semantic-view 起草 events / dataModels;
  - `mode === 'omitted' | 'deferred'` 走显式审批通道,写出空 body + coverage。
- 给 `omitted` / `deferred` 加专用 validator:`reason`、`approvedBy`、`approvedAt`
  必填;`draft` / `in-review` 不允许带这三个字段。
- 单测覆盖 schema 正反例、draft 起草、omitted/deferred 审批、确定性、hash 链一致性。

**不做**

- 不动 `component-plan` schema(5C)。
- 不写 CLI `contract` 子命令(5D)。
- 不接 `runContract` 薄入口(5D)。
- 不实现状态机推断(blueprint §7 明令:无显式 annotation 时,states/stateTransitions
  必须为空,不得编造 loading/error/success)。
- 不实现真 annotation 抽取(`SemanticEvidence.kind === 'annotation'` 5A 留入口,5B
  消费侧也只读;具体抽取留给后续 fidelity batch)。
- 不实现 API 绑定推断;数据槽位只到"这里有个 string 字段"层面。
- 不动 Stage 4 / Stage 5A 输出形态。

**标准**:5B 完成后,任一已通过的 semantic-view fixture 都能产出一份 schema 合法的
`interaction-spec` 对象,内容可解释、确定性可复跑、coverage 真实反映本次 draft 的边界,
draft event/dataModel 的 `confidence` 不超过 `medium`。

## 2. 输入 / 输出

```text
输入:
  designIr         : 已经 validateDesignIR() 过的 DesignIR
  visualView       : Stage 4 deriveVisualView() 的 VisualView
                     (含 generatedFrom.designIrHash)
  semanticView     : Stage 5A deriveSemanticView() 的 SemanticView
                     (含 generatedFrom.designIrHash + visualViewHash;5B 强制要求)
  mode (optional)  : 'draft' (default) | 'omitted' | 'deferred'
  approval (req. for omitted/deferred):
                     { reason, approvedBy, approvedAt }

输出:
  interactionSpec  : InteractionSpec,kind === 'interaction-spec',
                     generatedFrom 含 designIrHash + visualViewHash +
                     semanticViewHash 三档 hash
  warnings         : Warning[]

约束:
  同输入 → 同输出,字节级可复跑(包括 warnings 顺序、id 生成)。
```

`deriveInteractionSpec` 是纯函数,不读文件、不发网络、不写磁盘、不取系统时间
(`approvedAt` 必须由 caller 提供)。

## 3. 核心决策

### 3.1 `InteractionStatusSchema` 是 5 档独立 enum,不与 `ContractStatusSchema` 合流

蓝图 §3.2 / 架构文档明确:

| 工件               | 合法 status 集                                                 |
| ------------------ | -------------------------------------------------------------- |
| `interaction-spec` | `draft \| in-review \| approved \| omitted \| deferred` (5 档) |
| `component-plan`   | `draft \| in-review \| approved` (3 档,无 omitted/deferred)    |

`component-plan` 用 `mode` 区分 presentational / interactive,**不**用 status 表达
"不做"——那是 interaction-spec 的语义。

5B 新建 `InteractionStatusSchema`,`InteractionSpecSchema.status` 引用它。
`ContractStatusSchema` 不动。

### 3.2 `omitted` / `deferred` 的 approval 字段是 top-level,不进 body

蓝图 §7:`reason` / `approvedBy` / `approvedAt` 与 `status` 平级,**不**进
`body`。这与 `component-plan` 的 `approval` 子对象不一样——interaction-spec 没有 Gate
审批分级("level"),只有"为什么 omitted/deferred"。形态更扁平。

5B schema 用 discriminated union 把这条规则编进 Zod:

```ts
const InteractionSpecOmissionFields = {
  reason: z.string().min(1),
  approvedBy: z.string().min(1),
  approvedAt: z.string().min(1),
};

export const InteractionSpecSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('draft'),     /* no approval fields */ ... }).strict(),
  z.object({ status: z.literal('in-review'), /* no approval fields */ ... }).strict(),
  z.object({ status: z.literal('approved'),  ...InteractionSpecApprovalFields ... }).strict(),
  z.object({ status: z.literal('omitted'),   ...InteractionSpecOmissionFields ... }).strict(),
  z.object({ status: z.literal('deferred'),  ...InteractionSpecOmissionFields ... }).strict(),
]);
```

`approved` 也要 `approvedBy` / `approvedAt`(审批轨迹),但 `reason` 改为可选(approved 不需要
解释"为什么省略")。Schema 形态由 5B-PR-1 落实。

`draft` / `in-review` 携带这三个字段 **会被 schema 拒**——避免 caller 错把"我已经填了
approvedBy"当成审批已经发生。

### 3.3 hash 链:`semanticViewHash` 在 5B 加入 `GeneratedFromSchema`

现状:`GeneratedFromSchema` 有 `designIrHash` / `visualViewHash`(5A-PR-3 加)。5B 加
`semanticViewHash?`(可选,5B derive 强制写入)。

`deriveInteractionSpec` 入口校验:

- `visualView.generatedFrom.designIrHash` 必须与 `stableSha256(stableJson(designIr))` 一致;
- `semanticView.generatedFrom.designIrHash` 必须与上同;
- `semanticView.generatedFrom.visualViewHash` 必须与 `stableSha256(stableJson(visualView))` 一致。

任一不一致 → throw,**不**当 warning。

5B 写出:

```ts
interactionSpec.generatedFrom = {
  schemaVersion: designIr.schemaVersion,
  sourceRef: visualView.generatedFrom.sourceRef,  // 透传
  designIrHash: <computed>,
  visualViewHash: <computed>,
  semanticViewHash: stableSha256(stableJson(semanticView)),  // 本步计算
};
```

不动 `interactionSpecHash`(5C component-plan 才用)。

### 3.4 draft 起草上限:`confidence` 不高于 `medium`

蓝图 §7 反复强调:无 annotation 时,任何视觉启发式得出的 event / dataModel `confidence`
**不**得超过 `medium`。`high` / `developer-provided` 必须有显式 annotation 或开发者
override。5B 没有 annotation 抽取器,所以 5B 起草的所有 candidate `confidence` 实际上限是
`medium`——schema 层不限制(留给 5B+),由 derive 行为兜底,单测覆盖。

### 3.5 `body.coverage` 是 Stage 6 `interaction-coverage.md` 的唯一数据源

蓝图 §3.4 与 §7 双重锁定。5B coverage 形态(blueprint §15):

```ts
type InteractionCoverage = {
  states: { status: 'covered' | 'draft' | 'omitted' | 'deferred'; notes: string };
  events: { status: 'covered' | 'draft' | 'omitted' | 'deferred'; notes: string };
  dataBinding: { status: 'covered' | 'draft' | 'omitted' | 'deferred'; notes: string };
  stateTransitions: { status: 'covered' | 'draft' | 'omitted' | 'deferred'; notes: string };
};
```

5B 不会写出 `'covered'`——那需要开发者签字。5B draft 模式下,**全部四项**至少是 `'draft'`
或 `'omitted'`(如果该类没起草成功)。`omitted` / `deferred` 模式下,四项一律对齐 status。

### 3.6 deterministic id

复用 5A §3.5 方案:`<prefix> + stableSha256(stableJson({ form, ...canonical })).slice(0, 12)`。
5B 新增的 id 类型:

| id 类型                    | 前缀  | hash 输入 record                                                      |
| -------------------------- | ----- | --------------------------------------------------------------------- |
| `InteractionComponent.id`  | `ic_` | `{ form: 'interaction-component', semanticNodeId }`                   |
| `InteractionEvent.id`      | `ie_` | `{ form: 'interaction-event', source: semanticNodeId, eventName }`    |
| `InteractionDataModel.id`  | `id_` | `{ form: 'interaction-data', source: semanticNodeId, slotName }`      |
| `InteractionState.id`      | `is_` | `{ form: 'interaction-state', stateName }` (5B 不产出,留 schema 入口) |
| `InteractionTransition.id` | `it_` | `{ form: 'interaction-transition', from, on, to }` (5B 不产出)        |

`InteractionState` / `InteractionTransition` 5B **不产出**,但 schema 层留型。前缀提前约定,
避免后续 5B+ 加进来时再改 id 形态。

## 4. InteractionSpec Body Schema(Zod 具体形态)

```ts
// packages/d2c-core/src/contract/interaction-schema.ts

import { z } from 'zod';
import { ConfidenceSchema, WarningSchema } from '../ir/schema';

/* ── status enum (5 档,独立于 ContractStatusSchema) ─────────────────────── */

export const InteractionStatusSchema = z.enum([
  'draft',
  'in-review',
  'approved',
  'omitted',
  'deferred',
]);
export type InteractionStatus = z.infer<typeof InteractionStatusSchema>;

/* ── body 内部原语 ─────────────────────────────────────────────────────── */

export const InteractionComponentSchema = z
  .object({
    id: z.string().min(1),
    semanticNodeId: z.string().min(1),
    name: z.string().min(1),
    confidence: ConfidenceSchema,
  })
  .strict();

export const InteractionEventSchema = z
  .object({
    id: z.string().min(1),
    eventName: z.string().min(1),
    source: z.string().min(1), // semanticNodeId
    handlerProp: z.string().min(1), // e.g., "onSubmit"
    payload: z.record(z.string()), // field -> type signature (string for now)
    confidence: ConfidenceSchema,
    evidenceMessage: z.string(),
  })
  .strict();

export const InteractionDataModelSchema = z
  .object({
    id: z.string().min(1),
    slotName: z.string().min(1),
    source: z.string().min(1), // semanticNodeId
    type: z.string().min(1), // 'string' | 'Message[]' | 'User' | ...
    confidence: ConfidenceSchema,
    evidenceMessage: z.string(),
  })
  .strict();

export const InteractionStateSchema = z
  .object({
    id: z.string().min(1),
    stateName: z.string().min(1),
    confidence: ConfidenceSchema,
    evidenceMessage: z.string(),
  })
  .strict();

export const InteractionTransitionSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1), // stateName
    on: z.string().min(1), // eventName
    to: z.string().min(1), // stateName
    confidence: ConfidenceSchema,
  })
  .strict();

const CoverageStatusSchema = z.enum(['covered', 'draft', 'omitted', 'deferred']);

export const InteractionCoverageSchema = z
  .object({
    states: z.object({ status: CoverageStatusSchema, notes: z.string() }).strict(),
    events: z.object({ status: CoverageStatusSchema, notes: z.string() }).strict(),
    dataBinding: z.object({ status: CoverageStatusSchema, notes: z.string() }).strict(),
    stateTransitions: z.object({ status: CoverageStatusSchema, notes: z.string() }).strict(),
  })
  .strict();

export const InteractionSpecBodySchema = z
  .object({
    components: z.array(InteractionComponentSchema),
    states: z.array(InteractionStateSchema),
    events: z.array(InteractionEventSchema),
    dataModels: z.array(InteractionDataModelSchema),
    stateTransitions: z.array(InteractionTransitionSchema),
    coverage: InteractionCoverageSchema,
    warnings: z.array(WarningSchema),
  })
  .strict();
export type InteractionSpecBody = z.infer<typeof InteractionSpecBodySchema>;
```

**`InteractionSpecSchema` 自身在 `contract/interaction-schema.ts` 落地**(用 5 档 status
discriminated union,引用上面的 body schema,具体形态见 §3.2)。这样 5B-PR-1 就有一份
完整、可测的 envelope schema 可以单测,**不需要等到 PR-3 改 `ir/views.ts` 才能 review
5 档 discriminated union**。

PR 流转:

- **PR-1**:`InteractionSpecSchema` 的 canonical 定义在 `contract/`;`ir/views.ts` 的
  老 `InteractionSpecSchema`(3 档 status + 松散 body)暂不动。两个同名 export 不冲突,
  因为 `src/index.ts` 此时还未 `export * from './contract'`。
- **PR-2**:`derive-interaction.ts` 从 `'../contract'` import canonical 版本使用。
- **PR-3**:`ir/views.ts` 删掉本地老定义,改为
  `export { InteractionSpecSchema, type InteractionSpec, InteractionStatusSchema, type InteractionStatus } from '../contract';`
  同时把 `'./contract'` 加到 root barrel,`ir/__tests__/views.test.ts` 现有 InteractionSpec
  反例改写成 tight body。

## 5. graph-level validator(`interaction-validate.ts`)

shape 之外要求的约束分两层。

### 5.1 intra-spec(本身就能跑)

不需要任何外部上下文,光看 spec 本体就能判:

- 每个 `InteractionTransition.from`/`to` 必须能在 `body.states[*].stateName` 中找到。
- 每个 `InteractionTransition.on` 必须能在 `body.events[*].eventName` 中找到。
- `body.components` / `body.events` / `body.dataModels` 的 id 在各自数组内唯一,
  且跨四个 id 集全局唯一(沿用 5A `assertSemanticViewIntegrity` 的 P3 经验)。
- coverage 状态与 status 一致性:
  - `status === 'omitted'` → coverage 四项 status 都必须是 `'omitted'`;
  - `status === 'deferred'` → 四项都必须是 `'deferred'`;
  - `status === 'draft' | 'in-review'` → 四项可以是 `'draft'` / `'omitted'`,不能是
    `'covered'`(未签字不能宣称完整);
  - `status === 'approved'` → 任意组合,但至少一项必须是 `'covered'`(否则等于 omitted)。

### 5.2 artifact-chain(需要 upstream semantic-view 才能跑)

hash 链只能证明 provenance——证明 spec 是从某个 semantic-view 派生的,**不能**证明
手编辑过的 `source: 's_missing'` 仍然有效。具体跨工件引用必须显式查:

- 每个 `InteractionEvent.source` 必须 ∈ semantic-view 节点 id 集;
- 每个 `InteractionDataModel.source` 必须 ∈ semantic-view 节点 id 集;
- 每个 `InteractionComponent.semanticNodeId` 必须 ∈ semantic-view 节点 id 集。

### 5.3 签名

```ts
export function assertInteractionSpecIntegrity(
  spec: InteractionSpec,
  /** Optional upstream context. When provided, enables §5.2 chain checks. */
  semanticNodeIds?: ReadonlySet<string>,
): void;
```

caller 只持有 spec 时,validator 跑 §5.1;持有上游 semantic-view 时,提取一份
`new Set(semanticView.body.nodes.map((n) => n.id))` 传进来,同时跑 §5.2。
`deriveInteractionSpec` 自然走"持有上游"路径,**始终带上 semanticNodeIds 自检**——
任何跨工件引用失败都是 derive bug,直接 throw,不写 warning。

不传 `semanticView` 整对象的原因:validator 不该建立"必须知道 semantic-view 内部结构"
的依赖;只读 id 集就够,签名稳定、cycle-free,future 5C 也可以同款风格扩。

## 6. 起草算法(`derive-interaction.ts`)

### 6.1 入口签名

```ts
export interface DeriveInteractionSpecInput {
  designIr: DesignIR;
  visualView: VisualView;
  semanticView: SemanticView;
  mode?: 'draft' | 'omitted' | 'deferred'; // default 'draft'
  approval?: {
    // required when mode in {omitted, deferred}
    reason: string;
    approvedBy: string;
    approvedAt: string;
  };
}
```

`mode === 'draft'` 不允许传 `approval`(避免误导);`mode in {omitted, deferred}` 必须传
`approval`。不满足 → throw。

### 6.2 hash 链校验

依次校验 §3.3 列出的三条 hash 等式。任一失败 throw 明确错误信息(指出哪条链)。

### 6.3 mode='omitted' / 'deferred' 分支

body 为空骨架:

```ts
body = {
  components: <从 semantic-view 派生(见 §6.4)>,
  states: [],
  events: [],
  dataModels: [],
  stateTransitions: [],
  coverage: {
    states:           { status: mode, notes: approval.reason },
    events:           { status: mode, notes: approval.reason },
    dataBinding:      { status: mode, notes: approval.reason },
    stateTransitions: { status: mode, notes: approval.reason },
  },
  warnings: [],
};
```

`components` 仍然要写,因为 Stage 6 codegen 在 presentational 模式下还需要拿组件清单
渲染骨架。其余四项空数组 + coverage 全部对齐 mode。

### 6.4 components 来源

每个 `semantic-view.body.componentCandidates` 一对一映射成一个 `InteractionComponent`:

```ts
{
  id: generateInteractionComponentId(candidate.rootSemanticNodeId),
  semanticNodeId: candidate.rootSemanticNodeId,
  name: candidate.suggestedName,
  confidence: candidate.confidence,
}
```

不再额外推断;component 边界已经在 5A 经过 white-list 审过。

### 6.5 mode='draft' 起草启发式

#### 准备工作:VisualNode 索引

`SemanticNode` 只带 trace 字段(`primaryVisualNodeId` 等),**没有** `assetRef` /
`style` / `text.content` 这些 visual 层字段——那些只在 `VisualNode` 上。起草规则要看
`assetRef`,所以 derive 入口先建一份 index:

```ts
const visualNodeById = new Map<string, VisualNode>();
const walk = (n: VisualNode): void => {
  visualNodeById.set(n.id, n);
  for (const c of n.children) walk(c);
};
walk(visualView.body.root);
```

然后 `lookupVisual(semanticNode) = visualNodeById.get(semanticNode.primaryVisualNodeId)`,
返回值非空(`primaryVisualNodeId` 永远来自实际 visual 节点)。

#### 触发表

按 `semantic-view.body.nodes` 遍历顺序判定。表中 regex 用代码字面量,**反斜杠转义 `\|`**
避免 markdown 误把竖线当成列分隔:

| 触发条件                                                                            | 产出                                                                                                                                        | confidence | warning                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------ |
| `kind === 'text'`                                                                   | `dataModel`:slotName=camelCase(name), type=`'string'`, source=node.id                                                                       | `medium`   | —                                    |
| `kind === 'media'` **且** `lookupVisual(node).assetRef` 非空                        | `dataModel`:slotName=camelCase(name), type=`'string'`(URL), source=node.id                                                                  | `low`      | `interaction-draft-media-as-url`     |
| `kind === 'icon'`                                                                   | (skip — icon 通常装饰,不产 dataModel)                                                                                                       | —          | —                                    |
| `kind ∈ {region, component}` **且** name 匹配 `/(button\|btn\|cta\|submit\|send)/i` | `event`:eventName=camelCase(name)+`Click`, handlerProp=`on`+PascalCase, payload=`{}`                                                        | `low`      | `interaction-draft-button-from-name` |
| `kind ∈ {region, component}` **且** name 匹配 `/(tab\|tabs\|tabbar)/i`              | `event`:eventName=camelCase(name)+`Select`, handlerProp=`on`+...                                                                            | `low`      | `interaction-draft-tab-from-name`    |
| `kind ∈ {region, component}` **且** name 匹配 `/(input\|field\|search\|composer)/i` | `event`:eventName=camelCase(name)+`Change`, payload=`{ value: 'string' }`; **同时**产 `dataModel`:slotName=camelCase(name), type=`'string'` | `low`      | `interaction-draft-input-from-name`  |
| `evidence` 含 `kind === 'annotation'`                                               | (5B 不消费,但 5B+ annotation 抽取上线后,这里是 `confidence: high` 入口)                                                                     | —          | —                                    |

**event regex 的 `kind ∈ {region, component}` guard 至关重要**:不然一个内容写着 `"Send"`
的 `text` 节点也会被误归为 event source。`text` 节点只走 dataModel 路径,**永远**不变 event。
同理 `icon` 不变 event(就算名字含 button)。

#### 通用规则

- `confidence` 上限 `medium`;name-pattern 触发的全部是 `low`(纯名字推测,弱信号)。
- 每个 candidate `evidenceMessage` 必须包含触发条件(`"text node 'Title'"` /
  `"name matches /button/i (kind=region)"` 等),review 时能找回起草原因。
- 同一节点只走一个分支(text → dataModel;media → dataModel;name regex → event/+/dataModel);
  互斥,不会同时产出多份 candidate 引用同一 source+slot/eventName。
- regex 是大小写不敏感(`/i`),命中即触发——后续可以接 `project-rule` evidence 让规则
  可配,5B 先硬编码。

### 6.6 coverage 计算(draft 模式)

```ts
coverage = {
  states: {
    status: 'omitted',
    notes: 'draft mode: state machine requires annotations not yet wired',
  },
  events: {
    status: events.length > 0 ? 'draft' : 'omitted',
    notes: `${events.length} candidate events drafted`,
  },
  dataBinding: {
    status: dataModels.length > 0 ? 'draft' : 'omitted',
    notes: `${dataModels.length} candidate slots drafted`,
  },
  stateTransitions: {
    status: 'omitted',
    notes: 'draft mode: state transitions require an annotated state machine',
  },
};
```

5B draft 模式 `states` / `stateTransitions` 永远 `'omitted'`,这是 blueprint §7 锁死的:
没有 annotation 时不得编造状态。

### 6.7 确定性保证

- 任何 `Array.sort()` 用确定性 comparator(沿用 5A 经验,id 字典序兜底)。
- 遍历 semantic-view.body.nodes 顺序按出现顺序,深度优先 pre-order(5A 已保证)。
- 不调 `Date.now()` / `Math.random()`;`approvedAt` 只从 caller 透传。
- warnings 数组按"先节点遍历顺序、同节点按 code 字典序"输出。

## 7. 文件落点

```
packages/d2c-core/
  src/
    contract/                          # 新建
      index.ts                         # barrel
      interaction-schema.ts            # Zod schemas (§4)
      interaction-validate.ts          # assertInteractionSpecIntegrity (§5)
      derive-interaction.ts            # deriveInteractionSpec (§6)
    ir/
      views.ts                         # 改:
                                       # - 加 InteractionStatusSchema (5 档)
                                       # - InteractionSpecSchema 用 discriminated union
                                       #   on status + body 用 InteractionSpecBodySchema
                                       # - GeneratedFromSchema 加 semanticViewHash
```

barrel(`src/index.ts`)更新:从 `src/contract` re-export
`InteractionStatusSchema`、`InteractionSpecBodySchema`、`InteractionComponentSchema`、
`InteractionEventSchema`、`InteractionDataModelSchema`、`InteractionStateSchema`、
`InteractionTransitionSchema`、`InteractionCoverageSchema`、
`assertInteractionSpecIntegrity`、`deriveInteractionSpec`、其相关类型。

**新模块叫 `contract/` 而非 `interaction/`**:Stage 5C 的 `component-plan` 也属于
"Gate 2 契约"层,会同住此目录,避免再开一个并列目录。当前先 5B,5C 进来时只加文件不改结构。

## 8. Fixture 计划

复用 5A 的 5 个 `make*View` 作为上游基底,沿用 5A `__tests__/fixtures.ts` 的 helper。
新增 `packages/d2c-core/src/contract/__tests__/fixtures.ts`,提供:

```ts
import {
  makeFullChatView,
  makeListView,
  makeSymbolHeavyView,
  /* etc. */
} from '../../semantic/__tests__/fixtures';

import { deriveSemanticView } from '../../semantic';

export function makeChatStage5bInput(): DeriveInteractionSpecInput {
  const fx = makeFullChatView();
  const { semanticView } = deriveSemanticView(fx);
  return { designIr: fx.designIr, visualView: fx.visualView, semanticView };
}
/* + 同款 for list / symbol-heavy / ... */
```

加 3 个 5B 专属、用来 stress 起草启发式的 fixture(同样内联 TS):

| Fixture                    | 内容                                                          | 覆盖的 5B 行为                                |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| `makeButtonyView()`        | 1 root + frame named "PrimaryButton" + frame named "Send CTA" | name regex → event candidate,confidence='low' |
| `makeInputComposerView()`  | 1 root + frame named "Search Input" 包 1 text                 | event + dataModel 联动产出                    |
| `makeMixedTextMediaView()` | 1 root + 3 text + 2 media(带 assetRef)                        | dataModel × 5,coverage.dataBinding='draft'    |

不需要真 `.sketch`;5B 测试用内存对象,5D 再接 CLI + 真 fixture。

## 9. 测试矩阵

文件 `packages/d2c-core/src/contract/__tests__/`:

| 文件                          | 测试点                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.test.ts`              | shape 级正反例;反例:`status: 'draft'` 带 `approvedBy`、`status: 'omitted'` 缺 `reason`、`approval` 字段类型错、Coverage status enum 非法                 |
| `validate.test.ts`            | graph 级:duplicate id、Transition.from 不存在、Transition.on 不在 events、coverage 与 status 一致性(omitted 必须四项 omitted、approved 至少一项 covered) |
| `derive-omitted.test.ts`      | `mode='omitted'`:body 四数组都空,coverage 四项 'omitted',components 仍然来自 semantic candidates                                                         |
| `derive-deferred.test.ts`     | 同上,但 status='deferred',coverage 四项 'deferred'                                                                                                       |
| `derive-draft-events.test.ts` | makeButtonyView / makeInputComposerView:event candidate 数量、confidence≤medium、handlerProp 命名、warning code                                          |
| `derive-draft-data.test.ts`   | makeMixedTextMediaView:dataModel candidate 数量、type='string'、coverage.dataBinding='draft'                                                             |
| `derive-determinism.test.ts`  | 同输入跑 3 次,深度 equal;输入打乱 semantic.nodes 顺序后,id 与输出仍稳定                                                                                  |
| `derive-hash.test.ts`         | 三档 hash 不匹配各自抛 throw;输出 `semanticViewHash` 与输入一致                                                                                          |
| `views-integration.test.ts`   | `InteractionSpecSchema.safeParse(deriveInteractionSpec(...).interactionSpec)` 全部 fixture 通过                                                          |

测试约定沿用 5A:vitest,inline TS fixture。

## 10. 出口标准

- `packages/d2c-core/src/contract/` 四份文件全部就位,内部 import 清晰。
- `InteractionSpecSchema.body` 已替换为 `InteractionSpecBodySchema`,不再是
  `z.record(z.unknown())`。
- `InteractionStatusSchema` 是 5 档独立 enum,`ContractStatusSchema` 保持 3 档不变。
- `InteractionSpecSchema` 顶层用 discriminated union on status;`draft` / `in-review`
  不允许带 approval 字段;`approved` / `omitted` / `deferred` 必填 approval 字段集。
- `GeneratedFromSchema.semanticViewHash` 已加(可选字段,patch 兼容)。
- `deriveInteractionSpec` 三档模式行为全覆盖;draft 模式起草 `confidence` 上限 `medium`,
  states / stateTransitions 永远空。
- `npm run test:d2c` 全绿,本批新增约 35+ 用例。
- `npm run typecheck:d2c` / `npm run typecheck` 全绿。
- 同输入跑 3 次,`JSON.stringify(deriveInteractionSpec(input))` 字节级一致。
- hash 不匹配场景有明确 error,不是模糊 fail。
- 文档:`packages/d2c-core/README.md` 加一节 "Interaction Spec (Stage 5B)" 描述本期能力 +
  已知限制(无状态机推断、no annotation 消费、CLI 留 5D)。

## 11. 执行顺序 — 3 个 PR

沿用 5A 拆分,**3 个 PR**:

1. **5B-PR-1 — schema + validate**:`contract/interaction-schema.ts`(含
   canonical `InteractionStatusSchema` 5 档 + `InteractionSpecBodySchema` +
   **`InteractionSpecSchema`** 顶层 discriminated union)、`contract/interaction-validate.ts`
   (`assertInteractionSpecIntegrity(spec, semanticNodeIds?)`,§5 两层)、
   `contract/index.ts`(初版导出 schema/validate)+ `__tests__/schema.test.ts`、
   `__tests__/validate.test.ts`。
   **不动 `ir/views.ts`,也不动 `src/index.ts` 根 barrel**:`ir/views.ts` 的老
   `InteractionSpecSchema`(3 档 status + 松散 body)继续存在,与 `contract/` 的同名
   export 不冲突——因为根 barrel 此时还没 `export * from './contract'`。两个定义并存到
   PR-3,PR-3 才删老的、连根 barrel。
   Review 重点:Zod 形态、5 档 status discriminated union 是否正确禁止/要求 approval
   字段、§5.1 / §5.2 validator 分层是否清晰、`semanticNodeIds` 可选参数的覆盖是否完整。

2. **5B-PR-2 — derive + fixtures**:`contract/derive-interaction.ts` 完整实现 §6
   全套(三档 mode、起草启发式、hash 链校验、coverage 计算)+ `__tests__/fixtures.ts`(3
   新 5B fixture + 复用 5A maker 的 helper)+ derive 行为单测(`derive-omitted` /
   `derive-deferred` / `derive-draft-events` / `derive-draft-data` /
   `derive-determinism` / `derive-hash`)。barrel 同步导出 `deriveInteractionSpec`。
   Review 重点:起草启发式是否保守、`confidence` 上限是否真到 medium、states/
   stateTransitions 在 draft 模式是否真为空。

3. **5B-PR-3 — wiring + barrel + docs**:`ir/views.ts` 删掉本地老 `InteractionSpecSchema`,
   改成 `export { InteractionSpecSchema, type InteractionSpec, InteractionStatusSchema, type InteractionStatus } from '../contract';`
   `GeneratedFromSchema` 加 `semanticViewHash`,根 barrel(`src/index.ts`)加
   `export * from './contract';`,加 `contract/__tests__/views-integration.test.ts`、
   `packages/d2c-core/README.md` 加 "Interaction Spec (Stage 5B)" 节,改写
   `ir/__tests__/views.test.ts` 的 InteractionSpec 反例(松散 body / 3 档 status 翻成
   tight 5 档,新增 omitted/deferred 必填字段反例)。
   Review 重点:跨模块 import 是否清晰、对 5A semantic-view 不破坏、PR-2 的 derive 在
   PR-3 改完后 envelope 仍可被 safeParse、ir/**tests** 的 InteractionSpec 测试集是否够
   覆盖新形态。

PR-1 合掉后,5C 的 ComponentPlan schema 设计可以并行起草(消费 InteractionSpec 形状)。

## 12. 已知限制 / 后置

- **无状态机推断**:5B 默认 `states` / `stateTransitions` 永远空。后续接入 annotation
  抽取后,5B+ 可以补 `state` 起草入口(蓝图 §7)。
- **无 annotation 消费**:`SemanticEvidence.kind === 'annotation'` 5A 留入口,5B 也仅
  schema 层支持,具体抽取不在 5B。
- **payload type 只到 string**:5B 不实现 TypeScript-style 类型推断;dataModel.type 与
  event.payload value 都默认 `'string'`,留 5B+ 补强。
- **真 Sketch fixture**:5B 用合成 fixture,真 `.sketch` 端到端留到 5D。
- **`assertInteractionSpecIntegrity` 两层调用**:不带 `semanticNodeIds` 入参时只跑
  intra-spec 校验(§5.1),独立场景如 review fixture 时仍可用;带入参时同时跑
  artifact-chain 校验(§5.2)。`deriveInteractionSpec` 始终带,catch 手编辑后 dangling
  source 等"hash 链管不到"的场景。但 validator 不接 semantic-view 整对象,只读 id 集,
  保持签名稳定 + cycle-free。
- **Stage 6 接续**:5B coverage 形态稳定,Stage 6 直接读 `body.coverage` 并格式化为
  `interaction-coverage.md`。不重定义 coverage 分类。
