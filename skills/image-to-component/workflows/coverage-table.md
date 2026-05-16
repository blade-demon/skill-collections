# Coverage Table Workflow

Use this workflow after directory tree planning and before outputting or writing component files.

## Trigger

Generate a coverage table for every non-trivial output, especially when:
- More than one screenshot was processed.
- Multiple components or status variants are generated.
- A staged large-directory workflow selected representatives.
- Any candidate group was split, merged, skipped, or reused.

## Exact Format

```markdown
| Signature path | Covering file(s) | Component(s) | Status |
|---|---|---|---|
| T | src/components/OrderPage/Header.tsx | Header | covered |
| M.card[0].media | src/components/OrderPage/components/QRCodeArea.tsx | QRCodeArea | covered |
| M.card[0].status | src/components/OrderPage/components/QRCodeArea.tsx | QRCodeArea | covered |
| B.meta | src/components/OrderPage/components/Footer.tsx | Footer | reused |
| O.modal | src/components/OrderPage/components/ExpiredModal.tsx | ExpiredModal | pending |
```

## Fields

| Field | Meaning |
|---|---|
| Signature path | Mechanical path from slot and role/container position, e.g. `T.title`, `M.list.card[0].meta`, `O.modal.action` |
| Covering file(s) | Output files responsible for rendering that path |
| Component(s) | Component names responsible for the path |
| Status | `covered`, `reused`, or `pending` |

## Status Values

- `covered`: implemented directly by the listed component/file.
- `reused`: intentionally covered by a shared/static component or existing project component.
- `pending`: intentionally not generated yet, with a short reason immediately after the table.

## Rules

- Include every signature path that affects generated structure.
- Include status-varying paths separately when different files/components cover them.
- If a large-directory Stage A coarse signature was used only for grouping, do not list it as final coverage unless a Stage B full signature or explicit representative covers it.
- The table must match the directory tree. Do not list files that are not in the planned output.
- Any `pending` row must have a reason and next action.

## Exit

Exit when every structural path is marked `covered`, `reused`, or `pending` and any pending work is explained.
