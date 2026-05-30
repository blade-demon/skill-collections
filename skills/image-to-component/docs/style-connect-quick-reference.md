# Style Connect 快速参考

image-to-component 中 Style Connect 工作流（Step 8）的速查表。

## Style Connect 何时运行？

| Scenario                            | What happens                                             |
| ----------------------------------- | -------------------------------------------------------- |
| ✅ Step 1: Style hints **enabled**  | Style Connect runs in Step 8 after Image Connect         |
| ❌ Step 1: Style hints **disabled** | Style Connect skipped; code generation uses CSS defaults |

## Step 8：Style Connect 工作流

```
Input:  Style hints extracted in Step 4 (corner_radius, shadow, typography, etc.)
↓
Process: Map hints to existing design tokens
↓
Output: token-ledger.md table + decision-gate
↓
Wait:   User chooses A, B, or C
↓
Result: Confirmed token bindings for code generation
```

## Token Ledger 表格

展示所有检测到的样式特征及其映射状态：

```markdown
| Token ID  | Hint source          | Source image(s) | Visual trait         | Suggested token name | Source        | Confidence | Status   | User action              |
| --------- | -------------------- | --------------- | -------------------- | -------------------- | ------------- | ---------: | -------- | ------------------------ |
| token-001 | corner_radius=medium | pending.png     | Medium border radius | `--radius-md`        | project-local |       high | provided | Exists in project        |
| token-002 | shadow_presence=card | pending.png     | Card shadow          | `--ant-box-shadow`   | lib:antd      |       high | pending  | Confirm antd theme value |
```

### 列含义

| Column               | Purpose                             | Example                                             |
| -------------------- | ----------------------------------- | --------------------------------------------------- |
| Token ID             | Unique identifier for this mapping  | `token-001`                                         |
| Hint source          | What style hint was detected        | `corner_radius=medium`                              |
| Source image(s)      | Which screenshot(s) have this trait | `pending.png, used.png`                             |
| Visual trait         | What the hint describes             | "Medium border radius on cards"                     |
| Suggested token name | AI's proposed token name            | `--radius-md`                                       |
| **Source**           | Where the token is defined          | `project-local`, `lib:antd`, `proposed`, `inferred` |
| Confidence           | How certain the mapping is          | `high`, `medium`, `low`, `none`                     |
| Status               | Current decision state              | `pending`, `provided`, `create`, etc.               |
| User action          | What the user should do             | "Confirm this mapping"                              |

### Source 列（快速解码）

| Value             | Meaning                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `project-local`   | Defined in your own code (`src/tokens/*`, project CSS vars, custom Tailwind config) — **highest priority** |
| `lib:<name>`      | Defined in a declared library (`lib:antd`, `lib:mui`, `lib:chakra`, `lib:shadcn`, `lib:tailwind`)          |
| `css-var-runtime` | Found as a CSS custom property somewhere in project files, no clear owner                                  |
| `proposed`        | No matching token found; AI proposed a new name (for `status: create`)                                     |
| `inferred`        | Pure guess from style hint, no source supports it (for `status: hardcoded`)                                |

库列表与优先级顺序来自 `.image-to-component.rules.md`（init 时设置）。

## Status 取值说明

| Status      | Meaning                            | Next action                       |
| ----------- | ---------------------------------- | --------------------------------- |
| `pending`   | Detected but not yet confirmed     | User must decide in decision-gate |
| `provided`  | Confirmed; token exists in project | Use directly in code              |
| `reused`    | Existing token; user confirmed     | Use directly in code              |
| `create`    | User requests new token            | Create token (or TODO comment)    |
| `hardcoded` | User approved inline value + TODO  | Inline value with TODO marker     |
| `skip`      | User excluded from output          | Omit from generated code          |

## Decision-Gate（A/B/C 选择）

查看 token-ledger 后，你选择：

### 选项 A：全部接受

```
✅ Use all suggested mappings
✅ Resolve high-confidence pending → use suggested name
⏸ Ask per token for medium/low confidence
✅ Hardcode with TODO for none-confidence
```

→ 最快路径；由置信度驱动解析

### 选项 B：修改特定行

```
Tell me which token IDs should be:
- ✏️  "token-002 should map to --shadow-elevation-3 instead"
- ✨ "token-005 create new token --spacing-micro"
- 📝 "token-003 hardcode with TODO"
- 🗑️  "token-007 skip entirely"
```

→ 细粒度控制；精确映射

### 选项 C：跳过 Style Connect

```
🚫 Skip token mapping entirely
📝 Hardcode all styles with TODO comments
⚡ Fallback if you don't want design tokens yet
```

→ 保守做法；决策留待后续

## 示例场景

**用户有以下截图：**

- pending.png（待配送卡片）
- used.png（已使用卡片）
- expired.png（已过期卡片）

**Step 4 检测到的样式提示：**

