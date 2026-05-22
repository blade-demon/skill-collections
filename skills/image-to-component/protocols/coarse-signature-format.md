# Coarse Signature Return Format

Use this protocol only for large-directory Stage A pre-scans from `workflows/large-directory.md`.

The goal is cheap grouping, not final component modeling. Coarse signatures must never replace full signatures for Step 6 comparison, prop definition, code generation, or coverage tables.

## Contract

Return only JSON. Do not wrap it in markdown, code fences, headings, comments, or prose.

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "pending.png",
      "coarse_signature": {
        "T": ["nav", "title"],
        "M": ["card"],
        "B": ["action"]
      },
      "needs_full_signature": true,
      "reason": "slot contains nested container"
    }
  ]
}
```

## Fields

| Field                  | Required | Type    | Rules                                            |
| ---------------------- | -------: | ------- | ------------------------------------------------ |
| `batch`                |      yes | string  | Must match the dispatched Stage A batch id.      |
| `images`               |      yes | array   | Exactly one object per input path.               |
| `filename`             |      yes | string  | Basename only.                                   |
| `coarse_signature`     |      yes | object  | Exactly `T`, `M`, `B`; no `O` or `F` in Stage A. |
| `needs_full_signature` |      yes | boolean | `true` when this image must enter Stage B.       |
| `reason`               |      yes | string  | One allowlisted reason below.                    |

Each `coarse_signature` slot is an array of top-level role words only. Do not include nested roles, operators, containers, notes, text copy, or visual styling.

Allowed role words are the same as `signature-spec.md`: `nav`, `title`, `meta`, `media`, `form`, `list`, `card`, `action`, `status`, `hint`, `brand`, `empty`.

Allowed `reason` values:

- `stable top-level skeleton`
- `slot contains nested container`
- `candidate group inconsistent`
- `user requested full signature`
- `uncertain top-level role`

## Validation

The dispatcher validates your return by running `scripts/src/validate-coarse.ts` via `npm run validate-coarse`. Just ensure your output is bare JSON with all fields present.

## Stage B Selection

After all Stage A batches validate, select Stage B files:

- Every image with `needs_full_signature: true`.
- Every image in a candidate group whose coarse signatures disagree.
- Every file explicitly requested by the user.
- At least one representative from each stable coarse group that will generate code.

Only Stage B full signatures feed Step 6 and later steps.
