# Stage 5 蓝图 — Semantic View + Interaction Spec + Component Plan(门禁 2)

> 本文是 [`implementation-plan.md`](../design-source-to-component/implementation-plan.md)
> Stage 5 的详细蓝图。状态:**review draft,按反馈修订**(2026-05-25)。
>
> A5 symbol instance scale transform 已在 Batch 2 修复,Stage 5 的组件边界与列表识别不再建立在错位
> symbol 子树上。Batch 3(mask / clipping)与 Batch 4(部分 symbol override)仍是已知限制,但不阻断
> Stage 5 蓝图定稿。

---

## 1. 定位与范围

Stage 5 = 把已通过视觉预览门禁的设计 IR,转成可给代码生成器消费的**组件契约包**,并停在
**门禁 2**。

**做**:

1. `design-ir.json` + Stage 4 `visual-view.json` → `ir/views/semantic-view.json`;
2. `semantic-view.json` → `ir/interaction-spec.json`;
3. `semantic-view.json` + `interaction-spec.json` → `ir/component-plan.json`;
4. 产出 Gate 2 审批信息,停止在 codegen 之前。

**不做**:

- 不生成 React / Vue / 目标框架代码(Stage 6);
- 不猜业务 API、真实状态机、真实事件 handler;
- 不把低置信分组强行升格成组件;
- 不把 presentational 模式当作绕过 IR 保真审计的捷径。

**标准**:输出物足够让开发者评审组件边界、props/slots/events/states 的缺口、布局推断边界与
codegen 模式。未获 Gate 2 批准前,Stage 6 不得运行。

## 2. 输入 / 输出契约

```text
输入:  ir/design-ir.json
       ir/views/visual-view.json      (来自 Stage 4;必须与 design-ir hash 匹配)
       preview/visual-review-report.md(评审辅助;非 schema 输入)

输出:  ir/views/semantic-view.json
       ir/interaction-spec.json
       ir/component-plan.json

门禁:  生成后停止,返回 requiresApproval='gate-2';
       人如何批准由 skill / CLI 驱动,core 不做人机交互。

约束:  同一 design-ir + visual-view + 显式交互输入 → 同一 semantic-view / interaction-spec /
       component-plan contract hash。approval.approvedAt 是审计元数据,不参与 contract hash。
```

`design-ir.json` 仍是唯一权威来源;`visual-view.json` 是它的 render-ready 派生视图。Stage 5 读取
`visual-view.body` 作为视觉证据,因为 Stage 4 已应用 symbol 文本 override、解析 asset 引用并生成
Gate 1 可评审形态。CLI 必须校验 `visual-view.generatedFrom.designIrHash` 与本次
`design-ir.json` 匹配;独立调用 core 时可在内存里重新派生 `visual-view`。

Stage 5 输出必须形成完整 hash 链:

```text
design-ir hash
  -> visual-view.generatedFrom.designIrHash
  -> semantic-view.generatedFrom.visualViewHash
  -> interaction-spec.generatedFrom.semanticViewHash
  -> component-plan.generatedFrom.semanticViewHash + interactionSpecHash
```

生成态 artifact 的 body 与 contract hash 必须确定性可复跑。Gate 2 审批元数据可写在
`interaction-spec` / `component-plan` 内,但 `approvedAt` 不参与 contract hash;Stage 6 做输入链校验时
校验 contract hash 与审批字段存在性,不把时间戳当作派生输入。

## 3. 核心决策

### 3.1 先派生 semantic-view,再生成 interaction-spec 与 component-plan

`semantic-view.json` 是 Stage 5 的第一产物。它不是 HTML,也不是框架代码 AST,而是把视觉树中对
组件生成有意义的证据重组为稳定语义结构:

- 组件 / 区块 / 重复项 / 文本 / 图片 / 图标 / 装饰节点;
- 候选组件边界及其证据;
- 列表 / 栈 / 网格等布局意图候选;
- source trace,让每个结论能回到设计源节点;
- confidence 与 warnings,让开发者知道哪些结论不能自动相信。

