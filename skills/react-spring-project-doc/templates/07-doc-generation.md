# Phase 7 — Document Generation 模板

> 在 `docs/` 下生成 8 份散文文档 + `index.json`（结构化索引）+ `ai-context.md`（AI 上下文摘要），共 10 份产物（不含 `validation-report.md`，它由 P8 生成）。**只装配 `.analysis` 中间产物 + 证据账本，不重新读源码、不引入新结论。**
> 允许的来源：代码证据、`.analysis` 产物、证据账本、显式标注的推测、显式标注的待确认项。
> 低置信度结论：在最终文档里降级为「推测」或移入「待确认」，不得写成事实。
> 每份文档**面向新入职同事**：先讲「这是什么、我该从哪看起」，再给细节，路径可点击、命令可复制。

> 全局约定（每份文档顶部一行）：
> `> 本文档由 react-spring-project-doc 基于代码证据生成于 <日期>，对应提交 <commit>。结论可信度见 validation-report.md。`

---

## 1. onboarding.md — 新人上手

章节骨架：

- **项目是什么**：一句话用途 + 用户是谁（来源 `01` 第 1 节）。
- **跑起来**：环境要求 → 安装 → 启动前端 → 启动后端 → 联调方式（来源 `01` 第 5、6 节）。命令可直接复制。
- **代码地图**：前端在哪、后端在哪、配置在哪（来源 `01` 第 3 节），各一句话。
- **从哪开始读**：推荐先读哪 1~2 条核心业务链路（指向 business-flows.md 的 F-1）。
- **先看哪、找谁**（来源 `01` 第 8 节 git）：高频改动文件/目录热点指出最常变动的核心区,优先熟悉;CODEOWNERS/主要贡献者指出归属与求助对象。**git 信息不可用时省略本段**,不要编。
- **常见第一天问题**：指向 troubleshooting.md。

## 2. architecture.md — 架构

- **整体架构**：前端 → （代理/网关）→ 后端 → 数据库的请求路径（来源 `01`/`04` 拼接说明）。
- **分层**：前端分层（页面/组件/状态/请求）、后端分层（Controller/Service/Repository/Model）（来源 `02`/`03`）。
- **横切关注点**：鉴权链（Spring Security 过滤器/认证入口/Token，来源 `03` 第 6 节「安全与鉴权链」小节）、拦截器、统一返回、异常处理。
- **一张运行时全景 Mermaid**：必须有且仅有一张 `flowchart LR`，覆盖用户操作、React 页面/路由/API、HTTP 边界、Spring 鉴权/Controller/Service/Repository、可确认的数据存储、成功响应与异常回流。
- 图中只放代码或配置可证实的运行时节点和主要交互，不画部署拓扑，不把所有类都塞进全景图。
- 图开头必须声明本图使用的 Evidence：

  ```mermaid
  flowchart LR
    %% Evidence: E-001, E-003, E-013
    user["用户"] --> page["页面<br/>PageComponent"]
  ```

- 节点 ID 使用 ASCII；包含括号、斜杠、冒号或空格的标签使用双引号；边标签只写 HTTP 方法、URL、header 或返回类型等关键事实。

## 3. frontend.md — 前端模块分析

- 直接由 `02-frontend-index.md` 提炼：路由表、页面模块、API 方法、状态管理、权限/拦截器。
- 每个业务模块写「职责 + 关键页面 + 关键 API」，置信度低的标推测。

## 4. backend.md — 后端模块分析

- 直接由 `03-backend-index.md` 提炼：Controller/Service/Repository 分层、各业务模块、横切关注点、定时任务、外部调用。
- **单列「安全与鉴权链」一节**（来源 `03` 第 6 节安全小节）：配置类、认证过滤器、认证入口、Token 机制、方法级权限；静态确认不了的保留「待确认」。
- 置信度低的标推测。

## 5. api-map.md — 前后端接口映射表

- 直接由 `04-api-map-draft.md` 的映射表 + 未匹配清单生成。
- **保留**「未发现前端调用 / 未发现后端匹配接口」两类，这是交接重点，不要删。

