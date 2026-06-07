# @skill-collections/d2c-core

设计源到组件（D2C）管线的共享核心：规范 IR schema、派生视图 schema、校验器与 `Provider` 端口。

权威架构见 [`docs/design-source-to-component-architecture.md`](../../docs/design-source-to-component-architecture.md)，
构建阶段见 [`docs/design-source-to-component-implementation-plan.md`](../../docs/design-source-to-component-implementation-plan.md)。

## 仅源码的内部包

这是**内部 workspace 包**。仅发布 TypeScript 源码 —— 无 `dist/`、无构建步骤。
`package.json#exports` 指向 `src/index.ts`，由其他 workspace 包通过 `tsx` / `vitest` / TS 感知工具消费。
**不能**用纯 `node` 直接运行。

## 范围（当前）

`d2c-core` 拥有 provider 中立的契约与确定性共享管线辅助工具：

```
src/
  ir/        规范 Design IR schema、派生视图 schema、校验器
  provider/  能力式 Provider 端口 + normalize/validate 辅助
  preview/   visual view 派生、静态 HTML 预览、review 报告辅助
  semantic/  Stage 5A：semantic-view body schema、evidence、完整性
             校验器及 deriveSemanticView
  contract/  Stage 5B / 5C：interaction-spec + component-plan schema、
             完整性校验器，以及 deriveInteractionSpec /
             deriveComponentPlan 纯函数
  codegen/   Stage 6：Gate 2 签收 + verify，以及 TargetGenerator
             抽象及 React + TS + BEM 实现
  utils/     横切辅助（stable JSON / hash）
```

Provider 特定的提取与规范化代码留在 `skills/<provider>-to-component/scripts/`。
例如，Sketch 对 `.sketch` ZIP JSON 的解析在 `skills/sketch-to-component/scripts/`，
然后将校验后的 IR 交给本包。

尚未纳入范围：截图 diff 自动化，以及完全可恢复的管线 runner —— 下方 Stage 5D contract runner
在一次纯 pass 中链接 derive 步骤，但持久化与恢复部分运行是后续切片。Codegen（Stage 6）当前生成展示型 React 包（含 bitmap 资源，经 CLI 复制进 `src/assets/`；`stack` / `inline` 容器投影为 flex，0.5px 内保真否则回退 absolute）；交互式生成、vector 资源、grid / overlay 布局是后续切片。

## Semantic View（Stage 5A）

`src/semantic/` 是 Gate 2 的前半段：将 Stage 4 产出的 visual-view 转为下游 interaction-spec 与 component-plan 将消费的 typed `SemanticView`。

### 公共面

- `SemanticViewBodySchema` / `SemanticNodeSchema` /
  `ComponentCandidateSchema` / `RepeatedPatternSchema` /
  `LayoutCandidateSchema` —— Zod 定义。**仅形状**：每个字段存在、类型匹配、discriminated union 正确选择。
- `evidenceFromVisualNode` / `evidenceFromDesignIrCandidate` /
  `evidenceFromAnnotation` / `evidenceFromProjectRule` —— 构造 evidence 值的唯一入口。每个引用来源可 grep。Annotation 与 project-rule 为预留入口，5A derive 不产出。
- `assertSemanticViewIntegrity(body)` —— Zod 无法覆盖的图级不变量：唯一 node id、父子双向链接、screen 指针 kind、`primaryVisualNodeId` 成员关系、所有 candidate / pattern / layout 交叉引用可解析、四数组内 id 全局唯一。抛出 `SemanticViewIntegrityError`，消息含 offending id 与 field。
- `deriveSemanticView({ designIr, visualView })` —— 纯函数；相同输入 ⇒ 字节级相同输出。校验输入 hash 链（`visualView.generatedFrom.designIrHash` 必须等于 `stableSha256(stableJson(designIr))`），深度优先前序遍历 visual 树，应用 §6.4–§6.7 启发式，返回前自调用完整性校验器。

