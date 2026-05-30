# 变更日志 — design-to-spec

所有重要变更均记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本管理遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 子段约定

每个版本（包括 `[Unreleased]`）必须显式包含以下三个 **升级影响** 子段，即使内容是「无」：

- `### Breaking` — 不向后兼容的 schema / CLI / 产出结构变化。**为空写「无」**，不允许省略。
- `### Migration` — 旧版本升级到本版本的迁移步骤；与 Breaking 配对。无破坏性变更时也写「无」。
- `### Removed` — 删除的脚本、文件、字段、CLI 标志。

升级者只需 grep 这三段即可判断是否安全升级。其余子段（`### Added` / `### Changed` / `### Fixed` / `### Deprecated`）按 Keep a Changelog 标准用法。

---

## [Unreleased]

### Breaking

无。

### Migration

无。

### Removed

无。

### Added — 分发与上手 P2（沉淀经验、降低协作摩擦）

- 新增 `templates/ci/github-actions.yml` + `templates/ci/pre-commit.husky` + `templates/ci/lefthook.yml`：三种主流 CI / pre-commit 集成模板，复制即用。GitHub Actions 在 PR 触发，遍历 `design-spec/*/` 跑 validate-contracts + validate-output --strict；husky / lefthook 只对本次 staged 改动的目录跑校验，不全量。lefthook pre-push 阶段额外跑 `npm run smoke`。
- 新增 `references/ci-integration.md`：CI 集成指南。三种形态选型表（GitHub Actions / husky / lefthook 何时用）+ 各自的复制安装命令 + 常见失败的恢复路径（contracts 校验失败 / 输出 --strict 失败）+ 几条选型上的取舍说明（为什么 pre-commit 不跑 npm test、为什么 CI 不重跑 generator）。
- 新增 `references/reviewer-guide.md`：评审指南。分 PM / QA / 后端 / 数据四视角的签收 checklist，明确每个角色优先读哪些文件、不需读哪些、必须回退给作者重做的信号；附通用反模式表 + 进入 coding 前的 6 项退出标准。配合 v0.12 真实项目盲测的"非作者消费"目标。
- 新增 `docs/case-study-feedback-form.md`：基于 `samples/feedback-form/` 的 before/after 工作量对比。传统工作流 9.5–12h（评审会 + 联调 + 埋点回补 + 修复回归散在多个时间节点）vs design-to-spec 工作流 4.75–6.25h（一次 1h skill 对话把扯皮前移）；附诚实记录的"没解决的问题"（学习曲线、设计稿质量、ROI 边界）。
- 新增 `scripts/smoke.js` + `npm run smoke` 命令：1 秒级环境冒烟测试。用 `today-windvane` 金样跑 validate-contracts → generate-output（写到临时目录）→ validate-output --strict 全链路；任一失败退出 1 + 报错，全部通过输出 ✅ + 总耗时（实测约 410ms）。比 `npm test`（33 项回归套件）更快、信号更明确，适合装好后第一时间验证环境，或在 lefthook pre-push / CI 早期阶段做"环境健康检查"。
- README 末尾新增 `## 升级前必读` 节：三类版本（major / minor / patch）的升级影响对照、每次升级的三步走（grep CHANGELOG Breaking → 重跑 smoke → 重跑已有 design-spec 校验）+ 一段批量校验脚本，避免同事升级后不知道该确认什么。
- CHANGELOG 顶部新增 `## 子段约定` 节：每个版本（含 [Unreleased]）必须显式包含 `### Breaking` / `### Migration` / `### Removed` 三个子段，为空也写「无」。升级者只需 grep 这三段即可判断是否安全升级。
- ONBOARDING §9 下一步导航表新增 4 行：升级前必读 / 看跨角色评审清单 / 看真实需求工作量对比 / CI 集成。
- README 顶部分流指引新增 3 行，分别指向 ci-integration、reviewer-guide、case-study-feedback-form。
- SKILL.md §捆绑资源 节登记 5 份新文档（ci-integration / reviewer-guide / case-study-feedback-form / 三份 ci 模板 / smoke.js），标注"何时读取"触发条件。
- `package.json.version` 从 `0.10.0` 同步到 `0.10.1`，与 SKILL.md frontmatter 对齐。

### Added — 分发与上手 P1（降低同事接入心智成本）

