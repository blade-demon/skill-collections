---
name: react-spring-project-doc
metadata:
  version: 0.1.0
  compatibility:
    - claude-code # 原生支持：文件读写 / Glob / Grep / 分阶段会话
    - opencode # 原生支持：AGENTS.md 项目上下文 / SQLite 会话持久化 / Plan 模式
description: 当用户希望对一个已存在的 React 前端 + Java Spring / Spring Boot 后端代码仓库做静态分析，分阶段产出面向新人的上手文档、Mermaid 运行时交互架构图、前后端模块分析、API 映射表、核心业务链路、数据模型，以及基于代码证据、可溯源的校验报告时使用。仅处理现有代码仓库；不处理设计稿或 UI 截图，不生成知识图谱、独立图片或部署拓扑；也不用于纯目录树总结、单文件解释、或与代码库无关的写作。
---

# react-spring-project-doc — 代码库到新人文档的分阶段向导

把一个 React 前端 + Java Spring/Spring Boot 后端的项目，转换成一套面向新入职同事、**基于代码证据**的项目文档。

**核心架构**：用确定性的「分阶段状态机」包住不确定的 LLM 推断。每个阶段只做一件事、只看一组相关文件、把结论落盘到 `docs/.analysis/`，并把每条重要结论登记进 **evidence ledger（证据账本）**。最终文档只允许由中间产物和证据账本生成，绝不直接从「读了一遍代码的记忆」里写。

> **为什么这样设计**：目标模型可能上下文受限、能力较弱。一条超长 Prompt 会让它一次吞下整个仓库、产生幻觉、且无法恢复。分阶段 + 落盘 + 证据账本让每一步都可单独执行、单独恢复、单独校验。

---

## 流水线总览

```
P1 探索 → P2 前端索引 → P3 后端索引 → P4 API 映射 → P5 业务链路 → P6 数据模型 → P7 文档生成 → P8 强校验
  │           │            │           │            │            │            │            │
01-discovery 02-frontend 03-backend 04-api-map 05-flows   06-data    docs/*.md  validation
.md          -index.md   -index.md  -draft.md  -draft.md  -model.md  (8 份)     -report.md
```

每个阶段的产物都写进目标项目的 `docs/.analysis/`（中间产物，可删可重跑）。第 7 阶段把它们装配成 `docs/` 下的最终文档。第 8 阶段对最终文档做强校验。

**控制流铁律**：

1. 阶段顺序不可跳过。每个阶段的落盘文件是下一阶段的唯一事实源。
2. 每次只执行一个阶段，执行完落盘并停下来汇报，不要连跑。
3. 每个分析阶段只看一组高度相关的文件，**不要一次扫全仓库**。
4. 没有代码证据的结论，禁止写成确定事实（见下方「证据账本」与「置信度规则」）。

---

## 起步：判断当前在哪个阶段（恢复协议）

这个 skill 天然支持中断恢复。**每次被调用时，先按以下顺序判断起点，不要默认从头开始**：

1. 用户是否明确指定了阶段（如「从 Phase 4 继续」「重跑 P2」）？→ 按指定阶段执行。
2. 否则用 Glob 检查 `docs/.analysis/` 下**带序号的阶段产物**（`01-`~`06-` 与 `08-`），按下表判断进度——取**已存在的最高序号**那个，它的下一个阶段就是起点。`evidence-ledger.md`（及可选的 `git-insights.md`、`endpoints-seed.json`）不带序号，**不是阶段进度标记，探测时忽略**（别按文件名排序取「最后一个」，那会把它误当进度）。
   - `06-data-model-draft.md` 存在 → 起点 P7；`docs/` 下 8 份最终文档已存在 → 起点 P8；`08-validation-report-draft.md` 存在 → P8 进行中（按需续跑或重跑）。
3. `docs/.analysis/` 不存在或为空 → 从 P1 开始，先创建该目录。

判断出起点后，输出一行状态再开始：

```
🧭 react-spring-project-doc：检测到 docs/.analysis/ 已有 01~03，从 Phase 4（API 映射）继续。
```

> **不要重复已完成的阶段**。如果 `02-frontend-index.md` 已存在且用户没要求重跑，直接读它作为输入，不要重新扫前端目录。

---

## 输出结构

```
目标项目/
  docs/
    .analysis/                      # 中间产物（事实源，可重跑，不进版本库由用户决定）
      01-discovery-report.md
      02-frontend-index.md
      03-backend-index.md
      04-api-map-draft.md
      05-business-flows-draft.md
      06-data-model-draft.md
      08-validation-report-draft.md
      evidence-ledger.md              # 贯穿全程的证据账本，每阶段追加；无序号，不作为阶段进度标记

    onboarding.md                   # 最终文档（仅 P7 生成，仅来源于上方中间产物）
    architecture.md
    frontend.md
    backend.md
    api-map.md
    business-flows.md
    data-model.md
    troubleshooting.md
    index.json                      # 结构化索引（P7 生成，供 AI 问答；P8 确定性校验）
    ai-context.md                   # AI 上下文摘要（P7 生成，与 index.json 同源）
    validation-report.md            # P8 产出
```

