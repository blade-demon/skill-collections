# Ledger and Decision-Gate Pattern

This document explains how the **Ledger + Decision-Gate** pattern prevents AI hallucination and keeps code generation safe and auditable.

## The Pattern: Two Mechanisms Working Together

### Ledger (Capture mechanism)

A **ledger** is a structured table that collects uncertain or ambiguous mappings instead of letting the AI invent solutions. It serves as a "holding area" for decisions that require human judgment.

**Purpose:** Make uncertain decisions visible instead of hidden.

Examples in the skill:

- **asset-ledger.md** — Captures media and icon assets that can't be identified reliably from screenshots.
- **token-ledger.md** — Captures style traits that don't map cleanly to existing design tokens.

Each ledger row captures:

- What was detected or analyzed
- Which images/context it came from
- What the AI proposes as a solution
- Whether user approval is still needed
- Current status (pending, provided, reused, hardcoded, skipped)

**Without the ledger:** The AI would either:

- Invent asset names (`<img src={asset123} />`), breaking the build
- Invent tokens (`color: var(--color-unknown-xyz)`), breaking styles
- Hardcode wrong values silently, creating bugs

**With the ledger:** Uncertain items sit visibly in a table until the user decides what happens.

### Decision-Gate (Approval mechanism)

A **decision-gate** is a confirmation checkpoint where the user explicitly approves the AI's proposed mappings before they're used in code. It's a hard stop that forces user intent.

**Purpose:** Require explicit user judgment on uncertain decisions.

Decision-gates in the skill:

- **Image Connect (Step 7)** — User approves reuse/extend/create decisions for components.
- **Style Connect (Step 8)** — User approves token mappings and decides what to do with unresolved traits.

Each decision-gate asks the user to choose from explicit options (A/B/C):

```
Please confirm Style Connect token mappings:

[Show token-ledger.md table with pending decisions]

A. Accept all token bindings (use proposed mappings)
B. Change one or more decisions (specify which rows)
C. Skip Style Connect (hardcode everything with TODO comments)
```

**Without the gate:** The AI would guess between:

- "Bind to wrong token" (leading to visual bugs)
- "Invent new token" (leading to inconsistent design systems)
- "Hardcode" (losing token consistency)

All invisibly, without the user knowing alternatives were considered.

**With the gate:** User sees all options and chooses explicitly.

## How Ledger + Gate Work Together

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

## Pattern in Practice: Asset Ledger Example

The **asset-ledger** pattern already in the skill shows this in action.

Workflow:

1. **Extraction** — `asset-handling.md` reads signatures and identifies media nodes.
   - Media with identifiable source → use immediately
   - Media that's unclear → add to ledger

2. **Ledger** — Create `asset-ledger.md`:

   ```markdown
   | Asset ID  | Source image(s)       | Signature path  | Intended use      | Generated placeholder              | Required user action                    | Status  |
   | --------- | --------------------- | --------------- | ----------------- | ---------------------------------- | --------------------------------------- | ------- |
   | asset-001 | pending.png, used.png | M.card[0].media | QR-code-like area | `mediaASrc` prop                   | Provide image URL                       | pending |
   | asset-002 | expired.png           | T.media         | Unknown icon      | `<span className={styles.icon} />` | Identify icon or use existing component | pending |
   ```

3. **User sees the ledger** — User reads it and realizes:
   - asset-001 needs an image path
   - asset-002 needs an icon identification

4. **Decision-Gate** — Code generation doesn't run until:
   - User provides URLs/names for pending assets, OR
   - User confirms "hardcode with TODO" for now

5. **Code Generation** — Now safe to generate:
   - `<img src={props.mediaASrc} alt={props.mediaAAlt} />` ← user provided the prop
   - `<Icon name={props.iconName} />` ← user provided the name
   - `// TODO: provide QRCodeImage` ← if user chose hardcoded

## Pattern in Practice: Token Ledger Example

The new **token-ledger** pattern extends this to styles.

Workflow:

1. **Extraction** — `../prompts/style-context-prompt.md` (subagent) reads images and detects style hints.
   - `corner_radius=medium`
   - `shadow_presence=card`
   - `type_hierarchy_levels=3`

2. **Mapping** — `style-connect.md` tries to map each hint to project tokens.
   - `corner_radius=medium` → `--radius-md` (found in project) ✓
   - `shadow_presence=card` → `--shadow-elevation-2` (candidate, needs confirmation)
   - `type_hierarchy_levels=3` → typography tokens (needs confirmation)

