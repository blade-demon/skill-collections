# Output And Writing Workflow

Use this after code generation planning.

## Directory Tree First

Always output a directory tree before code blocks or file writes.

Rules:

- Every file line has a `#` comment describing responsibility.
- Mark which files vary by `status`/`step` and which are static.
- Mention reused components from Image Connect as imports, not generated files.
- If `asset-handling.md` produced pending assets, include `asset-ledger.md`.
- If `style-connect.md` produced pending token decisions, include `token-ledger.md`.

## Coverage Table

After the tree, run `coverage-table.md` and include a signature coverage table.

## Output Modes

| Mode | Action |
|---|---|
| Chat output | Print skeletons directly; create no files |
| Write files | Check for conflicts before writing |
| Unspecified | Default to chat output |

Before writing any file, check whether the target exists. If any target exists, ask:

```text
Existing files conflict with the planned output.
Please choose:
A. Overwrite all
B. Skip existing files and create only missing files
C. Cancel file writing and output to chat instead
```

## Optional Render Verification

Only in write-file mode, run `render-verification.md` when the project has Storybook or a safe Vite preview route and the user did not ask to skip verification.

## Exit

Exit with either:

- Chat-rendered directory tree, coverage table, asset ledger (if pending), token ledger (if pending), and skeleton code; or
- Written files, coverage table, asset ledger path (if pending), token ledger path (if pending), and optional render verification report.
