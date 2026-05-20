# 设计源到组件 — 实施计划

> 本文件是 [`design-source-to-component-architecture.md`](./design-source-to-component-architecture.md)
> （中文版 [`-zh`](./design-source-to-component-architecture-zh.md)）的**落地执行计划与进度追踪**。
> 架构总纲是权威契约；本文件只负责"怎么做、做到哪了"。
>
> 状态图例：✅ 已完成 ｜ 🚧 进行中 ｜ ⬜ 未开始

最后更新：2026-05-20（已并入用户对实施计划的 10 条评审意见）

---

## 0. 关键前提决策（已确认）

子文档（`mastergo` 架构文档、`sketch` SKILL.md）都已声明 canonical IR、预览、门禁、校验
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
| URL 解析 / 鉴权 / 拉取 raw DSL | MasterGo provider | `skills/mastergo-to-component/scripts/src/` |
| raw DSL → canonical IR 规范化（适配边界） | MasterGo provider | 同上 `normalize-design-ir.ts` |
| 资源导出 / 参考帧导出 | MasterGo provider | 同上 |

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
- `normalize-design-ir.ts` 留在 provider（必须懂 MasterGo 节点类型），但导入 core 的 IR schema。

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

### 阶段 1 — 建立共享管线 + IR 契约 ⬜（最关键，保持克制）

1. 新建 `packages/d2c-core/` workspace：`package.json`（`@skill-collections/d2c-core`、
   `type: module`、`zod`、`tsx`、`vitest`、`typescript`）、`tsconfig.json`、`vitest.config.ts`
   ——复用 `skills/sketch-to-component/scripts/` 的配置惯例（ES2022 / ESNext / Bundler / strict /
   noUncheckedIndexedAccess）。
2. 根 `package.json` 的 `workspaces` **只加 `packages/*`**（`skills/*/scripts` 暂不纳入，见第 3 节 #2），
   并加 `test:d2c` 脚本。
3. `src/ir/`：Zod `DesignIRSchema`。
   - **顶层信封从严**：`schemaVersion`、`source`（含 trace）、`warnings` 严格校验。
   - **内层从宽**：`visual` / `semantic` / `interaction` 在拿到真实 DSL fixture 前**不要定死**，
     先用 `confidence` / `warnings` / `annotations` / `candidates` 这种可扩展形态承接。
   - 派生视图 schema：`VisualView` / `SemanticView` / `InteractionSpec` / `ComponentPlan`。
   - `validateDesignIR()` + `schemaVersion` 兼容校验。
4. `src/provider/`：定义能力型 `Provider` 端口接口（见第 1 节边界约束）。
5. vitest 单测覆盖 schema 与 validator。纯类型与校验，不碰网络。

**阶段 1 出口标准：**
- `npm run test:d2c` 通过；
- 根 workspace `npm install` 正常；
- 最小 IR fixture 可被 `validateDesignIR()` parse；
- 错误的 `schemaVersion` 会校验失败；
- 缺 `source` trace 会校验失败；
- 测试全程不访问网络。

### 阶段 2 — MasterGo Provider 提取器（到 `raw-dsl.json`） ⬜

1. **脚手架 `skills/mastergo-to-component/scripts/`**——目前只有空 `.gitkeep`，需补
   `package.json` / `tsconfig.json` / `vitest.config.ts`。
2. 把 `skills/mastergo-to-component/scripts` 作为**具体路径**加入根 `workspaces`（不是
   `skills/*/scripts` 通配），使其可 `import @skill-collections/d2c-core`，同时把 sketch/image
   的半成品 scripts 挡在外面。
3. `parse-url.ts`：解析 MasterGo URL、decode `layer_id`。
4. `fetch-dsl.ts`：读 `MASTERGO_TOKEN`（绝不打印）、拉 DSL、按总纲"错误与中止语义"做错误分类。
5. **fixture 策略（脱敏）**：
   - 先用**私有、git-ignored** 的完整 raw DSL fixture 跑通；为 `scripts/tests/fixtures/` 加 `.gitignore`。
   - 之后再提交一份**最小化、脱敏、可复现**的 fixture 作为回归基线。
   - 不直接提交完整设计稿原始数据。

参考设计 URL：
`https://mastergo.com/file/192813714739577?fileOpenFrom=home&page_id=M&devMode=true&layer_id=2%3A0031`
（`layer_id=2:0031` 历史上对应根页面 `财资小助手对话页`）

### 阶段 3 — MasterGo 规范化 → `design-ir.json` ⬜（最难）

