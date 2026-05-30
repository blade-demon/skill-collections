# Style Connect 工作流

Style Connect 在结构对比（Step 6）之后、代码生成（Step 10）之前运行。它将检测到的视觉特征映射到现有 design token，将未解析映射记入 ledger，并在将 token 绑定写入代码前要求用户明确确认。

**前置条件：** 若启用样式提取，须在 Step 4 通过 `../prompts/style-context-prompt.md` 提取样式提示。Style Connect 连接已提取提示与项目 token。

## 输入

必需输入：

- Step 4 中已校验的样式提示（若启用了样式提取）。
- `.image-to-component.rules.md`（token 引用与栈配置）。
- 访问项目现有 design token 或 token 定义（如有）。
- 用户在 Step 1 的样式栈选择（CSS Modules、plain CSS + BEM 或 unknown）。

若缺少 `.image-to-component.rules.md`，先运行 `workflows/init-project-rules.md`，待文件创建后再继续 Style Connect。

## Token 发现

在项目中搜索现有 design token，再在已声明的组件库中搜索：

1. 读取 `.image-to-component.rules.md`，识别 token 来源、位置及 `Component Libraries` 列表（按优先级排序）。
2. **项目本地来源**（始终扫描，最高优先级）：
   - Design system 包（从 `@company/design-tokens`、`@tokens/core` 等导入）
   - 本地 token 文件（`src/tokens`、`src/styles/tokens.ts`、`tailwind.config.js` 用户自定义段）
   - 项目 CSS 中声明的 CSS 自定义属性（`--color-primary`、`--spacing-md` 等）
   - CSS Modules 或 SCSS 变量文件
3. **库来源**（按 init Step 2 中用户声明的顺序扫描）：
   - 对 `Component Libraries` 列表中的每个库，运行下方 Library Adapters 表中匹配的 adapter。
   - 若某已声明库无对应 adapter（例如用户输入 "Other"），跳过该条目的库扫描，并将发现的 token 记为 `Source: inferred`。
4. 若声明了 token，提取其名称与值。为每个 token 记录 `Source`（见 Library Adapters）。
5. 若各层级均未找到 token 来源，映射为探索性；每个检测到的提示以 `Source: proposed` 进入 ledger。

### Library Adapters（内联）

若 `.image-to-component.rules.md` 声明了任何 `Component Libraries`，扫描其已知 token 路径，而非全量遍历 `node_modules`。每个 adapter 说明发现流程：(a) 如何检测库，(b) 读取哪些文件，(c) 如何在 `Source` 列命名 token。

| Library name | Detection                                                    | Token source paths                                                                 | Token namespace                                                   |
| ------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `antd`       | `antd` in `package.json` dependencies                        | `node_modules/antd/dist/reset.css`, `node_modules/antd/es/theme/themes/default.js` | `--ant-*` CSS vars; JS theme keys                                 |
| `mui`        | `@mui/material` in dependencies                              | `node_modules/@mui/material/styles/createTheme.js` (default theme object)          | JS theme keys (e.g., `palette.primary.main`)                      |
| `chakra`     | `@chakra-ui/react` in dependencies                           | `node_modules/@chakra-ui/theme/dist/index.mjs`                                     | JS theme keys (e.g., `colors.blue.500`)                           |
| `shadcn`     | `components.json` marker file at project root                | user's `globals.css` (or equivalent), `tailwind.config.*` resolved theme           | `--*` user-defined CSS vars + Tailwind utility classes            |
| `tailwind`   | `tailwindcss` in devDependencies; `tailwind.config.*` exists | `tailwind.config.*` resolved (handles `presets`, `extend`)                         | Utility class names; resolved `theme.colors.*`, `theme.spacing.*` |
| `radix`      | any `@radix-ui/*` in dependencies                            | (no design tokens; primitives only)                                                | n/a — record `Source: inferred` if matched                        |

**优先级解析：** 若同一 token 名称（如 `--color-primary`）出现在多个来源，取最高优先级来源的值，ledger 中仅保留一行。在行的 `User action` 列提及低优先级重复项以保持透明（例如 "Also defined in lib:antd; using project-local"）。

