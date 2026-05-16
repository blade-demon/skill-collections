# Style Connect Workflow

Style Connect runs after structural comparison (Step 6) and before code generation (Step 8). It maps detected visual traits to existing design tokens, captures unresolved mappings in a ledger, and requires explicit user confirmation before committing token bindings to code.

**Prerequisite:** Style hints must be extracted in Step 4 via `../prompts/style-context-prompt.md` when enabled. Style Connect bridges extracted hints and project tokens.

## Inputs

Required inputs:

- Validated style hints from Step 4 (if style extraction was enabled).
- `.image-to-component.rules.md` for token reference and stack configuration.
- Access to the project's existing design tokens or token definitions (if available).
- User's Step 1 style-stack choice (CSS Modules, plain CSS + BEM, or unknown).

If `.image-to-component.rules.md` is missing, run `workflows/init-project-rules.md` first and resume Style Connect after the file exists.

## Token Discovery

Search for existing design tokens in the project:

1. Read `.image-to-component.rules.md` to identify the token source and location.
2. Check common token locations:
   - Design system packages (imported from `@company/design-tokens`, `@tokens/core`, etc.)
   - Local token files (`src/tokens`, `src/styles/tokens.ts`, `tailwind.config.js`)
   - CSS custom properties (`--color-primary`, `--spacing-md`, etc.)
   - CSS Modules or SCSS variable files
3. If tokens are declared in the project, extract their names and values.
4. If no token source is found, record that mapping will be exploratory.

## Style Trait Mapping

For each style hint extracted in Step 4, attempt to map it to an existing token:

Mappable hint types:

| Hint | Possible token mappings | How to match |
|---|---|---|
| `corner_radius` (enum: `none`, `small`, `medium`, `large`) | Border radius tokens | Match radius scale level |
| `shadow_presence` (enum: `none`, `subtle`, `card`, `elevated`) | Shadow/elevation tokens | Match shadow depth category |
| `type_hierarchy_levels` (int 1-5) | Typography scale tokens | Confirm font sizes/weights available |
| `density` (enum: `compact`, `normal`, `spacious`) | Spacing/padding tokens | Implies base spacing scale |
| `is_mobile_viewport` (boolean) | Responsive breakpoint tokens | Signals mobile-first design |
| `primary_action_count` (int) | Action button color/style tokens | Indicates color palette usage |

Mapping rules:

- Only map when the hint data is sufficient for unambiguous token selection.
- Record the confidence of each mapping (high, medium, low).
- If hint values cannot map to existing tokens, record as `unresolved`.

## Token Ledger Format

Create or output `token-ledger.md` with this table:

```markdown
| Token ID | Hint source | Source image(s) | Visual trait | Suggested token name | Confidence | Status | User action |
|---|---|---|---|---|---:|---|---|
| token-001 | corner_radius=medium | pending.png, used.png | Medium border radius | `radius-medium` | high | pending | Confirm mapping or create new token |
| token-002 | shadow_presence=card | expired.png | Card drop shadow | `shadow-elevation-2` | medium | pending | Verify shadow depth mapping |
| token-003 | type_hierarchy_levels=3 | pending.png | 3 font sizes (h1, body, caption) | typography: `type-scale-3` | high | pending | Confirm typography mapping |
| token-004 | primary_action_count=1 | all | Single primary action color | `color-primary` | high | provided | Already exists in project |
```

## Status Values

- `pending`: Token detected but not yet confirmed by user.
- `provided`: Token mapping confirmed; already exists in project.
- `reused`: Existing token or token pattern explicitly confirmed and will be used.
- `create`: User requests a new token be created for this trait.
- `hardcoded`: User approves hardcoding with a TODO comment instead of token reference.
- `skip`: User requests this style be excluded from code generation.

## Confidence Levels

- `high`: Hint maps unambiguously to exactly one token pattern in the project.
- `medium`: Hint suggests a token family but requires user confirmation of exact token.
- `low`: Hint could map to multiple tokens; user must choose or create.
- `none`: Hint cannot map; must be hardcoded or new token created.

## Decision-Gate Format

After building the token ledger, output it and ask:

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

Do not proceed to code generation until the user confirms A, B, or C.

## Confirmation Handler

User choice handling:

| Choice | Action |
|---|---|
| A | Apply default resolution strategy (described above). Update token ledger. Continue to Step 8. |
| B | Apply row-level user changes. Ask for clarification if any row remains ambiguous. Reshow decision-gate if clarification needed. |
| C | Mark all tokens as `hardcoded`. Mark entire token ledger status as skipped. Continue to Step 8. |

If a token decision is `create`, ask:
- Should the new token be added to `.image-to-component.rules.md` for future runs?
- What should the new token file location be (if a token file structure exists)?
- Do not actually write token files; just record the decision for code generation.

## Feeding Step 8 (Code Generation)

Style Connect decisions constrain code generation:

- **Mapped tokens** → generate CSS variable references or token import statements.
- **Pending unresolved tokens** → generate placeholder comments with suggested token names.
- **Hardcoded with TODO** → inline style values with `// TODO: extract to token <name>` comments.
- **Skipped** → omit style from code; rely on browser defaults or inherited styles.

If the code generation needs to reference token values (for CSS generation), use the token-ledger to identify which tokens are confirmed vs. placeholder.

## Example Ledger Outcome

Input (from Step 4 style hints):

```
pending.png: corner_radius=medium, shadow_presence=card, type_hierarchy_levels=3
used.png: corner_radius=medium, primary_action_count=1
expired.png: corner_radius=medium, shadow_presence=elevated, type_hierarchy_levels=3
```

Output (token-ledger.md after mapping):

```markdown
| Token ID | Hint source | Source image(s) | Visual trait | Suggested token name | Confidence | Status | User action |
|---|---|---|---|---|---:|---|---|
| token-001 | corner_radius=medium | all 3 images | Medium border radius on cards | `--radius-md` | high | provided | Exists: `--radius-md` in `src/tokens/spacing.css` |
| token-002 | shadow_presence=card | pending.png, used.png | Card elevation shadow | `--shadow-elevation-2` | high | pending | Confirm: matches design system `--elevation-2` |
| token-003 | shadow_presence=elevated | expired.png | Elevated modal shadow | `--shadow-elevation-3` | medium | pending | Verify: could also use `--elevation-3` or `--elevation-4` |
| token-004 | type_hierarchy_levels=3 | pending.png, expired.png | Typography scale (h1, body, caption) | typography | high | pending | Confirm: uses project font sizes |
| token-005 | primary_action_count=1 | used.png | Primary action button color | `--color-primary` | high | provided | Exists: `--color-primary` in `src/tokens/color.css` |
```

## Exit

Exit when every detected style trait is:

- Mapped to a confirmed existing token (status: `provided` or `reused`),
- Assigned a new token name for creation (status: `create`),
- Hardcoded with a TODO comment (status: `hardcoded`), or
- Explicitly skipped (status: `skip`).

Pass the confirmed token-ledger to Step 8 code generation.
