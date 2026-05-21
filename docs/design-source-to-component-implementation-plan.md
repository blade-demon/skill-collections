# 设计源到组件 — 实施计划

> 本文件是 [`design-source-to-component-architecture.md`](./design-source-to-component-architecture.md)
> （中文版 [`-zh`](./design-source-to-component-architecture-zh.md)）的**落地执行计划与进度追踪**。
> 架构总纲是权威契约；本文件只负责"怎么做、做到哪了"。
>
> 状态图例：✅ 已完成 ｜ 🚧 进行中 ｜ ⬜ 未开始

最后更新：2026-05-21（Sketch-first 调整、Stage 3 选项 A、多轮文档一致性修订）

---

## 0. 关键前提决策（已确认）

子文档（`mastergo` / `sketch` 架构文档）都已声明 canonical IR、预览、门禁、校验
"属于 shared pipeline"，但该 shared pipeline 在仓库里**没有代码落点**。`docs/repo-workflow.md` §7
已预留 `packages/` 作为共享代码的家。

**决策（已通过）：** 新建 npm workspace 包承载共享管线。
- 包名用 scoped 名称 **`@skill-collections/d2c-core`**（workspace import 更清晰，且区分内部包）。
- `design-ir.json` 的 Zod schema 放 `d2c-core`，**不放 mastergo provider**。
- 命名 `d2c-core` 为定稿值。

---

## 1. 所有权划分

只有"提取 + 规范化"是 provider 私有；**`design-ir.json` 之后的一切都是共享的**。

| 模块 / 阶段 | 归属 | 位置 |
|---|---|---|
| IR schema + 派生视图 schema + `validateDesignIR()` | 共享 | `packages/d2c-core/src/ir/` |
| `Provider` 能力接口（port） | 共享 | `packages/d2c-core/src/provider/` |
| 管线编排 runner + 门禁状态机 | 共享 | `packages/d2c-core/src/pipeline/` |
| Visual View 派生 + HTML 预览生成 | 共享 | `packages/d2c-core/src/preview/` |
| 标注提取 + 启发式语义 + Semantic View | 共享 | `packages/d2c-core/src/semantic/` |
| 交互建模 + Component Plan 生成 | 共享 | `packages/d2c-core/src/contract/` |
| 目标代码生成（React 为首个 target） | 共享 | `packages/d2c-core/src/codegen/` |
| 工程校验（typecheck / build / 截图 diff） | 共享 | `packages/d2c-core/src/validate/` |
| 取 raw（provider 专有：文件 / URL / MCP）→ `RawArtifact` | Provider adapter | `skills/<provider>-to-component/scripts/src/` |
| raw → canonical IR 规范化（适配边界） | Provider adapter | 同上 |
| 资源导出 / 参考帧导出 | Provider adapter | 同上 |

> Stage 2 首个 **raw-extraction** provider = **Sketch**（`skills/sketch-to-component/scripts/`，
> 本轮只实现 `extractRaw`）；MasterGo adapter 暂停。**Stage 3 起 normalize 的 provider 仍待定
> (选项 A)** —— 这里不代表 Sketch 已占定完整 pipeline。`Provider` 端口本身 provider 中立。

### 关键边界约束

- **`Provider` 接口做成能力型**，不强制所有 provider 实现完整同步接口：
  - 必选：`extractRaw()`、`normalize()`
  - 可选：`exportAssets?()`、`exportReferenceFrame?()`
  - `normalize()` 输出**必须通过 core 的 `validateDesignIR()`**。
  - 这样 MasterGo / Sketch / 未来 Figma 的能力差异可被优雅承接（如某 provider 无法导出参考帧，
    截图 diff 按总纲降级为"带 warning 跳过"）。
- **core runner 不负责人机交互**：`pipeline/` 负责状态机、阶段编排、产物写入，并在门禁处返回
  `requiresApproval` + 可恢复状态；"用户如何确认 Gate 1 / Gate 2" 留给 skill / CLI 层。
  否则 core 会过早绑定到某种交互方式。
- **codegen 留 target 扩展口**：即使首版只做 React，core 内也按 `src/codegen/react/` +
  `TargetGenerator` 抽象组织，避免 `d2c-core` 语义上变成 React-only。
- raw → canonical IR 的 `normalize` 留在 provider（必须懂对应 provider 的节点类型，如 Sketch 的
  `_class` 树、MasterGo 的 DSL 节点），但导入 core 的 IR schema。

---

## 2. 实施阶段

### 阶段 0 — 文档同步 ✅

- ✅ `skills/mastergo-to-component/docs/architecture-design.md` 已改为引用总纲
- ✅ `skills/sketch-to-component/` 已重定位为 provider 适配器：原 `SKILL.md` 降级为
  `docs/architecture-design.md`（与 mastergo 一致，实现就绪前不可发现），触发短语问题随之消解