- 新增 `references/troubleshooting.md`：故障排查手册，10 大类 22 条按「症状 → 原因 → 解决命令」三栏组织，覆盖安装环境、4 阶段每段的常见错（漏组件、字段过多、binding 引用错、render_assertion 缺失、trace 锚点丢失、YAML 重试失败、context 不足、跨组件不一致、skill 没触发等）。同事卡住时直接 grep 首行报错即可定位，不再依赖去 SKILL.md / operator-guide.md 翻找。
- 新增 `references/glossary.md`：术语速查表。按字母顺序排列，每条「一句话定义 + 具体例子 + 出现位置」，覆盖核心概念（contract / deterministic generation / golden sample / harness / OpenSpec / state machine / trace anchor）、契约字段（confidence / interactive / parent_id / render_assertion / repeat_source / role / scope / semantic_type / auth_required / cache_key_fields / error_shape / pagination / binding direction / call_type / concurrency_policy / transform）、流程术语（4 阶段状态、open_questions 优先级、阶段四 A/B/C/D 子阶段）、易混淆对照（needs_human_input vs open_questions / examples vs samples / validate-contracts vs validate-output）。
- 新增 `templates/agents-snippet.md` 和 `templates/claude-md-snippet.md`：项目级配置可复制片段。`cat templates/agents-snippet.md >> AGENTS.md`（OpenCode）或 `cat templates/claude-md-snippet.md >> CLAUDE.md`（Claude Code）一行接入；包含项目上下文 yaml、触发示例、提交前必跑校验、关键纪律和故障排查导航。从 SKILL.md §OpenCode 环境配置 节嵌入式段落沉淀出来，避免同事手动选段复制。
- 新增 `docs/architecture.svg`：架构总览图。横向布局展示「输入 → 4 阶段（前 3 蓝/LLM 推断 + 第 4 橙/确定性脚本）→ 3 份 YAML 契约（紫）→ 3 份产物 → 5 类下游消费者（绿，前端/后端/测试/PM/CI）」，含用户确认门标注。嵌入到 README 和 ONBOARDING 顶部，作为"一图秒懂"的视觉锚点。
- ONBOARDING §9 下一步导航表新增 4 行：跑不通查 troubleshooting / 看到生词查 glossary / 接入项目级配置查两份 templates snippet。
- README 顶部分流指引新增两行，分别指向 troubleshooting + glossary 和两份 snippet 模板。
- SKILL.md §捆绑资源 节登记 4 份新文档（troubleshooting / glossary / 两份 snippet / architecture.svg），标注各自的"何时读取"触发条件，确保 LLM 在对应场景能找到。
- frontmatter `version` 从 `0.10.0` 升至 `0.10.1`（文档与上手资源补强，不改运行时行为）。

### Added — 此前条目

- 新增 `scripts/tests/validate-contracts.test.js`：24 个错误路径回归用例，覆盖 cross-reference（component / state / endpoint / request / binding / state_machine 引用错误，required state 缺 render_assertion，render_assertion fallback 缺失）、唯一性（重复 component / state / endpoint / request / response_field id）和 JSON Schema（缺必填、类型错配、enum / pattern / oneOf 违反）三类。配合现有 9 个 happy-path 测试，`npm test` 共 33 项全过。
- `references/contracts.md` 新增「`needs_human_input` 与 `open_questions` 使用规则」节：明确两者不是互斥而是配对、决策树（何时用哪个）、强制配对规则、P0/P1/P2 优先级语义、5 条反模式、在 notes.md/spec.md 的最终落地、进入 coding 前的评审退出标准。闭合 v0.10 验收最后一项文档项。
- 新增 `ONBOARDING.md`（顶层）：3 分钟新人引导文档。覆盖"是不是我的菜"决策、谁该用 / 不该用（强调 UI 单元 = 组件 / 页面 / 模块，多页面流程拆多次跑）、3 个具体痛点、产物清单、30 秒安装、第一次跑（today-windvane sample）、按需求分流的下一步导航表、6 个常见疑问。补齐文档梯度（README → ONBOARDING → operator-guide → SKILL.md / contracts.md）的 Tier 2 缺口。
- README 顶部分流指引调整：`第一次来？读 ONBOARDING.md` 与 `要拿真实设计稿动手？读 operator-guide.md` 拆成两行，避免新人和上手者读同一份文档。
- `references/operator-guide.md` 顶部读者预设从"第一次使用此 skill"调整为"已经决定要用、准备动手"，并指向 ONBOARDING 作为前置入口；"组件"措辞统一为"UI 单元（组件 / 页面 / 模块）"。
- ONBOARDING §7「第一次跑」新增到 `samples/search-panel/` 的入口指引，区分"回归 sample"（仅 contracts + 输出）与"手动验证 sample"（完整 inputs → spec → 实现）。