---

## 关键原则（贯穿全部阶段）

1. 不要一次性分析全仓库；每次只看一个模块或一组相关文件。
2. 每次只执行一个 phase，执行完落盘并停下来。
3. 所有阶段结果必须落盘到 `docs/.analysis/`。
4. 所有重要结论必须登记进 `evidence-ledger.md`，并附代码证据。
5. 没有证据的内容不能写成确定事实；推测必须显式标注「推测」；无法确认的进「待确认项」。
6. 最终文档（`docs/*.md`，P7）只能基于 `.analysis` 中间产物和证据账本生成，不得引入新的未登记结论。
7. Mermaid 图只画代码或配置可证实的运行时节点和连线；不完整链路画到最后一个确定节点并标「断点：待确认」，禁止推测补线。
8. **不修改业务代码、不重构业务代码、不新增运行时依赖**。本 skill 只读代码、只写 `docs/`。
9. 全部输出使用简体中文。文档面向新入职同事，要求清晰、具体、可落地。

---

## 证据账本（evidence ledger）

`docs/.analysis/evidence-ledger.md` 是贯穿全程的事实源。**P2~P6 每得到一个会进入最终文档的重要结论，都要在这里追加一条 Evidence 记录**。

每条记录的字段格式见 `schemas/evidence-record.md`；填好的样例见 `examples/evidence-ledger-example.md`。核心字段：结论 / 类型 / 文件路径 / 符号（类·方法·组件）/ 证据说明 / 置信度 / 状态 / 是否允许进入最终文档。

**置信度规则**：

| 置信度 | 判据                                             | 可否写成确定事实       |
| ------ | ------------------------------------------------ | ---------------------- |
| 高     | 有明确的代码调用、注解、配置、测试或类型定义支持 | 可                     |
| 中     | 只能通过命名、目录结构、调用关系合理推断         | 需标注「推测」         |
| 低     | 代码证据不足                                     | 否，只能进「待确认项」 |

低置信度内容**不得**在最终文档里写成确定事实。详见 `references/confidence-and-evidence.md`。

---

## 各阶段执行说明

每个阶段：① 读上一阶段产物作为输入 → ② 按 template 只做该阶段那一件事 → ③ 把结论写进对应 `.analysis` 产物 + 追加证据账本 → ④ 汇报并停下。**执行某阶段前，加载对应 template；执行完即释放，不跨阶段保留全文。**

### Phase 1 — Discovery / 代码库探索

**目标**：建立代码库地图，不写最终文档，不改业务代码。
**输入**：目标项目根目录。
**做什么**：定位并速读 README、`package.json` + lock、`pom.xml`/`build.gradle`、前端入口/路由/API 封装/状态管理、Spring Boot 启动类、Controller/Service/Repository、Entity/DTO/VO、Config/Interceptor/Filter/ExceptionHandler、安全/鉴权配置、数据库迁移（Flyway/Liquibase）、测试目录、部署与环境配置。**（可选）运行 `scripts/git-insights.js --project <项目根>`**，获取高频改动文件/目录热点/贡献者/CODEOWNERS 信号,填入第 8 节,供 P7 的 onboarding 与 troubleshooting 使用。
**输出**：`docs/.analysis/01-discovery-report.md`。
**模板**：`templates/01-discovery.md`。

### Phase 2 — Frontend Index / 前端索引

**目标**：建立 React 前端模块索引，不做最终文档。
**输入**：`01-discovery-report.md` + 前端源码目录。
**做什么**：（推荐先跑 `scripts/extract-endpoints.js` 生成 `endpoints-seed.json`，把 `frontend[]` 当 API 方法清单基线，再核对。）列出前端入口、路由表、页面模块、组件目录、API 方法列表、状态管理位置、权限处理、请求/响应拦截器、环境变量与构建配置、初步业务模块判断、待确认项。
**输出**：`docs/.analysis/02-frontend-index.md`；重要结论追加证据账本。
**模板**：`templates/02-frontend-index.md`。

### Phase 3 — Backend Index / 后端索引