- ✅ `skills/image-to-component/SKILL.md` 已重定位为"截图到骨架"，并路由设计源到 design-source workflow
- ✅ **`README.md` 同步**：修正旧术语 "Stable Design IR"、布局树补 `sketch-to-component`、
  Quick map 与 Status 补实施计划链接（`packages/*` 的 workspace 说明随阶段 1 落地一并更新）
- ✅ **`docs/repo-workflow.md` §1 同步**：布局树补 image/mastergo/sketch 三个 skill 与 docs/ 清单
  （`packages/` 与 §7 随阶段 1 落地一并更新）

### 阶段 1 — 建立共享管线 + IR 契约 ✅

已落地 `packages/d2c-core/`（`@skill-collections/d2c-core`，source-only 内部包，无 `dist/`）：

1. ✅ workspace 配置（`package.json` / `tsconfig.json` / `vitest.config.ts` / `README.md`），
   复用 sketch scripts 的 TS/vitest 惯例。
2. ✅ 根 `package.json` 加 `packages/*` 与 `test:d2c` 脚本（未并入 `check`）。
3. ✅ `src/ir/`：`version.ts`（版本族 + 粒度化 `isCompatible`：malformed / family-mismatch /
   major-incompatible / minor-incompatible）、`schema.ts`（`DesignIRSchema` 顶层从严、
   `visual`/`semantic` 从宽，`Warning`/`Confidence`/`Annotation` 等稳定基元）、
   `views.ts`（4 个派生视图仅信封 + `generatedFrom`）、`validate.ts`（`validateDesignIR()` /
   `assertDesignIR()`）。
4. ✅ `src/provider/`：能力型 `Provider` 端口 + `RawArtifactSchema`（`capturedAt` 为 ISO datetime）
   + `normalizeAndValidate()` helper。
5. ✅ vitest 单测 6 文件 40 用例;模块级 + 根 barrel。

**阶段 1 出口标准（全部已验证 ✅，2026-05-20）：**
- ✅ `npm run test:d2c` 通过 — 6 文件 40/40；
- ✅ 根 workspace `npm install` 正常 — 71 包，11s；
- ✅ 最小 IR fixture 可被 `validateDesignIR()` parse；
- ✅ 错误 / 畸形的 `schemaVersion` 会校验失败；
- ✅ 缺 `source` trace（`source.ref` 空 / 缺 `source`）会校验失败；
- ✅ 测试全程不访问网络（纯函数）；
- ✅ 附加：`tsc --noEmit` 类型检查通过。

**阶段 1 后代码评审加固（已并入，40/40 通过）：** 抽出共享 `TraceRefSchema`（`source.ref`
与 `RawArtifact.ref` 同用、非空）；`RawArtifact.payload` 显式拒绝缺失 / `undefined`；
`DesignIRSchema.schemaVersion` 加格式 regex（schema 管格式、`isCompatible` 管语义）；
`normalizeAndValidate()` 增加 raw 校验 + provider id 一致性检查；补 `views` / `raw-artifact`
测试；`interaction-spec` / `component-plan` 统一 `ContractStatusSchema`。

### 阶段 2 — Sketch Provider Raw Extractor（探针，到 `raw-dsl.json`） 🚧

> **定位(选项 A)**:本轮是 Sketch provider 的 raw extraction 探针——把本地 `.sketch` 提取成
> `RawArtifact`。选 Sketch 先行,是因为 `.sketch` 是公开、本地、可检视的格式,`extractRaw` 能
> 离线开发与测试、无需服务端往返。**Stage 3(normalize)起由哪个 provider 承载,待本轮跑通后
> 再定**;本轮不预先承诺完整 pipeline。注:Sketch 是当前**唯一离线可行**的 normalize 候选——
> MasterGo normalize 需服务端 raw、无法离线 TDD。

详细蓝图见 [`../skills/sketch-to-component/docs/stage-2-extract-raw-outline.md`](../skills/sketch-to-component/docs/stage-2-extract-raw-outline.md)。

1. 清理现有 `skills/sketch-to-component/scripts/`:删旧 `src/ir/`(Color/Rect)、删独立
   `package-lock.json`;`package.json` 改 scoped 名 `@skill-collections/sketch-to-component-scripts`,
   依赖 `@skill-collections/d2c-core` + `fflate`。
2. 把 `skills/sketch-to-component/scripts` 作为**具体路径**加入根 `workspaces`;根加 `test:sketch`。
3. `open-sketch-file.ts` / `acquire-from-file.ts` / `extract-raw.ts` / `cli.ts` —— `.sketch`
   → `SketchRawModel` → `RawArtifact` → 写 `raw-dsl.json`;采集缝(判别联合)为后续 MCP 预留。
4. 离线单测(合成 fixture)+ 真实 `d2c.sketch` 端到端验证。
5. 参考文件 `/Users/blade/Desktop/d2c.sketch` 保持私有、git-ignored;真实 `raw-dsl.json` 含绝对
   路径与设计内容,同样不入库;提交的回归 fixture 用脱敏最小化版本。

MasterGo provider(`parse-url` / `fetch-dsl` / `MASTERGO_TOKEN`)后置,待其服务端 DSL 契约能
稳定取得后再做。

