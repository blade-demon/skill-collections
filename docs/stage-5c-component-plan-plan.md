# Stage 5C 实施计划 — `deriveComponentPlan` + ComponentPlan schema

> 本文是 [Stage 5 蓝图](./stage-5-component-contract-outline.md) §8 / §10 的 **5C**
> 子段。在 Stage 5A(`semantic-view`)与 Stage 5B(`interaction-spec`)之上,定义
> `component-plan` 契约,实现 `deriveComponentPlan`,并停在 Gate 2 之前。5D
> (`runContract` 薄入口 + Sketch CLI `contract` 子命令 + 真 `.sketch` golden)不在本文范围。
>
> 前置:Stage 5B stack 已通过 #38 合入 `master`。本 plan PR 基于当前 `master`,
> 不再堆叠在 5B 实现分支上。

---

## 1. 范围

**做**

- 新建 `packages/d2c-core/src/contract/component-plan-schema.ts`:
  - canonical `ComponentPlanSchema`;
  - `ComponentPlanModeSchema = z.enum(['presentational', 'interactive'])`;
  - `ComponentPlanApprovalSchema = z.discriminatedUnion('level', [...])`;
  - `ComponentPlanBodySchema`;
  - `PlannedComponentSchema` / `PlannedExportSchema` / `PlannedLayoutSchema` /
    `PlannedAssetSchema`;
  - public TS types。
- 新建 `packages/d2c-core/src/contract/component-plan-validate.ts`:
  - `assertComponentPlanIntegrity(plan, { semanticNodeIds?, interactionSpec? })`;
  - shape 与 approval(status × mode × approval)之外的 graph / upstream 引用 / mode × interaction-status
    组合校验;approval shape 由 `ComponentPlanSchema.superRefine()` 在 parse 阶段强制(§3.3),
    validator 不重复实现。
- 给 `GeneratedFromSchema` 加 `interactionSpecHash?: string`。5C derive 强制写入。
- 新建 `packages/d2c-core/src/contract/derive-component-plan.ts`:
  `deriveComponentPlan({ designIr, visualView, semanticView, interactionSpec, mode })`
  → `{ componentPlan, warnings }`。
  - `designIr` / `visualView` 用于 hash-chain 校验与 assetRef 查找;
  - `semanticView` / `interactionSpec` 是实际组件计划输入;
  - `mode` 必填,并写入 `componentPlan.mode`。
- 单测覆盖 schema 正反例、validator graph 约束、presentational / interactive derive、
  deterministic output、hash mismatch、root barrel / `ir/views.ts` wiring。
- `packages/d2c-core/README.md` 加 "Component Plan (Stage 5C)"。

**不做**

- 不写 `runContract` 薄入口(5D)。
- 不写 Sketch CLI `contract` 子命令(5D)。
- 不生成 React / Vue / 目标代码(Stage 6)。
- 不消费真 `.sketch` golden fixture(5D)。
- 不实现业务 API / 状态机补全;5C 只把已获批准或显式省略的 `interaction-spec`
  固化进 plan。
- 不新增外部 `--mode` codegen 参数;Stage 6 只能读 `component-plan.mode`。
- 不把 `omitted` / `deferred` 加进 `ContractStatusSchema`。

**标准**:5C 完成后,任一合法的 `semantic-view` + `interaction-spec` 组合都能产出一份
schema 合法、hash-pinned、可 review 的 `component-plan`。Stage 6 可以从这份 plan 开始执行
完整链校验,而不重新判断组件边界、mode 或 coverage。

## 2. 输入 / 输出

