# Stage 6 实施计划 — Component Codegen(React + TS + BEM 首发)

> 本文是 [Stage 5 蓝图](./stage-5-component-contract-outline.md) 之后的 **Stage 6** 计划。
> Stage 5(5A `semantic-view` / 5B `interaction-spec` / 5C `component-plan` / 5D contract
> runner + CLI + 落盘)已全部合入 `master`(到 merge `7e56dde`)。Stage 6 把 5D 产出的
> `design-spec/` 翻译成**目标栈组件包**:消费一个 **approved** 的 `component-plan.json` +
> 同目录 artifacts,生成 React + TypeScript + BEM 的组件包,确定性、字节级可复现。
>
> 前置:本 plan PR 基于当前 `master`(`7e56dde`)。
>
> **Stage 6 不重判契约。** 不重新判断 component boundary / mode / interaction coverage,
> 不接收外部 `--mode`。这些都是 Stage 5 已经定好、并经 Gate 2 签字的事实;Stage 6 只读、只生成。
> 权威约束见架构总纲 [`design-source-to-component-architecture.md`](./design-source-to-component-architecture.md)
> 的 "Interaction status and codegen mode" 与 "Presentational package metadata" 两节。

---

## 1. 范围

**做**

- `packages/d2c-core` 增加 `src/codegen/`:`TargetGenerator` 抽象 + `react/`(React + TS + BEM)
  首个实现。输入是已校验的 `design-spec/` artifacts(内存对象),输出是**内存里的文件计划**
  (`{ path, content }[]`),**不碰 IO、不取时钟、不发网络**(承接 impl-plan §codegen)。
- `packages/d2c-core` 增加 **Gate 2 输入校验**:读四个 contract artifact + manifest,校验
  manifest hash、`generatedFrom` hash chain、各 schema、`component-plan.status === 'approved'`
  与 status×mode×approval 一致性。纯函数,失败即 throw。
- `packages/d2c-core` 增加 **sign-off**:纯函数 `approveComponentPlan(plan, approval)` 把一个
  draft plan 提升为 approved(只翻 `status` + 写 `approval` 块,**不动 body**),自检 schema;
  配套重算受影响的 manifest 条目(见 §3.4)。
- `skills/sketch-to-component/scripts` 增加 CLI:`codegen`(读 `design-spec/` → 写
  `output/package/`)与 `approve`(对一个 `design-spec/` 内的 plan 签字 + 重写 manifest)。
- 一个 **approved 的、无 asset 的** golden:同输入两跑字节级一致,且生成包能 `tsc` / build。
- 更新 architecture doc / README:写清 Stage 6 如何消费 5D 产物 + 解决 §3.4 的 hash 口径分歧。

**不做**

- 不重判 component boundary / mode / interaction coverage(全部沿用 `component-plan.json`)。
- 不接收外部 `--mode`;mode 只来自 approved plan 的 `mode` 字段(架构 §"…codegen mode")。
- **首版不做 interactive 生成**:先把 presentational 跑通(见 §3.8 / §6 的 6A)。
- **首版不做 asset emission**:第一个 golden 用无 asset 的 plan(见 §3.5)。
- 不实现 Gate 2 审批 UI / 工作流;sign-off 只提供把 approval 写进 artifact 的纯机制 + CLI 入口,
  谁批、批不批是人的事。
- 不改 5A–5D 已合入的 schema / derive / runContract 行为(除非 Stage 6 集成暴露 bug,另开修复)。

**标准**:Stage 6 完成后,`npm run codegen -- --spec <dir>/design-spec --out <pkgdir>` 能在
`<pkgdir>/` 产出一套 React + TS + BEM 组件包(组件、CSS、types、barrels、`package.json` 的 d2c
元信息、README banner、`interaction-coverage.md`);同一 approved `design-spec/` 两次运行 diff 为空;
生成包能通过 `tsc`;喂入 draft plan / hash 失配 / 缺 `interaction-spec.json` 一律被拒。

