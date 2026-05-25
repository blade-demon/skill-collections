# 设计源到组件 — 实施计划

> 本文件是 [`design-source-to-component-architecture.md`](./design-source-to-component-architecture.md)
> （中文版 [`-zh`](./design-source-to-component-architecture-zh.md)）的**落地执行计划与进度追踪**。
> 架构总纲是权威契约；本文件只负责"怎么做、做到哪了"。
>
> 状态图例：✅ 已完成 ｜ 🚧 进行中 ｜ ⬜ 未开始

最后更新：2026-05-23（Stage 4 已完成；仓库质量门禁接入 `check:full` / CI / hooks）

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

| 模块 / 阶段                                              | 归属             | 位置                                          |
| -------------------------------------------------------- | ---------------- | --------------------------------------------- |
| IR schema + 派生视图 schema + `validateDesignIR()`       | 共享             | `packages/d2c-core/src/ir/`                   |
| `Provider` 能力接口（port）                              | 共享             | `packages/d2c-core/src/provider/`             |
| 管线编排 runner + 门禁状态机                             | 共享             | `packages/d2c-core/src/pipeline/`             |
| Visual View 派生 + HTML 预览生成                         | 共享             | `packages/d2c-core/src/preview/`              |
| 标注提取 + 启发式语义 + Semantic View                    | 共享             | `packages/d2c-core/src/semantic/`             |
| 交互建模 + Component Plan 生成                           | 共享             | `packages/d2c-core/src/contract/`             |
| 目标代码生成（React 为首个 target）                      | 共享             | `packages/d2c-core/src/codegen/`              |
| 工程校验（typecheck / build / 截图 diff）                | 共享             | `packages/d2c-core/src/validate/`             |
| 取 raw（provider 专有：文件 / URL / MCP）→ `RawArtifact` | Provider adapter | `skills/<provider>-to-component/scripts/src/` |
| raw → canonical IR 规范化（适配边界）                    | Provider adapter | 同上                                          |
| 资源导出 / 参考帧导出                                    | Provider adapter | 同上                                          |

> 首发 provider = **Sketch**（`skills/sketch-to-component/scripts/`）：Stage 2 已实现 `extractRaw`，
> Stage 3 起的 `normalize` 也确认由 Sketch 承接（2026-05-21）。MasterGo adapter 暂停。`Provider`
> 端口本身 provider 中立 —— 上表的"专有"列指各 provider 各自实现。

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
2. ✅ 根 `package.json` 加 `packages/*` 与 `test:d2c` 脚本；后续仓库加固已把 D2C 类型检查与测试并入
   `check:full`。
3. ✅ `src/ir/`：`version.ts`（版本族 + 粒度化 `isCompatible`：malformed / family-mismatch /
   major-incompatible / minor-incompatible）、`schema.ts`（`DesignIRSchema` 顶层从严、
   `visual`/`semantic` 从宽，`Warning`/`Confidence`/`Annotation` 等稳定基元）、
   `views.ts`（4 个派生视图仅信封 + `generatedFrom`）、`validate.ts`（`validateDesignIR()` /
   `assertDesignIR()`）。
4. ✅ `src/provider/`：能力型 `Provider` 端口 + `RawArtifactSchema`（`capturedAt` 为 ISO datetime）
   - `normalizeAndValidate()` helper。
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

### 阶段 2 — Sketch Provider Raw Extractor（到 `raw-dsl.json`） ✅

> **定位**:Stage 2 是 Sketch provider 的 raw extraction——把本地 `.sketch` 提取成 `RawArtifact`。
> 选 Sketch 先行,是因为 `.sketch` 是公开、本地、可检视的格式,可离线开发与测试、无需服务端往返。
> Stage 2 验证通过后,**Stage 3(normalize)也已确认由 Sketch 承接**(2026-05-21);MasterGo
> normalize 需服务端 raw、无法离线 TDD,暂停。
>
> 已完成:`skills/sketch-to-component/scripts/`,4 测试文件 15 用例,提交 `4e42f80`。

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

### 阶段 3 — Sketch 规范化 → `design-ir.json` ✅（最难）

已完成(提交 `7f1b2eb`,蓝图 `skills/sketch-to-component/docs/stage-3-normalize-outline.md`):

- d2c-core 升 `v0.2.0`:新增 `visual.ts` / `semantic.ts` schema,收紧 `DesignIRSchema`。
- Sketch `normalize`:`select-artboard` / `clean-tree` / `visual` / `symbols` / `names` /
  `semantic` 管线;`SketchProvider` 组装;CLI `normalize` 命令。
