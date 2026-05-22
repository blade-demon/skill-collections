# Signature Subagent Return Format

Signature subagents must return one structured JSON object per dispatched read batch. The dispatcher validates this object by schema and field rules before any structural comparison.

## Contract

Return only JSON. Do not wrap it in markdown, code fences, headings, comments, or prose.

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "pending.png",
      "signature": {
        "T": "nav",
        "M": "card(media + title -> meta)",
        "B": "action",
        "O": "-",
        "F": "-"
      },
      "notes": {
        "float_anchor": null,
        "overlay_type": null,
        "divider": null
      }
    }
  ]
}
```

### Top-Level Fields

| Field    | Required | Type   | Rules                                                                                            |
| -------- | -------: | ------ | ------------------------------------------------------------------------------------------------ |
| `batch`  |      yes | string | Must exactly match the dispatcher-provided batch id, for example `batch-1`.                      |
| `images` |      yes | array  | Must contain exactly one object for each input path in the batch. No extra images. No omissions. |

### Image Fields

| Field       | Required | Type   | Rules                                                                                      |
| ----------- | -------: | ------ | ------------------------------------------------------------------------------------------ |
| `filename`  |      yes | string | Basename only, matching one input image path in the batch. Do not include directory paths. |
| `signature` |      yes | object | Must contain exactly the five slot keys `T`, `M`, `B`, `O`, `F`.                           |
| `notes`     |      yes | object | May contain only allowlisted note keys. Use `null` when a known optional key is absent.    |

### Signature Slot Object

`signature` must contain exactly these keys:

```json
{
  "T": "<slot expression or '-'>",
  "M": "<slot expression or '-'>",
  "B": "<slot expression or '-'>",
  "O": "<slot expression or '-'>",
  "F": "<slot expression or '-'>"
}
```

Slot expressions use the grammar and vocabulary from `signature-spec.md`:

- Role words: `nav`, `title`, `meta`, `media`, `form`, `list`, `card`, `action`, `status`, `hint`, `brand`, `empty`.
- Operators: `:`, `->`, `+`, `()`, `-`, `?`.
- The JSON value for a missing slot is the string `"-"`.
- Slot values must not include the slot label. Use `"T": "nav"`, not `"T": "T: nav"`.
- Slot keys must appear as object fields, not as free-text lines.

### Notes Allowlist

`notes` may contain only these keys:

| Key            | Allowed value                                    |
| -------------- | ------------------------------------------------ |
| `overlay_type` | `modal`, `drawer`, `toast`, `sheet`, or `null`   |
| `float_anchor` | `br`, `bl`, `tr`, `tl`, or `null`                |
| `occluded`     | array of slot.role path strings, or `null`       |
| `divider`      | `dashed`, `solid`, `dotted`, or `null`           |
| `tab_active`   | string matching one visible tab label, or `null` |
| `list_count`   | integer, string in `≥N` / `>=N` form, or `null`  |

No other keys are allowed. Reject visual or descriptive keys such as `bg`, `color`, `shadow`, `radius`, `font_size`, `theme`, `description`, or `summary`.

Required note relationships:

- If `signature.O` is not `"-"`, `notes.overlay_type` must be one of `modal`, `drawer`, `toast`, or `sheet`.
- If `signature.F` is not `"-"`, `notes.float_anchor` must be one of `br`, `bl`, `tr`, or `tl`.

## Validation

The dispatcher validates your return by running `scripts/src/validate-signature.ts` via `npm run validate-signature`. You do not need to self-validate — just ensure your output is bare JSON (no markdown fences, no prose) and that every field described above is present and correct.

## Failure and Re-Dispatch Rules

Validation failure is batch-scoped.

1. First failure: re-dispatch the same batch. Inject the concrete validation errors only inside the `===dispatcher-instructions-begin===` / `===dispatcher-instructions-end===` fence.
2. Second failure: pause the workflow and show the bad JSON plus validation errors. Ask the user to choose:

```text
Signature validation failed twice for this batch.

Bad return:
<json or raw output>

Validation errors:
<errors>

Please choose:
A. Provide corrected JSON for this batch manually
B. Skip this batch
C. Stop the workflow
```

User choice handling:

- A: validate the supplied JSON using the same rules.
- B: exclude the batch from later comparison.
- C: stop the workflow cleanly.

Do not infer missing fields from prose. Do not recover from malformed JSON by parsing markdown signature blocks. Re-dispatch or ask for a corrected JSON object.

## Batch Tracking Rules

- The dispatcher assigns stable ids in processing order: `batch-1`, `batch-2`, etc.
- A subagent may only return images from its own assigned batch.
- Cross-batch comparison starts only after every retained batch has a valid JSON object.
- Skipped batches must be recorded as excluded and must not participate in component/state decisions.
- Preserve the mapping from `batch` + `filename` to source path in dispatcher state; the subagent return intentionally carries only the basename.

## Worked Example

Input batch:

```text
batch: batch-1
paths:
/project/screens/pending.png
/project/screens/used.png
```

Valid return:

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "pending.png",
      "signature": {
        "T": "nav -> title",
        "M": "card(media + card(title -> meta) -> status)",
        "B": "action",
        "O": "-",
        "F": "-"
      },
      "notes": {
        "overlay_type": null,
        "float_anchor": null,
        "divider": "dashed"
      }
    },
    {
      "filename": "used.png",
      "signature": {
        "T": "nav -> title",
        "M": "card(media + card(title -> meta) -> status)",
        "B": "hint",
        "O": "-",
        "F": "-"
      },
      "notes": {
        "overlay_type": null,
        "float_anchor": null,
        "divider": "dashed"
      }
    }
  ]
}
```

Invalid return examples:

- Markdown block containing JSON: invalid because the return is not only JSON.
- `"filename": "/project/screens/pending.png"`: invalid because filename must be basename only.
- `"signature": "T: nav\nM: ..."`: invalid because signature must be an object.
- `"notes": { "shadow": "card" }`: invalid because `shadow` belongs to style hints, not signature notes.