## 2. 输入 / 输出

```text
Gate 2 输入(读 design-spec/,全部已落盘):
  design-spec/
    visual-view.json
    semantic-view.json
    interaction-spec.json     # 必需;缺失 → codegen 直接拒跑(架构明确)
    component-plan.json        # status 必须 === 'approved'
    manifest.json              # 每个 artifact 的 hash + origin + generatedFrom

codegen 核心(纯)输入 / 输出:
  generate(plan, { semanticView, interactionSpec, target: 'react' })
    => CodegenFilePlan = { files: { path: string; content: string }[]; warnings: string[] }
  纯内存;同输入 ⇒ 字节级相同 files。任何 mkdir / writeFile 都在 CLI 层。

CLI 落盘布局(在 --out <pkgdir> 下,presentational 首版):
  <pkgdir>/
    package.json               # 含 d2c block(mode / level / 来源 hash)
    README.md                  # presentational banner(架构 §"Presentational package metadata")
    interaction-coverage.md    # 由 contract 里已有的 coverage 快照格式化,不重新推断
    src/
      <Component>/<Component>.tsx
      <Component>/<Component>.module.css   # 或 BEM class;具体见 §3.7
      <Component>/index.ts
      index.ts                 # barrel,root default + 每候选一个 named export
      types.ts
```

> **同一输出目录、就地重写。** 架构总纲规定 presentational→interactive 升级是"就地重写
> `output/package/`",不维护并行的 `@presentational` 副本。Stage 6 写盘按此语义:同一 `--out`
> 目标,覆盖式生成(CLI 层定义覆盖 vs 拒写已存在,见 PR-3)。

## 3. 核心决策

### 3.1 codegen 在 core(纯),CLI 负责 IO(writer boundary)

沿用 5D 的 `runContract`(core)+ `cli.ts`(写盘)分层,且 impl-plan 已拍板 codegen 落点:

- `packages/d2c-core/src/codegen/` —— `TargetGenerator` 接口 + `react/` 实现,外加 Gate 2 校验与
  sign-off,**全纯函数**,产内存文件计划。即使首版只做 React,也按 `TargetGenerator` 抽象写,
  给后续 target(Vue 等)留扩展口(impl-plan §"codegen 留 target 扩展口")。
- `skills/sketch-to-component/scripts` —— 读 `design-spec/`、`mkdir` / `writeFile`、CLI 参数。

好处同 5D:core 可在任何环境纯函数调用、用内存 fixture 测;落盘策略集中在 skill 层,不泄漏进契约。

### 3.2 只消费 approved plan,不重判契约

架构 §"Interaction status and codegen mode" 是硬约束:

- `component-plan.status` 必须 `=== 'approved'`,否则 pipeline 在进入 Stage 6 前就被拒
  (任何 unapproved plan 在 mode 校验之前先被否)。
- **mode 来自 plan 的 `mode` 字段**,codegen **不接收外部 `--mode`**。mode 是 approved plan 的
  属性,不是运行时开关。
- `interaction-spec.json` 是必需 artifact,缺失即拒跑。
- component boundary / props / slots / states / events / data contracts / public exports 全部
  以 `component-plan.json` 为准;Stage 6 不重新推断,只把它们翻译成代码。
- `interaction-coverage.md` 由 contract 里**已落地的 coverage 快照**格式化输出,绝不自己编造覆盖
  数据(架构原文:"it never invents coverage data")。确切读哪个字段
  (`interaction-spec.body.coverage` 还是 `component-plan.body.interactionCoverage`)在 PR-2 以
  schema 为准锁定。

### 3.3 Gate 2 输入完整性校验(PR-1)

进入生成前,纯校验函数(暂名 `verifyDesignSpec(artifacts)`)按序断言,任一不过即 throw:

1. 四个 contract artifact 各自 `safeParse` 通过(schema 合法)。
2. **manifest hash 对账**:对每个 artifact 重算 `stableSha256(stableJson(artifact))`,与
   `manifest.json` 里对应条目的 `hash` 必须一致。
