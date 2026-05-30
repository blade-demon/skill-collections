# Ledger + Decision-Gate 实现摘要

本文档总结 image-to-component skill 中 **Ledger + Decision-Gate** 模式的实现，重点说明如何处理样式 token 并防止 AI 幻觉。

## 新增内容

### 1. 新工作流：Style Connect（`workflows/style-connect.md`）

**目的：** 将检测到的视觉样式特征映射到现有 design token，并将未解析映射捕获到结构化 ledger 中。

**主要特性：**

- Token 发现：在项目中搜索现有 design token
- 样式特征映射：尝试将提取的提示匹配到现有 token
- Token ledger 创建：结构化表格捕获未解析映射
- Decision-gate：代码生成前明确的用户检查点（A/B/C 选项）
- Confidence 级别：跟踪映射确定性（high/medium/low/none）
- 多种 Status 取值：pending、provided、reused、create、hardcoded、skip

**输入：**

- Step 4 的样式提示（若启用样式提取）
- 项目 design token 定义（如有）
- `.image-to-component.rules.md`（token 配置）

**输出：**

- `token-ledger.md` 表格（含未解析/歧义映射）
- 用户通过 decision-gate 确认 token 决策

**集成：**

- 作为 **Step 8** 运行（可选，仅当 Step 1 启用样式提示时）
- 位于 Image Connect（Step 7）之后
- 位于代码生成（Step 10）之前

### 2. 更新主工作流（`SKILL.md`）

**变更：**

- 为 `workflows/style-connect.md` 新增 routing map 条目
- 在 step skeleton 中新增 Step 8："Style Connect (Optional)"
- 更新 Step 11 输出要求：待处理时包含 `token-ledger.md`
- 新增 3 条与样式 token 处理相关的常见错误：
  - 不要在没有 ledger 的情况下硬编码样式值
  - 不要未经用户批准臆造新 token
  - 不要跳过 style-connect decision-gate

**核心原则：**

> "If style hints were enabled in Step 1, run Style Connect in Step 8 to map traits to tokens. If not enabled, skip to Step 9."

### 3. 更新代码生成（`workflows/code-generation.md`）

**新章节："Token Usage (From Style Connect)"**

说明如何在生成代码中使用已确认的 token 映射：

- **Provided tokens** → 直接引用（`var(--token-name)`）
- **Create tokens** → 添加 TODO 注释供后续定义
- **Hardcoded tokens** → 内联值加 TODO 标记
- **Skipped tokens** → 完全省略，使用浏览器默认

确保代码生成尊重 Style Connect 决策，不臆造 token。

### 4. 更新输出工作流（`workflows/output-and-writing.md`）

**变更：**

- 更新目录树规则：待处理时包含 token-ledger
- 更新退出条件：与 asset-ledger 一并引用 token-ledger

### 5. 新参考文档（`docs/ledger-and-gate-pattern.md`）

**目的：** 全面解释 Ledger + Decision-Gate 模式及其如何防止 AI 幻觉。

**章节：**

- 模式概览：Ledger（捕获）+ Decision-Gate（批准）
- 二者如何协同（6 步流程图）
- Asset Ledger 示例（skill 中已有）
- Token Ledger 示例（新增）
- 为何能防止幻觉
- 应避开的模式（代码示例）
- Ledger status 含义（pending/provided/reused/create/hardcoded/skip）
- 集成点（Image Connect、Style Connect、Asset Handling）
- 要点：可见性 + 确认 = 安全

## 模式实践

### 之前（无 Ledger + Gate）：

```
1. Extract styles from images
2. AI guesses which tokens they should use
3. AI invents new tokens if no clear match exists
4. Code generated with guessed mappings
5. Later: designer notices wrong colors/spacing (too late)
```

**问题：** 静默假设、不可见猜测、已发布代码中的 bug。

### 之后（有 Ledger + Gate）：

