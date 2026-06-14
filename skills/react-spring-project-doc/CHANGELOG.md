# 变更日志 — react-spring-project-doc

所有重要变更均记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本管理遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 子段约定

每个版本（包括 `[Unreleased]`）必须显式包含以下三个 **升级影响** 子段，即使内容是「无」：

- `### Breaking` — 不向后兼容的阶段产物结构 / 记录格式 / 输出文件变化。**为空写「无」**，不允许省略。
- `### Migration` — 旧版本升级到本版本的迁移步骤；与 Breaking 配对。无破坏性变更时也写「无」。
- `### Removed` — 删除的模板、schema、文件或字段。

升级者只需 grep 这三段即可判断是否安全升级。其余子段（`### Added` / `### Changed` / `### Fixed` / `### Deprecated`）按 Keep a Changelog 标准用法。

---

## [Unreleased]

### Breaking

- P7 的 `architecture.md` 从 ASCII 文字图改为恰好一张 `flowchart LR` Mermaid；`business-flows.md` 每条 `## F-<编号>` 核心链路必须有一张 Mermaid。依赖旧文档结构的消费者需要重跑 P7。

### Migration

1. 重跑 P7，把旧 ASCII 架构图替换为运行时全景 Mermaid，并为每条核心链路补图级 `%% Evidence:` 声明。
2. 重跑 P8，使用 `node skills/react-spring-project-doc/scripts/validate-docs.js --project <目标项目根> --symbols --strict` 校验 Mermaid 结构、数量和 Evidence。

### Removed

- 移除 P8 的构建、测试、lint、typecheck 命令执行步骤与 validation report「命令可执行性」章节。

### Added

- `scripts/validate-docs.js` — P8 确定性校验脚本：自动抽取最终文档引用的文件路径与代码符号，逐条核对存在性，替代易错的手工 Grep（规避 `rg -o` 多文件前缀、`js` 抢匹配 `.json`、`class User` 子串命中 `UserContext`，以及 glob `*Foo.java` 等坑）。零依赖、CommonJS，带 `scripts/tests/validate-docs.test.js` 冒烟测试，并已对真实 React + Spring Boot demo 跑通。
- `templates/08-validation.md` 新增「步骤 0：先跑确定性脚本」，把脚本输出映射到 V-001/V-002。
- `scripts/git-insights.js`（P1-B）— P1 可选的 git 历史洞察脚本：输出高频改动文件、目录热点、主要贡献者、CODEOWNERS、近 N 天活跃文件,喂 P7 的 onboarding(先看哪/找谁)与 troubleshooting(热点区)。零依赖,非 git 仓库/浅克隆优雅降级,带 `scripts/tests/git-insights.test.js` 冒烟测试。
- 模板深挖(P1-C):`templates/03-backend-index.md` 把鉴权从一行升级为「安全与鉴权链(Spring Security)」独立小节;`templates/06-data-model.md` 确立「迁移 DDL > 注解 > 命名推断」的表/字段/枚举证据优先级;`templates/01-discovery.md` 补安全配置、数据库迁移、git 活跃度三类定位;`templates/05-business-flow.md` 强化登录/鉴权为优先核心链路;`templates/07-doc-generation.md` 让 backend/architecture 点名鉴权链、onboarding/troubleshooting 消费 git 信号。
- 确定性接口抽取(P1-A):新增 `scripts/extract-endpoints.js` —— 正则 best-effort 抽取后端 Spring mapping(类级 `@RequestMapping` 前缀 + 五种方法注解 + `@RequestMapping`)与前端 axios/fetch 调用,产出 `endpoints-seed.json`(handler/method/url/file:line/confidence),作为 P2/P3/P4 的**种子基线**(非事实,须逐条核对;动态 URL/SpEL/多方法标 `needs-review`)。新增共享库 `scripts/lib/project-index.js`(`CODE_EXT`/`IGNORE_DIRS`/`indexProject`/`buildCodeContentCache`),`validate-docs.js` 改为复用它。模板 `02`/`03` 增「先跑种子」步骤、`04` 复用两侧清单、SKILL.md 注册脚本与反模式。冒烟测试 `scripts/tests/extract-endpoints.test.js`。
- 结构化产物(P0-1):P7 新增两份产物——`docs/index.json`(机器可读的结构化索引:codeMap/symbols/api/flows/dataModels/evidence,供 AI 问答)与 `docs/ai-context.md`(稠密 AI 上下文摘要)。新增 `schemas/index-json.md`(字段格式)与 `examples/index-json-example.json`(样例)。`scripts/validate-docs.js` 增 `validateIndexJson`:确定性校验 index.json 的必填键、所有 `file` 路径、`E-xxx` 与证据账本一致且引用闭合、`usedByApi/usedByFlow` 引用完整性,以及 `--symbols` 下符号定义存在;缺失 index.json 仅提示不算失败,结构错误为硬失败。
- P7 增加 Mermaid 运行时全景图与逐链路图规范；每张图用 `%% Evidence: E-xxx` 建立可机械检查的溯源入口。
- `validate-docs.js` 增加 Mermaid fence、`flowchart` 声明、全景/链路图数量和图级 Evidence 校验。

