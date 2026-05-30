# Ledger 与 Decision-Gate 模式

本文档说明 **Ledger + Decision-Gate** 模式如何防止 AI 幻觉，并保持代码生成安全、可审计。

## 模式：两种机制协同工作

### Ledger（捕获机制）

**Ledger** 是一种结构化表格，收集不确定或歧义的映射，而不是让 AI 臆造解决方案。它是需要人类判断的决策的「暂存区」。

**目的：** 让不确定的决策可见，而非隐藏。

Skill 中的示例：

- **asset-ledger.md** — 捕获无法从截图可靠识别的媒体与 icon 资源。
- **token-ledger.md** — 捕获无法干净映射到现有 design token 的样式特征。

每行 ledger 捕获：

- 检测到或分析的内容
- 来自哪些图片/上下文
- AI 提议的解决方案
- 是否仍需用户批准
- 当前 status（pending、provided、reused、hardcoded、skipped）

**没有 ledger 时：** AI 可能会：

- 臆造资源名称（`<img src={asset123} />`），导致构建失败
- 臆造 token（`color: var(--color-unknown-xyz)`），导致样式错误
- 静默硬编码错误值，产生 bug

**有 ledger 时：** 不确定项在表格中可见，直到用户决定如何处理。

### Decision-Gate（批准机制）

**Decision-gate** 是确认检查点，用户在映射用于代码前明确批准 AI 提议的映射。它是强制用户意图的硬停止。

**目的：** 对不确定决策要求明确的用户判断。

Skill 中的 decision-gate：

- **Image Connect（Step 7）** — 用户批准组件的 reuse/extend/create 决策。
- **Style Connect（Step 8）** — 用户批准 token 映射并决定如何处理未解析特征。

每个 decision-gate 请用户从明确选项（A/B/C）中选择：

```
Please confirm Style Connect token mappings:

[Show token-ledger.md table with pending decisions]

A. Accept all token bindings (use proposed mappings)
B. Change one or more decisions (specify which rows)
C. Skip Style Connect (hardcode everything with TODO comments)
```

**没有 gate 时：** AI 会在以下选项间猜测：

- 「绑定到错误 token」（导致视觉 bug）
- 「臆造新 token」（导致设计系统不一致）
- 「硬编码」（失去 token 一致性）

全部不可见，用户不知道曾考虑过哪些替代方案。

**有 gate 时：** 用户看到所有选项并明确选择。

## Ledger + Gate 如何协同

```
Step 1: Extraction
  └─ Analyze images / existing code
  ├─ For certain mappings → proceed with them
  └─ For uncertain mappings → add to ledger

Step 2: Ledger Output
  └─ Show ledger table to user
  ├─ Column: "Status" = all items marked "pending" or "provided"
  └─ User can read and understand what's uncertain

Step 3: Decision-Gate
  └─ Present options (A/B/C)
  ├─ A = accept proposed solutions from ledger
  ├─ B = modify specific ledger rows
  └─ C = skip this workflow entirely (fallback)

Step 4: User Confirmation
  └─ User picks A, B, or C in chat
  ├─ No hidden assumptions
  └─ No AI guessing

Step 5: Ledger Update
  └─ Apply user's decision to ledger
  ├─ Pending → provided (if A)
  ├─ Pending → custom value (if B)
  ├─ All → hardcoded (if C)
  └─ Update "Status" and "User action" columns

Step 6: Code Generation
  └─ Use only confirmed decisions from ledger
  ├─ No "invented" mappings in generated code
  ├─ No guesses in the output
  └─ All uncertainty resolved or explicitly marked (TODO)
```

## 实践：Asset Ledger 示例

Skill 中已有的 **asset-ledger** 模式展示了该模式的应用。

工作流：

1. **Extraction** — `asset-handling.md` 读取签名并识别 media 节点。
   - 来源可识别的 media → 立即使用
   - 不明确的 media → 加入 ledger

2. **Ledger** — 创建 `asset-ledger.md`：

   ```markdown
   | Asset ID  | Source image(s)       | Signature path  | Intended use      | Generated placeholder              | Required user action                    | Status  |
   | --------- | --------------------- | --------------- | ----------------- | ---------------------------------- | --------------------------------------- | ------- |
   | asset-001 | pending.png, used.png | M.card[0].media | QR-code-like area | `mediaASrc` prop                   | Provide image URL                       | pending |
   | asset-002 | expired.png           | T.media         | Unknown icon      | `<span className={styles.icon} />` | Identify icon or use existing component | pending |
   ```

3. **用户查看 ledger** — 用户阅读后意识到：
   - asset-001 需要图片路径
   - asset-002 需要 icon 识别

4. **Decision-Gate** — 在以下情况之前不运行代码生成：
   - 用户为 pending 资源提供 URL/名称，或
   - 用户确认「暂时 hardcode with TODO」

5. **Code Generation** — 此时可安全生成：
   - `<img src={props.mediaASrc} alt={props.mediaAAlt} />` ← 用户提供了 prop
   - `<Icon name={props.iconName} />` ← 用户提供了名称
   - `// TODO: provide QRCodeImage` ← 若用户选择 hardcoded

## 实践：Token Ledger 示例

新的 **token-ledger** 模式将此扩展到样式。

工作流：

1. **Extraction** — `../prompts/style-context-prompt.md`（子代理）读取图片并检测样式提示。
   - `corner_radius=medium`
   - `shadow_presence=card`
   - `type_hierarchy_levels=3`

2. **Mapping** — `style-connect.md` 尝试将每个提示映射到项目 token。
   - `corner_radius=medium` → `--radius-md`（项目中找到）✓
   - `shadow_presence=card` → `--shadow-elevation-2`（候选，需确认）
   - `type_hierarchy_levels=3` → typography tokens（需确认）