> **未来扩展点：** 若存在 `protocols/library-adapters.md`，其定义优先于上述内联表。内联表为 v0 默认；protocol 文件为计划中的扩展点，用于用户自定义 adapter 与更丰富的解析配置。

## 样式特征映射

对 Step 4 提取的每个样式提示，尝试映射到现有 token：

可映射的提示类型：

| Hint                                                         | Possible token mappings          | How to match                         |
| ------------------------------------------------------------ | -------------------------------- | ------------------------------------ |
| `corner_radius` (enum: `none`, `small`, `medium`, `large`)   | Border radius tokens             | Match radius scale level             |
| `shadow_presence` (enum: `none`, `card`, `modal`, `overlay`) | Shadow/elevation tokens          | Match shadow depth category          |
| `type_hierarchy_levels` (int 1-5)                            | Typography scale tokens          | Confirm font sizes/weights available |
| `density` (enum: `compact`, `normal`, `loose`)               | Spacing/padding tokens           | Implies base spacing scale           |
| `is_mobile_viewport` (boolean)                               | Responsive breakpoint tokens     | Signals mobile-first design          |
| `primary_action_count` (int)                                 | Action button color/style tokens | Indicates color palette usage        |

映射规则：

- 仅当提示数据足以无歧义选择 token 时才映射。
- 记录每个映射的置信度（high、medium、low）。
- 若提示值无法映射到现有 token，记为 `unresolved`。

## Token Ledger 格式

创建或输出 `token-ledger.md`，使用下表：

```markdown
| Token ID  | Hint source             | Source image(s)       | Visual trait                     | Suggested token name | Source        | Confidence | Status   | User action                                                                           |
| --------- | ----------------------- | --------------------- | -------------------------------- | -------------------- | ------------- | ---------: | -------- | ------------------------------------------------------------------------------------- |
| token-001 | corner_radius=medium    | pending.png, used.png | Medium border radius             | `--radius-md`        | project-local |       high | pending  | Confirm mapping or create new token                                                   |
| token-002 | shadow_presence=card    | expired.png           | Card drop shadow                 | `--ant-box-shadow`   | lib:antd      |     medium | pending  | Verify shadow depth mapping; also defined in lib:tailwind, using lib:antd by priority |
| token-003 | type_hierarchy_levels=3 | pending.png           | 3 font sizes (h1, body, caption) | `type-scale-3`       | proposed      |       high | pending  | No matching token found; create or use closest existing scale                         |
| token-004 | primary_action_count=1  | all                   | Single primary action color      | `--color-primary`    | project-local |       high | provided | Already exists in project                                                             |
```

### Source 列取值

| Value             | Meaning                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `project-local`   | Defined in the user's own code (`src/tokens/*`, project CSS variables, `tailwind.config.*` custom sections) |
| `lib:<name>`      | Defined in a declared component library (`lib:antd`, `lib:mui`, `lib:chakra`, `lib:shadcn`, `lib:tailwind`) |
| `css-var-runtime` | Found as a CSS custom property in a project file but with no clear definition site                          |
| `proposed`        | No matching token found in any source; AI proposed a new name (used with `status: create`)                  |
| `inferred`        | No source supports this token; pure heuristic from style hint (used with `status: hardcoded`)               |

## Status 取值

- `pending`：已检测到 token，尚未经用户确认。
- `provided`：token 映射已确认；项目中已存在。
- `reused`：现有 token 或 token 模式已明确确认并将使用。
- `create`：用户要求为该特征创建新 token。
- `hardcoded`：用户批准硬编码并加 TODO 注释，而非引用 token。
- `skip`：用户要求从代码生成中排除该样式。

## Confidence 级别

- `high`：提示无歧义映射到项目中恰好一种 token 模式。
- `medium`：提示指向某 token 族，但需用户确认具体 token。
- `low`：提示可映射到多个 token；用户须选择或创建。
- `none`：提示无法映射；须硬编码或创建新 token。

## Decision-Gate 格式

构建 token ledger 后，输出并询问：

```text
Please confirm Style Connect token mappings:

[Show token-ledger.md table]

A. Accept all token bindings. Resolve unresolved tokens as:
   - pending with high confidence → use the suggested token name
   - pending with medium/low confidence → stop and ask me per token
   - pending with none confidence → hardcode with TODO comment

B. Change one or more token decisions. Tell me which token IDs should be:
   - mapped to a different existing token
   - created as new project tokens
   - hardcoded with TODO (instead of referencing a token)
   - skipped entirely

C. Skip Style Connect. Hardcode all style values with TODO comments instead of token references.
```

