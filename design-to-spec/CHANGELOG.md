# Changelog — design-to-spec

所有重要变更均记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本管理遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

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