### 确定性

所有 id 为 `<prefix>` + `stableSha256(stableJson({ form, ...canonical fields })).slice(0, 12)`。
前缀：`s_` SemanticNode、`cc_` ComponentCandidate、`rp_` RepeatedPattern、`lc_` LayoutCandidate。
RepeatedPattern item id 在 hash 前排序，使乱序输入仍产生相同 pattern id。无 `Date.now`、无 UUID、无计数器。

### 5A 携带的已知限制

- 未检测 grid 布局（x+y 等间距混合）—— 发出 `repeated-pattern-grid-skipped` warning。
- Annotation 提取为 schema 入口但尚未消费；5B+ 接入 `@component` / `@slot` / `@event` 等。
- Project-rule evidence 同样为预留。
- `repeated-item` kind 在 union 中存在但 derive 不产出。
- 真实 `.sketch` fixture 在 5D CLI + Gate 2 信号到达时落地；5A 测试用 `src/semantic/__tests__/fixtures.ts` 内联 TS maker。

### Hash 链

`GeneratedFromSchema` 现携带 `designIrHash` 与 `visualViewHash`（schema 层均为可选，但 `deriveSemanticView` 始终写入两者）。下游 `interaction-spec` 与 `component-plan` 将在 5B / 5C 钉住 `semantic-view` 的 body hash。

## Interaction Spec（Stage 5B）

`src/contract/` 新增介于 `SemanticView` 与未来 `ComponentPlan` 之间的交互契约。提供
`InteractionSpecSchema`、`InteractionSpecBodySchema`、
`InteractionStatusSchema`、`assertInteractionSpecIntegrity()` 与 `deriveInteractionSpec()`。

### 状态模型

`InteractionStatusSchema` 五值：`draft`、`in-review`、`approved`、`omitted`、`deferred`。
有意与 `ContractStatusSchema` 分离，后者仍为 component-plan 使用的三态生命周期（`draft | in-review | approved`）。展示型 vs 交互式输出是 Stage 5C 的 component-plan `mode` 决策，而非 `ContractStatusSchema` 的额外状态。

### Derive 模式

`deriveInteractionSpec()` 为纯函数。校验上游 hash 链（`designIrHash`、`visualViewHash`、`semanticViewHash`），相同输入返回相同 artifact。支持三种模式：

- `draft`（默认）：镜像 semantic component candidates，起草启发式 events 与 data slots，将 caveat 写入 `body.warnings`，`states` / `stateTransitions` 留空。
- `omitted`：要求调用方提供 `{ reason, approvedBy, approvedAt }`，写入顶层 approval 字段，行为数组留空，所有 coverage 条目钉为 `omitted`。
- `deferred`：与 `omitted` 相同的 approval 要求与空行为数组，但 coverage 条目钉为 `deferred`。

### Draft 启发式

Stage 5B 仅使用保守的名称与 kind 检查：

- region/component 节点上 `button`、`btn`、`cta`、`submit`、`send` 起草 click events。
- region/component 节点上 `tab`、`tabs`、`tabbar` 起草 select events。
- region/component 节点上 `input`、`field`、`search`、`composer` 起草 change event 与 value slot。
- Text 节点起草 string data slots。
- 带 `assetRef` 的 media 节点起草 string URL data slots 并发出 warning。

所有启发式 candidate 的 confidence 为 `low` 或 `medium`；`high` 与 `developer-provided` 保留给显式 annotation 或开发者 override。

### 已知限制

- 无状态机推断：无显式 annotation 时 `states` 与 `stateTransitions` 留空。
- Annotation evidence 尚未消费，尽管 schema 入口已存在。
- Payload 与 data slot 类型在 5B 仅到 `'string'` 级别。
- 真实 `.sketch` contract golden fixture 保留给 5D，待 CLI `contract` 命令与 Gate 2 信号引入。