### Added (repo-level, outside `design-to-spec/`)

- 仓库根新增 npm workspaces：`design-to-spec` + `samples/*`。根 `package.json` 提供 `npm run test:skill` / `build:samples` / `check` 编排。
- 根 `README.md` 解释 skill vs samples 的分工，给出快速导航表。
- 根 `docs/repo-workflow.md` 说明两类"examples"的区别（golden 回归 vs 手动验证）、samples 的 inputs → spec → impl 工作流、未来扩展（多 skill / tools / packages）的延后策略。
- 根 `docs/sample-authoring.md` 给 sample 作者：何时该做新 sample、目录契约、authoring 顺序、`walkthrough.md` 模板、PR checklist、anti-patterns。
- 第一个手动验证 sample `samples/search-panel/`：`inputs/`（design.svg + api.md + interaction-notes.md）+ `design-spec/search-panel/`（contracts + 三份 markdown，已通过 `--strict` 校验）+ `src/`（vite + vanilla JS 实现，匹配 spec 的状态机和 binding）+ `walkthrough.md`（≤200 行的四阶段过程记录）。
- 第二个手动验证 sample `samples/feedback-form/`，与 search-panel 形态互补：POST + 表单 / 主导 binding 是 `ui_to_api` / 多字段双层校验 / request_body 首次落地 / element-scoped invalid 状态（emailInvalid + commentInvalid + rateLimited）/ success 态完全替换表单。`walkthrough.md` 重点写"与 search-panel 的差异"而非重复整个流程。同样通过 `validate-contracts` + `--strict`。
- ONBOARDING §7 sample 对照表加入 feedback-form 行，注明两个 sample 的形态差异（GET vs POST、api_to_ui vs ui_to_api 主导）。
- 新增第二份 golden sample `examples/price-card/`：props-only 形态，与 `today-windvane`（自取数据卡片）形态互补。覆盖 4 个状态（success / discount / partial / disabled）、空 `api.endpoints` / 空 `bindings` / 空 `data_fetching.requests` 退化路径，验证 operator-guide §4 的 props-only 模式可端到端跑通。生成的 `notes.md`、`data-fetching.md`、`spec.md` 均通过 `validate-output.js --strict`。
- 新增 `scripts/tests/price-card.test.js`：5 个回归用例覆盖 props-only 全链路（contracts 校验 → 生成 → strict 输出校验）+ 信号短语断言（"无直接请求"、"数据由父组件或宿主上下文传入"）+ 4 个 required state 的 trace 锚点 + 组件级 trace 锚点。`npm test` 现共 38 项全过。

## [0.10.0] - 2026-05-01

### Changed（运行时迁移）

- **从 Python 完全迁移到 Node.js**：三个生产脚本（`validate-contracts`、`generate-output`、`validate-output`）和 4 个回归测试全部改写为 Node.js (ESM)，金样输出经字节级 parity 比对一致。
- 新增 `design-to-spec/package.json`，依赖收敛为单一运行时包 `js-yaml`；JSON Schema 校验沿用脚本内置的 Draft-7 子集校验器。
- 测试切换为内置 `node:test`，全部用 `npm test` 一键运行；不再需要装 PyYAML / Ruby fallback。
- SKILL.md / README / contracts.md / operator-guide 中所有 `python3 ... .py` 命令替换为 `node ... .js`；环境要求章节改为 Node.js ≥ 18。
- frontmatter `version` 从 `0.9.5` 升至 `0.10.0`（运行时变更属于 minor 版本切换）。

### Removed

- 删除 `design-to-spec/scripts/*.py`（3 个生产脚本 + 4 个测试脚本，共约 2058 行 Python）。
- 删除 PyYAML 依赖和 Ruby YAML fallback（subprocess 调用），简化 YAML 加载路径。
- 删除 `python3` 在 Windows 上经常找不到的兼容性烦恼。