```
1. Extract styles from images
2. AI tries to map traits to existing tokens
3. Unresolved mappings → recorded in token-ledger
4. User reviews ledger and explicitly chooses:
   - A: Accept proposed mappings
   - B: Change specific mappings
   - C: Hardcode everything with TODOs
5. Code generated with confirmed decisions only
6. Later: designer knows exactly what tokens were used
```

**收益：** 可审计、透明、需要明确批准。

## Token Ledger 格式

token-ledger 表格捕获：

```markdown
| Token ID  | Hint source             | Source image(s) | Visual trait  | Suggested token name | Source        | Confidence | Status   | User action              |
| --------- | ----------------------- | --------------- | ------------- | -------------------- | ------------- | ---------: | -------- | ------------------------ |
| token-001 | corner_radius=medium    | all images      | Border radius | `--radius-md`        | project-local |       high | provided | Exists in project        |
| token-002 | shadow_presence=card    | pending.png     | Card shadow   | `--ant-box-shadow`   | lib:antd      |       high | pending  | Confirm antd theme value |
| token-003 | type_hierarchy_levels=3 | pending.png     | Font scale    | typography           | lib:tailwind  |       high | pending  | Confirm Tailwind scale   |
```

每行表示一个检测到的样式特征及其映射状态。`Source` 列捕获来源（项目代码、已安装库、AI 提案）——完整说明见下文 Iteration 2 章节。

## Decision-Gate 格式

构建 ledger 后，工作流展示此门控：

```
Please confirm Style Connect token mappings:

[Show token-ledger.md table]

A. Accept all token bindings.
   Resolve unresolved tokens as:
   - high confidence → use suggested name
   - medium/low confidence → ask me per token
   - none confidence → hardcode with TODO

B. Change one or more decisions.
   Tell me which token IDs should be:
   - mapped to different existing token
   - created as new project tokens
   - hardcoded with TODO comment
   - skipped entirely

C. Skip Style Connect. Hardcode all styles with TODO.
```

用户选择 A、B 或 C。确认前不运行代码生成。

## 与现有模式的集成

token-ledger 模式与现有 **asset-ledger** 模式并行：

| Aspect           | Asset Ledger                                                            | Token Ledger                                                                                        |
| ---------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| What it captures | Media/icon assets without reliable sources                              | Style traits without clear token mappings                                                           |
| Table columns    | Asset ID, source images, intended use, placeholder, user action, status | Token ID, hint source, source images, visual trait, suggested name, confidence, user action, status |
| Decision-gate    | Happens during asset-handling (Step 9)                                  | Happens during style-connect (Step 8)                                                               |
| Code generation  | Uses confirmed asset references                                         | Uses confirmed token references                                                                     |
| Status values    | pending, provided, reused                                               | pending, provided, reused, create, hardcoded, skip                                                  |

二者目的相同：**让不确定性可见、要求批准、防止猜测**。

## Style Connect 何时运行

**前置条件：** Step 1 必须启用样式提示。

若禁用样式提示：

- Step 4 不派发 style-context 子代理
- Step 8 不运行 Style Connect 工作流
- 代码生成完全跳过 token 映射
- 默认：硬编码样式（或 CSS 遵循模板默认）

若启用样式提示：

- style-context-prompt.md 子代理在 Step 4 提取提示
- Style Connect 工作流在 Step 8 运行
- Decision-gate 要求用户确认
- 代码生成使用已确认的 token 映射

## 修改的文件

1. **SKILL.md** — 新增 Step 8，更新 routing map，新增常见错误
2. **workflows/code-generation.md** — 新增 "Token Usage" 章节
3. **workflows/output-and-writing.md** — 更新目录树与退出规则
4. **workflows/style-connect.md** — 新增（8119 bytes）
5. **docs/ledger-and-gate-pattern.md** — 新增（综合参考）

## 未修改的文件（现有，仍在使用）

- `protocols/style-context-spec.md` — 定义允许的样式提示（corner_radius、shadow_presence 等）
- `../prompts/style-context-prompt.md` — 派发子代理从图片提取提示
- `workflows/image-connect.md` — 组件复用决策的并行模式
- `workflows/asset-handling.md` — 资源管理的并行模式