```text
输入:
  designIr         : validated DesignIR
  visualView       : Stage 4 VisualView, generatedFrom.designIrHash 必须匹配 designIr
  semanticView     : Stage 5A SemanticView, generatedFrom.designIrHash +
                     generatedFrom.visualViewHash 必须匹配上游
  interactionSpec  : Stage 5B InteractionSpec, generatedFrom.designIrHash +
                     visualViewHash + semanticViewHash 必须匹配上游
  mode             : 'presentational' | 'interactive'

输出:
  componentPlan    : ComponentPlan, kind === 'component-plan',
                     generatedFrom 含 designIrHash + visualViewHash +
                     semanticViewHash + interactionSpecHash
  warnings         : Warning[]
```

`deriveComponentPlan` 是纯函数,不读文件、不发网络、不写磁盘、不取系统时间。
`approvedAt` 只存在于 caller / 人工审批后的 `component-plan.approval`,不参与任何 derive hash。

## 3. 核心决策

### 3.1 ComponentPlan 使用 3 档 ContractStatusSchema,mode 单独建模

`component-plan.status` 继续使用 `ContractStatusSchema`:

```ts
'draft' | 'in-review' | 'approved';
```

`presentational` / `interactive` 不属于 status,只属于 `component-plan.mode`:

```ts
export const ComponentPlanModeSchema = z.enum(['presentational', 'interactive']);
```

这保持 Stage 5 蓝图与架构文档的边界:interaction-spec 用 5 档 status 表达行为契约状态,
component-plan 用 3 档 status 表达 plan 生命周期,再用 mode 表达 codegen 档位。

### 3.2 mode 与 interaction status 的组合必须显式校验

`deriveComponentPlan` 与 validator 都必须拒绝非法组合:

| `interaction-spec.status` | `component-plan.mode` | 结果                                     |
| ------------------------- | --------------------- | ---------------------------------------- |
| `approved`                | `interactive`         | 允许,表示完整交互 plan                   |
| `omitted` / `deferred`    | `presentational`      | 允许,表示视觉级行为占位 plan             |
| 其它组合                  | -                     | 拒绝,不进入 component-plan / Gate 2 审批 |

`draft` / `in-review` interaction-spec 不能生成 component-plan。它们可以作为 Stage 5B review
产物存在,但 5C 的职责是把可进入 Gate 2 的组合固化为 codegen plan。

`omitted` 与 `deferred` 对 data model 的态度不同:

- `interactionSpec.status === 'omitted'`:表示本次明确不建模交互,`body.dataModels` 应为空。
  若上游仍携带 dataModels,`deriveComponentPlan` 只发 warning,不消费成
  `presentational-stub` props;输出保持纯视觉骨架。
- `interactionSpec.status === 'deferred'`:表示交互建模暂缓,`body.dataModels` 可以非空,并可被
  presentational plan 消费成 optional `presentational-stub` props,为后续 interactive 升级保留
  prop 形状线索。

### 3.3 approval 是 level discriminated union,由 status/mode 约束

`PlanApproval` 用 `level` 分支:

```ts
type ComponentPlanApproval =
  | {
      gate: 'gate-2';
      level: 'interactive';
      approvedBy: string;
      approvedAt: string;
    }
  | {
      gate: 'gate-2';
      level: 'presentational';
      approvedBy: string;
      approvedAt: string;
      acknowledgedBehaviorStubbed: true;
    };
```

Schema 层使用 `ComponentPlanApprovalSchema = z.discriminatedUnion('level', [...])`,
**status × mode × approval shape 一律由 `ComponentPlanSchema.superRefine()` 在 parse 阶段强制**,
`assertComponentPlanIntegrity()` 不重复校验 approval shape,只负责 graph / 引用类校验
(§6)。具体规则:

- `status === 'draft' | 'in-review'`:不允许带 `approval`。
- `status === 'approved' && mode === 'interactive'`:必须带
  `approval.level === 'interactive'`。
- `status === 'approved' && mode === 'presentational'`:必须带
  `approval.level === 'presentational'` 且 `acknowledgedBehaviorStubbed === true`。

