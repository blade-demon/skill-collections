# Init Project Rules 工作流

当目标项目中缺少 `.image-to-component.rules.md` 时使用本工作流。它在 Step 1 询问 image-to-component 生成问题之前运行，随后带着已初始化的规则作为项目上下文返回 Step 1。

## 触发条件

在 image-to-component 运行开始时：

1. 从用户请求的输出位置或当前工作目录解析目标项目根目录。
2. 检查 `<project-root>/.image-to-component.rules.md`。
3. 若文件存在，读取并继续 Step 1。
4. 若文件缺失，运行本工作流一次，创建文件，然后继续 Step 1。

本工作流期间不要读取图片。在规则文件存在或用户取消初始化之前，不要询问 Step 1 的框架/输出/语言/样式问题。

## 扫描策略

在选择默认值前收集轻量级项目证据：

- 组件目录：检查常见根目录，如 `src/components`、`components`、`app/components`、`src/app`、`src/ui`、`src/shared/ui` 及现有 import 别名。
- 样式栈：检查现有组件文件与包元数据中的 CSS Modules（`*.module.css`）、plain CSS/BEM（带 BEM 风格类名的 `*.css`）、CSS-in-JS、Tailwind、Sass 或仅 UI 库样式。
- Class helper：在 `src/utils`、`src/lib`、`utils`、`lib` 下搜索 `cn`、`clsx`、`classnames`、`classNames` 或本地 utility export。
- Icon 来源：检查包元数据与 import 中的 icon 库。若一致，优先使用现有单一 icon 来源。
- 无障碍要求：检查现有组件与项目文档中的交互元素标注模式。
- 基础组件：搜索 `Button`、`Card`、`Modal`、`ListItem` 组件。仅在实际发现时记录路径。
- 测试命令：检查 `package.json` scripts。优先使用运行组件/单元测试的现有脚本。
- 组件库：检查 `package.json` dependencies 与 devDependencies 中的已知 UI 库包（`antd`、`@mui/material`、`@chakra-ui/react`、`@radix-ui/*`、`tailwindcss`）。同时检查项目根目录的 shadcn 标记文件 `components.json`（shadcn 将组件复制到项目中而非安装包）。

可用时使用 `rg`/`rg --files`。保持扫描足够浅，避免将初始化变成全面审计。

## 组件库检测与确认

扫描策略完成后，在写入规则文件前解析项目的组件库。Style Connect（Step 8）需要此列表以选择正确的 Library Adapter 进行 token 发现。

### 标准化库名称

将检测信号映射为规则文件与 adapter 表使用的标准化名称：

| Detection signal                         | Standardized name                      |
| ---------------------------------------- | -------------------------------------- |
| `antd` in dependencies                   | `antd`                                 |
| `@mui/material` in dependencies          | `mui`                                  |
| `@chakra-ui/react` in dependencies       | `chakra`                               |
| Any `@radix-ui/*` in dependencies        | `radix`                                |
| `tailwindcss` in devDependencies         | `tailwind`                             |
| `components.json` exists at project root | `shadcn`                               |
| User-specified "Other" entry             | `<lowercased-user-input>` (no adapter) |

### 确认流程

若检测产生至少一个匹配，请用户确认：

```text
Detected component libraries from package.json:
  ✓ antd  (found in dependencies)
  ✓ tailwind  (found in devDependencies)

Detected from project files:
  ✓ shadcn  (components.json marker found)

Confirm libraries for Style Connect token discovery:

A. Confirm detected list: [antd, tailwind, shadcn]
B. Edit the list (add/remove libraries; specify order — first has higher priority)
C. None — use only project-local token sources
```

若未检测到任何库，从零询问：

```text
No known component library detected in package.json.

Which library does this project use? (Multi-select allowed)

A. None / custom internal — only scan project-local tokens
B. Ant Design (antd)
C. Material-UI (@mui/material)
D. Chakra UI (@chakra-ui/react)
E. shadcn/ui (components copied into project)
F. Radix UI primitives (@radix-ui/*)
G. Tailwind CSS
H. Other — specify package name(s)
```

### 库优先级

库列表顺序即 Style Connect 在多个来源定义同一 token 名称时用于解决冲突的**优先级顺序**。项目本地 token 始终优先于任何库；库之间**列表第一项优先级最高**。

当用户选择 B（Edit the list）时，明确说明顺序很重要。自动检测的默认顺序：dependencies 先于 devDependencies，然后是项目文件标记（shadcn），各组内保持 package.json 声明顺序。

