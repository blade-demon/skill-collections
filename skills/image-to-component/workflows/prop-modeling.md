# Prop Modeling Workflow

Use this after structural comparison and confirmed Image Connect decisions.

## Diff-To-Prop Rules

| Diff type | Modeling |
|---|---|
| `status` appears/disappears | `status: StatusUnion` drives conditional rendering |
| `meta` varies with status | Concrete data prop, e.g. `timestamp?: string` |
| `action` disappears with status | Optional callback, e.g. `onRefresh?: () => void` |
| Whole slot replacement | `status` or `step/phase` drives conditional rendering |
| `hint` disappears with status | Static copy, not a prop |
| `media` varies | Asset props per `asset-handling.md` |

For same-component state variants, prefer one flat discriminator:

```ts
type OrderStatus = 'pending' | 'used' | 'expired'

interface ComponentProps {
  status: OrderStatus
  timestamp?: string
  onRefresh?: () => void
}
```

Status naming convention: `pending`, `used`, `expired`, `active`, `inactive`.

## Image Connect Constraints

- Reused components use their existing public API.
- Extended components only get additive optional props/variants unless the user approves a breaking change.
- Created components follow `.image-to-component.rules.md`.
- Do not force callers to pre-compute status-specific prop objects unless the user explicitly asks.

## Asset Pass

Before finalizing prop names for any `media` node or unknown icon, run `asset-handling.md`.

## Exit

Exit with:

- Root component public props.
- Child component props.
- Reused component imports/API notes.
- Asset ledger rows, if any.