`interaction-spec.json` 与 `component-plan.json` 都在 semantic-view 之后生成。前者说明行为契约是否
完整、推迟或省略;后者固化组件拆分、目标 package 计划与 codegen `mode`。

### 3.2 interaction-spec 必须存在,但可以显式 omitted / deferred

缺少 `interaction-spec.json` 是错误。Stage 5 必须写出这份文件,用显式 `status` 表达交互建模状态:

| `status`    | 含义                                          | 能否通过 Gate 2 |
| ----------- | --------------------------------------------- | --------------- |
| `draft`     | 引擎起草,开发者尚未签字                       | 否              |
| `in-review` | 已提交评审,尚未批准                           | 否              |
| `approved`  | 开发者批准了完整交互契约                      | 是              |
| `omitted`   | 开发者确认本次交付不建模交互                  | 是              |
| `deferred`  | 开发者确认本次仅视觉交付,后续升级 interactive | 是              |

`omitted` / `deferred` 都必须写 `reason`、`approvedBy`、`approvedAt`。这不是缺文件的“默认值”,
而是 Gate 2 的显式审批结果。

### 3.3 mode 属于 component-plan,不是 codegen 参数

Stage 6 codegen 只读取 `component-plan.json`。不允许额外传 `--mode presentational` 之类的运行期开关。
`component-plan.status` 表达方案生命周期:`draft` 是引擎起草,`in-review` 是已提交门禁但未签字,
`approved` 才能进入 Stage 6。

允许组合:

| `interaction-spec.status` | `component-plan.mode` | 含义                     |
| ------------------------- | --------------------- | ------------------------ |
| `approved`                | `interactive`         | 生成完整交互包           |
| `omitted` / `deferred`    | `presentational`      | 生成视觉级行为占位包     |
| 其它组合                  | -                     | schema / Gate 2 校验失败 |

无论 `mode` 如何,`component-plan.status !== 'approved'` 时 Stage 6 必须拒绝运行。

Gate 2 仍是单一门禁,审批记录用 `approval.level: 'presentational' | 'interactive'` 区分批准范围。

### 3.4 presentational 模式不绕过 Stage 5

presentational 只表示 Stage 6 可以生成行为占位包,不表示可以跳过 `semantic-view` 或
`component-plan`。它仍然需要:

- 通过 Gate 1 的视觉证据;
- 合法的组件边界;
- 明确的布局计划;
- 显式 `interaction-spec.status`;
- Gate 2 中开发者签字确认“这是行为占位”。

Stage 6 还必须把 presentational 元信息扩散到 `package.json`、README banner、组件文件头注释与
`interaction-coverage.md`。这些属于 Stage 6 输出要求,Stage 5 负责把单一事实源固化在
`component-plan.mode`。

## 4. semantic-view 的依据

semantic-view 的依据分四层,按可信度从高到低合并:

1. **显式标注**:设计图层名、description、pluginData 中的 `@component` / `@slot` /
   `@state` / `@event` / `@data`。当前 Sketch fixture 几乎没有这类标注,但 schema 要先留入口。
2. **Design IR semantic candidates**:Stage 3 产出的 `semantic.candidates`,包括 symbol 实例、
   命名前缀与重复结构候选。
3. **Visual evidence**:`visual-view.body` 中的 kind、层级、局部坐标、尺寸、文本、asset、
   symbol trace、样式差异、重复结构与 sibling spacing。
4. **项目规则**:后续可由 skill / CLI 传入命名约定、导出策略、组件粒度偏好。Stage 5 首版只保留
   schema 入口,不引入复杂规则引擎。

所有推断必须带 `evidence[]` 与 `confidence`。没有足够证据时,保留为普通 semantic node,不要升格成
component。

## 5. semantic-view 结构

首版采用“稳定外壳 + 可演进 body”的方式,但 body 不能再是完全任意 record。建议 schema:

```ts
type SemanticViewBody = {
  screen: SemanticScreen;
  nodes: SemanticNode[];
  componentCandidates: ComponentCandidate[];
  repeatedPatterns: RepeatedPattern[];
  layoutCandidates: LayoutCandidate[];
  warnings: Warning[];
};
```

`SemanticScreen` 是 screen 级摘要,其 `rootSemanticNodeId` 指向 `nodes` 中唯一
`kind: 'screen'` 的节点;布局、子节点与 source trace 仍以该 semantic node 为准。

核心节点:

```ts
type SemanticNode = {
  id: string;
  kind:
    | 'screen'
    | 'region'
    | 'component'
    | 'repeated-item'
    | 'text'
    | 'media'
    | 'icon'
    | 'control'
    | 'decorative';
  name: string;
  role?: string;
  primaryVisualNodeId: string;
  visualNodeIds: string[];
  parentId?: string;
  childIds: string[];
  bounds: { x: number; y: number; width: number; height: number };
  confidence: 'low' | 'medium' | 'high' | 'developer-provided';
  evidence: SemanticEvidence[];
  source: { nodeIds: string[]; provider?: string };
};
```

候选结构:

```ts
type ComponentCandidate = {
  id: string;
  rootSemanticNodeId: string;
  suggestedName: string;
  boundary: 'symbol' | 'annotation' | 'repeat-pattern' | 'visual-region' | 'developer-provided';
  confidence: 'low' | 'medium' | 'high' | 'developer-provided';
  evidence: SemanticEvidence[];
};

type RepeatedPattern = {
  id: string;
  itemSemanticNodeIds: string[];
  axis: 'x' | 'y' | 'grid' | 'unknown';
  itemCount: number;
  similarity: number;
  confidence: 'low' | 'medium' | 'high';
  evidence: SemanticEvidence[];
};

type LayoutCandidate = {
  id: string;
  semanticNodeId: string;
  kind: 'absolute' | 'stack' | 'inline' | 'grid' | 'overlay';
  confidence: 'low' | 'medium' | 'high';
  constraints: string[];
  caveats: string[];
};
```

`source.nodeIds` 与 `visualNodeIds` 是人类 review 的生命线。Stage 5 不能只产好看的组件名,必须能解释
“为什么这几个 visual nodes 被合成这个 semantic node”。

## 6. 布局推断能力缺口

Stage 3 审计的 B 类缺口在 Stage 5 正面承接:当前 IR 主要是绝对坐标,不足以可靠推出高质量 flex /
grid。Stage 5 只做**保守布局意图推断**。

可做:

- 同级节点等间距、同尺寸、相似结构 → `stack` / `inline` / `grid` candidate;
- 同 symbol master、重复命名前缀、相同文本/图像槽位 → `repeatedPattern`;
- 大块 frame/group、symbol 实例、命中 `组件/` 前缀 → `componentCandidate`;
- 已知无法确定的布局保留 `absolute`,并把 caveat 写入 `layoutCandidates`。

不做:

- 不承诺自动生成响应式 flex/grid;
- 不从单一画板推断断点;
- 不把所有 group 都变成组件;
- 不在缺少 raw constraint / auto-layout 语义时伪造约束;
- 不因 presentational 模式降低布局推断标准。

Stage 6 若遇到 `layoutCandidate.kind === 'absolute'`,可以生成稳定的绝对定位视觉包;若要生成更可维护的
flex/grid,必须只使用 `confidence >= medium` 且 caveats 可接受的候选。

## 7. interaction-spec 结构

Stage 5 首版可以从 semantic-view 起草交互规格,但默认保守:

```ts
type InteractionSpec = {
  kind: 'interaction-spec';
  generatedFrom: GeneratedFrom;
  status: 'draft' | 'in-review' | 'approved' | 'omitted' | 'deferred';
  reason?: string;
  approvedBy?: string;
  approvedAt?: string;
  body: {
    components: InteractionComponent[];
    states: InteractionState[];
    events: InteractionEvent[];
    dataModels: InteractionDataModel[];
    stateTransitions: InteractionTransition[];
    coverage: InteractionCoverage;
    warnings: Warning[];
  };
};
```

