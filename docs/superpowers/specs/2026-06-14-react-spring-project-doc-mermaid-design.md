# React + Spring 项目文档 Mermaid 交互架构图设计

## 背景

`react-spring-project-doc` 当前在 `architecture.md` 中要求输出 ASCII 架构图，并在
Phase 8 执行构建、测试、lint、typecheck 命令。实际试跑表明：

- ASCII 图难以表达用户操作、前端分层、HTTP、后端分层、数据访问以及响应/异常回流。
- 构建命令容易被本机 Node、JDK、Maven、父目录依赖和网络状态干扰，与静态代码文档的
  准确性校验目标不完全一致。

本次调整将图形交付改为 Mermaid，并暂时从 P8 移除运行命令验证。

## 目标

1. 生成覆盖整个项目、但只包含代码可证实运行时交互的 Mermaid 架构图。
2. 同时提供项目全景和核心业务链路细节，方便新人先看整体、再沿链路阅读。
3. 图中的节点和连线遵守现有证据账本与置信度规则，不通过图形补全缺失事实。
4. P8 聚焦静态文档可信度，不执行构建、测试、lint 或 typecheck 命令。
5. 不增加运行时依赖，不修改目标项目业务代码。

## 非目标

- 不绘制部署拓扑、CI/CD、容器、Kubernetes 或云资源。
- 不绘制代码和配置中无法确认的外部系统。
- 不生成图片、SVG、PNG 或独立 HTML。
- 不新增最终文档文件；继续使用现有 8 份 P7 文档和 1 份 P8 校验报告。
- 不保证通过 Mermaid CLI 做完整语法编译；保持 skill 与校验脚本零依赖。

## 输出设计

### `docs/architecture.md`

将原 ASCII 图替换为一张 `flowchart LR` Mermaid 运行时全景图。

图按以下子图组织：

1. 用户与浏览器：用户操作、页面或页面模块。
2. React 前端：路由/路由守卫、状态、API 方法、请求与响应拦截器。
3. HTTP 边界：可证实的 baseURL、proxy、context-path、请求头和响应格式。
4. Spring 后端：Filter/Interceptor、Controller、Service、Repository/Mapper。
5. 数据层：代码或配置可确认的数据库和核心表/集合。
6. 回流路径：成功响应、业务异常、鉴权失败及前端处理。

全景图只展示架构角色和主要交互，不为每个类或每个接口各建一个节点，避免复杂项目
出现不可读的连线网。

### `docs/business-flows.md`

每条 P5 选出的核心业务链路增加一张独立 Mermaid 图，使用 `flowchart LR`，至少覆盖：

```text
用户操作 → 页面/事件 → 前端 API → HTTP → 鉴权（如有）
→ Controller → Service → Repository/Mapper → 数据模型/数据库
→ 返回值 → 前端状态或渲染
```

异常路径有代码证据时使用分支表示。链路不完整时：

- 画到最后一个已确认节点为止。
- 使用“断点：待确认”节点标明缺口。
- 不得为了视觉闭环添加推测连线。

## Mermaid 证据规则

### 节点

节点分为两类：

- 代码符号节点：页面、组件、函数、拦截器、Controller、Service、Repository、模型。
- 运行时概念节点：用户、浏览器、HTTP 请求、数据库、成功响应、异常响应。

代码符号节点必须能映射到 P2-P6 产物或 evidence ledger 中的路径与符号。运行时概念节点
必须由配置、调用关系或框架行为直接支持。

### 连线

每条连线必须表达已登记的调用、传递、读写、拦截或返回关系。允许的来源：

- P4 API 映射记录。
- P5 业务链路记录。
- P2/P3 中有路径和符号支撑的框架交互。
- evidence ledger 中允许进入最终文档的结论。

中置信度关系必须在节点或相邻正文中标注“推测”。低置信度关系不得画成确定连线。

### 标签

- 节点 ID 使用稳定 ASCII 标识，如 `loginPage`、`authController`。
- 用户可见标签使用简体中文，并在代码符号节点中附真实符号名，例如
  `loginPage["登录页<br/>LoginPage"]`。
- 包含括号、斜杠、冒号或空格的标签统一使用双引号。
- 边标签只写协议、方法、关键 header 或返回类型，不堆放长说明。

### 图级证据声明

每个 Mermaid 代码块开头必须使用注释列出该图依赖的 Evidence，例如：

```mermaid
flowchart LR
  %% Evidence: E-014, E-019
```