### Migration

旧的 Python 命令仍在 git 历史中可查；用户的 muscle memory 命令需做以下替换：

| 旧                                                         | 新                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `python3 design-to-spec/scripts/validate-contracts.py ...` | `node design-to-spec/scripts/validate-contracts.js ...` |
| `python3 design-to-spec/scripts/generate-output.py ...`    | `node design-to-spec/scripts/generate-output.js ...`    |
| `python3 design-to-spec/scripts/validate-output.py ...`    | `node design-to-spec/scripts/validate-output.js ...`    |
| `python3 design-to-spec/scripts/test-*.py`                 | `cd design-to-spec && npm test`                         |

CLI 标志（`--ui`、`--api`、`--mapping`、`--out-dir`、`--strict`、`--notes`、`--data-fetching`、`--spec`）名字、退出码和错误消息格式与原 Python 实现保持一致。

## [0.9.5] - 2026-04-30

### Changed

- 四个阶段的用户确认/状态输出统一加进度标题 `━━ 阶段 N / 4：<名称> ━━`，让用户始终知道当前进度。
- 每阶段确认块末尾内联「下一阶段是什么」+ 「如需调整怎么说」的恢复提示，用户不再需要预知状态机模型。
- 阶段三的用户确认从一句话描述升级为完整模板（状态机转换 + 字段绑定示例），与阶段一/二格式对齐。
- 阶段四进入时输出"自动生成中"状态行，完成时输出 `━━ ✅ 完成（4 / 4）━━`，闭合进度反馈。

## [0.9.4] - 2026-04-30

### Changed

- 新增 `## 启动话术` 节：skill 首次被调用时（用户已提供设计稿、尚未进入阶段一分析前）先输出一段固定文本，告知四阶段流程、当次所需输入和输出位置，续跑场景不输出。用户无需提前阅读任何文档即可开始使用。
- frontmatter `version` 从 `0.9.2` 更新至 `0.9.4`（0.9.3 漏更）。

## [0.9.3] - 2026-04-30

### Changed

- `错误处理与重试` 节新增「运行时常见问题」表：覆盖阶段一漏组件、阶段二字段过多、阶段三转换缺失、Scenario THEN 空泛、trace 锚点被误删、context 不足六类常见出错场景。
- 每类场景改为由 skill 主动输出补救提示（含可直接复制的操作指令），不再依赖用户自行查阅 operator-guide。
- YAML 连续失败的兜底提示改为引导用户用自然语言描述，降低恢复门槛。

## [0.9.2] - 2026-04-26

### Changed

- 阶段一用户确认摘要改为只输出 ASCII 图表，移除 Mermaid 代码块和 `graph TD` 展示规则，以适配 TUI 环境。
- README 同步说明当前确认摘要只使用 ASCII 图表。

## [0.9.1] - 2026-04-26

### Changed

- 阶段一用户确认摘要新增 Mermaid 层级图和 ASCII 树要求，用 `*` 标交互组件、`?` 标 `needs_human_input`，让 UI 识别结果比纯列表更直观。
- README 同步说明视觉提纯确认摘要的图表化展示规则。

## [0.9.0] - 2026-04-26

### Added

- `generate-output.py` 生成 `## Traceability` 表，显式写入 `component:<id>`、`binding:<index>:<direction>`、`state:<id>` 和 `request:<id>` 锚点。
- `validate-output.py` 在发现 `## Traceability` 时校验 trace 覆盖：component/binding/state/request 都必须能回到契约；required state 必须在 `spec.md` 有 `state:<id>` trace。
- 新增 `scripts/test-traceability.py`，覆盖 trace 生成和篡改 required state trace 后严格校验失败的场景。
- 新增 `scripts/test-package-hygiene.py`，校验 agents metadata 资源存在、stack hints 不再引用 `design.md`、包内不存在 `.DS_Store` 实体文件。

### Changed

- `agents/openai.yaml` 的 icon 引用从不存在的 PNG 改为已有 SVG。
- `references/stack-hints/*.md` 统一引用 `notes.md`，消除旧 `design.md` 命名漂移。
- `templates/notes.md`、`templates/data-fetching.md`、`templates/spec*.md` 补充 traceability 规则。

### Removed

- 移除 `design-to-spec/examples/today-windvane/.DS_Store` 和本地 `design-to-spec/.DS_Store` 包装噪音。