这样 `ComponentPlanSchema.safeParse()` 单独可信:任何持有合法 parse 结果的 caller 不必再
跑 validator 才能确定 approval shape 合法。validator 只回答 "id 是否互引一致 / 是否还匹配
upstream semantic / interaction" 这类 schema 表达不出来的问题。

5C derive 默认返回 `status: 'draft'`,不自动写 approval。审批字段由开发者或 5D CLI/Gate
流程写入后再校验。

### 3.4 hash 链在 5C 加入 interactionSpecHash

`GeneratedFromSchema` 在 5C 新增:

```ts
interactionSpecHash?: string;
```

`deriveComponentPlan` 入口校验:

- `visualView.generatedFrom.designIrHash === stableSha256(stableJson(designIr))`;
- `semanticView.generatedFrom.designIrHash === designIrHash`;
- `semanticView.generatedFrom.visualViewHash === stableSha256(stableJson(visualView))`;
- `interactionSpec.generatedFrom.designIrHash === designIrHash`;
- `interactionSpec.generatedFrom.visualViewHash === visualViewHash`;
- `interactionSpec.generatedFrom.semanticViewHash === stableSha256(stableJson(semanticView))`。

出口写:

```ts
componentPlan.generatedFrom = {
  schemaVersion: designIr.schemaVersion,
  sourceRef: visualView.generatedFrom.sourceRef,
  designIrHash,
  visualViewHash,
  semanticViewHash,
  interactionSpecHash: stableSha256(stableJson(interactionSpec)),
};
```

不一致全部 throw,不降级为 warning。

### 3.5 计划只执行 semantic / interaction 中已有事实

5C 不重新推断组件边界、不重新解释 coverage,也不凭空生成业务 API:

- `components` 来自 `semanticView.body.componentCandidates` + screen root;
- `layoutPlan` 来自 `semanticView.body.layoutCandidates`;
- `assetPlan` 来自 semantic media nodes,并用 `visualView` 查找可用 `assetRef`;
- event / data / state / transition 绑定只来自 `interactionSpec.body`;
- presentational plan 可以记录 behavior stubbed,但不能清空或重写
  `interactionSpec.body.coverage` 的事实。

## 4. ComponentPlan Body Schema

建议首版 schema:

```ts
export const PlannedPropSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    source: z.enum(['data-model', 'event-payload', 'presentational-stub']),
    required: z.boolean(),
    interactionRefId: z.string().optional(),
  })
  .strict();

export const PlannedEventBindingSchema = z
  .object({
    eventId: z.string().min(1),
    sourceSemanticNodeId: z.string().min(1),
    handlerProp: z.string().min(1),
    payload: z.record(z.string()),
  })
  .strict();

export const PlannedComponentSchema = z
  .object({
    id: z.string().min(1),
    semanticNodeId: z.string().min(1),
    name: z.string().min(1),
    role: z.enum(['root', 'component', 'region', 'repeated-item']),
    renderAs: z.enum(['component', 'markup', 'slot']),
    childSemanticNodeIds: z.array(z.string()),
    props: z.array(PlannedPropSchema),
    eventBindings: z.array(PlannedEventBindingSchema),
    dataBindings: z.array(
      z
        .object({
          dataModelId: z.string().min(1),
          sourceSemanticNodeId: z.string().min(1),
          propName: z.string().min(1),
          type: z.string().min(1),
        })
        .strict(),
    ),
    confidence: ConfidenceSchema,
    warnings: z.array(WarningSchema),
  })
  .strict();

export const PlannedExportSchema = z
  .object({
    id: z.string().min(1),
    /** 引用 `body.components[*].id` 或 `body.rootComponent.id`。 */
    plannedComponentId: z.string().min(1),
    exportName: z.string().min(1),
    kind: z.enum(['default', 'named']),
  })
  .strict();

export const PlannedLayoutSchema = z
  .object({
    id: z.string().min(1),
    semanticNodeId: z.string().min(1),
    layoutCandidateId: z.string().min(1).optional(),
    strategy: z.enum(['absolute', 'stack', 'inline', 'grid', 'overlay']),
    confidence: ConfidenceSchema,
    constraints: z.array(z.string()),
    caveats: z.array(z.string()),
  })
  .strict();

export const PlannedAssetSchema = z
  .object({
    id: z.string().min(1),
    semanticNodeId: z.string().min(1),
    assetRef: z.string().optional(),
    usage: z.enum(['image', 'icon', 'background']),
    required: z.boolean(),
  })
  .strict();

export const ComponentPlanBodySchema = z
  .object({
    target: z
      .object({
        framework: z.enum(['react']),
        language: z.enum(['ts']),
        styling: z.enum(['bem-css']),
      })
      .strict(),
    rootComponent: PlannedComponentSchema,
    components: z.array(PlannedComponentSchema),
    exports: z.array(PlannedExportSchema),
    layoutPlan: z.array(PlannedLayoutSchema),
    assetPlan: z.array(PlannedAssetSchema),
    interactionCoverage: InteractionCoverageSchema,
    warnings: z.array(WarningSchema),
  })
  .strict();
```

