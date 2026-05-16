# Style Connect Quick Reference

A cheat sheet for using the Style Connect workflow (Step 6.7) in image-to-component.

## When Does Style Connect Run?

| Scenario | What happens |
|---|---|
| ✅ Step 1: Style hints **enabled** | Style Connect runs in Step 6.7 after Image Connect |
| ❌ Step 1: Style hints **disabled** | Style Connect skipped; code generation uses CSS defaults |

## Step 6.7: Style Connect Workflow

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

## Token Ledger Table

Shows all detected style traits and their mapping status:

```markdown
| Token ID | Hint source | Source image(s) | Visual trait | Suggested token name | Confidence | Status | User action |
|---|---|---|---|---|---:|---|---|
| token-001 | corner_radius=medium | pending.png | Medium border radius | `--radius-md` | high | provided | Exists in project |
| token-002 | shadow_presence=card | pending.png | Card shadow | `--shadow-elevation-2` | high | pending | Confirm mapping |
```

### Column Meanings

| Column | Purpose | Example |
|---|---|---|
| Token ID | Unique identifier for this mapping | `token-001` |
| Hint source | What style hint was detected | `corner_radius=medium` |
| Source image(s) | Which screenshot(s) have this trait | `pending.png, used.png` |
| Visual trait | What the hint describes | "Medium border radius on cards" |
| Suggested token name | AI's proposed token name | `--radius-md` |
| Confidence | How certain the mapping is | `high`, `medium`, `low`, `none` |
| Status | Current decision state | `pending`, `provided`, `create`, etc. |
| User action | What the user should do | "Confirm this mapping" |

## Status Values Explained

| Status | Meaning | Next action |
|---|---|---|
| `pending` | Detected but not yet confirmed | User must decide in decision-gate |
| `provided` | Confirmed; token exists in project | Use directly in code |
| `reused` | Existing token; user confirmed | Use directly in code |
| `create` | User requests new token | Create token (or TODO comment) |
| `hardcoded` | User approved inline value + TODO | Inline value with TODO marker |
| `skip` | User excluded from output | Omit from generated code |

## Decision-Gate (A/B/C Choice)

After seeing the token-ledger, you choose:

### Option A: Accept All
```
✅ Use all suggested mappings
✅ Resolve high-confidence pending → use suggested name
⏸ Ask per token for medium/low confidence
✅ Hardcode with TODO for none-confidence
```
→ Fastest path; confidence-driven resolution

### Option B: Change Specific Rows
```
Tell me which token IDs should be:
- ✏️  "token-002 should map to --shadow-elevation-3 instead"
- ✨ "token-005 create new token --spacing-micro"
- 📝 "token-003 hardcode with TODO"
- 🗑️  "token-007 skip entirely"
```
→ Fine-grained control; exact mappings

### Option C: Skip Style Connect
```
🚫 Skip token mapping entirely
📝 Hardcode all styles with TODO comments
⚡ Fallback if you don't want design tokens yet
```
→ Conservative approach; leaves decisions for later

## Example Scenario

**User has these screenshots:**
- pending.png (card pending delivery)
- used.png (card marked as used)
- expired.png (card marked as expired)

**Step 4 detects style hints:**
```
All: corner_radius=medium, primary_action_count=1
pending.png: shadow_presence=card, type_hierarchy_levels=3
expired.png: shadow_presence=elevated, type_hierarchy_levels=3
```

**Style Connect builds token-ledger:**
```markdown
| Token ID | Hint source | Source image(s) | Visual trait | Suggested name | Confidence | Status | User action |
| token-001 | corner_radius=medium | all | Border radius | `--radius-md` | high | provided | Exists in project |
| token-002 | shadow_presence=card | pending.png | Card shadow | `--shadow-elevation-2` | high | pending | Confirm |
| token-003 | shadow_presence=elevated | expired.png | Modal shadow | `--shadow-elevation-3` | medium | pending | Confirm or choose `--elevation-4` |
| token-004 | type_hierarchy_levels=3 | all | Typography scale | `typography` | high | pending | Confirm scale exists |
| token-005 | primary_action_count=1 | all | Primary color | `--color-primary` | high | provided | Exists in project |
```

**User chooses Option B:**
```
Change:
- token-003: map to --shadow-elevation-4 instead (elevated cards need more shadow)
- token-004: already have this typography scale
```

**After confirmation:**
- token-001 → use `--radius-md` ✓
- token-002 → use `--shadow-elevation-2` ✓
- token-003 → use `--shadow-elevation-4` ✓ (user's change)
- token-004 → use existing typography tokens ✓
- token-005 → use `--color-primary` ✓

**Code generation uses confirmed mappings:**
```css
.card {
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-elevation-2);
  /* or: var(--shadow-elevation-4) for elevated state */
}
```

## Confidence Levels (Quick Decoder)

| Level | Meaning | Example |
|---|---|---|
| `high` | Maps unambiguously to exactly one token | corner_radius=medium → `--radius-md` (project has exact match) |
| `medium` | Suggests a token family but needs confirmation | shadow_presence=card → could be `--elevation-2` or `--elevation-2.5` |
| `low` | Multiple possible tokens | type_hierarchy_levels=3 → could be different scales depending on design |
| `none` | Cannot map to any existing token | Trait has no matching token; create or hardcode |

## Integration with Code Generation

After decision-gate confirmation:

### Confirmed tokens are used directly:
```css
color: var(--color-primary);           /* status: provided */
border-radius: var(--radius-md);       /* status: provided */
```

### Create-status gets TODO:
```css
box-shadow: var(--shadow-new);         /* TODO: add --shadow-new to design system */
```

### Hardcoded-status gets TODO:
```css
color: #ff6b6b;                        /* TODO: extract to token --color-warning */
```

### Skipped-status is omitted:
```css
/* (no color property; inherits from parent) */
```

## Key Principles

1. **Visible**: Every detected style trait appears in the ledger
2. **Explicit**: User confirms decisions; AI doesn't guess
3. **Auditable**: Decision-gate creates a record of choices
4. **Safe**: No invented tokens in generated code
5. **Recoverable**: TODO comments mark future work

## Troubleshooting

### "I want to use a different token than suggested"
→ Choose **Option B** in decision-gate; tell me which rows to change

### "I have a new token to create"
→ Choose **Option B**; say "token-XXX create new token --my-token-name"

### "I don't want style tokens yet"
→ Choose **Option C** to skip Style Connect; all styles hardcoded with TODO

### "The suggested token doesn't exist in my project"
→ Choose **Option B**; either map to a different token or choose "create"

### "Token extraction looks wrong"
→ Check that `protocols/style-context-spec.md` matches your project's style traits

## File References

- **Workflow:** `../workflows/style-connect.md`
- **Pattern explanation:** `./ledger-and-gate-pattern.md`
- **Full implementation details:** `./implementation-summary.md`
- **Style hints spec:** `../protocols/style-context-spec.md`
- **Related workflow:** `../workflows/image-connect.md` (similar pattern for components)

---

**Remember:** Style Connect runs in **Step 6.7** (optional, only if style hints enabled in Step 1).