## 后续步骤（可选增强）

实现已完成，未来工作可包括：

1. **Style Context 子代理 Prompt** — 若需更深样式提取（颜色、精确尺寸、排版细节），可新增 `style-token-prompt.md`。当前样式提示为粗粒度（corner_radius=medium、shadow_presence=card 等）。

2. **Token 创建辅助** — 若用户选择 "create" status，增加创建新 token 的指引。

3. **Token 导出集成** — 说明 token-ledger 如何与设计系统 token 文件生成集成。

4. **模板更新** — 在 CSS Modules 与 BEM 模板中增加 token 引用示例。

5. **渲染验证** — 扩展 render-verification.md，检查代码生成后引用的 token 是否实际存在。

## 核心原则

> **Ledger = Make it visible. Decision-Gate = Require approval. Code = Use only confirmed decisions.**

该模式确保：

- 不会静默臆造 token
- 所有样式决策要么自动处理（高置信度），要么经用户明确批准
- 生成代码可审计、可追溯到用户决策
- 通过有意识、可见的选择维护设计系统一致性

---

## 后续：Token 来源感知（Iteration 2）

初始实现后，token-ledger 扩展为跟踪每个候选 token 的**来源**（project-local vs. 已安装组件库 vs. AI-proposed）。这使 skill 更接近真实项目组织方式——token 常来自项目自有 design token 与所依赖组件库（antd、MUI、Chakra、shadcn、Tailwind、Radix）的混合。

### 变更（Iteration 2）

1. **`workflows/init-project-rules.md`**
   - 扫描策略现从 `package.json` 与 shadcn `components.json` 标记检测组件库。
   - 新增 "Component Library Confirmation" 章节：先自动检测，再请用户确认或编辑；仅当未检测到任何库时显示冷启动菜单。
   - 规则文件输出模板新增 `Component Libraries` 章节，位于 Style Stack 与 Class Name Helper 之间。
   - 库列表顺序 = 优先级顺序；项目本地始终整体优先；库列表按 `dependencies` → `devDependencies` → 项目文件标记排序，保持 package.json 声明顺序。
   - 冲突处理规则："package.json 显示库 X 但用户选择 None"。

2. **`workflows/style-connect.md`**
   - Token 发现现从规则文件读取 `Component Libraries`，并运行新内联 "Library Adapters" 表中匹配的 adapter。
   - 内置 adapter：`antd`、`mui`、`chakra`、`shadcn`、`tailwind`、`radix`（Radix 无 design token；匹配但记为 `inferred`）。
   - Token-ledger 新增 `Source` 列，允许值：`project-local`、`lib:<name>`、`css-var-runtime`、`proposed`、`inferred`。
   - 优先级解析：同一 token 名称存在于多个来源时，最高优先级来源胜出；行的 `User action` 列提及低优先级重复项以保持透明。
   - 未来扩展点：工作流注明若存在 `protocols/library-adapters.md`，其覆盖内联 adapter 表——计划中的用户自定义 adapter 扩展点。

3. **文档更新**
   - `docs/style-connect-quick-reference.md` — 示例新增 Source 列，新增 "Source Column (Quick Decoder)" 表，新增库相关故障排查条目。
   - `docs/ledger-and-gate-pattern.md` — Token Ledger 示例现含 Source 列及来源重要性的简短说明。

### 推迟至 Iteration 3

- 将 Library Adapters 提取到 `protocols/library-adapters.md`（未来扩展点目标）。推迟至内联 adapter 数量超过约 8 个或需要用户自定义 adapter 时。
- 支持用户提供的自定义 adapter（如公司内部 design system）。当前此类库可在 init 中列为 "Other"；其 token 显示为 `Source: inferred`。

---

**Implementation Date:** May 16, 2026  
**Status:** Iteration 2 complete (Source-aware ledger + library detection in init). Iteration 3 (`protocols/library-adapters.md` extraction) deferred until needed.