3. **`generatedFrom` hash chain 自洽**:`semantic-view` pin `visual-view`、`interaction-spec`
   pin `semantic-view`、`component-plan` pin `semantic-view` + `interaction-spec`,逐跳重算比对。
4. **`component-plan.status === 'approved'`**,且 status×mode×approval 一致(由 `ComponentPlanSchema`
   的 `superRefine` 保证;持有成功 parse 结果即足够)。
5. **mode 只从 plan 读**:校验层不接受任何外部 mode 入参。

注:校验是纯函数,吃**已解析的对象**;真正的读盘在 PR-3 的 CLI。PR-1 用内存 fixture 测。

### 3.4 sign-off 机制 + hash 口径分歧(必须拍板)

**现状(已核实代码):** 5A–5D 的 hash 一律是 `stableSha256(stableJson(整个 artifact))`
(`derive-component-plan.ts:120`、`artifact-paths.ts:75`),**没有**排除 `status` / `approval`。
而架构总纲第 531 行写的是"`approvedAt` 等审批时间戳是审计元数据,**排除在 contract hash 之外**"。
**这条架构意图当前未实现。**

后果:`approveComponentPlan` 把 draft 提升为 approved 会改变 component-plan 自身的整体 hash
(`status` 值变了 + 多了 `approval` 块)。它是契约链叶子,**上游 chain 不受影响**,但
`manifest.json` 里 `component-plan` 那条 `hash` 会失配。

**决策(本计划采纳 Option A,推荐):**

- **Option A(v1)**:保留"整 artifact 取 hash"的现状。sign-off 产出 approved
  `component-plan.json` 时,**连带重算 `manifest.json` 里 component-plan 的 hash 条目**。
  Stage 6 Gate 2 从盘上重算 hash,对账的是签字后的 manifest。简单、与已落地代码一致、不动 hash 原语、
  不影响既有 golden。代价:sign-off 必须同时改 `component-plan.json` + `manifest.json`(一个受控步骤)。
- **Option B(后置)**:引入"contract identity hash"——hash 前剥掉顶层 `status` / `approval`
  (及 `approvedAt`),让 artifact 的契约 hash 在 draft→approved 间稳定,签字不再扰动 manifest。
  忠于架构第 531 行,但要改贯穿 5A–5D 的 hash 原语、重铸全部既有 hash + golden,成本与风险大,后置。

**配套动作**:本计划落地 Option A 的同时,在架构总纲里把第 531 行更正为"当前实现:审批字段进
contract hash;identity-hash 为后续优化"(或开 issue 记 Option B),消除文档与代码的分歧。

`approveComponentPlan(plan, approval)`(core,纯):

- 入参 `plan` 必须是 draft;`approval` 含 `{ gate: 'gate-2', level, approvedBy, approvedAt }`,
  presentational 还需 `acknowledgedBehaviorStubbed: true`(承接 5C schema)。
- **只翻 `status` → `'approved'` + 写 `approval`,body 一字不动**;返回前以
  `ComponentPlanSchema.parse` 与 `assertComponentPlanIntegrity` 自检。
- 这是 **Stage 6(需 approved component-plan)与 interactive 路径(需 approved interaction-spec,
  见 6A)的共同前置**——interaction-spec 的 `approved` 同样没有 derive 出口,sign-off 要设计成一等
  步骤,而不是散落在 fixture 里手搓 approval 块。interaction-spec 的签字以同构方式提供(6A 落地)。

### 3.5 asset 划界(v1 不生成 asset)

**现状(已核实):** `contract` CLI 只写 `design-spec/`(四 JSON)+ `ir/design-ir.json`,
**不落 asset 字节**;落 asset 的是 `preview` 子命令(`cli.ts:239-240`,以 utf8 写 SVG / data-URI)。
所以 `design-spec/` 里没有 Stage 6 可读的 asset 来源。