## [0.8.0] - 2026-04-26

### Added

- UI_Schema 支持更丰富的前端控件类型：`Table`、`Form`、`Modal`、`Dropdown`、`Switch`、`Tooltip`、`Chart`、`Avatar`、`Skeleton`、`Toast`、`Custom`，并新增 `components[].semantic_type` 保留业务语义。
- UI_Schema `states[]` 新增 `scope` 和 `scope_components`，用于表达局部 loading/error/disabled 等状态作用范围。
- API_Schema endpoint 新增 `request_body`、`auth_required`、`cache_key_fields`、`pagination`、`status_codes`、`error_shape`，覆盖真实前端请求、分页、错误兜底和鉴权分支。
- Mapping_Logic `data_fetching` 新增 `cache_policy`、`retry_policy`、`concurrency_policy`，把缓存、重试、abort、去重和过期响应处理结构化。
- 新增 `scripts/test-contract-extensions.py`，用后台表格查询场景回归验证扩展契约可校验、可生成且不丢关键策略字段。

### Changed

- `validate-contracts.py` 的 `ui_to_api.target_api` 校验现在同时接受 `params[].name` 和 `request_body[].name`。
- `validate-contracts.py` 会校验 `states[].scope_components[]` 必须引用存在的 UI component。
- `generate-output.py` 会把 request body、接口元信息、错误结构、状态 scope、组件 semantic type、分页、缓存、重试和并发策略写入 markdown 输出。
- `README.md`、`SKILL.md`、`templates/*.yaml`、`references/contracts.md` 同步说明扩展字段。

## [0.7.3] - 2026-04-26

### Added

- 新增 `scripts/generate-output.py`，从三份 YAML 契约确定性生成 `contracts/`、`notes.md`、`data-fetching.md`、`specs/<capability>/spec.md` 基线文件。
- 新增 `scripts/test-generate-output.py`，使用 `examples/today-windvane/contracts/*.yaml` 回归验证生成脚本，并用 `validate-output.py --strict` 校验生成结果。

### Changed

- `SKILL.md` 的 frontmatter description 改为仅描述触发条件，避免模型把描述当成流程摘要而跳过正文。
- 输出目录正式包含 `contracts/ui-schema.yaml`、`contracts/api-schema.yaml`、`contracts/mapping-logic.yaml`，前三阶段用户确认后必须立即落盘。
- 阶段四默认流程调整为：先 `validate-contracts.py`，再 `generate-output.py`，修订 markdown 后运行 `validate-output.py --strict`。
- `README.md` 与 `references/contracts.md` 补充确定性生成命令和生成后校验流程。

## [0.7.2] - 2026-04-25

### Added

- 新增 `schemas/ui-schema.json`、`schemas/api-schema.json`、`schemas/mapping-logic.json`，将三份 YAML 契约的结构约束显式化。
- 新增 `scripts/validate-output.py`，用于校验最终 `notes.md`、`data-fetching.md`、`spec.md` 是否覆盖契约中的必需状态、请求 endpoint、事件名和关键章节。
- 新增 `references/contracts.md`，集中说明三份 YAML 契约的字段语义、填写纪律和校验命令。

### Changed

- `scripts/validate-output.py` 增加结构化锚点校验，优先解析 `notes.md` 的「状态枚举」表、「开放问题」编号列表和「埋点锚点」表，减少开放问题改写导致的字符串误报。
- `scripts/validate-contracts.py` 增加唯一性约束，重复的 `components[].id`、`states[].id`、`api.endpoints[].id`、`requests[].id`、字段名和开放问题 id 会报错。
- `scripts/validate-contracts.py` 改为先执行 JSON Schema 校验，再执行跨契约引用校验，能更早发现缺字段、字段类型错误、非法枚举值和多余字段。
- 校验脚本移除 Python 第三方包硬依赖：YAML 读取优先使用 PyYAML，缺失时回退到 Ruby 标准库；JSON Schema 校验由脚本内置 Draft 7 子集校验器完成。
- `README.md` 和 `SKILL.md` 同步说明 schema 驱动校验与输出产物校验流程。
- `SKILL.md` 移除内嵌契约长示例，改为通过模板、schema 和 `references/contracts.md` 渐进披露字段细节。

---

## [0.7.1] - 2026-04-25

### Added