`body.coverage` 是 Stage 6 生成 `interaction-coverage.md` 的唯一数据源。Codegen 不应通过重读 events 或 states 推断 coverage。

## Component Plan（Stage 5C）

`src/contract/` 还拥有 Stage 5C component-plan 契约，介于 `InteractionSpec` 与 Stage 6 codegen 之间。提供
`ComponentPlanSchema`、`ComponentPlanBodySchema`、`ComponentPlanModeSchema`、
`assertComponentPlanIntegrity()` 与 `deriveComponentPlan()`。

### 状态、mode 与 approval

`component-plan.status` 保持现有三态 `ContractStatusSchema`（`draft | in-review | approved`）；展示型 vs 交互式为独立轴 —— `ComponentPlanModeSchema = z.enum(['presentational', 'interactive'])` —— 计划不会混淆生命周期与 codegen 原型。

`ComponentPlanApprovalSchema` 为 `level` 判别联合：`interactive` 计划用 `{ gate: 'gate-2', level: 'interactive', approvedBy, approvedAt }` 签收；`presentational` 计划用相同字段加 `acknowledgedBehaviorStubbed: true`。literal-`true` 字段强制审批人物理确认计划为行为 stub，而非让 `false` 滑过并假装功能完整。

`status × mode × approval` 一致性由 `ComponentPlanSchema.superRefine()` 在 parse 时拥有，而非完整性校验器。成功 `ComponentPlanSchema.safeParse()` 即足以知 approval 形状一致。

### Derive

`deriveComponentPlan({ designIr, visualView, semanticView, interactionSpec, mode })`
为纯函数 —— 无 IO、无时钟、无 `Math.random`。它：

- 校验四个上游 artifact 的完整 hash 链，并在输出上写入 `interactionSpecHash`；
- 拒绝非法 `mode × interactionSpec.status` 组合（interactive 需要 `approved` spec；presentational 需要 `omitted` 或 `deferred`；`draft` / `in-review` spec 永不 derive plan）；
- 从 `semanticView.body.screen` 构建 `rootComponent`，再将每个 `componentCandidate` 映射为 `PlannedComponent`（kind→role 表；primitive kind —— text、media、icon、control、decorative —— 抛出而非强制为 `'component'`）；
- presentational mode 不发出 event handler；上游 `deferred` 将 `dataModels` 转为可选 `presentational-stub` props，`omitted` 忽略并 warning；
- interactive mode 将 events → handler props、data models → required data props，每个 binding 归因于 semantic ownership 覆盖 binding 源节点的最深 planned component；
- 从上游 `layoutCandidates` 生成 `layoutPlan`，并填充 `absolute` fallback，使每个 planned component 至少有一条 layout 条目；
- 从 `media` / `icon` semantic 节点生成 `assetPlan`，经 `primaryVisualNodeId` 查找 `assetRef`；缺失 ref 警告，不抛出；
- 生成 exports —— root default 加每个 candidate 一个 named —— PascalCase 冲突时抛出（错误消息含两个 candidate id），而非静默去重。

确定性 id 使用 `<prefix>` + `stableSha256(stableJson({ form, ...canonical fields })).slice(0, 12)` 方案：`pc_` PlannedComponent、`pe_` PlannedExport、`pl_` PlannedLayout、`pa_` PlannedAsset。无 `Date.now`、无 UUID、无计数器。

### 接线（Stage 5C-PR-3）

规范 `ComponentPlanSchema` 位于 `src/contract/component-plan-schema.ts`。
`src/contract/index.ts` 将 schema、validator、derive 一并导出为 Stage 5C 公共面。
`src/ir/views.ts` 为少数仍从 `ir/views` 导入的历史调用方重导出规范绑定（及 `ComponentPlanModeSchema`）。
`src/ir/index.ts` 有意停止转发 `ComponentPlanSchema`，根 barrel 经 `export * from './contract'` 恰好导出一次。

### 不在范围内