**目标**：建立 Java Spring 后端模块索引，不做最终文档。
**输入**：`01-discovery-report.md` + 后端源码目录。
**做什么**：（复用或生成 `endpoints-seed.json`，把 `backend[]` 当 Controller URL 清单基线，再核对。）列出启动类、Controller、URL mapping、Service、Repository/Mapper/DAO、Entity/DTO/VO、Config、Interceptor/Filter、ExceptionHandler、安全与鉴权链、定时任务、外部系统调用、初步业务模块判断、待确认项。
**输出**：`docs/.analysis/03-backend-index.md`；重要结论追加证据账本。
**模板**：`templates/03-backend-index.md`。

### Phase 4 — API Map / 前后端接口映射

**目标**：基于前端 API 方法与后端 Controller 建立双向映射。
**输入**：`02-frontend-index.md` + `03-backend-index.md`。
**做什么**：前端 API → 后端 Controller 正向匹配；后端 Controller → 前端调用反查；标注「未发现前端调用」「未发现后端匹配接口」；存在 baseURL/proxy/动态前缀时说明拼接方式。
**输出**：`docs/.analysis/04-api-map-draft.md`（每行一条映射记录）；映射结论追加证据账本。
**模板**：`templates/04-api-map.md`；记录格式 `schemas/api-map-record.md`；样例 `examples/api-map-example.md`。

### Phase 5 — Business Flow Trace / 业务链路分析

**目标**：把核心业务从用户操作串到后端数据访问。
**输入**：`02`/`03`/`04` 产物。
**做什么**：挑选核心业务链路（不必穷尽全部），每条从用户入口 → 前端路由/页面/事件 → 前端 API → HTTP/URL → Controller → Service → Repository → 数据模型 → 返回 → 前端渲染 → 异常路径，逐项填写并给出完整性判断（完整/部分完整/不完整/需人工确认）。
**输出**：`docs/.analysis/05-business-flows-draft.md`；链路结论追加证据账本。
**模板**：`templates/05-business-flow.md`；记录格式 `schemas/business-flow-record.md`；样例 `examples/business-flow-example.md`。

### Phase 6 — Data Model Analysis / 数据模型分析

**目标**：分析核心 Entity/DTO/VO/Request/Response/Enum。
**输入**：`03`/`04`/`05` 产物。
**做什么**：对每个核心模型记录名称、类型、代码位置、字段说明、使用位置、涉及接口/前端页面/业务链路、数据库表名（可确认时）、待确认项。
**输出**：`docs/.analysis/06-data-model-draft.md`；模型结论追加证据账本。
**模板**：`templates/06-data-model.md`。

### Phase 7 — Document Generation / 最终文档生成

**目标**：基于 `.analysis` 中间产物和证据账本，装配最终文档。
**输入**：`01`~`06` 产物 + `evidence-ledger.md`。
**做什么**：生成 `docs/` 下 8 份散文文档 + `index.json` 结构化索引 + `ai-context.md` AI 上下文摘要。**只能引用以下来源**：代码证据、`.analysis` 中间产物、证据账本、显式标注的推测、显式标注的待确认项。**不得在 P7 引入任何未登记的新结论**。低置信度内容按规则降级或移入待确认。`architecture.md` 必须有且仅有一张 `flowchart LR` 运行时全景 Mermaid；`business-flows.md` 每条 `## F-<编号>` 核心链路必须紧跟一张 `flowchart LR`。每张图用 `%% Evidence: E-xxx` 声明证据来源。`index.json` 按 `schemas/index-json.md` 装配，`E-xxx` 与证据账本一致、`flows[].id` 与 `F-N` 对应。
**输出**：`docs/onboarding.md`、`architecture.md`、`frontend.md`、`backend.md`、`api-map.md`、`business-flows.md`、`data-model.md`、`troubleshooting.md`（8 份散文）+ `docs/index.json` + `docs/ai-context.md`（共 10 份）。**P7 不生成 `validation-report.md`——那是 P8 的产物，本阶段不要顺手写它。**
**模板**：`templates/07-doc-generation.md`（含每份文档的章节骨架）。

### Phase 8 — Evidence-Based Validation / 强校验

**目标**：校验最终文档的准确性，产出可信度报告。
**输入**：`docs/*.md` 最终文档 + 全部 `.analysis` 产物。
**做什么**：先跑 `scripts/validate-docs.js` 自动核对文件路径、符号、Mermaid 结构/数量、图级 Evidence 声明，以及 `index.json` 的结构/路径/Evidence/引用完整性；再按 checklist 逐项校验——API 双向映射是否成立、核心链路是否闭环、Mermaid 节点和连线是否有证据、图文是否一致、是否把废弃代码当核心业务、低置信度是否被误写成事实。P8 暂不执行目标项目的构建、测试、lint、typecheck 命令。按失败处理规则修正文档或降级结论。
**输出**：`docs/validation-report.md`（草稿先落 `docs/.analysis/08-validation-report-draft.md`）。
**模板**：`templates/08-validation.md`；记录格式 `schemas/validation-record.md`。