- 新增 `agents/openai.yaml`，为技能列表提供展示名、短描述、图标和默认调用提示。
- 新增 `scripts/validate-contracts.py`，用于校验 `UI_Schema`、`API_Schema`、`Mapping_Logic` 的 YAML 格式和跨契约引用关系。

### Changed

- 同步 `README.md` 到 0.7.x 四阶段状态机架构，移除已废弃的「交互式步骤 0」叙事。
- `UI_Schema` 增加 `parent_id`、`role`、`repeat_source`、`required`、`source`、`render_assertion`，支持层级结构、列表重复结构和机械化 Scenario 组装。
- `API_Schema` 增加 `api.open_questions`，解决枚举值不确定时无处记录的问题。
- `Mapping_Logic.data_fetching` 从单请求字段升级为 `requests[]`，支持多接口、依赖请求和聚合场景。
- `Mapping_Logic.bindings` 增加 `ui_to_event` 方向，用于表达只向父级发出组件事件、不直接调用 API 的交互。
- 分页、排序、筛选、缓存 key 字段从「默认过滤」调整为「影响 UI 或请求状态时必须保留」。
- Scenario 生成规则改为优先读取 `state_machine.render_assertion`，缺失时回退到 `UI_Schema.states[].render_assertion`，不再在第四阶段重新猜 DOM 断言。

---

## [0.7.0] - 2026-04-21

### Changed（架构重写）

- **核心架构**：从「8 步散文工作流」升级为「四阶段状态机 + YAML 内部契约」架构
  - 控制流由确定性代码驱动（WAITING_FOR_UI → WAITING_FOR_API → WAITING_FOR_MAPPING → GENERATING_SPEC），不用 LLM 做路由
  - 阶段间通信协议统一为 YAML（UI_Schema / API_Schema / Mapping_Logic 三份契约），替代散文式推理输出
  - 每阶段强制先在 `<thinking>` 中推理，再输出干净 YAML 代码块
  - 第四阶段（规格组装）纯模板填充，不依赖 LLM 重新推断
- **YAML 契约定义**：新增三份标准契约模板，明确每个字段的语义和填写规则
- **用户确认机制**：每阶段 YAML 提取后，将结构化数据转为 Markdown 展示供用户确认，再流转到下一阶段
- **错误重试**：YAML 解析失败时后台自动重试 2 次，失败后才提示用户（替代之前无重试机制）
- **数据映射规则**：新增阶段四「数据映射规则」表，明确每个输出字段的来源 YAML 路径，消除歧义

### Removed

- 步骤 0（交互式输入收集）作为独立步骤：信息收集现已拆分到阶段一（UI 确认）和阶段二（API 确认）自然进行
- 步骤 2（技术栈和上下文解析）、步骤 3（信息分层）、步骤 4（交互推断）等散文步骤：合并到阶段一 YAML 提取的 `<thinking>` 推理协议中

---

## [0.6.0] - 2026-04-21

### Added

- **上下文预算与分阶段释放原则**（新增独立章节，工作流程开始前必读）：
  - 三级预算门控：< 30K tokens 跳过 Annotated SVG；< 20K tokens `data-fetching.md` 精简输出；< 10K tokens 主动停止并告知用户
  - **API 文档摘要门控**：接口文档字段数 > 20 或原文 > 2000 字时，先提炼字段索引表，后续步骤只引用索引，不保留原始文档全文
  - **分阶段写入规范**：步骤 7 拆为 A/B/C/D 四阶段，每阶段写完立即写入磁盘并提炼摘要锚点（数据锚点 / 待确认锚点 / 状态锚点），下游步骤只引用锚点，解决三份文件同时驻留 context 的峰值问题
  - **引用文件按需加载规则**：明确每个 reference 文件只在对应步骤加载，步骤完成后不在后续步骤重新引用
- **内联校准检查清单**（替代整文件读取）：把 golden sample 的核心风格信号内联为四个维度（数据契约 / 状态覆盖 / Scenario 质量 / 埋点锚点），无需加载示例文件即可对照检查
- **锚点格式示例**：在步骤 7 中内联了三类锚点的示例，AI 可直接参照格式压缩并传递

### Changed