自动起草规则:

- 视觉上像 button / tab / input 的节点可起草 `event` candidate,但 `confidence` 不能高于 medium,
  除非来自显式标注。
- 文本、价格、头像、图片等可起草数据槽位 candidate,但不指定真实 API。
- 未提供开发者标注时,状态机保持空或 draft,不得编造 loading/error/success。
- 若用户选择 presentational,写出 `status: 'omitted'` 或 `status: 'deferred'`,并生成 coverage 表。
- `body.coverage` 是 Stage 6 生成包内 `interaction-coverage.md` 的唯一数据源。Stage 6 只能把它格式化
  为 markdown,不能重新发明 coverage 分类或绕过 Stage 5 的缺口记录。

## 8. component-plan 结构

`component-plan.json` 是 Stage 6 的唯一输入开关。建议结构:

```ts
type ComponentPlan = {
  kind: 'component-plan';
  generatedFrom: GeneratedFrom;
  status: 'draft' | 'in-review' | 'approved';
  mode: 'presentational' | 'interactive';
  semanticViewRef: 'ir/views/semantic-view.json';
  interactionSpecRef: 'ir/interaction-spec.json';
  body: {
    target: { framework: 'react'; language: 'ts'; styling: 'bem-css' };
    rootComponent: PlannedComponent;
    components: PlannedComponent[];
    exports: PlannedExport[];
    layoutPlan: PlannedLayout[];
    assetPlan: PlannedAsset[];
    warnings: Warning[];
  };
  approval?: PlanApproval;
};

type PlanApproval =
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

实现时建议用 discriminated union 收紧审批分支:

- `status: 'draft' | 'in-review'` 时 `approval` 可以不存在;
- `status: 'approved'` + `mode: 'interactive'` 时必须有 `approval.level === 'interactive'`;
- `status: 'approved'` + `mode: 'presentational'` 时必须有
  `approval.level === 'presentational'` 且 `acknowledgedBehaviorStubbed === true`。

组件计划必须把“哪些 semantic nodes 合并为一个组件”“哪些节点拍平为 markup”“哪些作为 slot / prop /
asset 输出”说清楚。Stage 6 不再重新判断组件边界,只执行 component-plan。

## 9. Gate 2 审批清单

Gate 2 审查同一套产物,但按 `component-plan.mode` 分支:

**共同必审**:

- `semantic-view.json` 与 `visual-view.json` 的 designIrHash 一致;
- 组件边界合理,低置信候选没有被静默升格;
- repeated pattern 与 layout candidate 的 confidence / caveats 可接受;
- `interaction-spec.json` 存在;
- `component-plan.json` 引用正确,`mode` 合法;
- 全链 hash 校验通过:design-ir、visual-view、semantic-view、interaction-spec、component-plan 互相钉住;
- warnings 没有 `severity: 'error'`。

**presentational 必审**:

- `interaction-spec.status` 是 `omitted` 或 `deferred`;
- `reason`、`approvedBy`、`approvedAt` 存在;
- `approval.level === 'presentational'`;
- `acknowledgedBehaviorStubbed === true`;
- `interaction-spec.body.coverage` 能在 Stage 6 原样映射为包内 `interaction-coverage.md`。

**interactive 必审**:

- `interaction-spec.status === 'approved'`;
- events、handler props、states、data models、state transitions 已由开发者确认;
- public exports 与 component props 不含低置信占位。

## 10. 执行顺序 — 5A / 5B / 5C / 5D

| 子段   | 内容                                                              |
| ------ | ----------------------------------------------------------------- |
| **5A** | 收紧 `SemanticViewSchema.body`,实现 `derive-semantic-view` 与单测 |
| **5B** | 定义 `InteractionSpec` 状态与 coverage,实现 omitted/deferred 起草 |
| **5C** | 定义 `ComponentPlan` schema,实现 mode 校验与计划生成              |
| **5D** | `runContract` 薄入口 + Sketch CLI `contract` 子命令 + Gate 2 信号 |

Stage 5 可以先只支持 `presentational` 垂直切片,但不能把 interactive schema 留空。interactive 可以是
draft/in-review 流程,Stage 6 interactive codegen 后置。

## 11. 模块与文件

**d2c-core**:

| 文件                                               | 职责                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| `packages/d2c-core/src/semantic/schema.ts`         | Stage 5 semantic-view body schema                   |
| `packages/d2c-core/src/semantic/derive.ts`         | `design-ir` + `visual-view` → `semantic-view`       |
| `packages/d2c-core/src/semantic/evidence.ts`       | evidence / source trace 构造                        |
| `packages/d2c-core/src/contract/interaction.ts`    | interaction-spec schema、status 校验、coverage 生成 |
| `packages/d2c-core/src/contract/component-plan.ts` | component-plan schema、mode 组合校验、计划生成      |
| `packages/d2c-core/src/contract/run-contract.ts`   | Stage 5 薄入口,返回 `requiresApproval: 'gate-2'`    |
| `packages/d2c-core/src/ir/views.ts`                | 引用 Stage 5 schema,替换 loose record               |

**Sketch provider scripts**:

| 文件                                            | 职责                                       |
| ----------------------------------------------- | ------------------------------------------ |
| `skills/sketch-to-component/scripts/src/cli.ts` | 增 `contract` 子命令,写出 Stage 5 三份产物 |

CLI 首版建议:

```bash
npm run contract --workspace @skill-collections/sketch-to-component-scripts -- \
  --design-ir output/ir/design-ir.json \
  --visual-view output/ir/views/visual-view.json \
  --out output \
  --interaction-status deferred \
  --approved-by "<developer>" \
  --reason "视觉评审包先交付,交互契约后续补齐"