## 6. business-flows.md — 核心业务链路

- 直接由 `05-business-flows-draft.md` 生成。每条链路保留完整性判断。
- 每个 `## F-<编号>` 标题后必须紧跟一张 `flowchart LR` Mermaid，图数量与核心链路数量严格一致。
- 每张图从用户操作画到前端状态/渲染，沿途包含 P5 已确认的 API、HTTP、鉴权、Controller、Service、Repository/Mapper、数据模型和返回路径。
- 每张图开头使用 `%% Evidence: E-xxx` 声明对应业务链路和 API 映射 Evidence。
- **不完整/需人工确认的链路必须保留该标注**，不要补全成「看起来闭环」。
- 不完整链路只画到最后一个确定节点，再连接到 `断点["断点：待确认"]`；禁止用推测连线闭环。

## 7. data-model.md — 数据模型

- 直接由 `06-data-model-draft.md` 生成。枚举值全量保留，待确认字段保留标注。

## 8. troubleshooting.md — 常见问题排查

- 来源：各阶段「待确认项」+ 拦截器/异常处理/环境配置中可预见的坑（来源 `02`/`03`）。
- 每条：**现象 → 可能原因 → 排查位置（path）→ 处理建议**。
- **高频改动区（潜在坑）**（来源 `01` 第 8 节 git）：把 churn 最高的文件/目录列为「易出问题、改动前先看历史」的提示。明确标注「热点是经验性推断,不等于确定缺陷」。git 不可用时省略。
- 没有证据支撑的「常见问题」不要编；宁可少写。

## 9. index.json — 结构化索引（供 AI 问答，机器可读）

- **字段格式见 `schemas/index-json.md`；填好的样例见 `examples/index-json-example.json`。**
- 数据**只来自** `.analysis` 产物与证据账本：`codeMap` 来自 `01`，`symbols`/`api` 来自 `02`/`03`/`04`，`flows` 来自 `05`，`dataModels` 来自 `06`，`evidence` 来自证据账本（`E-xxx` 必须与账本一致）。
- 每条带证据的结论引用一个 `E-xxx`；`file` 写真实相对路径、`line` 写真实行号。
- `flows[].id` 与 `business-flows.md` 的 `F-N` 一一对应。
- 不确定的内容进 `openQuestions`，**不要**塞进结构化字段冒充事实。
- 这是 P8 `validate-docs.js` 会确定性校验的产物：路径/符号/Evidence/引用完整性出错都会被打回。

## 10. ai-context.md — AI 上下文摘要（稠密入口，给 AI 助手丢进上下文）

- 一屏内说清：技术栈一行、代码地图（前端/后端/配置/迁移各一行 path）、3~6 条核心链路入口（指向 `F-N` 与 `index.json`）、关键符号锚点（Top 10~20，`符号 → file:line`）。
- **稠密、去重、可机读优先**：不重复散文文档的展开叙述，只给指针。
- 顶部一行注明：「本文件与 `index.json` 同源；结构化查询用 `index.json`，人/AI 速览用本文件。」

---

## 生成后自检（进入 P8 前）

- [ ] 每份文档顶部都有「来源/日期/可信度」声明行。
- [ ] 所有写成事实的结论，都能在证据账本里找到对应 Evidence（高置信度）。
- [ ] 所有「推测」「待确认」标注都被保留，没有被悄悄抹平。
- [ ] 没有出现 `.analysis` 与证据账本里都不存在的新路径、新符号、新链路。
- [ ] `architecture.md` 恰好一张 Mermaid；`business-flows.md` 每条 F-N 链路恰好一张。
- [ ] 每张 Mermaid 都有 `%% Evidence:` 声明，图中节点和连线未超出所列证据。
- [ ] `index.json` 已生成：必填键齐全，`file`/`line`/`E-xxx` 真实，`flows[].id` 与 F-N 对应，引用闭合。
- [ ] `ai-context.md` 已生成，与 `index.json` 同源、无新结论。
