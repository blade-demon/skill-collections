# Ledger + Decision-Gate Implementation Summary

This document summarizes the implementation of the **Ledger + Decision-Gate** pattern for the image-to-component skill, specifically for handling style tokens and preventing AI hallucination.

## What Was Added

### 1. New Workflow: Style Connect (`workflows/style-connect.md`)

**Purpose:** Map detected visual style traits to existing design tokens and capture unresolved mappings in a structured ledger.

**Key features:**
- Token discovery: searches for existing design tokens in the project
- Style trait mapping: attempts to match extracted hints to existing tokens
- Token ledger creation: structured table capturing unresolved mappings
- Decision-gate: explicit user checkpoint (A/B/C options) before code generation
- Confidence levels: tracks mapping certainty (high/medium/low/none)
- Multiple status values: pending, provided, reused, create, hardcoded, skip

**Inputs:**
- Style hints from Step 4 (if style extraction enabled)
- Project design token definitions (if available)
- `.image-to-component.rules.md` for token configuration

**Outputs:**
- `token-ledger.md` table with unresolved/ambiguous mappings
- User confirmation of token decisions via decision-gate

**Integration:**
- Runs as **Step 6.7** (optional, only if style hints enabled in Step 1)
- Positioned after Image Connect (Step 6.5)
- Before code generation (Step 8)

### 2. Updated Main Workflow (`SKILL.md`)

**Changes:**
- Added routing map entry for `workflows/style-connect.md`
- Added Step 6.7: "Style Connect (Optional)" to the step skeleton
- Updated Step 9 output requirements to include `token-ledger.md` when pending
- Added 3 new common mistakes related to style token handling:
  - Don't hardcode style values without a ledger
  - Don't invent new tokens without user approval
  - Don't skip the style-connect decision-gate

**Key principle:**
> "If style hints were enabled in Step 1, run Style Connect in Step 6.7 to map traits to tokens. If not enabled, skip to Step 7."

### 3. Updated Code Generation (`workflows/code-generation.md`)

**New section: "Token Usage (From Style Connect)"**

Describes how to use confirmed token mappings in generated code:
- **Provided tokens** → Reference directly (`var(--token-name)`)
- **Create tokens** → Add TODO comments for future definition
- **Hardcoded tokens** → Inline values with TODO markers
- **Skipped tokens** → Omit entirely, use browser defaults

Ensures code generation respects Style Connect decisions and doesn't invent tokens.

### 4. Updated Output Workflow (`workflows/output-and-writing.md`)

**Changes:**
- Updated directory tree rules to include token-ledger when pending
- Updated exit conditions to reference token-ledger alongside asset-ledger

### 5. New Reference Document (`docs/ledger-and-gate-pattern.md`)

**Purpose:** Comprehensive explanation of the Ledger + Decision-Gate pattern and why it prevents AI hallucination.

**Sections:**
- Pattern overview: Ledger (capture) + Decision-Gate (approval)
- How they work together (6-step flow diagram)
- Asset Ledger example (already in skill)
- Token Ledger example (new)
- Why it prevents hallucination
- Patterns to avoid (code examples)
- Ledger status meanings (pending/provided/reused/create/hardcoded/skip)
- Integration points (Image Connect, Style Connect, Asset Handling)
- Takeaway: visibility + confirmation = safety

## The Pattern in Action

### Before (Without Ledger + Gate):
```
1. Extract styles from images
2. AI guesses which tokens they should use
3. AI invents new tokens if no clear match exists
4. Code generated with guessed mappings
5. Later: designer notices wrong colors/spacing (too late)
```

**Problems:** Silent assumptions, invisible guesses, bugs in shipped code.

### After (With Ledger + Gate):
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

**Benefits:** Auditable, transparent, requires explicit approval.

## Token Ledger Format

The token-ledger table captures:

```markdown
| Token ID | Hint source | Source image(s) | Visual trait | Suggested token name | Source | Confidence | Status | User action |
|---|---|---|---|---|---|---:|---|---|
| token-001 | corner_radius=medium | all images | Border radius | `--radius-md` | project-local | high | provided | Exists in project |
| token-002 | shadow_presence=card | pending.png | Card shadow | `--ant-box-shadow` | lib:antd | high | pending | Confirm antd theme value |
| token-003 | type_hierarchy_levels=3 | pending.png | Font scale | typography | lib:tailwind | high | pending | Confirm Tailwind scale |
```

Each row represents a detected style trait and its mapping status. The `Source` column captures provenance (project code, installed library, AI proposal) — see the Iteration 2 section below for the full story.

## Decision-Gate Format

After building the ledger, the workflow presents this gate:

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

User chooses A, B, or C. Code generation does not run until confirmed.

## Integration with Existing Patterns

The token-ledger pattern parallels the existing **asset-ledger** pattern:

| Aspect | Asset Ledger | Token Ledger |
|---|---|---|
| What it captures | Media/icon assets without reliable sources | Style traits without clear token mappings |
| Table columns | Asset ID, source images, intended use, placeholder, user action, status | Token ID, hint source, source images, visual trait, suggested name, confidence, user action, status |
| Decision-gate | Happens during asset-handling (Step 7) | Happens during style-connect (Step 6.7) |
| Code generation | Uses confirmed asset references | Uses confirmed token references |
| Status values | pending, provided, reused | pending, provided, reused, create, hardcoded, skip |