3. **Ledger** — 创建 `token-ledger.md`：

   ```markdown
   | Token ID  | Hint source             | Source image(s) | Visual trait     | Suggested token name | Source        | Confidence | Status   | User action                        |
   | --------- | ----------------------- | --------------- | ---------------- | -------------------- | ------------- | ---------: | -------- | ---------------------------------- |
   | token-001 | corner_radius=medium    | all             | Border radius    | `--radius-md`        | project-local |       high | provided | Exists in `src/tokens/spacing.css` |
   | token-002 | shadow_presence=card    | pending.png     | Card shadow      | `--ant-box-shadow`   | lib:antd      |       high | pending  | Confirm antd theme value           |
   | token-003 | type_hierarchy_levels=3 | pending.png     | Typography scale | typography           | lib:tailwind  |       high | pending  | Confirm Tailwind scale             |
   ```

   `Source` 列使每个候选 token 的来源明确（项目代码 vs. 已安装库 vs. AI 提案）。当同一 token 名称存在于多个来源时，这至关重要——用户可一眼看出工作流使用的是哪个来源。

4. **用户查看 ledger** — 用户阅读并决定：
   - `--radius-md` 正确；直接使用
   - `--shadow-elevation-2` 正确；使用
   - Typography scale 存在；使用

5. **Decision-Gate**：

   ```
   A. Accept all mappings (use suggested token names)
   B. Change specific rows (e.g., "token-003 should use `--shadow-elevation-3` not `-2`")
   C. Hardcode everything with TODO comments instead
   ```

6. **用户选择 A** → 所有 token 已确认，进入代码生成。

7. **Code Generation** — 此时安全：

   ```css
   .cardContainer {
     border-radius: var(--radius-md);
     box-shadow: var(--shadow-elevation-2);
   }
   ```

   所有值来自已确认 token，无猜测。

## 为何能防止幻觉

### 问题：AI 不询问就推断

没有 ledger + gate 时，AI 可能：

- 看到带阴影的按钮并臆造 `--shadow-button`
- 看到间距模式并臆造 `--spacing-tight-xs`
- 猜测「未定义 token」意味着「跳过此样式」

所有决策静默、不可见地进入已发布代码。

### 解决方案：Ledger + Gate 使决策可见

1. **Ledger** = 「以下是我发现但不确定的内容」
2. **Gate** = 「以下是对每个不确定项的选项」
3. **User** = 「此项我选 A，彼项我选 B」
4. **Code** = 「仅使用用户确认的内容」

### 结果：100% 可审计

从视觉设计到代码 token 的每个映射均为以下之一：

- **自动处理**（来自现有 token 库的高置信度映射）
- **用户明确确认**（通过 decision-gate）
- **明确 TODO**（等待未来决策）

无猜测。无臆造 token。无静默假设。

## 应避开的模式

### ❌ 无 Ledger 就臆造

```javascript
// WRONG: AI silently invents a token name
const buttonStyles = css`
  background-color: var(--color-button-primary);
  // ^ If this token doesn't exist, code breaks silently
`;
```

### ✅ 改用 Ledger + Gate

```javascript
// CORRECT: User explicitly confirmed this token exists
const buttonStyles = css`
  background-color: var(--color-primary);
  // ^ From token-ledger row token-001, status=provided
`;
```

### ❌ 猜测 Token 行为

```javascript
// WRONG: AI guesses whether token applies to responsive styles
const responsiveColor = isDesktop ? 'var(--color-primary)' : 'var(--color-primary-mobile)';
// ^ Did the user intend a mobile variant? Unclear.
```

### ✅ 请求确认

在 token-ledger 中：

```markdown
| Token ID | ... | Status | User action |
| token-005 | ... | pending | Should `--color-primary` vary by viewport? If yes, what tokens? |
```

用户确认 → 代码生成使用其明确选择。

## Ledger Status 含义

每行 ledger 携带描述决策状态的 `Status`：

| Status      | Meaning                                   | Code generation                   | Example                                            |
| ----------- | ----------------------------------------- | --------------------------------- | -------------------------------------------------- |
| `pending`   | Not yet confirmed                         | BLOCKED (waiting for user choice) | User hasn't decided on `--shadow-elevation-2` yet  |
| `provided`  | Confirmed; token exists in project        | USE IT (reference the token)      | `--radius-md` confirmed to exist; use as-is        |
| `reused`    | Confirmed; existing token pattern applies | USE IT                            | User confirmed `--shadow-elevation-2` is correct   |
| `create`    | User requests a new token                 | CREATE IT (or TODO with comment)  | User says "make a new token `--spacing-micro`"     |
| `hardcoded` | User approved inline style + TODO comment | INLINE + TODO                     | `color: #ff6b6b; // TODO: extract to token`        |
| `skip`      | User excludes this style from output      | OMIT IT                           | User says "don't style this, use browser defaults" |

## 集成点

ledger + gate 模式用于：

- **Image Connect（Step 7）** — 组件的 reuse/extend/create 决策
- **Style Connect（Step 8）** — 样式的 token 映射决策
- **Asset Handling（Step 9）** — 资源识别与占位决策

未来扩展可用于：

- 动画 token 映射
- 响应式断点决策
- 无障碍要求确认

## 要点

**Ledger** = Capture → **Decision-Gate** = Confirm → **Code** = Safe

该模式不任由 AI 猜测，而是强制可见性并要求明确批准。这使生成代码可审计、防止静默 bug，并尊重设计系统与样式决策是人类选择这一事实。