## 默认值

当项目证据缺失、不完整或与用户规格一致时，编码以下默认值：

| Rule                | Default                                                          |
| ------------------- | ---------------------------------------------------------------- |
| Component directory | `src/components/`                                                |
| Style stack         | CSS Modules                                                      |
| `cn` helper path    | `src/utils/cn.ts`                                                |
| Icon source         | Only `@iconify/react`; do not introduce new icon packages        |
| Accessibility       | All interactive elements must have `aria-label`                  |
| Base components     | `Button`, `Card`, `Modal`, `ListItem` with paths when discovered |
| Test command        | `vitest`                                                         |
| Component libraries | `[]` (none — only project-local token sources used)              |

默认值不是对现有应用的猜测。在规则文件中将其标记为 default，以便后续生成能区分项目证据与回退策略。

## 冲突处理

若证据与默认值冲突：

- 优先采用用户明确指令，而非检测证据。
- 优先采用强项目证据，而非默认值。
- 若两种项目约定冲突，在 `Open Questions` 下记录冲突，并在生成依赖未解析选择的代码前询问。
- 若 icon import 显示多个库，不要新增包。记录用户指令或项目约定所选允许来源；否则默认 `@iconify/react` 并标记冲突。
- 若 `cn` helper 存在于不同路径，记录发现的路径，而非创建默认 helper。
- 若未发现基础组件路径，记录组件名称并标注 `path: not discovered`。
- 若 `package.json` 显示已知 UI 库但用户在组件库确认中选择 "None"，尊重用户选择并在 `Open Questions` 中记录差异（用户可能正在迁移离开该库）。

若冲突阻塞生成，写入规则草稿后停止并让用户选择。若不阻塞生成，继续并记录决策，将冲突纳入 `Open Questions`。

## 输出模板

使用以下结构创建 `.image-to-component.rules.md`：

```markdown
# Image To Component 项目规则

为本项目的 image-to-component 运行生成。项目约定变更时请更新本文件。

## 组件目录

- Directory: `src/components/`
- Source: default | project evidence | user instruction

## 样式栈

- Stack: CSS Modules
- Source: default | project evidence | user instruction
- Notes: <module file naming, BEM convention, Tailwind policy, or other relevant constraints>

## 组件库

- Libraries (in priority order): `[antd, tailwind]`
- Source: project evidence | user confirmation | user instruction
- Detection method: package.json dependencies | components.json marker | user-specified
- Priority rule: project-local tokens always win over library tokens; among libraries, the first entry has highest priority.
- Notes: <e.g., "antd v5 with CSS-in-JS"; "shadcn components in src/components/ui">

### Token 发现来源（参考信息）

Style Connect 运行时将扫描以下来源的 token：

- Project-local: `src/tokens/`, `src/styles/`, `tailwind.config.*`
- Library: <resolved adapter paths, e.g., `node_modules/antd/dist/reset.css`, `tailwind.config.*` resolved theme>

If no library is selected, only project-local sources are scanned.

## Class Name Helper

- Helper: `cn`
- Path: `src/utils/cn.ts`
- Source: default | project evidence | user instruction
- Policy: Reuse this helper for React class composition. Do not redefine it in every component.

## 图标

- Allowed source: `@iconify/react`
- Policy: Do not introduce new icon packages. Use existing project icons only when listed here.
- Existing icon components/imports: <paths or "none discovered">

## 无障碍

- All interactive elements must have `aria-label`.
- Prefer semantic buttons/links for actions.
- Preserve heading hierarchy through configurable heading props when needed.

## 现有基础组件

| Component | Path           | Notes             |
| --------- | -------------- | ----------------- |
| Button    | not discovered | default candidate |
| Card      | not discovered | default candidate |
| Modal     | not discovered | default candidate |
| ListItem  | not discovered | default candidate |

## 测试命令

- Command: `vitest`
- Source: default | project evidence | user instruction

## 待决问题

- None.
```

证据清晰时用发现值替换默认值。即使未发现路径，仍保留 `Button`、`Card`、`Modal`、`ListItem` 的表格行。

## 后续步骤

写入 `.image-to-component.rules.md` 后：

1. 用一段简短文字向用户总结所选规则。
2. 若无阻塞冲突，返回 Step 1 并询问常规 upfront 问题。
3. 若仍有阻塞冲突，在 Step 1 前请用户解决。

工作流其余部分将 `.image-to-component.rules.md` 视为 Image Connect、属性定义、目录规划与代码生成的权威项目约定输入。