在用户确认 A、B 或 C 之前，不要进入代码生成。

## 确认处理

用户选择处理：

| Choice | Action                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| A      | 应用默认解析策略（见上文）。更新 token ledger。继续 `workflows/style-plan.md`，然后 Step 10。                           |
| B      | 应用用户行级修改。若仍有歧义行则请求澄清。需要时重新展示 decision-gate。                                                |
| C      | 将所有 token 标记为 `hardcoded`。将整个 token ledger 状态标记为 skipped。继续 `workflows/style-plan.md`，然后 Step 10。 |

若 token 决策为 `create`，询问：

- 是否将新 token 加入 `.image-to-component.rules.md` 供后续运行使用？
- 新 token 文件位置应为何（若存在 token 文件结构）？
- 不要实际写入 token 文件；仅记录决策供代码生成使用。

## 供给 Style Plan 与 Step 10

Style Connect 决策约束 `workflows/style-plan.md`，后者再供给 Step 10 代码生成：

- **已映射 token** → 生成 CSS 变量引用或 token import 语句。
- **待解析 token** → 生成带建议 token 名称的占位注释。
- **硬编码 + TODO** → CSS 声明加注释，如 `/* TODO: extract to token <name> */`。
- **Skipped** → 从代码中省略样式；依赖浏览器默认或继承样式。

若代码生成需引用 token 值（用于 CSS 生成），用 token-ledger 识别哪些 token 已确认、哪些为占位。

## 示例 Ledger 结果

输入（来自 Step 4 样式提示）：

```
pending.png: corner_radius=medium, shadow_presence=card, type_hierarchy_levels=3
used.png: corner_radius=medium, primary_action_count=1
expired.png: corner_radius=medium, shadow_presence=modal, type_hierarchy_levels=3
```

项目上下文（来自 `.image-to-component.rules.md`）：

- `Component Libraries: [antd, tailwind]`（优先级顺序）
- 本地 token：`src/tokens/spacing.css`、`src/tokens/color.css`

输出（映射后的 token-ledger.md）：

```markdown
| Token ID  | Hint source             | Source image(s)          | Visual trait                         | Suggested token name         | Source        | Confidence | Status   | User action                                                                                                                            |
| --------- | ----------------------- | ------------------------ | ------------------------------------ | ---------------------------- | ------------- | ---------: | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| token-001 | corner_radius=medium    | all 3 images             | Medium border radius on cards        | `--radius-md`                | project-local |       high | provided | Exists: `--radius-md` in `src/tokens/spacing.css` (also defined in lib:antd as `--ant-border-radius`, using project-local by priority) |
| token-002 | shadow_presence=card    | pending.png, used.png    | Card elevation shadow                | `--ant-box-shadow`           | lib:antd      |       high | pending  | Confirm: matches antd default theme `--ant-box-shadow`                                                                                 |
| token-003 | shadow_presence=modal   | expired.png              | Modal-depth shadow                   | `--ant-box-shadow-secondary` | lib:antd      |     medium | pending  | Verify: could also use a stronger elevation; antd has 3 levels                                                                         |
| token-004 | type_hierarchy_levels=3 | pending.png, expired.png | Typography scale (h1, body, caption) | typography                   | lib:tailwind  |       high | pending  | Confirm: uses Tailwind `text-2xl`, `text-base`, `text-xs` from resolved config                                                         |
| token-005 | primary_action_count=1  | used.png                 | Primary action button color          | `--color-primary`            | project-local |       high | provided | Exists: `--color-primary` in `src/tokens/color.css`                                                                                    |
```

## 退出条件

当每个检测到的样式特征均满足以下之一时退出：

- 映射到已确认的现有 token（status: `provided` 或 `reused`），
- 分配新 token 名称待创建（status: `create`），
- 硬编码并加 TODO 注释（status: `hardcoded`），或
- 明确跳过（status: `skip`）。

将已确认的 token-ledger 传给 `workflows/style-plan.md`，再将得到的 `stylePlan` 纳入 Step 10 代码生成。