5C 仍不生成 React / TS / BEM（Stage 6）、不提供 CLI 入口（Stage 5D）、不写 artifact 到磁盘；返回的 component-plan 在内存中经 `ComponentPlanSchema` + `assertComponentPlanIntegrity` 往返后返回。

## Contract Runner（Stage 5D）

`src/contract/run-contract.ts` 将四个 Stage 5 derive 步骤链接为一次 pass；
`src/contract/artifact-paths.ts` 定义稳定 artifact 名称及 manifest 构建器。二者均为**纯** —— `d2c-core` 不做文件 IO。
写磁盘的 CLI 在 Sketch skill（`skills/sketch-to-component/scripts`），将 provider/输出关注点排除在 core 之外。

### `runContract`

```ts
runContract({ designIr, visualView?, semanticView?, interactionSpec?, mode, interactionMode?, approval? })
  => { visualView, semanticView, interactionSpec, componentPlan, warnings }
```

链接 `deriveVisualView → deriveSemanticView → deriveInteractionSpec → deriveComponentPlan`。
相同输入 ⇒ 字节级相同输出；无时钟、无网络、无 IO。输入契约（灵活，但约束是硬性的）：

- `designIr` 必填 —— hash 链的根锚点。
- `visualView` / `semanticView` / `interactionSpec` 可选，但提供的 view 必须对上游通过完整 hash 链校验；不匹配则抛出（永不信任缓存对象）。
- `mode` / `interactionMode` / `approval` 由调用方显式指定。当 interaction spec 被 derive（非提供）时，`interactionMode` **必填** —— `runContract` 不回落到默认值。
- 提供的 view 必须形成从 `designIr` 起的连续前缀；runner 仅在最后提供的 view 之后 derive，永不 re-derive 已提供的 view。warnings 为实际运行步骤的有序合并。

`runContract` 永不将 interaction spec 提升为 `approved`（`deriveInteractionSpec` 仅产出 `draft | omitted | deferred`）。
因此 `mode='interactive'` 仅在有调用方提供的 `approved` spec 时成功；否则 `deriveComponentPlan` 抛出（5C §3.2）。

### Artifact 名称 + manifest

```ts
ARTIFACT_FILENAMES; // design-ir.json（输入根，在 ir/）+ 四个 runContract 输出（在 design-spec/）
MANIFEST_FILENAME; // 'manifest.json'
buildContractManifest(input, result); // 纯；每个 contract artifact 一条：
// { filename, hash, origin: 'provided' | 'derived', generatedFrom }
```

`hash` 始终为最终采用 artifact 的 `stableSha256(stableJson(artifact))`，
因此已校验的 provided view 与 derive 出的相同 view hash 一致 —— `origin` 仅记录来源。

### 不在范围内（Stage 5D）

无 codegen（Stage 6）。CLI 的 `--file` / `--design-ir` 入口 derive 完整链；reuse-input 入口（为 interactive mode 喂入预批准 interaction-spec）是后续切片。

## Codegen（Stage 6）

`src/codegen/` 将**已批准**的 `design-spec/` 转为目标组件包。此处一切**纯**（无 IO / 时钟 / 随机）；CLI 拥有磁盘写入。

