# Render Verification Workflow

Use this optional workflow only when the user selected write-file mode and the generated project has a local render path.

## Trigger

Run render verification when all are true:

- Files were written to the project.
- The target project exposes Storybook or a Vite app route suitable for preview.
- Playwright or an equivalent browser automation path is available.
- The user did not ask to skip verification.

If no local render path exists, state that render verification was skipped and why.

## Setup Preference

| Available path     | Use                                                                            |
| ------------------ | ------------------------------------------------------------------------------ |
| Existing Storybook | Add or use a story for each status/step variant                                |
| Existing Vite app  | Add or use a temporary route/demo page only if safe in the project conventions |
| Neither            | Skip render verification; do not invent project infrastructure                 |

Do not add new rendering infrastructure unless the user explicitly asks.

## Required Screenshots

Capture each meaningful variant:

- Every status union member, e.g. `pending`, `used`, `expired`.
- Every `step` or `phase` value for sequential flows.
- Overlay open/closed states when O-slot output exists.
- Empty/loading/error variants only when generated from signatures or user request.

## Difference Report

Produce a human-readable report only. Do not automatically fix generated code from screenshot differences.

Use this format:

```markdown
## Render Verification

| Variant         | Screenshot                            | Result | Notes                                         |
| --------------- | ------------------------------------- | ------ | --------------------------------------------- |
| pending         | artifacts/OrderPage-pending.png       | pass   | Matches planned structure                     |
| used            | artifacts/OrderPage-used.png          | review | Footer action wraps differently than expected |
| expired + modal | artifacts/OrderPage-expired-modal.png | pass   | Overlay renders                               |

### Differences

- `used`: Footer action wraps to two lines; confirm whether this is acceptable.
- `expired + modal`: No structural differences found.
```

## Rules

- Verify that referenced assets render or placeholders appear where ledger rows exist.
- Verify no major text overlap or blank render.
- Verify state variants can be selected independently.
- Report differences in plain language. Do not attempt pixel-perfect matching unless the user explicitly requests it.
- Do not apply automatic fixes during this workflow; ask before editing.

## Exit

Exit with screenshots captured and a difference report, or with a clear skipped reason.