```
All: corner_radius=medium, primary_action_count=1
pending.png: shadow_presence=card, type_hierarchy_levels=3
expired.png: shadow_presence=modal, type_hierarchy_levels=3
```

**项目库（来自规则文件）：** `[antd, tailwind]`（优先级顺序）

**Style Connect 构建 token-ledger：**

```markdown
| Token ID | Hint source | Source image(s) | Visual trait | Suggested name | Source | Confidence | Status | User action |
| token-001 | corner_radius=medium | all | Border radius | `--radius-md` | project-local | high | provided | Exists in `src/tokens/spacing.css` (also in lib:antd, using project-local by priority) |
| token-002 | shadow_presence=card | pending.png | Card shadow | `--ant-box-shadow` | lib:antd | high | pending | Confirm antd theme value |
| token-003 | shadow_presence=modal | expired.png | Modal shadow | `--ant-box-shadow-secondary` | lib:antd | medium | pending | Verify; antd has 3 elevation levels |
| token-004 | type_hierarchy_levels=3 | all | Typography scale | `text-base / text-xl / text-2xl` | lib:tailwind | high | pending | Confirm Tailwind scale |
| token-005 | primary_action_count=1 | all | Primary color | `--color-primary` | project-local | high | provided | Exists in `src/tokens/color.css` |
```

**用户选择选项 B：**

```
Change:
- token-003: map to --shadow-elevation-4 instead (modal-depth state needs stronger shadow)
- token-004: already have this typography scale
```

**确认后：**

- token-001 → use `--radius-md` ✓
- token-002 → use `--shadow-elevation-2` ✓
- token-003 → use `--shadow-elevation-4` ✓ (user's change)
- token-004 → use existing typography tokens ✓
- token-005 → use `--color-primary` ✓

**代码生成使用已确认映射：**

```css
.card {
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-elevation-2);
  /* or: var(--shadow-elevation-4) for modal-depth state */
}
```

## Confidence 级别（快速解码）

| Level    | Meaning                                        | Example                                                                 |
| -------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `high`   | Maps unambiguously to exactly one token        | corner_radius=medium → `--radius-md` (project has exact match)          |
| `medium` | Suggests a token family but needs confirmation | shadow_presence=card → could be `--elevation-2` or `--elevation-2.5`    |
| `low`    | Multiple possible tokens                       | type_hierarchy_levels=3 → could be different scales depending on design |
| `none`   | Cannot map to any existing token               | Trait has no matching token; create or hardcode                         |

## 与代码生成的集成

decision-gate 确认后：

### 已确认 token 直接使用：

```css
color: var(--color-primary); /* status: provided */
border-radius: var(--radius-md); /* status: provided */
```

### create status 加 TODO：

```css
box-shadow: var(--shadow-new); /* TODO: add --shadow-new to design system */
```

### hardcoded status 加 TODO：

```css
color: #ff6b6b; /* TODO: extract to token --color-warning */
```

### skipped status 省略：

```css
/* (no color property; inherits from parent) */
```

## 核心原则

1. **Visible**：每个检测到的样式特征都出现在 ledger 中
2. **Explicit**：用户确认决策；AI 不猜测
3. **Auditable**：decision-gate 形成选择记录
4. **Safe**：生成代码中无臆造 token
5. **Recoverable**：TODO 注释标记后续工作

## 故障排查

### 「我想用与建议不同的 token」

→ 在 decision-gate 中选择 **Option B**；告诉我哪些行需要修改

### 「我有新 token 要创建」

→ 选择 **Option B**；说明 "token-XXX create new token --my-token-name"

### 「我暂时不想用样式 token」

→ 选择 **Option C** 跳过 Style Connect；所有样式 hardcode 并加 TODO

### 「建议的 token 在我的项目中不存在」

→ 选择 **Option B**；映射到其他 token 或选择 "create"

### 「Token 提取看起来不对」

→ 检查 `protocols/style-context-spec.md` 是否与项目的样式特征匹配

### 「我想用库 X 但检测列表里没有」

→ 编辑 `.image-to-component.rules.md` 的 `Component Libraries` 章节；重新运行 Style Connect

### 「冲突时选错了来源」

→ 在规则文件中调整 `Component Libraries` 列表顺序。库之间第一项优先级最高；项目本地始终整体优先。

### 「公司内部 design system 未被识别」

→ init 时列为 `Other`；会记录但无 adapter（在 `protocols/library-adapters.md` 支持自定义 adapter 之前，该库的 token 不会自动发现）

## 文件引用

- **Workflow：** `../workflows/style-connect.md`
- **Pattern explanation：** `./ledger-and-gate-pattern.md`
- **Full implementation details：** `./implementation-summary.md`
- **Style hints spec：** `../protocols/style-context-spec.md`
- **Related workflow：** `../workflows/image-connect.md`（组件的类似模式）

---

**Remember：** Style Connect 在 **Step 8** 运行（可选，仅当 Step 1 启用 style hints 时）。