**决策:** v1 codegen 只处理**无 asset 的 approved plan**(5D golden 本身就无 media → `assetPlan`
为空)。asset emission + 把 asset 落进 `design-spec/assets/`(或另定来源)作为 Stage 6 后续 PR。
若 plan 的 `assetPlan` 非空而 v1 未实现,生成器**显式报错或 warn 并跳过**,不静默产出坏引用。

### 3.6 确定性

- 生成器纯函数:无 `Date.now`、无随机、无计数器;文件按 path 排序输出,内容用 sorted-key 稳定序列化。
- 同输入 ⇒ 字节级相同 `files`,从 PR-2 第一行就焊死,而非等 PR-4 golden 才发现漂移。
- **文件名大小写**:5C 只查了 PascalCase **export** 冲突;落盘文件名在 macOS 等**大小写不敏感**
  文件系统上会再撞一次(`Foo.tsx` vs `foo.tsx`)。生成器要自己检测路径冲突并报错。

### 3.7 输出包内容(presentational 首版)

按架构 §"Presentational package metadata":

- **组件**:每个 planned component 一个 `.tsx`,props 来自 plan;presentational 下 event handler /
  data binding 是 placeholder(可选 props),文件头注释标"Behavior is stubbed; see
  ../interaction-coverage.md"。
- **样式**:BEM。CSS Modules vs 全局 BEM class 的取舍在 PR-2 定(倾向 CSS Modules + BEM 命名)。
- **types.ts** / **barrels**:root default export + 每候选一个 named export;PascalCase 冲突
  沿用 5C 已有的报错(不静默 dedup)。
- **`package.json` 的 `d2c` block**:记 mode / Gate 2 level / 来源 contract 的 hash(可追溯)。
- **README banner**:presentational / behavior-stubbed 警示(架构原文模板),提示需经 interactive
  Gate 2 升级后才可进业务代码。
- **`interaction-coverage.md`**:格式化 coverage 快照(§3.2)。

### 3.8 presentational 先行,interactive 后置

架构指出 presentational→interactive 是最高风险跃迁(可选 placeholder 变必填 handler,所有调用点
可能炸),且必须就地重写 + 重过 Gate 2。因此 v1 只做 presentational;interactive 生成在
presentational 跑通后,作为单独切片,且依赖 6A 把 approved 的 interaction-spec 喂进链路。

## 4. PR 拆分

### 6-PR-1 — sign-off + Gate 2 输入校验(core,纯)

文件:

- `packages/d2c-core/src/codegen/sign-off.ts`(新,`approveComponentPlan`)
- `packages/d2c-core/src/codegen/verify-design-spec.ts`(新,Gate 2 输入校验)
- `packages/d2c-core/src/codegen/index.ts`(新,导出)+ `src/index.ts` 接出
- 对应 `__tests__/`

要点:纯函数;sign-off 只动 status/approval 不动 body;校验吃已解析对象。
测试重点:**拒 draft plan**、**拒 hash 失配**(manifest 与重算不一致 / chain 断裂)、
**拒缺 `interaction-spec.json`**、**拒任何外部 mode 入参**;`approveComponentPlan` draft→approved
后 schema 自洽 + body 不变 + **整 artifact hash 如期改变**(锚定 §3.4 Option A 行为)。

### 6-PR-2 — presentational React 生成核心(core,纯)

文件:

- `packages/d2c-core/src/codegen/target.ts`(`TargetGenerator` 抽象)
- `packages/d2c-core/src/codegen/react/*`(React + TS + BEM 实现)
- `__tests__/`(吃内存 fixture,断言 `files` 字节级稳定)

要点:plan → 内存 `CodegenFilePlan`,不写盘;只做 presentational;组件 / CSS / types / barrels /
`package.json` d2c block / README banner / `interaction-coverage.md`;确定性 + 文件名冲突检测(§3.6);
`assetPlan` 非空时按 §3.5 报错或 warn-skip。

