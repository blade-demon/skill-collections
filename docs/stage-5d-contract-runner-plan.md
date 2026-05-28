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

> **设计决策(待 plan review 拍板):** runContract 接受**可选预算上游 view**(只有 `designIr`
> 必填),缺省的 view 内部 derive,传入的 view 走 hash chain 校验。理由:5D-PR-3 CLI 需要支持
> "从 `.sketch` 全链生成" 和 "复用已有中间物"(例如已审过的 `semantic-view.json`)两种入口,
> flexible 输入直接覆盖。若 review 倾向更窄的 `designIr`-only 入口,可在 PR-1 收窄,代价是 CLI
> 复用中间物时要自己 re-derive。
>
> mode / interactionMode / approval **由 caller 显式传入**,runContract 不内置默认 policy
> (承接 5C §3.2 "非法组合直接 throw" 的确定性原则)。

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
    manifest.json           # 列出本次产出的 artifact + 各自 hash,便于 Stage 6 校验链
```

> `interaction-coverage.md` 的**生成**留给 Stage 6;5D 只在 `component-plan.body.interactionCoverage`
> 里保留 coverage snapshot(已由 5C 落地),并在 5D 文档里写明 Stage 6 从这里读、不重判。

### 3.3 hash chain 贯穿

`runContract` 内部沿用 5A–5C 已建的 hash chain 校验:传入的任何上游 view 必须与重算 hash 一致,
否则 throw(不降级 warning)。出口每个 artifact 的 `generatedFrom` 带齐它依赖的上游 hash。
`manifest.json` 额外记录每个 artifact 的 `stableSha256(stableJson(artifact))`,给 Stage 6 做
"输入链完整性" 校验的锚点。

### 3.4 错误传播

四步任一 throw,`runContract` 直接向上抛(不吞、不降级),错误信息带阶段前缀(已由各 derive 保证)。
CLI 层捕获并以非零 exit code + 可读信息退出(沿用 `cli.ts` 既有 `ExtractError` 处理风格)。

## 4. PR 拆分

### 5D-PR-1 — core `runContract`

文件:

- `packages/d2c-core/src/contract/run-contract.ts`(新)
- `packages/d2c-core/src/contract/__tests__/run-contract.test.ts`(新)
- `packages/d2c-core/src/contract/index.ts`(导出 `runContract` + 类型)

要点:串联四步、flexible 输入、mode/status 显式、纯函数。
测试:全链 happy path(presentational + interactive)、hash chain mismatch 各步 throw、
mode×status 非法组合 throw、determinism(同输入 deep-equal + stableJson 相同)、
warnings 有序合并、错误传播。

### 5D-PR-2 — artifact 路径常量 + writer boundary

文件:

- `packages/d2c-core/src/contract/artifact-paths.ts`(新,导出 `ARTIFACT_FILENAMES` + manifest 类型)
- `packages/d2c-core/src/contract/index.ts`
- `packages/d2c-core/src/contract/__tests__/artifact-paths.test.ts`

要点:常量 + manifest 形态(artifact 名 → hash 映射的纯构造函数,**不写盘**)。
测试:常量稳定、manifest 构造确定性、manifest 覆盖全部五个 artifact。

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