- `verifyDesignSpec(input)` —— Gate 2 输入校验：schema 解析四个 contract artifact + manifest，核对每个 manifest hash，遍历 `generatedFrom` 链，要求 `component-plan.status === 'approved'`。故意无 `mode` 参数 —— mode 是 plan 的属性。
- `approveComponentPlan(plan, signOff)` —— 签收：将 draft plan 翻转为 `approved`（仅 status + approval 块；body 不动）。
- `generateComponentPackage(input)` —— 按 plan 自身 `body.target.framework` 分发；拒绝任何非 approved plan。React target 为每个组件发出 `.tsx`/`.module.css`/`index.ts`、包 barrel、`package.json`、presentational README banner 及 `interaction-coverage.md`（从 plan 的 coverage 快照格式化 —— 永不重新分类）。
- **bitmap 资源（reference + CLI copy）**：media 节点发出 `background-image: url("../assets/asset-<hash>.png")`，`CodegenFilePlan.assets` 给出纯文本复制计划（`assetRef`/`sourceFileName`/`outputPath`/`required`，按 `assetRef` 去重、`outputPath` 排序）。core 不碰字节；`required` asset 解析不到即抛错。字节由 Sketch CLI 从 `--assets` 目录复制（见下）。
- **stack / inline layout → flex**：`projectStackInlineLayout`（`src/codegen/react/layout.ts`，纯函数）消费 approved 的 `stack` / `inline` `layoutPlan`，把命中容器投影为 flex（`stack` → `flex-direction: column`，`inline` → `row`，`align-items: flex-start` + mean-gap + 首项 padding），直接子项改为 flow（`position: relative` + `flex: 0 0 auto` + 显式宽高，无 `left/top`）。**保真即投影前提**：仅当均值 gap 能在 0.5px 内复刻原绝对几何时才发 flex；`<2` 子项 / 缺几何 / DOM 顺序≠主轴序 / 负 gap / 负 padding / 主轴漂移 >0.5px / 跨轴方差 >0.5px 任一命中即**确定性回退**到 absolute 子项定位，并向 `CodegenFilePlan.warnings` 追加精确 warning（永不抛错）。容器自身定位与 `display:flex` 正交（定位看父布局，flex 看自身计划）。`componentCss()` 因此返回 `{ content, warnings }`。`absolute` strategy 仍走 absolute；grid / overlay 不在范围。

生成的 `package.json` 携带 `d2c` 来源块：

```jsonc
"d2c": {
  "mode": "presentational",
  "gate2Level": "presentational",          // from plan.approval.level
  "sourceHashes": {                          // stableSha256(stableJson(artifact))
    "visualView": "…", "semanticView": "…",
    "interactionSpec": "…", "componentPlan": "…"
  }
}
```

### Hash 语义

Contract hash 覆盖**整个** artifact，含 approval 字段，因此签收会改变 `component-plan` hash 并重写 `component-plan.json` 及其 `manifest.json` 条目（架构文档「Gate 2 artifact chain」）。排除 approval 元数据的 contract-identity hash 是 noted 的未来优化。

### Golden

`fixtures/apps/react-vite/src/golden/` 是已提交的、含 bitmap 资源、已批准 React `design-spec/` 的预期包（两个 media 节点复用一个 `assetRef` → 去重为单个 `src/assets/*.png`）。
一份副本服务两个目的：`codegen-golden` 测试（在 `skills/sketch-to-component/scripts`）将生成字节与之比较，
`npm run check:fixtures` 经 `tsc -b && vite build` 编译以证明输出可构建。用 Sketch CLI 重新生成：

```bash
# from skills/sketch-to-component/scripts
npm run contract -- --design-ir <ir> --out <tmp> --mode presentational \
  --interaction-mode deferred --approval-reason … --approved-by … --approved-at …
npm run approve  -- --spec <tmp>/design-spec --approved-by … --approved-at … \
  --acknowledge-behavior-stubbed
npm run codegen  -- --spec <tmp>/design-spec --design-ir <ir> \
  --assets <ir-dir>/assets \
  --out <repo>/fixtures/apps/react-vite/src/golden
```

### 不在范围内（Stage 6 v1）

交互式生成、vector / 复杂资源、第二 target、grid / overlay 布局及上游 layout inference 扩展、reuse-input CLI 路径为后续切片（bitmap 资源已经过 reference + CLI copy 落地；`stack` / `inline` 布局已投影为 flex）。

## Verification

```bash
npm run typecheck:d2c
npm run test:d2c
```

全仓库门禁经 `npm run typecheck`、`npm run test:all` 与 `npm run check:full` 包含本包。