- 产物过 `validateDesignIR()`,字节级确定性;脱敏 fixture `sketch-raw.min.json` 入库。
- test:d2c 45 / test:sketch 26 全过。
- **遗留**:symbol `override` 已记录在 `symbol.overrides`,但未应用到 `visual` 树 ——
  Stage 4 预览须消费它,否则被 override 的实例显示 master 默认内容。

### 阶段 4 — 共享：Visual View + HTML 预览 → 门禁 1 ✅

已完成（提交 `556220b`，蓝图 [`stage-4-preview-outline.md`](./stage-4-preview-outline.md)）：

- `d2c-core/src/preview/`：`derive-visual-view`（应用 symbol 文本 override）、`generate-preview`
  （`index.html` / `preview.css` / 占位 `assets/`）、`visual-review-report`、`run-preview`
  （门禁 1 薄入口）；CLI `preview` 子命令。
- core 跑到 Gate 1 返回 `requiresApproval='gate-1'`；确认动作由 skill / CLI 驱动。
- test:d2c 57 / test:sketch 30 全过。
- **Gate-1 评审发现并已修订的设计缺陷**：D1 文字图层 fill 被当成盒子背景、D2 `fills[0]`
  无差别映射成 `background-color` —— 详见 Stage 3 蓝图 §18、Stage 4 蓝图 §15。
- **里程碑：** 发首发 provider 的 `SKILL.md` / 架构文档，描述明确写"仅到预览门禁"。

### 阶段 5 — 共享：语义 / 交互 / 方案 → 门禁 2 ⬜

- `d2c-core`：标注提取器 + 启发式语义推断 + `derive-semantic-view` + 交互建模器
  （草稿 + `confidence`，引擎只起草、开发者补全）+ `component-plan` 生成。
- **产出顺序固定为：** `semantic-view.json` → `interaction-spec.json`（带显式
  `status`） → `component-plan.json`（固化 `mode`）。
- `interaction-spec.json` 是必需工件，缺文件即报错。`status` 取
  `draft | in-review | approved | omitted | deferred`，其中 `approved | omitted | deferred`
  能过门禁 2；`omitted`/`deferred` 都要求填 `reason`、`approvedBy` 与 `approvedAt`。
- `component-plan.json` 携带 `status: 'draft' | 'in-review' | 'approved'` 与
  `mode: 'presentational' | 'interactive'`，门禁 2 审批记录里带 `level` 字段（不开两个 gate id）。
  允许组合详见架构总纲
  "Interaction status and codegen mode" 节。
- Stage 5 输出形成 hash 链:`design-ir` → `visual-view` → `semantic-view` →
  `interaction-spec` → `component-plan`。`approvedAt` 是审计元数据,不参与 contract hash。
- Gate 2 同样由 pipeline 返回 `requiresApproval`，交互留给 skill / CLI。

### 阶段 6 — 共享：目标代码生成 → `output/package/` ⬜

- `d2c-core` 的 `src/codegen/react/`，置于 `TargetGenerator` 抽象之下（首版只实现 React + TS + BEM）。
- 严格按总纲目录结构与 barrel 导出形态。
- Codegen **只消费 `component-plan.mode`**，不接收外部 mode 参数。两档输出：
  - `mode === 'interactive'` —— 完整业务组件包；要求
    `interaction-spec.status === 'approved'`。
  - `mode === 'presentational'` —— 视觉级包，行为占位；要求
    `interaction-spec.status` 为 `omitted` 或 `deferred`。必须落齐四处元信息
    （`package.json` `d2c` 块 / README banner / 每文件头注释 /
    `interaction-coverage.md`），详见架构总纲 "Presentational package metadata" 节。
- presentational → interactive 升级时原地重写 `output/package/`，并**再过一次门禁 2**。
  不维护并行的 `output/package@presentational/` 目录。

### 阶段 7 — 共享：工程校验 + 收尾 ⬜

- `d2c-core`：typecheck / build / 截图 diff。
- 首发 provider 的 `SKILL.md` 升级为完整管线描述。
- 已提前完成的仓库级质量门禁：root `lint` / `format:check` / `typecheck` / `test:all` /
  `build:samples` / `check:fixtures` / `check:full`，并接入 GitHub Actions 与 `lefthook`。

### 阶段 8 — 后置：消费侧防线 ⬜（非阻断）