`target` 三项即使当前只有一个合法值,也使用 enum 而非 literal。这样 Stage 6 后续扩展新目标
时可以只追加成员,不必为了枚举形态本身改 schema 版本。

`interactionCoverage` 是 `interactionSpec.body.coverage` 的 snapshot。Stage 6 生成
`interaction-coverage.md` 时只读取这里或原始 interaction-spec 的同一份 coverage;不得重新分类。

## 5. ComponentPlanSchema 顶层

```ts
export const ComponentPlanSchema = z
  .object({
    kind: z.literal('component-plan'),
    generatedFrom: GeneratedFromSchema,
    status: ContractStatusSchema,
    mode: ComponentPlanModeSchema,
    body: ComponentPlanBodySchema,
    approval: ComponentPlanApprovalSchema.optional(),
  })
  .strict()
  .superRefine(validateApprovalShape);
```

5C canonical schema 不硬编码 `semantic-view.json` / `interaction-spec.json` 的落盘路径。稳定
artifact 路径常量与可选 ref 字段由 5D CLI 与 schema 一起引入,避免 5C 泄漏 CLI 输出结构。

## 6. Graph-level validator

`assertComponentPlanIntegrity(plan, context?)` 分两层。

### 6.1 intra-plan

不需要外部 artifact:

- `body.rootComponent.id` 必须出现在 `body.components[*].id` 中,且 role 为 `root`。
- `body.components` / `body.exports` / `body.layoutPlan` / `body.assetPlan` id 全局唯一。
- `PlannedExport.plannedComponentId` 必须指向 `body.components[*].id`。
- `PlannedComponent.childSemanticNodeIds` 不得包含自身 `semanticNodeId`。
- `PlannedLayout.semanticNodeId` 在 `body.components[*].semanticNodeId` 或
  root component child set 中有使用。
- `status` / `mode` / `approval` shape 不在 validator 校验:由
  `ComponentPlanSchema.superRefine()` 在 parse 阶段强制(§3.3)。validator 假设输入已经
  通过 schema parse,不重复实现该约束。
- `mode === 'presentational'` 时,任何 `PlannedProp.source === 'presentational-stub'`
  必须可由 `interactionCoverage` 解释;不能静默制造未记录行为 stub。

### 6.2 artifact-chain

调用方传入 `{ semanticNodeIds, interactionSpec }` 后启用:

- 每个 `PlannedComponent.semanticNodeId` 必须存在于 upstream semantic-view。
- 每个 `childSemanticNodeId` 必须存在于 upstream semantic-view。
- 每个 `PlannedLayout.semanticNodeId` 必须存在于 upstream semantic-view。
- 每个 `PlannedAsset.semanticNodeId` 必须存在于 upstream semantic-view。
- 每个 `PlannedEventBinding.eventId` 必须存在于 `interactionSpec.body.events[*].id`。
- 每个 `dataBinding.dataModelId` 必须存在于 `interactionSpec.body.dataModels[*].id`。
- `plan.mode === 'interactive'` 要求 `interactionSpec.status === 'approved'`。
- `plan.mode === 'presentational'` 要求
  `interactionSpec.status === 'omitted' || interactionSpec.status === 'deferred'`。