### Fixed

- `validate-docs.js` 符号校验修两处问题：① 性能——旧实现对每个符号都重读一遍全仓代码文件（O(符号数 × 文件数) 次磁盘读），改为一次性把代码文件读入内存缓存后在内存里匹配；② 假阳性——旧实现「符号在任意位置出现即算存在」，会让仅出现在 import/注释/字符串里的符号静默通过。现按定义处（`class/interface/enum/record/type/function/const/let/var X`）与词界匹配分三档：`defined`（有定义，通过）/`referenced`（仅被引用，多为框架/外部类型，列为告警待人工确认，**不**触发 `--strict` 硬失败）/`absent`（全仓不存在，疑似幻觉，告警且 `--strict` 下硬失败）。

### Changed

- 基于一次真实 demo（React 16 JS/TS 混合 + Spring Boot 登录/注册/改密）的全流程试跑，加固 4 处模板：
  - `templates/05-business-flow.md`：强调每个环节 `path:line` 必须用 Grep/`rg` 现查现填，禁止凭记忆（试跑中记忆行号确有漂移）。
  - `templates/08-validation.md`：新增「工具核对本身要自检」提示，列出 `rg -o` 多文件前缀、`js` 抢匹配 `.json`、`class User` 子串命中 `UserContext` 三类常见误差，先复核命令再判「不通过」。
  - `templates/01-discovery.md`：构建命令表补「前端类型检查」一行。
  - `templates/04-api-map.md`：接口多时提示按模块分块或拆「核心+附录」表，改善宽表可读性。
- P8 聚焦静态文档与代码证据，Mermaid 节点/连线需对照 P4/P5/evidence ledger；不再受本机 Node、JDK、Maven、网络和父目录依赖状态干扰。

---

## [0.1.0] — 2026-06-14

文档型最小可用版本（MVP）。

### Breaking

无（首个版本）。

### Migration

无（首个版本）。

### Removed

无。

### Added

- `SKILL.md` — 8 阶段流水线主控：阶段总览、中断恢复协议、证据账本与置信度规则、每阶段执行说明、汇报格式、资源清单、反模式。
- `templates/01-discovery.md` ~ `templates/08-validation.md` — 8 个阶段产物的章节骨架。
- `schemas/evidence-record.md` / `api-map-record.md` / `business-flow-record.md` / `validation-record.md` — 4 类记录的字段格式与规则。
- `examples/evidence-ledger-example.md` / `api-map-example.md` / `business-flow-example.md` — 共用「订单」虚构域的填好样例。
- `references/confidence-and-evidence.md` / `phase-resume-guide.md` — 置信度纪律与中断恢复/取材策略。
- `README.md` — 使用指南。

### 说明

- 本版本不含独立校验脚本；P8 强校验由模型按 `templates/08-validation.md` 的 checklist 用 Glob/Grep/运行命令执行。是否引入 `scripts/` 待真实项目跑通后评估。
