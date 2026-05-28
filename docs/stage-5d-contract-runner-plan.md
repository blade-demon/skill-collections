# Stage 5D 实施计划 — Contract Runner + Sketch CLI `contract` + artifact 落盘

> 本文是 [Stage 5 蓝图](./stage-5-component-contract-outline.md) 的 **5D** 子段。在
> Stage 5A(`semantic-view`)、5B(`interaction-spec`)、5C(`component-plan`)全部
> 合入 `master`(到 commit `3f4abd6`)之后,把这四步串成一条**可运行、可落盘、可审查**的
> contract 生成链:`runContract` 薄入口 + Sketch CLI `contract` 子命令 + 稳定 artifact
> 路径 + 真 `.sketch` golden。
>
> 前置:Stage 5C stack(#40 / #41 / #42)已合入 `master`。本 plan PR 基于当前 `master`。
>
> **5D 不做 codegen。** 不生成任何 React / TS / BEM 代码,不消费 `component-plan` 生成组件;
> 那是 Stage 6。5D 的终点是:给定一个合法 `design-ir.json`(或 `.sketch`),能确定性地、
> 字节级可复现地产出一组 schema 合法、hash-pinned 的 contract artifacts。

---

## 1. 范围

**做**

- `packages/d2c-core` 增加 `runContract(...)`:把 `deriveVisualView → deriveSemanticView →
deriveInteractionSpec → deriveComponentPlan` 串成一条链,返回内存对象 + 合并 warnings,
  **不碰文件 IO、不取时钟、不发网络**。
- 定义稳定 artifact 名称与目录布局常量(`design-spec/` 下),core 暴露常量但**不写盘**。
- `skills/sketch-to-component/scripts` 增加 `contract` 子命令:读 `.sketch` 或已有
  `design-ir.json`,调用 `runContract`,把 artifacts 写到稳定路径。
- 加一条真实 `.sketch` golden,验证整条链路可重复生成**字节级相同**的 artifacts。
- 更新 `packages/d2c-core/README.md`、Sketch skill docs,必要时补 architecture doc。

**不做**

- 不做 Stage 6 codegen(React / TS / BEM、`interaction-coverage.md` 生成、package 脚手架)。
- 不实现 Gate 2 审批 UI / 流程;`runContract` 默认产出 `component-plan.status = 'draft'`,
  审批字段留给人工 / 后续。
- 不新增 `--mode` 之外的设计判断;mode / interaction-status 由 caller 显式传入(承接 5C §3.2)。
- 不改 5A–5C 已合入的 schema / derive 行为(除非 5D 集成暴露出 bug,另开修复)。

**标准**:5D 完成后,`npm run contract -- --design-ir <path> --out <dir>`(或 `--file <.sketch>`)
能在 `<dir>/design-spec/` 产出 `visual-view.json` / `semantic-view.json` /
`interaction-spec.json` / `component-plan.json`,同一输入两次运行 diff 为空,且每个 artifact 都能
被对应 schema `safeParse` 通过、hash chain 自洽。

## 2. 输入 / 输出

```text
runContract 输入:
  designIr         : validated DesignIR（必填)
  visualView?      : 缺省则 deriveVisualView(designIr)
  semanticView?    : 缺省则 deriveSemanticView
  interactionSpec? : 缺省则 deriveInteractionSpec（按 interactionMode + approval)
  mode             : 'presentational' | 'interactive'（component-plan mode,必填)
  interactionMode? : 'draft' | 'omitted' | 'deferred'（仅当需要 derive interactionSpec 时)
  approval?        : omitted/deferred 所需 { reason, approvedBy, approvedAt }

runContract 输出:
  { visualView, semanticView, interactionSpec, componentPlan, warnings }
  纯内存对象;warnings 是四步 warnings 的有序合并。
```

### 2.1 输入契约(已拍板:flexible,约束写死)

runContract 接受**可选预算上游 view**,但 flexible 不等于松。下面五条是硬约束,PR-1 必须按此实现,
不允许"信任缓存":

1. **`designIr` 必填。** 它是整条链的根锚点;其余 view 的 hash 都最终回链到它。
2. **`visualView` / `semanticView` / `interactionSpec` 可选,但一旦传入就必须走完整 hash-chain
   校验** —— 与从 `designIr` 重算的 hash 不一致即 throw,绝不"信任传入的缓存对象"。校验沿用 5A–5C
   各 derive 入口已有的链式校验规则(designIrHash / visualViewHash / semanticViewHash /
   interactionSpecHash)。
3. **mode / interactionMode / approval intent 仍由 caller 显式传入**,runContract 不猜、不内置
   默认 policy(承接 5C §3.2 "非法组合直接 throw")。
4. **从传入点向后续补,不重算前面。** 若 caller 传入了一个已校验通过的 `semanticView`,runner 从该点
   继续 derive `interactionSpec` / `componentPlan`,**不**重新 derive `visualView` / `semanticView`。
   传入物在 hash 校验通过后被原样采用(provenance 见下条)。
5. **输出 manifest 必须标清每个 artifact 是 `provided` 还是 `derived`**(见 §3.2),这样 PR-3 CLI
   复用已有 `design-spec/` 中间物继续跑时,审计链不含糊:谁是这次新生成的、谁是沿用上游的,一目了然。

> 为什么 flexible 比 `designIr`-only 更适合 5D:CLI 有两个真实入口 —— 全链从 `.sketch` 跑、以及
> 复用已有 `design-spec/` 中间物继续跑。只要 hash-chain(约束 2)与 provenance(约束 4/5)写死,
> flexible 不削弱契约,反而更贴近实际工作流。`designIr`-only 会逼 CLI 复用中间物时自己 re-derive,
> 丢掉"已审过的中间物"这层语义。

`runContract` 是纯函数:同输入 ⇒ 字节级相同输出。任何时钟 / 路径 / 落盘都在 CLI 层。

## 3. 核心决策

### 3.1 core 不写盘,CLI / skill 负责 IO(writer boundary)

沿用 `runPreview`(core)+ `cli.ts runPreview`(写盘)的既有分层:

- `packages/d2c-core` 只产出内存对象 + 序列化用的 `stableJson`;
- `skills/sketch-to-component/scripts` 负责 `mkdir` / `writeFile` / 路径拼接。

这样 core 保持可在任何环境(浏览器 / worker / 测试)纯函数调用,artifact 落点策略集中在 skill 层,
不会泄漏进共享契约。

### 3.2 稳定 artifact 名称 + 目录布局

core 暴露一组**常量**(名称),skill 层用它们拼路径,避免 Stage 6 路径漂移:

```ts
// packages/d2c-core 暴露(只是名字,不含目录):
export const ARTIFACT_FILENAMES = {
  designIr: 'design-ir.json',
  visualView: 'visual-view.json',
  semanticView: 'semantic-view.json',
  interactionSpec: 'interaction-spec.json',
  componentPlan: 'component-plan.json',
} as const;
```

CLI 落盘布局(在 `--out <dir>` 下):

```text
<out>/
  ir/
    design-ir.json          # 已存在(normalize 产出)
  design-spec/
    visual-view.json
    semantic-view.json
    interaction-spec.json
    component-plan.json
    manifest.json           # 每个 artifact 的 hash + provenance(provided / derived)
```

`manifest.json` 形态(由 `runContract` 在内存里构造,CLI 落盘):

```ts
// 每个 artifact 一条 entry:
{
  filename: string;        // 来自 ARTIFACT_FILENAMES
  hash: string;            // stableSha256(stableJson(artifact))
  origin: 'provided' | 'derived'; // 本次是沿用传入物还是新 derive 的(§2.1 约束 5)
  generatedFrom: {...};    // 该 artifact 的上游 hash 链(原样取自 artifact.generatedFrom)
}
```

`origin` 是审计链的关键:CLI 复用已有中间物继续跑时(§2.1 约束 4),manifest 能直接区分"这次新生成的"
与"沿用上游已审过的"。

> `interaction-coverage.md` 的**生成**留给 Stage 6;5D 只在 `component-plan.body.interactionCoverage`
> 里保留 coverage snapshot(已由 5C 落地),并在 5D 文档里写明 Stage 6 从这里读、不重判。

### 3.3 hash chain 贯穿 + provenance

`runContract` 内部沿用 5A–5C 已建的 hash chain 校验:传入的任何上游 view 必须与重算 hash 一致,
否则 throw(不降级 warning,§2.1 约束 2)。出口每个 artifact 的 `generatedFrom` 带齐它依赖的上游 hash。
`manifest.json` 额外记录每个 artifact 的 `stableSha256(stableJson(artifact))` 与 `origin`
(`provided` / `derived`,§2.1 约束 5),给 Stage 6 做"输入链完整性"校验的锚点。

注意:无论 artifact 是 `provided` 还是 `derived`,它进入 manifest 的 hash 都是对**最终采用的对象**
重算的,所以一个传入但 hash 校验通过的 view 与重新 derive 的同一 view 在 manifest 里 hash 必然一致 ——
`origin` 只记录"这次是怎么来的",不改变 hash 语义。

### 3.4 错误传播

四步任一 throw,`runContract` 直接向上抛(不吞、不降级),错误信息带阶段前缀(已由各 derive 保证)。
CLI 层捕获并以非零 exit code + 可读信息退出(沿用 `cli.ts` 既有 `ExtractError` 处理风格)。

## 4. PR 拆分

### 5D-PR-1 — core `runContract`

文件:

- `packages/d2c-core/src/contract/run-contract.ts`(新)
- `packages/d2c-core/src/contract/__tests__/run-contract.test.ts`(新)
- `packages/d2c-core/src/contract/index.ts`(导出 `runContract` + 类型)

要点:串联四步、flexible 输入(§2.1 五条硬约束)、mode/status 显式、纯函数。
测试:全链 happy path(presentational + interactive)、hash chain mismatch 各步 throw、
**传入已校验中间物时从该点续跑且不重 derive 上游**(断言传入的 view 对象被原样采用、上游 derive
未被再次调用 / 输出与传入完全一致)、**传入 hash 不一致的中间物即 throw(不信任缓存)**、
mode×status 非法组合 throw、determinism(同输入 deep-equal + stableJson 相同)、
warnings 有序合并、错误传播。

### 5D-PR-2 — artifact 路径常量 + writer boundary

文件:

- `packages/d2c-core/src/contract/artifact-paths.ts`(新,导出 `ARTIFACT_FILENAMES` + manifest 类型)
- `packages/d2c-core/src/contract/index.ts`
- `packages/d2c-core/src/contract/__tests__/artifact-paths.test.ts`

要点:常量 + manifest 形态(每条 entry 含 filename / hash / `origin` / generatedFrom 的纯构造
函数,**不写盘**)。
测试:常量稳定、manifest 构造确定性、manifest 覆盖全部五个 artifact、**`origin` 正确区分
provided vs derived**(同一 view 传入 vs 重算时 hash 相同但 origin 不同)。

### 5D-PR-3 — Sketch CLI `contract` 子命令

文件:

- `skills/sketch-to-component/scripts/src/cli.ts`(加 `parseContractArgs` + `runContract` 命令)
- `skills/sketch-to-component/scripts/package.json`(加 `contract` script)
- `skills/sketch-to-component/scripts/src/__tests__/`(CLI arg 解析 + 落盘 manifest 测试)

要点:输入 `--file <.sketch>`(全链)或 `--design-ir <path>`(从 IR 起);`--mode` +
`--interaction-mode` + approval flags;输出到 `<out>/design-spec/`;遵守仓库边界(不依赖
`raw inputs/`,sample 产物 gitignored)。

### 5D-PR-4 — 真实 golden + docs

文件:

- golden fixture(`.sketch` + expected `design-spec/` artifacts,放约定的 fixture 目录)
- `packages/d2c-core/README.md`、Sketch skill docs、必要时 architecture doc
- 可复现性测试:跑两次 `contract`,diff expected golden,断言字节级相同

要点:真实 `.sketch` 端到端;确认链路可重复;文档写清 5D 边界(不生成代码)。

## 5. 测试矩阵

| 文件                     | 测试点                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run-contract.test.ts`   | 全链 presentational / interactive happy path;hash chain 各步 mismatch throw;mode×interaction-status 非法 throw;determinism;warnings 合并;flexible 输入(传入 vs derive 上游) |
| `artifact-paths.test.ts` | 常量稳定;manifest 构造确定性 + 覆盖五 artifact                                                                                                                              |
| CLI 测试                 | `parseContractArgs` 正反例;落盘后 `design-spec/` 含五 artifact + manifest;同输入两跑 diff 空                                                                                |
| golden 测试              | 真 `.sketch` → `design-spec/` 字节级匹配 expected                                                                                                                           |

## 6. 与 Stage 6 边界

留给 Stage 6:

- React / TS / BEM codegen,消费 `component-plan.json`,**不重判** component boundary / mode /
  interaction coverage;
- `interaction-coverage.md` markdown 输出(从 `component-plan.body.interactionCoverage` 读);
- package README banner / file header / `package.json.d2c` presentational 元信息;
- Stage 6 输入链完整校验(用 5D 的 `manifest.json` + 各 `generatedFrom` hash)与 approved
  plan gate。

第一刀建议:React + TS + BEM 最小 codegen skeleton,再逐步接 props / events / assets / layout。

## 7. 验证命令

每个实现 PR 至少跑:

```bash
npm run test:d2c
npm run typecheck
npm run lint
npm run format:check
npm run check:full
```