```

若传入 `--interaction-status omitted|deferred`,CLI 必须同时要求 `--approved-by` 与 `--reason`;
`approvedAt` 由 CLI 写入,但不参与 contract hash。否则默认生成 `draft`。

编辑循环必须保守:

- 首次 `contract` 生成三份 draft JSON;
- 开发者直接编辑 `interaction-spec.json` / `component-plan.json`,或通过后续专门命令补字段;
- 再运行 `contract --validate --out output` 只校验现有文件与 hash 链,不覆盖人工编辑;
- 普通 `contract` 遇到已存在的 Stage 5 文件时拒绝覆盖,除非显式传 `--force`;
- 后续若需要自动合并,另加 `--merge` 子命令,但不作为 Stage 5 首版阻断。

## 12. 测试方案 + 验证

- `SemanticViewSchema` 正 / 反例:缺 source trace、非法 confidence、空 nodes 等应失败。
- `derive-semantic-view`:
  - symbol 实例变成 component candidate;
  - 重复 sibling 生成 repeated pattern;
  - 低置信 group 不升格;
  - 输出确定性。
- `interaction-spec`:
  - 缺文件由 runner 报错;
  - `omitted` / `deferred` 缺 `reason` 或 `approvedBy` 失败;
  - `approved` 但缺必要 interactive body 失败。
- `component-plan`:
  - `approved + interactive` 通过;
  - `omitted/deferred + presentational` 通过;
  - `draft + presentational`、`approved + presentational`、`omitted + interactive` 失败。
- CLI:
  - `contract` 写出三份 JSON;
  - hash mismatch 拒绝运行;
  - 同输入复跑字节级一致。
- fixture-level golden:用现有 Sketch 脱敏 fixture 生成
  `semantic-view.json` / `interaction-spec.json` / `component-plan.json` expected 文件,测试
  contract hash 与 JSON 快照稳定。
- approval metadata:同一输入、同一 `reason` / `approvedBy`、不同 `approvedAt` 时 contract hash 不变;
  若改动 body、status、mode 或 coverage,contract hash 必须变化。

验证命令:

```bash
npm run typecheck:d2c
npm run test:d2c
npm run typecheck:sketch
npm run test:sketch
npm run format:check
```

## 13. 出口标准

- `semantic-view.json` body 有稳定 schema,不是 loose record。
- `derive-semantic-view` 使用 Gate 1 visual evidence,保留完整 source trace。
- `interaction-spec.json` 必定生成;缺文件不能进入 Stage 6。
- `omitted` / `deferred` 是显式审批状态,不是隐式缺省。
- `component-plan.json` 固化 `mode`,Stage 6 不需要外部 mode 参数。
- Gate 2 审批清单可由人读懂,能区分 presentational 与 interactive。
- Stage 6 可从 `component-plan` 开始验证完整 hash 链,确认 design-ir / visual-view / semantic-view /
  interaction-spec 没被偷换。
- `interaction-spec.body.coverage` 到 Stage 6 `interaction-coverage.md` 的映射边界明确。
- B 类布局缺口被显式建模为 `layoutCandidates.confidence/caveats`,不靠代码生成时临场猜。
- `runContract` 返回 `requiresApproval='gate-2'`;CLI 能输出可 review 的三份 Stage 5 产物。

## 14. 后置项

- Batch 3 mask / clipping schema:会影响 semantic boundary 与 layout caveats,但不阻断 Stage 5 首版。
- Batch 4 symbol override:文本 override 已由 Stage 4 消费;颜色 / border / nested symbol override
  仍需后续 fidelity 批次。
- `check:d2c-consumption`:Stage 8 扫描业务 import presentational 包,不是 Stage 5 阻断项。
- 自动截图 diff:仍属于 Stage 4 预览增强,不是 Gate 2 的必要条件。

## 15. Appendix — helper type sketches

这些草图用于钉住 5A/5B 一上来会用到的证据、warning、hash 与 coverage 形态。实现 PR 可以拆分文件与
字段名,但不能丢掉这些信息边界。

```ts
type GeneratedFrom = {
  schemaVersion: string;
  sourceRef?: Record<string, string>;
  designIrHash: string;
  visualViewHash?: string;
  semanticViewHash?: string;
  interactionSpecHash?: string;
};