校验脚本确认这些 Evidence ID 在 `evidence-ledger.md` 中存在。图级声明用于建立可机械检查的
溯源入口；P8 仍需逐条核对节点和连线是否确实被所列 Evidence 或对应 P4/P5 记录支持。

## 阶段职责变化

### Phase 7

P7 仍只读取 `01` 至 `06` 中间产物和 evidence ledger，不重新扫描源码。

新增生成要求：

- `architecture.md` 必须有且仅有一张运行时全景 Mermaid。
- `business-flows.md` 中每条核心链路必须有一张 Mermaid。
- 图和相邻正文必须表达一致的链路完整性。
- 未匹配 API 只在正文或“待确认”节点中呈现，不伪造调用关系。

### Phase 8

移除以下项目：

- 构建命令执行。
- 测试命令执行。
- lint 命令执行。
- typecheck 命令执行。
- validation report 中的“命令可执行性”章节。

新增以下校验：

1. Mermaid 代码块完整，声明为支持的 `flowchart`。
2. `architecture.md` 恰好包含一张全景图。
3. `business-flows.md` 的 Mermaid 数量与 `## F-<编号>` 核心链路标题数量一致。
4. 每张图声明的 Evidence ID 均存在。
5. 代码符号节点可在项目或中间产物中定位。
6. 图中连线可追溯到 API 映射、业务链路或 evidence ledger。
7. 图、正文、API 映射和链路完整性结论互不矛盾。
8. 不完整链路没有被 Mermaid 画成完整闭环。

## 校验脚本

扩展 `scripts/validate-docs.js`，保持 CommonJS、零依赖：

- 提取 Markdown 中的 Mermaid fenced code block。
- 检查 fence 是否闭合、首个有效语句是否为 `flowchart`。
- 统计各文档 Mermaid 数量。
- 提取 Mermaid 节点标签中的代码符号与文件路径，复用现有路径/符号定位。
- 提取 `%% Evidence:` 声明并核对 Evidence ID 是否存在。
- 输出结构错误为硬失败。

脚本不实现完整 Mermaid parser。节点与连线的业务真实性仍由 P8 按 evidence ledger 和
P4/P5 产物逐项核对。

## 文件改动范围

- `skills/react-spring-project-doc/SKILL.md`
- `skills/react-spring-project-doc/README.md`
- `skills/react-spring-project-doc/CHANGELOG.md`
- `skills/react-spring-project-doc/templates/07-doc-generation.md`
- `skills/react-spring-project-doc/templates/08-validation.md`
- `skills/react-spring-project-doc/schemas/validation-record.md`
- `skills/react-spring-project-doc/references/phase-resume-guide.md`
- `skills/react-spring-project-doc/scripts/validate-docs.js`
- `skills/react-spring-project-doc/scripts/tests/validate-docs.test.js`
- `demo-react-spring/docs/architecture.md`
- `demo-react-spring/docs/business-flows.md`
- `demo-react-spring/docs/validation-report.md`
- `demo-react-spring/docs/.analysis/08-validation-report-draft.md`

demo 目录受本地 Git exclude 保护，仅用于真实效果验证，不进入产品提交。

## 测试策略

校验脚本按 TDD 增加以下覆盖：

1. 不属于 `architecture.md` / `business-flows.md` 的普通文档没有 Mermaid 时，仍可按原
   路径/符号规则校验。
2. 合法 `flowchart LR` 可被提取并通过。
3. 未闭合 Mermaid fence 为硬失败。
4. 非 `flowchart` 声明为硬失败。
5. `architecture.md` 缺少或包含多张 Mermaid 时按新规则失败。
6. `business-flows.md` 的图数量与识别到的 F 编号链路数量不一致时失败。
7. Mermaid 标签中的路径和代码符号继续参与存在性校验。
8. 图级 Evidence ID 缺失或无法在 ledger 中定位时失败。

真实 demo 验证：

- strict 路径/符号/Mermaid 结构校验退出码为 0。
- 全景图覆盖前端、HTTP、鉴权、后端、数据层和响应/异常回流。
- 三条核心业务链路各有一张 Mermaid，且与 P5 记录一致。
- P8 报告不再出现构建、测试、lint、typecheck 的执行结果。

## 验收标准

- 用户能在 `architecture.md` 一屏理解代码可证实的运行时全景。
- 用户能在 `business-flows.md` 沿每条核心业务从操作追到数据访问和返回。
- 图中不存在未登记的新系统、新符号或推测闭环。
- P8 不执行任何构建、测试、lint、typecheck 命令。
- `validate-docs` 测试与 demo strict 校验通过。