- `normalize-design-ir.ts`：清理节点树、零标注启发式识别语义候选、抽取文本、生成稳定命名、
  记录 assets/warnings；实现 core 的 `Provider.normalize`。
- 对 fixture 做 TDD，断言产出**通过 `d2c-core` 的 `validateDesignIR()`**。
- 补 `export-assets.ts`、`export-reference-frame.ts`、`write-provider-artifacts.ts`、provider `cli.ts`。
- 先让参考设计产出一份合法 IR，不追求完美。

### 阶段 4 — 共享：Visual View + HTML 预览 → 门禁 1 ⬜

- `d2c-core` 的 `derive-visual-view.ts` + `generate-preview.ts`
  （`index.html` / `preview.css` / `assets/` / `visual-review-report.md`）。
- core pipeline runner 跑到 Gate 1 时返回 `requiresApproval`；确认动作由 skill / CLI 驱动。
- **里程碑：** 发首版 `mastergo-to-component/SKILL.md`，描述明确写"仅到预览门禁"。

### 阶段 5 — 共享：语义 / 交互 / 方案 → 门禁 2 ⬜

- `d2c-core`：标注提取器 + 启发式语义推断 + `derive-semantic-view` + 交互建模器
  （草稿 + `confidence`，引擎只起草、开发者补全）+ `component-plan` 生成。
- Gate 2 同样由 pipeline 返回 `requiresApproval`，交互留给 skill / CLI。

### 阶段 6 — 共享：目标代码生成 → `output/package/` ⬜

- `d2c-core` 的 `src/codegen/react/`，置于 `TargetGenerator` 抽象之下（首版只实现 React + TS + BEM）。
- 严格按总纲目录结构与 barrel 导出形态。

### 阶段 7 — 共享：工程校验 + 收尾 ⬜

- `d2c-core`：typecheck / build / 截图 diff。
- 接入根 `npm run check`；`mastergo SKILL.md` 升级为完整管线描述。

---

## 3. 仓库现存遗漏项（实施时一并处理）

1. **mastergo `scripts/` 未脚手架**——只有空 `src/.gitkeep`、`tests/fixtures/`，无
   `package.json`/`tsconfig`/`vitest.config`。→ 阶段 2 补。
2. **根 `workspaces` 不覆盖**：当前是 `skills/*` + `samples/*/*`，不含 `packages/*`，也不含
   `skills/*/scripts/` 子包。→ 阶段 1 加 `packages/*`；阶段 2 单独加 mastergo scripts 具体路径。
   sketch/image 的 scripts 有半成品和独立 lockfile，**暂不纳入根 workspace / 根 check**，
   待其脚手架稳定后再议。
3. **根 `test:skills` 写死**只跑 `design-to-spec` + `html-article-to-markdown`，新测试套件不会进
   `npm run check`。→ 阶段 1 加 `test:d2c`；阶段 7 并入 `check`。
4. **`README.md` 与 `repo-workflow.md` 陈旧**：README 第 78 行旧术语、布局树漏 sketch；
   两者 §布局都需补 `packages/`。→ 阶段 0。
5. **sketch 脚本残缺**：`scripts/package.json` 的 `extract`/`generate`/`e2e` 指向不存在的
   `src/cli.ts`；`src/ir/schema.ts`（仅 Color/Rect）是旧 sketch IR，与 canonical d2c-core IR
   重叠且过时。→ 后续 Sketch provider 阶段清理；阶段 0 先标注，勿误当现成实现。
6. **无 CI**（repo-workflow §8）——非阻断，阶段 7 可选把 `npm run check` 提升为 GitHub Actions。

---

## 4. 下一步

执行**阶段 1**：搭 `packages/d2c-core/`（`@skill-collections/d2c-core`）workspace、IR Zod schema
（顶层严、内层宽）、能力型 `Provider` 接口、vitest 测试，并把 `packages/*` 加进根 `package.json`
的 `workspaces` + 加 `test:d2c` 脚本。完成后对照第 2 节"阶段 1 出口标准"逐条核验。

## 5. 贯穿原则

- **垂直切片**：始终用参考 MasterGo URL 端到端跑，不要把单阶段做到完美再下一步。
- **离线优先**：raw DSL 落 fixture，除提取器外所有阶段离线可测；测试不访问网络。
- **保持克制**：没有真实 DSL fixture 前不要把 `semantic` / `interaction` 模型定死。
- **门禁即发布里程碑**：做到门禁 1 即发 `SKILL.md`（标注能力边界），不等全链路。
- **每阶段产物都过 schema 校验**，派生视图亦然。
- 先 MasterGo 单 provider 跑通；Figma/Sketch 与中性化按迁移路径 #5–6 后置。