type SemanticEvidence = {
  kind:
    | 'annotation'
    | 'semantic-candidate'
    | 'symbol'
    | 'name-pattern'
    | 'repeat-geometry'
    | 'visual-geometry'
    | 'style-similarity';
  sourceNodeIds: string[];
  confidence: 'low' | 'medium' | 'high' | 'developer-provided';
  message: string;
};

type Warning = {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  sourceNodeId?: string;
  stage?: 'stage-5';
};

type InteractionCoverage = {
  states: { status: 'covered' | 'draft' | 'omitted' | 'deferred'; notes: string };
  events: { status: 'covered' | 'draft' | 'omitted' | 'deferred'; notes: string };
  dataBinding: { status: 'covered' | 'draft' | 'omitted' | 'deferred'; notes: string };
  stateTransitions: { status: 'covered' | 'draft' | 'omitted' | 'deferred'; notes: string };
};

type PlannedComponent = {
  id: string;
  name: string;
  sourceSemanticNodeIds: string[];
  renderStrategy: 'component' | 'inline-markup' | 'slot';
};

type PlannedExport = {
  name: string;
  kind: 'component' | 'type' | 'asset' | 'style';
  sourceComponentId?: string;
};

type PlannedLayout = {
  semanticNodeId: string;
  strategy: 'absolute' | 'stack' | 'inline' | 'grid' | 'overlay';
  confidence: 'low' | 'medium' | 'high';
  caveats: string[];
};

type PlannedAsset = {
  assetId: string;
  usage: 'image' | 'icon' | 'font' | 'other';
  sourceSemanticNodeIds: string[];
};
```