---

## 每阶段结束的汇报格式

```
━━ ✅ Phase N 完成 ━━
产物：docs/.analysis/0N-xxx.md（+ 证据账本新增 K 条）
关键发现：<1~3 条>
待确认：<0~3 条，P5/P8 需重点关注的>
下一步：Phase N+1（<名称>）。回复「继续」执行，或「重跑 PN」修正本阶段。
```

---

## 捆绑资源（按需加载，用完即释放，不跨阶段保留全文）

- `templates/01-discovery.md` ~ `templates/08-validation.md` — 各阶段产物的章节骨架与填写指引（**仅在执行对应阶段时加载**）。
- `schemas/evidence-record.md` — Evidence 记录字段格式（**P2 起每次登记结论前可参照**）。
- `schemas/api-map-record.md` — API 映射记录字段格式（**仅 P4**）。
- `schemas/business-flow-record.md` — 业务链路记录字段格式（**仅 P5**）。
- `schemas/validation-record.md` — 校验项记录字段格式（**仅 P8**）。
- `schemas/index-json.md` — `index.json` 结构化索引字段格式（**P7 生成 index.json 时参照**）。
- `scripts/validate-docs.js` — P8 确定性校验脚本：自动核对 docs/ 引用的路径/符号、Mermaid 结构与图级 Evidence（**P8 第一步运行**：`node validate-docs.js --project <项目根> --symbols --strict`）；冒烟测试 `scripts/tests/validate-docs.test.js`。
- `scripts/git-insights.js` — P1 可选的 git 历史洞察脚本：输出高频改动文件/目录热点/贡献者/CODEOWNERS/近期活跃文件（`node git-insights.js --project <项目根> [--top N] [--days N] [--json] [--out <path>]`）；非 git 仓库/浅克隆自动降级；冒烟测试 `scripts/tests/git-insights.test.js`。
- `scripts/extract-endpoints.js` — P2/P3/P4 的接口**种子**脚本：确定性抽取后端 Spring mapping 与前端 axios/fetch 调用（`node extract-endpoints.js --project <项目根> --out docs/.analysis/endpoints-seed.json`）。**种子是基线不是事实**，P2/P3 须逐条核对；`needs-review` 项须人工确认。冒烟测试 `scripts/tests/extract-endpoints.test.js`。
- `scripts/lib/project-index.js` — `validate-docs.js` 与 `extract-endpoints.js` 共享的文件索引工具（`CODE_EXT` / `IGNORE_DIRS` / `indexProject` / `buildCodeContentCache`）。
- `examples/evidence-ledger-example.md` — 填好的证据账本样例（**对齐格式时读，不整文件背**）。
- `examples/api-map-example.md` — 填好的 API 映射表样例（**仅 P4 对齐格式时读**）。
- `examples/business-flow-example.md` — 填好的业务链路样例（**仅 P5 对齐格式时读**）。
- `examples/index-json-example.json` — 填好的 `index.json` 样例（**P7 对齐格式时读**）。
- `references/confidence-and-evidence.md` — 置信度判定与证据纪律细则（**判断某结论能否写成事实时读**）。
- `references/phase-resume-guide.md` — 中断恢复与「只看一组相关文件」的取材策略（**续跑或不确定该看哪些文件时读**）。

---

## 反模式

- **不要一次性读完整个仓库再开始写。** 每阶段只看相关文件，落盘后再进下一阶段。
- **不要跳过阶段顺序。** 后续阶段依赖前序产物作为唯一事实源，跳过会让推断失去依据。
- **不要在 P7 重新分析代码。** 最终文档只装配 `.analysis` 产物和证据账本；重新看代码会引入未登记、不一致的结论。
- **不要把推测写成事实。** 中/低置信度结论必须标注「推测」或进「待确认项」，由证据账本和置信度规则约束。
- **不要把 `endpoints-seed.json` 种子直接当事实。** 它是确定性抽取的基线清单，仍须 P2/P3 逐条核对真实存在再登记；`needs-review` 项必须人工确认，不得跳过核对直接写进文档或 api-map。
- **不要把废弃/示例/测试代码当核心业务。** P5/P8 需主动甄别，存疑的标「待确认」。
- **不要为了让 Mermaid 好看而补全调用关系。** 未匹配 API、外部断点和低置信度关系必须保留缺口或待确认标注。
- **不要在 P8 执行目标项目命令。** 本阶段验证静态文档、图与代码证据，不验证构建环境。
- **不要修改、重构业务代码或新增运行时依赖。** 本 skill 只读代码、只写 `docs/`。
- **不要在最终文档里引入没在证据账本登记过的新结论。** P8 会反查并打回。