### 阶段 3 — 规范化 → `design-ir.json` ⬜（最难;provider 待定）

- **首发 provider 待 Stage 2 跑通后再定**(选项 A)。Sketch 是当前唯一离线可行的 normalize
  候选(`.sketch` 可检视、fixture 友好);MasterGo normalize 需服务端 raw、无法离线 TDD。
- 实现 `Provider.normalize`:raw → canonical `design-ir.json` —— 清理节点树、零标注启发式
  识别语义候选、抽取文本、生成稳定命名、记录 assets/warnings。
- 对脱敏 fixture 做 TDD，断言产出**通过 `d2c-core` 的 `validateDesignIR()`**。
- 此处才把 raw model 的内层(如 `SketchRawModel` 的 `_class` 树)真正展开。

### 阶段 4 — 共享：Visual View + HTML 预览 → 门禁 1 ⬜

- `d2c-core` 的 `derive-visual-view.ts` + `generate-preview.ts`
  （`index.html` / `preview.css` / `assets/` / `visual-review-report.md`）。
- core pipeline runner 跑到 Gate 1 时返回 `requiresApproval`；确认动作由 skill / CLI 驱动。
- **里程碑：** 发首发 provider 的 `SKILL.md` / 架构文档，描述明确写"仅到预览门禁"。

### 阶段 5 — 共享：语义 / 交互 / 方案 → 门禁 2 ⬜

- `d2c-core`：标注提取器 + 启发式语义推断 + `derive-semantic-view` + 交互建模器
  （草稿 + `confidence`，引擎只起草、开发者补全）+ `component-plan` 生成。
- Gate 2 同样由 pipeline 返回 `requiresApproval`，交互留给 skill / CLI。

### 阶段 6 — 共享：目标代码生成 → `output/package/` ⬜

- `d2c-core` 的 `src/codegen/react/`，置于 `TargetGenerator` 抽象之下（首版只实现 React + TS + BEM）。
- 严格按总纲目录结构与 barrel 导出形态。

### 阶段 7 — 共享：工程校验 + 收尾 ⬜

- `d2c-core`：typecheck / build / 截图 diff。
- 接入根 `npm run check`；首发 provider 的 `SKILL.md` 升级为完整管线描述。

---

## 3. 仓库现存遗漏项（实施时一并处理）

1. **mastergo `scripts/` 未脚手架**——只有空 `src/.gitkeep`、`tests/fixtures/`，无
   `package.json`/`tsconfig`/`vitest.config`。→ 待 MasterGo provider 阶段补。
2. **根 `workspaces` 不覆盖**：阶段 1 已加 `packages/*`；阶段 2 单独加
   `skills/sketch-to-component/scripts` 具体路径。image 的 scripts 仍有独立 lockfile，
   **暂不纳入根 workspace**，待其稳定后再议。
3. **根 `test:skills` 写死**只跑 `design-to-spec` + `html-article-to-markdown`，新测试套件不会进
   `npm run check`。→ 阶段 1 加 `test:d2c`；阶段 7 并入 `check`。
4. ✅ **`README.md` 与 `repo-workflow.md`** —— 已同步:术语更新、布局树补 `packages/` 与各
   skill、provider 状态对齐(阶段 0 + 后续一致性修订完成)。
5. **sketch 脚本残缺**：`scripts/package.json` 的 `extract`/`generate`/`e2e` 指向不存在的
   `src/cli.ts`；`src/ir/schema.ts`（仅 Color/Rect）是旧 sketch IR，与 canonical d2c-core IR
   重叠且过时。→ **阶段 2 清理重做**(见 Stage 2 蓝图)。
6. **无 CI**（repo-workflow §8）——非阻断，阶段 7 可选把 `npm run check` 提升为 GitHub Actions。

---

## 4. 下一步

阶段 0、阶段 1 已完成。执行**阶段 2 — Sketch Provider Raw Extractor**:清理并重做
`skills/sketch-to-component/scripts/`,实现 `.sketch` → `RawArtifact` → `raw-dsl.json`。
详细蓝图见 [`../skills/sketch-to-component/docs/stage-2-extract-raw-outline.md`](../skills/sketch-to-component/docs/stage-2-extract-raw-outline.md)。

## 5. 贯穿原则

- **垂直切片**：用参考设计端到端跑(本轮用 `d2c.sketch`)，不要把单阶段做到完美再下一步。
- **离线优先**：raw DSL 落 fixture，除提取器外所有阶段离线可测；测试不访问网络。
- **保持克制**：没有真实 DSL fixture 前不要把 `semantic` / `interaction` 模型定死。
- **门禁即发布里程碑**：做到门禁 1 即发 `SKILL.md`（标注能力边界），不等全链路。
- **每阶段产物都过 schema 校验**，派生视图亦然。
- 先把单个 provider 的一条垂直切片端到端跑通(本轮从 Sketch raw extraction 起步)；其余 provider 与中性化后置。