`deriveComponentPlan` 必须始终传入 artifact-chain context 自检;standalone fixture review
可以只跑 intra-plan。

## 7. deriveComponentPlan 行为

### 7.1 signature

```ts
export interface DeriveComponentPlanInput {
  designIr: DesignIR;
  visualView: VisualView;
  semanticView: SemanticView;
  interactionSpec: InteractionSpec;
  mode: ComponentPlanMode;
}

export interface DeriveComponentPlanResult {
  componentPlan: ComponentPlan;
  warnings: Warning[];
}
```

### 7.2 algorithm

1. 校验 hash chain(§3.4)。
2. 校验 `mode` / `interactionSpec.status` 组合(§3.2)。
3. 从 `semanticView.body.screen.semanticNodeId` 解析出 screen 节点,在
   `semanticView.body.nodes[*]` 中按该 id 查到 `kind === 'screen'` 的节点,用它的 `id` /
   `name` / `childIds` 构造 `rootComponent`。
4. 从 `semanticView.body.componentCandidates` 构造 planned components:
   - 用 `componentCandidate.rootSemanticNodeId` 在 `semanticView.body.nodes[*]` 中查到
     根节点,按下表将 semantic node `kind` 映射到 `PlannedComponent.role`:

     | semantic node kind                                   | PlannedComponent.role                                  |
     | ---------------------------------------------------- | ------------------------------------------------------ |
     | `component`                                          | `'component'`                                          |
     | `region`                                             | `'region'`                                             |
     | `repeated-item`                                      | `'repeated-item'`                                      |
     | `screen`                                             | 不出现在 candidate 循环;screen → rootComponent(step 3) |
     | `text` / `media` / `icon` / `control` / `decorative` | **derive throw**(非法 candidate root)                  |

     primitive / asset 类节点不应被 semantic derive 选为 componentCandidate root;若上游
     仍这么给,5C derive 直接 throw,而不是凭空映射成 `'component'`。错误信息必须包含
     `componentCandidate.id` 与触发的 `kind`,便于回到 5A 修。

   - `renderAs` 在 5C 一律写 `'component'`。schema 的 `renderAs` 枚举保留 `'markup'`
     / `'slot'` 作为 Stage 6 后续扩展位,5C derive 不发这两个值;PR-2 不会因为漏分类而需要决定
     何时切到 `'markup'` / `'slot'`。
   - `confidence` 透传 `componentCandidate.confidence`;
   - `childSemanticNodeIds` 使用 upstream semantic node 的 `childIds`。非 componentCandidate
     的子节点(text / media / icon / control / decorative)合法出现在这里,但不会成为独立
     `PlannedComponent`;它们由父 component 内嵌 markup 或 `assetPlan` 承接。

5. presentational mode:
   - 不生成真实 event bindings;
   - `interactionSpec.status === 'omitted'` 时不消费 `interactionSpec.body.dataModels`;若非空则
     warning,并保持纯视觉骨架;
   - `interactionSpec.status === 'deferred'` 时,从 `interactionSpec.body.dataModels` 生成
     optional props,source 为 `presentational-stub`;
   - warnings 写明 behavior stubbed,并保留 `interactionCoverage`。
6. interactive mode:
   - 从 `interactionSpec.body.events` 生成 `eventBindings` 与 handler props;
   - 从 `interactionSpec.body.dataModels` 生成 required data props;
   - `states` / `stateTransitions` 暂只记录在 warnings / coverage 中,不编造额外 state API。