Both serve the same purpose: **make uncertainty visible, require approval, prevent guessing**.

## When Style Connect Runs

**Prerequisite:** Style hints must be enabled in Step 1.

If style hints are disabled:
- No style-context subagent dispatch in Step 4
- No Style Connect workflow in Step 6.7
- Code generation skips token mapping entirely
- Default: hardcoded styles (or CSS follows template defaults)

If style hints are enabled:
- style-context-prompt.md subagent extracts hints in Step 4
- Style Connect workflow runs in Step 6.7
- Decision-gate requires user confirmation
- Code generation uses confirmed token mappings

## Files Modified

1. **SKILL.md** — Added Step 6.7, updated routing map, added common mistakes
2. **workflows/code-generation.md** — Added "Token Usage" section
3. **workflows/output-and-writing.md** — Updated directory tree and exit rules
4. **workflows/style-connect.md** — NEW (8119 bytes)
5. **docs/ledger-and-gate-pattern.md** — NEW (comprehensive reference)

## Files Not Modified (Existing, Still Used)

- `protocols/style-context-spec.md` — Defines allowed style hints (corner_radius, shadow_presence, etc.)
- `../prompts/style-context-prompt.md` — Dispatches subagent to extract hints from images
- `workflows/image-connect.md` — Parallel pattern for component reuse decisions
- `workflows/asset-handling.md` — Parallel pattern for asset management

## Next Steps (Optional Enhancements)

The implementation is complete, but future work could include:

1. **Style Context Subagent Prompt** — Add a `style-token-prompt.md` if you want deeper style extraction (colors, exact measurements, typography details). Currently, style hints are coarse-grained (corner_radius=medium, shadow_presence=card, etc.).

2. **Token Creation Helper** — Add guidance for creating new tokens if users choose "create" status.

3. **Token Export Integration** — Reference how token-ledger integrates with design system token file generation.

4. **Template Updates** — Add token reference examples to CSS Modules and BEM templates.

5. **Render Verification** — Extend render-verification.md to check that referenced tokens actually exist after code generation.

## Key Principle

> **Ledger = Make it visible. Decision-Gate = Require approval. Code = Use only confirmed decisions.**

The pattern ensures that:
- No tokens are invented silently
- All style decisions are either automatic (high-confidence) or explicit (user-approved)
- Generated code is auditable and traceable to user decisions
- Design system consistency is maintained through conscious, visible choices

---

## Follow-up: Token Source Awareness (Iteration 2)

After the initial implementation, the token-ledger was extended to track the **source** of each candidate token (project-local vs. installed component library vs. AI-proposed). This brings the skill closer to the way real projects are organized — tokens often come from a mix of the project's own design tokens and the component library (antd, MUI, Chakra, shadcn, Tailwind, Radix) that the project depends on.

### Changes (Iteration 2)

1. **`workflows/init-project-rules.md`**
   - Scan Strategy now detects component libraries from `package.json` and the shadcn `components.json` marker.
   - New "Component Library Confirmation" section: auto-detect first, then ask the user to confirm or edit; cold-start menu shown only when nothing is detected.
   - New `Component Libraries` section in the rules-file output template, placed between Style Stack and Class Name Helper.
   - Library list order = priority order; project-local always wins overall; library list ordered by `dependencies` → `devDependencies` → project-file markers, preserving package.json declaration order.
   - Conflict-handling rule for "package.json shows library X but user picks None".

2. **`workflows/style-connect.md`**
   - Token Discovery now reads `Component Libraries` from the rules file and runs the matching adapter from a new inline "Library Adapters" table.
   - Built-in adapters: `antd`, `mui`, `chakra`, `shadcn`, `tailwind`, `radix` (Radix has no design tokens; matched but recorded as `inferred`).
   - Token-ledger gains a `Source` column with allowed values: `project-local`, `lib:<name>`, `css-var-runtime`, `proposed`, `inferred`.
   - Priority resolution: when the same token name exists in multiple sources, the highest-priority source wins; the row's `User action` column mentions the lower-priority duplicates for transparency.
   - Future hook: workflow notes that if `protocols/library-adapters.md` exists, it overrides the inline adapter table — the planned extension point for user-defined adapters.

3. **Docs updates**
   - `docs/style-connect-quick-reference.md` — new Source column in the example, new "Source Column (Quick Decoder)" table, new troubleshooting entries for library-related issues.
   - `docs/ledger-and-gate-pattern.md` — Token Ledger example now includes the Source column with a short explanation of why provenance matters.

### Deferred to Iteration 3

- Extract Library Adapters into `protocols/library-adapters.md` (the future-hook target). Defer until inline adapter count exceeds ~8 or user-defined adapters are needed.
- Support for user-supplied custom adapters (e.g., internal company design systems). Today such libraries can be listed as "Other" during init; tokens from them appear as `Source: inferred`.

---

**Implementation Date:** May 16, 2026  
**Status:** Iteration 2 complete (Source-aware ledger + library detection in init). Iteration 3 (`protocols/library-adapters.md` extraction) deferred until needed.