- **步骤 0b-A**：读取接口文档后增加摘要门控步骤，大型 API 文档不再全程占用 context
- **步骤 7 写文件顺序**：从简单的「notes → data-fetching → spec」升级为四阶段分阶段写入，每阶段定义释放规则
- **校准节**：从「完整阅读 golden sample」改为内联质量信号；golden sample 文件改为按需读取特定节，标注「不要整文件加载」
- **捆绑资源节**：golden sample 由「必读」改为按节按需读取
- **version**：`0.5.1` → `0.6.0`

---

## [0.5.1] - 2026-04-20

### Added

- **交互式步骤 0（阻塞式，分析前执行）**：skill 在开始视觉枚举之前主动停顿，依次发起最多 4 次提问，引导用户提供接口信息和数据获取描述
  - **步骤 0a**：询问是否有接口文档（支持 OpenAPI / Markdown / TS 类型 / GraphQL / Postman），等待用户回复后再继续
  - **步骤 0b-A**（有文档）：追问接口响应字段 → UI 展示含义的映射，**枚举字段必须列出全量枚举值及每值的 UI 规则**；收到后升级字段来源标注为 `source: api (mapped)`
  - **步骤 0b-B**（无文档）：询问是否需要 AI 根据截图推断 Props 并生成 Java DTO 草稿，设置 `generate_java_dto` 标志位
  - **步骤 0c**（两条分支后统一执行）：开放式提问数据获取方式，用户用自然语言描述「数据从哪来 / 何时触发请求 / 失败怎么处理 / 是否分页缓存」，AI 从描述中提取五个维度信号（是否调接口、触发时机、失败处理、特殊机制、是否 props-only）
- **新增第三份输出文件 `data-fetching.md`**：数据获取逻辑设计文档，自包含，可直接交给实现开发者而无需阅读 `notes.md`，包含九节：
  - 数据流向（文字箭头图）
  - 触发时机与条件（各触发事件及前提条件表）
  - 请求链路（主请求 + 辅助请求，含接口路径、参数来源、聚合方式）
  - 分页与无限滚动（方案、边界条件、重置时机）
  - 缓存与复用策略（策略、粒度、失效触发、stale 态）
  - 错误分级与降级（按 network / 5xx / 4xx / 空数据 / 字段缺失分级，每级定义 UI 行为和是否可重试）
  - 竞态与并发处理（防抖、AbortController、并发上限）
  - 状态机（文字状态图 + 各状态说明表）
  - 待确认项汇总（全文 `⚠️` 条目集中列出，标注需确认对象和优先级）
- **枚举字段强制展开**：数据契约推导（步骤 5）新增规则，枚举字段必须展开为 TS 字面量联合类型（`'ACTIVE' | 'SUSPENDED'`），整型枚举同理（`1 | 2 | 3`），不允许宽泛 `string` / `number`；每个枚举值在 inline 注释里写明 UI 展示规则
- **枚举字段与状态枚举联动**：处理完枚举字段后自动回头检查步骤 4.5 的状态枚举表，每个枚举值视为潜在独立 UI 状态，要求各自至少有一条 Scenario
- **接口字段映射表**（`templates/notes.md` 新增节）：记录接口响应字段与 UI 展示含义的对应关系，含「枚举值（全量）」列；枚举值缺失或不全时标 `needs_human_input` 并加追问
- **Java DTO 草稿**（`templates/notes.md` 新增节，条件输出）：枚举字段映射为独立 Java `enum` + `@JsonValue` 标注，类型映射规则：`string → String`、`number → Double/Integer`、`string[] → List<String>`、嵌套对象 → 独立内部 record
- **新增步骤 5.5：数据获取方式推导**：从步骤 0c 用户描述中提炼结构化内容（触发时机、请求链路、分页、缓存、竞态），同时产出 `notes.md` 数据获取汇总表和完整 `data-fetching.md`；`props_only` 场景输出简化版（仅「数据流向」+「父组件约定」两节）
- **新增模板文件 `templates/data-fetching.md`**

### Changed