7. 从 `semanticView.body.layoutCandidates` 生成 `layoutPlan`;
   没有 layout candidate 的 planned component 使用 `strategy: 'absolute'` caveat。
8. 从 `kind === 'media' | 'icon'` 的 semantic 节点生成 `assetPlan`:
   - 用 `semanticNode.primaryVisualNodeId` 作为查 key,在 `visualView` 上查 `assetRef`;
     `primaryVisualNodeId` 是上游 5A canonical 一对一引用,5C **不** 退化到
     `visualNodeIds[*]` fallback,避免 "同一 semantic media 在 visual-view 对到两个不同
     asset" 的歧义被静默吞掉;
   - 命中:写入 `PlannedAsset.assetRef`;
   - 未命中:写 warning(不 throw),`PlannedAsset.assetRef` 不写;
   - `PlannedAsset.required` 按 semantic node 的 `kind` 决定(`media` / `icon` 都为
     `true`),`usage` 暂只产 `'image'`(media)/ `'icon'`(icon),`'background'` 留给
     Stage 6 视觉策略,5C derive 不发。
9. 生成 exports:
   - root component default export;exportName 取 `PascalCase(rootSemanticNode.name)`;
     当 name 为空 / 全部非 ASCII 时 fallback 到字面量 `'Screen'`。
   - component candidates named export;exportName 取
     `PascalCase(componentCandidate.suggestedName)`。
   - **同名冲突直接 throw**,不静默 dedup、不加 counter / id 后缀。
     冲突意味着上游 semantic-view 给出了两个 `suggestedName` PascalCase 后同名的
     `componentCandidate`,这属于 5A 的事实问题,应该回 semantic-view review 修;5C 把它
     显式抛出来,避免 codegen 后才发现两个不同组件被 import 成同一个名字。
   - 抛错信息必须包含两侧 `componentCandidate.id`、原 `suggestedName` 与冲突后的
     exportName,便于回到 semantic-view 定位。
10. 通过 `ComponentPlanSchema.safeParse()` 与 `assertComponentPlanIntegrity()`。

### 7.3 deterministic ids

沿用 Stage 5 id 规则:

| id 类型          | 前缀  | hash 输入 record                                             |
| ---------------- | ----- | ------------------------------------------------------------ |
| PlannedComponent | `pc_` | `{ form: 'planned-component', semanticNodeId, role }`        |
| PlannedExport    | `pe_` | `{ form: 'planned-export', plannedComponentId, exportName }` |
| PlannedLayout    | `pl_` | `{ form: 'planned-layout', semanticNodeId, strategy }`       |
| PlannedAsset     | `pa_` | `{ form: 'planned-asset', semanticNodeId, usage }`           |

公式:`<prefix> + stableSha256(stableJson(record)).slice(0, 12)`。
不用计数器、UUID、Date、Math.random。

## 8. Fixture 计划

复用 5B fixtures:

- `bridgedFullChat()`
- `bridgedList()`
- `makeButtonyView()`
- `makeInputComposerView()`
- `makeMixedTextMediaView()`

新增 `packages/d2c-core/src/contract/__tests__/component-plan-fixtures.ts`,提供:

```ts
export function presentationalInput(makeInput = bridgedFullChat): DeriveComponentPlanInput {
  const input = makeInput();
  const { interactionSpec } = deriveInteractionSpec({
    ...input,
    mode: 'deferred',
    approval: {
      reason: 'visual delivery first',
      approvedBy: 'alice',
      approvedAt: '2026-05-26T00:00:00Z',
    },
  });
  return { ...input, interactionSpec, mode: 'presentational' };
}

export function interactiveInput(makeInput = makeButtonyView): DeriveComponentPlanInput {
  const input = makeInput();
  const drafted = deriveInteractionSpec(input).interactionSpec;
  const interactionSpec = approveForInteractiveFixture(drafted);
  return { ...input, interactionSpec, mode: 'interactive' };
}
```