> 体量提示:输出种类多,若 PR 过大,可拆"组件 + CSS + types"与"barrels + 包元信息 + coverage"两刀。

### 6-PR-3 — Sketch CLI `codegen` + `approve` 子命令(IO)

文件:

- `skills/sketch-to-component/scripts/src/cli.ts`(加 `codegen` 与 `approve` 命令 + 参数解析)
- `skills/sketch-to-component/scripts/package.json`(加 script)
- `__tests__/`(参数正反例 + 落盘后目录结构 + 同输入两跑 diff 空)

要点:`codegen --spec <design-spec> --out <pkgdir>`:读盘 → 调 PR-1 校验 → 调 PR-2 生成 → 写盘;
**不接收 `--mode`**。`approve --spec <design-spec> --by <id> --at <iso> [--level …]`:读
component-plan → `approveComponentPlan` → 重写 `component-plan.json` + `manifest.json`(§3.4)。
就地覆盖语义(§2)。

### 6-PR-4 — approved golden package + docs

文件:

- golden fixture:一个 **approved、无 asset** 的 `design-spec/`(用 PR-3 `approve` 对 5D 风格的
  draft plan 签字产出)+ expected 生成包
- 可复现性测试:两跑 `codegen` 字节级一致;**生成包能 `tsc` / build**(沿用 `fixtures/` 的
  react-vite build 套路,进 `check:fixtures`)
- 架构 doc / README:Stage 6 如何消费 5D 产物;**更正第 531 行 hash 口径(§3.4)**

要点:端到端 approved → 包;确认可重复 + 可编译;文档闭环。

## 5. 测试矩阵

| 文件                      | 测试点                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sign-off.test.ts`        | draft→approved:status/approval 写对、body 不变、schema 自洽、**整 artifact hash 改变**;presentational 需 `acknowledgedBehaviorStubbed`;非 draft 入参 throw |
| `verify-design-spec.test` | 拒 draft plan;拒 manifest hash 失配;拒 `generatedFrom` chain 断裂;拒缺 `interaction-spec.json`;拒外部 mode;approved + 合法链路通过                         |
| `react` 生成测试          | presentational 全套输出字节级稳定;mode 取自 plan;PascalCase / 文件名大小写冲突报错;`assetPlan` 非空按 §3.5 处理;coverage 来自快照不臆造                    |
| CLI 测试                  | `codegen` / `approve` 参数正反例;`approve` 后 manifest 同步;`codegen` 落盘目录结构;同输入两跑 diff 空;`codegen` 不吃 `--mode`                              |
| golden 测试               | approved 无 asset `design-spec/` → 包字节级匹配 expected;生成包 `tsc` / build 通过                                                                         |

## 6. 与 Stage 5D / 6A 边界 + 后续

**承接 5D**:Stage 6 只读 5D 产出的 `design-spec/` + `manifest.json`,用 manifest hash + 各
`generatedFrom` 做输入链完整性校验(5D plan §6 已把这些列为"留给 Stage 6")。

**并行但不阻塞 —— 6A:5D reuse-input CLI 路径。** 让 CLI 能传入已 approved 的 interaction-spec /
中间 artifact 再跑后续链路(5D plan 把 `--visual-view` / `--semantic-view` / `--interaction-spec`
列为后置切片)。它主要服务 **interactive**:approved interaction-spec 靠 §3.4 的 sign-off 机制
产出后,经 reuse-input 喂进 `runContract`。**排程:presentational(PR-1~PR-4)跑通后**,再做 6A,
作为 interactive 生成的前置。

**Stage 6 后续切片**:① interactive 生成(就地重写 + 重过 Gate 2);② asset emission + asset 落盘
来源(§3.5);③ 第二个 target(如 Vue,验证 `TargetGenerator` 抽象);④ Option B contract
identity hash(§3.4)。

## 7. 验证命令

每个实现 PR 至少跑:

```bash
npm run test:d2c
npm run typecheck
npm run lint
npm run format:check
npm run check:full
```
