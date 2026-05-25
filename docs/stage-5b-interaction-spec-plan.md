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

`InteractionSpecSchema` 自身放回 `ir/views.ts`(与 SemanticView 同位),用 5 档 status
做 discriminated union,引用上面的 body schema。具体形态见 §3.2。

## 5. graph-level validator(`interaction-validate.ts`)

shape 之外要求的跨字段约束:

- 每个 `InteractionEvent.source` 必须能在 `semantic-view.body.nodes` 中找到(由 caller
  传入的 semantic-view 做 cross-check)——但 5B validator 不接受 semantic-view 作为输入,
  保持纯 shape + intra-spec 的整洁,**跨工件 hash 链**校验在 `deriveInteractionSpec` 入口完成,
  足以保证一致性。
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

签名:`assertInteractionSpecIntegrity(spec: InteractionSpec): void`(整 spec 入参,包括
status 与 body,因为 coverage-vs-status 是跨字段约束)。

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

按以下顺序遍历 `semantic-view.body.nodes`,把视觉信号转成 candidate event / dataModel。
**整套规则在 §6.6 实现成可单测的纯函数**;表中每行对应一个独立判定:

| 触发条件                              | 产出                                                                      | confidence | warning                                                           |
| ------------------------------------- | ------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------ |
| `kind === 'text'`                     | `dataModel`: slotName=camelCase(name), type='string', source=node.id      | `medium`   | —                                                                 |
| `kind === 'media'` 且有 assetRef      | `dataModel`: slotName=camelCase(name), type='string'(URL), source=node.id | `low`      | `interaction-draft-media-as-url`                                  |
| `kind === 'icon'`                     | (skip — icon 通常是装饰,不产出 dataModel)                                 | —          | —                                                                 |
| node.name 匹配 `/(button              | btn                                                                       | cta        | submit                                                            | send)/i`                                                                                                                                                 | `event`: eventName=camelCase(name)+'Click', handlerProp='on'+PascalCase(eventName), payload={} | `low`                               | `interaction-draft-button-from-name` |
| node.name 匹配 `/(tab                 | tabs                                                                      | tabbar)/i` | `event`: eventName=camelCase(name)+'Select', handlerProp='on'+... | `low`                                                                                                                                                    | `interaction-draft-tab-from-name`                                                              |
| node.name 匹配 `/(input               | field                                                                     | search     | composer)/i`                                                      | `event`: eventName=camelCase(name)+'Change', payload={ value: 'string' }, handlerProp=...; **加上** `dataModel`: slotName=camelCase(name), type='string' | `low`                                                                                          | `interaction-draft-input-from-name` |
| `evidence` 含 `kind === 'annotation'` | (5B 不消费,但若 5B+ annotation 抽取上线,这里是 confidence: high 入口)     | —          | —                                                                 |

**起草规则统一遵循**:`confidence` 上限 `medium`;每个 candidate `evidenceMessage` 必须
包含触发条件(`"text node 'Title'"` / `"name matches /button/i"` 等),让人 review 时能
找回为什么起草了这个 candidate。

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

1. **5B-PR-1 — schema + validate**:`contract/interaction-schema.ts`、
   `contract/interaction-validate.ts`、`contract/index.ts`(初版只导出 schema/validate)
   - `__tests__/schema.test.ts`、`__tests__/validate.test.ts`。**不动 views.ts**,
     不动 derive。同 PR 加 `InteractionStatusSchema` enum,但 views.ts 的 InteractionSpec
     暂时仍是旧 3 档 ContractStatusSchema + 松散 body(以便 PR-1 不破现有测试)。
     Review 重点:Zod 形态、5 档 status discriminated union 是否正确禁止/要求 approval 字段、
     graph-level 校验覆盖(coverage-vs-status 一致性)。

2. **5B-PR-2 — derive + fixtures**:`contract/derive-interaction.ts` 完整实现 §6
   全套(三档 mode、起草启发式、hash 链校验、coverage 计算)+ `__tests__/fixtures.ts`(3
   新 5B fixture + 复用 5A maker 的 helper)+ derive 行为单测(`derive-omitted` /
   `derive-deferred` / `derive-draft-events` / `derive-draft-data` /
   `derive-determinism` / `derive-hash`)。barrel 同步导出 `deriveInteractionSpec`。
   Review 重点:起草启发式是否保守、`confidence` 上限是否真到 medium、states/
   stateTransitions 在 draft 模式是否真为空。

3. **5B-PR-3 — wiring + barrel + docs**:`ir/views.ts` 替换 `InteractionSpecSchema`
   (改用 discriminated union 与 `InteractionStatusSchema`,body 改 `InteractionSpecBodySchema`),
   `GeneratedFromSchema` 加 `semanticViewHash`,主 barrel(`src/index.ts`)同步,
   `views-integration.test.ts`、`packages/d2c-core/README.md` 加 "Interaction Spec (Stage 5B)" 节,
   updates `ir/__tests__/views.test.ts` 的 InteractionSpec 反例(松散 body 测试翻成 tight)。
   Review 重点:跨模块 import 是否清晰、对 5A semantic-view 不破坏、PR-2 的 derive 在
   PR-3 改完后 envelope 仍可被 safeParse。

PR-1 合掉后,5C 的 ComponentPlan schema 设计可以并行起草(消费 InteractionSpec 形状)。

## 12. 已知限制 / 后置

- **无状态机推断**:5B 默认 `states` / `stateTransitions` 永远空。后续接入 annotation
  抽取后,5B+ 可以补 `state` 起草入口(蓝图 §7)。
- **无 annotation 消费**:`SemanticEvidence.kind === 'annotation'` 5A 留入口,5B 也仅
  schema 层支持,具体抽取不在 5B。
- **payload type 只到 string**:5B 不实现 TypeScript-style 类型推断;dataModel.type 与
  event.payload value 都默认 `'string'`,留 5B+ 补强。
- **真 Sketch fixture**:5B 用合成 fixture,真 `.sketch` 端到端留到 5D。
- **`assertInteractionSpecIntegrity` 不做跨工件 cross-check**:不接 semantic-view
  作为入参(避免环依赖)。跨工件一致性(event.source 是不是 semantic node)由 hash 链 +
  derive 内部的 semantic.nodes 索引保证。
- **Stage 6 接续**:5B coverage 形态稳定,Stage 6 直接读 `body.coverage` 并格式化为
  `interaction-coverage.md`。不重定义 coverage 分类。