- **输出从两份文件升级为三份**：`notes.md` + `data-fetching.md` + `spec.md`；写文件顺序固定为 notes → data-fetching → spec，避免 Scenario WHEN 子句写错
- **步骤 8（呈现输出）**：摘要格式改为三文件清单，重点新增「data-fetching.md 中的 `⚠️ 待确认` 项」；用户反馈锚点从 `needs_human_input` 扩展到 `⚠️ 待确认`
- **输入收集逻辑**：从被动等待改为主动引导，步骤 0 在分析前阻塞执行；输入 #7「API 文档」现在通过步骤 0 交互式收集，不再是静默可选项
- **步骤 5（数据契约推导）**：原有 4 步处理流程扩展为 5 步，新增第 2 步「枚举字段必须展开」；「只有设计稿、没有接口文档」的兜底提示追加「以及所有枚举字段的完整取值列表」
- **`notes.md` 小节顺序**：在「数据契约」和「状态枚举」之间插入「数据获取方式」节
- **version**：`0.5.0` → `0.5.1`

### Fixed

- 枚举字段在数据契约中被宽泛化为 `string` / `number` 导致下游 AI 无法生成精确 Scenario 的问题

---

## [0.5.0] - 2026-04-20

### Added

- **API 文档 / 接口契约**作为可选输入（第 7 项），支持 OpenAPI / Swagger YAML、Markdown 接口文档、Postman Collection、TypeScript 类型定义、GraphQL Schema、Protobuf
- **字段来源标注**：数据契约每个字段必须在 inline 注释中标明 `source: api | derived | prop | ui-only`
- **接口文档 + 设计稿 双输入处理流程**：以接口文档字段为基线抄写，再与 设计稿做 diff，找出「接口有 UI 没用」和「UI 有接口没有」两类异常
- **状态触发条件升级**：有接口文档时，`loading` / `empty` / `error` 的触发条件可引用具体接口字段和 `error.code` 枚举值，直接变成 spec.md Scenario 的可断言 `WHEN` 子句
- **两条新反模式**：
  - 不要用接口文档替代视觉枚举（接口文档告诉你「数据是什么」，设计稿告诉你「数据如何展示」）
  - 不要盲信接口文档的可空性（后端标 `optional` 不代表业务上可以为空）
- `templates/notes.md` 新增字段来源标注说明节

### Changed

- 数据契约推导从「视觉反推（全部 inferred）」升级为「文档抄写 + 设计稿 diff」，置信度地图大量条目从 `inferred` 升级到 `identified`

---

## [0.4.0] - 2026-04-19

首次发布（initial commit）。

### Added

- 完整的 `SKILL.md` 工作流（步骤 1–8 + 步骤 4.5 / 6.5 / 8.5 插步）
- 视觉枚举通道（步骤 1）：逐项列出 设计稿中可见元素，含位置 / 文本 / 颜色 / 可交互性
- 交互推断与置信度标志（步骤 4）：identified / inferred / needs_human_input 三级分类
- 状态枚举（步骤 4.5）：loading / empty / success / error 等运行时状态，必需状态强制列出
- 数据契约推导（步骤 5）：TypeScript 风格 Props / Events interface，业务语义命名
- 组件分解（步骤 6）：名称 / 目的 / 复用信号（business-specific / feature-shared / atom-candidate / existing:{path}）
- 判定变更类型（步骤 6.5）：新建 vs 改造既有组件，决定 spec.md 使用哪份模板
- 规格实体化（步骤 7）：生成 `notes.md` + `spec.md`，含埋点锚点节
- Annotated SVG（步骤 8.5，可选）：编号圆圈 + Legend 映射到 spec Requirement / Scenario，三色置信度配色
- `references/visual-analysis-checklist.md`：强制枚举检查清单
- `references/openspec-format.md`：OpenSpec 格式规范
- `references/scenario-writing-guide.md`：Scenario 写作纪律（反模式 + 自检清单）
- `references/stack-hints/miniprogram.md`：微信小程序注意事项
- `references/stack-hints/web.md`：通用 Web 注意事项
- `templates/notes.md`：设计笔记模板（含状态枚举、埋点锚点）
- `templates/spec.md`：OpenSpec 增量模板（新建组件，仅 ADDED）
- `templates/spec-modified.md`：OpenSpec 增量模板（改造组件，MODIFIED / ADDED / REMOVED）
- `examples/today-windvane/`：golden sample（notes.md + spec.md + input.svg + input-annotated.svg）

---

[0.6.0]: https://github.com/blade-demon/skill-collections/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/blade-demon/skill-collections/compare/v0.5.0...feat/design-to-spec-v0.5.1
[0.5.0]: https://github.com/blade-demon/skill-collections/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/blade-demon/skill-collections/releases/tag/v0.4.0