`approveForInteractiveFixture()` 只在测试中使用,手动把 coverage 至少一项设为 `covered`,
写 `approvedBy` / `approvedAt`,不改 production derive 逻辑。

## 9. 测试矩阵

`packages/d2c-core/src/contract/__tests__/` 新增:

| 文件                                       | 测试点                                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `component-plan-schema.test.ts`            | mode enum、approval level union、approved+interactive 缺 approval / approved+presentational 缺 `acknowledgedBehaviorStubbed` / draft+approval 三类 superRefine 拒绝、body shape 正反例           |
| `component-plan-validate.test.ts`          | duplicate id、`export.plannedComponentId` 指向缺失 component、artifact-chain 下 `plan.mode === 'interactive' + interactionSpec.status !== 'approved'` 与反向组合;**不** 重复 approval shape 校验 |
| `derive-component-presentational.test.ts`  | omitted/deferred + presentational 通过;omitted 不消费 dataModels、deferred 生成 stub props;生成 root/components/exports/layout/assets/coverage snapshot                                          |
| `derive-component-interactive.test.ts`     | approved + interactive 通过;events/dataModels 映射为 handler props / required data props                                                                                                         |
| `derive-component-illegal-input.test.ts`   | componentCandidate.rootSemanticNodeId 指向 `text` / `media` / `icon` / `control` / `decorative` 节点时 derive throw;`PascalCase(suggestedName)` 撞名时 derive throw,错误信息含两侧 id            |
| `derive-component-hash.test.ts`            | designIr / visualView / semanticView / interactionSpec hash mismatch 各自 throw;输出 `interactionSpecHash`                                                                                       |
| `derive-component-determinism.test.ts`     | 同输入多次 deep equal;semantic arrays 顺序变化时 deterministic ids 稳定                                                                                                                          |
| `component-plan-views-integration.test.ts` | `ir/views.ts` 的 `ComponentPlanSchema.safeParse(deriveComponentPlan(...).componentPlan)` 通过                                                                                                    |

现有 `ir/__tests__/views.test.ts` 的 ComponentPlan 测试要在 PR-3 改写:

- 3-state `ContractStatusSchema` 仍保留;
- `mode` 必填;
- arbitrary loose `body: {}` 被拒绝;
- approved + presentational 缺 `acknowledgedBehaviorStubbed` 被拒绝;
- `generatedFrom.interactionSpecHash` 被接受。

## 10. 3 PR 拆分

### 5C-PR-1 — schema + validate

文件:

- `packages/d2c-core/src/contract/component-plan-schema.ts`
- `packages/d2c-core/src/contract/component-plan-validate.ts`
- `packages/d2c-core/src/ir/generated-from.ts` 加 `interactionSpecHash`
- `packages/d2c-core/src/contract/__tests__/component-plan-schema.test.ts`
- `packages/d2c-core/src/contract/__tests__/component-plan-validate.test.ts`

PR-1 不动 `ir/views.ts` 里的老 `ComponentPlanSchema`,也不把 `ComponentPlanSchema` 加进
`contract/index.ts` barrel,避免 root barrel 当前 `export * from './ir'` + `export * from './contract'`
产生同名 export 冲突。PR-1 测试从具体文件 import canonical schema。

Review 重点:

- `ContractStatusSchema` 保持 3 档;
- `ComponentPlanModeSchema` 不混入 status;
- approval level discriminated union 是否正确;
- status × mode × approval shape 由 `ComponentPlanSchema.superRefine()` 一处强制,
  validator 不在 PR-1 重复实现;
- validator 是否分清 intra-plan 与 artifact-chain;
- `interactionSpecHash` 是 optional schema 字段,derive 才强制写。

### 5C-PR-2 — derive + fixtures

文件:

- `packages/d2c-core/src/contract/derive-component-plan.ts`
- `packages/d2c-core/src/contract/__tests__/component-plan-fixtures.ts`
- `packages/d2c-core/src/contract/__tests__/derive-component-presentational.test.ts`
- `packages/d2c-core/src/contract/__tests__/derive-component-interactive.test.ts`
- `packages/d2c-core/src/contract/__tests__/derive-component-hash.test.ts`
- `packages/d2c-core/src/contract/__tests__/derive-component-determinism.test.ts`

PR-2 仍从具体文件 import canonical schema / derive 类型,不更新 `contract/index.ts` barrel。
barrel 导出留给 PR-3 一次性接线,避免 root 同名冲突。

Review 重点:

- derive 纯函数,无 clock / IO / random;
- mode / interaction status 非法组合 throw;
- presentational 不制造真实 handlers;
- interactive 只消费已 approved interaction;
- body.warnings 与 return warnings 保持一致;
- output deterministic。

### 5C-PR-3 — wiring + README

文件:

- `packages/d2c-core/src/ir/views.ts`
  - 删除本地老 `ComponentPlanSchema` + type;
  - re-export canonical:
    `export { ComponentPlanSchema, type ComponentPlan, ComponentPlanModeSchema, type ComponentPlanMode } from '../contract/component-plan-schema';`
- `packages/d2c-core/src/ir/index.ts`
  - 如果 root export 冲突,保持 `ComponentPlanSchema` 不从 `ir` barrel 输出,或改为明确从 contract 输出。
- `packages/d2c-core/src/contract/index.ts`
  - 导出 component-plan schema / validate / derive。
- `packages/d2c-core/src/index.ts`
  - 显式处理 contract 与 ir 的同名 export,避免 root `ComponentPlanSchema` ambiguity。
- `packages/d2c-core/src/ir/__tests__/views.test.ts`
- `packages/d2c-core/src/contract/__tests__/component-plan-views-integration.test.ts`
- `packages/d2c-core/README.md`

Review 重点:

- root barrel 只有一个可用 `ComponentPlanSchema` binding;
- `ir/views.ts` direct import path 仍可用;
- 5B InteractionSpec wiring 不 regress;
- README 清楚说明 5C 仍不生成 code。

## 11. 与 5D / Stage 6 的边界

留给 5D:

- `runContract()` 组合 semantic + interaction + component-plan,返回 `requiresApproval='gate-2'`;
- Sketch CLI `contract` 子命令;
- stable artifact 路径常量 + `semanticViewRef` / `interactionSpecRef` 等落盘引用字段;
- `contract --validate` 不覆盖人工编辑;
- 真 `.sketch` fixture expected / golden;
- CLI 字节级 diff。

留给 Stage 6:

- React / TS / BEM codegen;
- `interaction-coverage.md` markdown 输出;
- package README banner / file header / `package.json.d2c` presentational 元信息;
- Stage 6 输入链完整校验与 approved plan gate。

## 12. 验证命令

每个实现 PR 至少跑:

```bash
npm run test:d2c
npm run typecheck
npm run lint
npm run format:check
```

push 前由 lefthook 跑:

```bash
npm run check:full
```

## 13. 出口标准

- `ComponentPlanSchema` canonical 定义在 `contract/`。
- `ComponentPlanSchema.body` 不再是 loose record。
- `mode` 固化在 component-plan,Stage 6 不需要外部 mode 参数。
- approval branch 能区分 `presentational` / `interactive`,presentational 强制
  `acknowledgedBehaviorStubbed: true`。
- `deriveComponentPlan` 对 presentational / interactive 都有保守、可解释输出。
- hash chain 写齐 `interactionSpecHash`,并在 mismatch 时 throw。
- validator 能检查 plan 内引用和 upstream semantic / interaction 引用。
- `body.interactionCoverage` 保持 `interactionSpec.body.coverage` 单一事实源。
- root / ir / contract barrel 没有同名 export ambiguity。
- README 写清 5C 能力、限制和 5D / Stage 6 边界。