- `check:d2c-consumption`：扫描业务代码，flag 任何 import 自
  `package.json.d2c.mode === 'presentational'` 包的位置。允许的场景（sandbox /
  Storybook / demo / 视觉评审）通过 allowlist 放行。
- 该项是对 Stage 6 四处包内元信息的加固，不阻断 Stage 6 交付。

---

## 3. 仓库现存遗漏项（实施时一并处理）

1. **mastergo `scripts/` 未脚手架**——只有空 `src/.gitkeep`、`tests/fixtures/`，无
   `package.json`/`tsconfig`/`vitest.config`。→ 待 MasterGo provider 阶段补。
2. ✅ **根 `workspaces` 覆盖已补齐**：当前覆盖 `packages/*`、`skills/*`、
   `skills/image-to-component/scripts`、`skills/sketch-to-component/scripts`、`samples/*/*`。
3. ✅ **根质量脚本已补齐**：`typecheck` 覆盖 d2c / image / sketch / html；`test:all` 覆盖 skills /
   samples / d2c；`check:full` 再追加 samples build 与 fixture lint/build。
4. ✅ **`README.md` 与 `repo-workflow.md`** —— 已同步:术语更新、布局树补 `packages/` 与各
   skill、provider 状态对齐(阶段 0 + 后续一致性修订完成)。
5. ✅ **sketch 脚本残缺已清理**：阶段 2 已重做 `scripts/package.json`、`src/cli.ts`、raw extract；
   阶段 3/4 已补 `normalize` 与 `preview` 命令，旧 sketch IR 已移除。
6. ✅ **CI 已接入**：GitHub Actions 使用 `npm ci`、`npm ci --prefix fixtures`、`npm run check:full`。

---

## 4. 下一步

阶段 0–4 已完成(d2c-core v0.2.0 契约 + Sketch raw extractor + normalize + Visual View
预览门禁)。Stage 4 Gate-1 评审发现的 D1/D2 缺陷已修订(见各阶段蓝图"缺陷修订"节)。

**进 Stage 5 前先做一轮 IR 保真修复。** Post-Stage-4 审计查出 6 条会污染 codegen 的 A 类缺陷
(见 [`stage-3-ir-fidelity-audit.md`](../skills/sketch-to-component/docs/stage-3-ir-fidelity-audit.md)),
按批次推进:

1. **Batch 1**(必修,小而准):A1 行高 / A2 字重 / A3 渐变保留 —— 改 `extractText` /
   `normalizeFills`,补单测。
2. **Batch 2**(必修,**单独做**):A5 symbol 实例缩放时子节点坐标换算 —— 需专门 fixture +
   回归测试。
3. **Batch 3**(schema 设计先行):A4 蒙版 / 裁剪建模 —— 先定 `VisualNode` mask 语义。
4. **Batch 4**(已知限制,顺延):A6 部分 symbol override。

⚠️ **A5 是 Stage 5 前置阻断项**:symbol 缩放不修,semantic / component-plan 会基于错位
子树做错误抽象。Batch 1→2 修完方可进 **阶段 5 — 语义视图 / 交互规格 / 组件方案(门禁 2)**
(Batch 3 可顺延);Stage 5 开工前先出蓝图供 review,蓝图须开一节承接 B 类"布局推断能力缺口"。

⚠️ **presentational 模式不绕过 A5。** Stage 6 的 presentational 档绕开的是
`interaction-spec` 的完整建模(走 `omitted` / `deferred` 通道),不是 IR 保真审计。
symbol 缩放错位会污染 visual-view 与 semantic-view 的组件边界判断,任何 mode 的
codegen 输出都会被带坏。Batch 2 仍是 Stage 5 / Stage 6 通用硬前置。

## 5. 贯穿原则

- **垂直切片**：用参考设计端到端跑(本轮用 `d2c.sketch`)，不要把单阶段做到完美再下一步。
- **离线优先**：raw DSL 落 fixture，除提取器外所有阶段离线可测；测试不访问网络。
- **保持克制**：没有真实 DSL fixture 前不要把 `semantic` / `interaction` 模型定死。
- **门禁即发布里程碑**：做到门禁 1 即发 `SKILL.md`（标注能力边界），不等全链路。
- **每阶段产物都过 schema 校验**，派生视图亦然。
- 先把单个 provider 的一条垂直切片端到端跑通(本轮从 Sketch raw extraction 起步)；其余 provider 与中性化后置。