3. **Ledger** — Create `token-ledger.md`:

   ```markdown
   | Token ID  | Hint source             | Source image(s) | Visual trait     | Suggested token name | Source        | Confidence | Status   | User action                        |
   | --------- | ----------------------- | --------------- | ---------------- | -------------------- | ------------- | ---------: | -------- | ---------------------------------- |
   | token-001 | corner_radius=medium    | all             | Border radius    | `--radius-md`        | project-local |       high | provided | Exists in `src/tokens/spacing.css` |
   | token-002 | shadow_presence=card    | pending.png     | Card shadow      | `--ant-box-shadow`   | lib:antd      |       high | pending  | Confirm antd theme value           |
   | token-003 | type_hierarchy_levels=3 | pending.png     | Typography scale | typography           | lib:tailwind  |       high | pending  | Confirm Tailwind scale             |
   ```

   The `Source` column makes the provenance of each candidate token explicit (project code vs. installed library vs. AI proposal). This is essential when the same token name exists in multiple sources — the user can see at a glance which source the workflow is using.

4. **User sees the ledger** — User reads and decides:
   - `--radius-md` is correct; use it as-is
   - `--shadow-elevation-2` is correct; use it
   - Typography scale exists; use it

5. **Decision-Gate**:

   ```
   A. Accept all mappings (use suggested token names)
   B. Change specific rows (e.g., "token-003 should use `--shadow-elevation-3` not `-2`")
   C. Hardcode everything with TODO comments instead
   ```

6. **User chooses A** → All tokens confirmed, move to code generation.

7. **Code Generation** — Now safe:

   ```css
   .cardContainer {
     border-radius: var(--radius-md);
     box-shadow: var(--shadow-elevation-2);
   }
   ```

   All values come from confirmed tokens, no guesses.

## Why This Prevents Hallucination

### Problem: AI Infers Without Asking

Without ledger + gate, the AI might:

- See a shadowed button and invent `--shadow-button`
- See a spacing pattern and invent `--spacing-tight-xs`
- Guess that "undefined token" means "skip this style"

All decisions made silently, invisibly, in code that ships.

### Solution: Ledger + Gate Makes Decisions Visible

1. **Ledger** = "Here's what I found that I'm uncertain about"
2. **Gate** = "Here are your options for each uncertain thing"
3. **User** = "I choose option A for this, option B for that"
4. **Code** = "Use only what the user confirmed"

### Result: 100% Auditable

Every mapping from visual design to code token is either:

- **Automatically handled** (high-confidence mappings from existing token library)
- **Explicitly confirmed by user** (via decision-gate)
- **Explicitly TODO** (awaiting future decision)

No guesses. No invented tokens. No silent assumptions.

## Patterns to Avoid

### ❌ Inventing Without a Ledger

```javascript
// WRONG: AI silently invents a token name
const buttonStyles = css`
  background-color: var(--color-button-primary);
  // ^ If this token doesn't exist, code breaks silently
`;
```

### ✅ Ledger + Gate Instead

```javascript
// CORRECT: User explicitly confirmed this token exists
const buttonStyles = css`
  background-color: var(--color-primary);
  // ^ From token-ledger row token-001, status=provided
`;
```

### ❌ Guessing Token Behavior

```javascript
// WRONG: AI guesses whether token applies to responsive styles
const responsiveColor = isDesktop ? 'var(--color-primary)' : 'var(--color-primary-mobile)';
// ^ Did the user intend a mobile variant? Unclear.
```

### ✅ Ask for Confirmation

In token-ledger:

```markdown
| Token ID | ... | Status | User action |
| token-005 | ... | pending | Should `--color-primary` vary by viewport? If yes, what tokens? |
```

User confirms → code generation uses their explicit choice.

## Ledger Status Meanings

Each ledger row carries a `Status` that describes the decision state:

| Status      | Meaning                                   | Code generation                   | Example                                            |
| ----------- | ----------------------------------------- | --------------------------------- | -------------------------------------------------- |
| `pending`   | Not yet confirmed                         | BLOCKED (waiting for user choice) | User hasn't decided on `--shadow-elevation-2` yet  |
| `provided`  | Confirmed; token exists in project        | USE IT (reference the token)      | `--radius-md` confirmed to exist; use as-is        |
| `reused`    | Confirmed; existing token pattern applies | USE IT                            | User confirmed `--shadow-elevation-2` is correct   |
| `create`    | User requests a new token                 | CREATE IT (or TODO with comment)  | User says "make a new token `--spacing-micro`"     |
| `hardcoded` | User approved inline style + TODO comment | INLINE + TODO                     | `color: #ff6b6b; // TODO: extract to token`        |
| `skip`      | User excludes this style from output      | OMIT IT                           | User says "don't style this, use browser defaults" |

## Integration Points

The ledger + gate pattern is used in:

- **Image Connect (Step 7)** — reuse/extend/create decisions for components
- **Style Connect (Step 8)** — token mapping decisions for styles
- **Asset Handling (Step 9)** — asset identification and placeholder decisions

Future extensions could use the same pattern for:

- Animation token mapping
- Responsive breakpoint decisions
- Accessibility requirement confirmation

## Takeaway

**Ledger** = Capture → **Decision-Gate** = Confirm → **Code** = Safe

Instead of letting AI guess, the pattern forces visibility and requires explicit approval. This keeps generated code auditable, prevents silent bugs, and respects that design systems and style decisions are human choices.
