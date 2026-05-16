# Style Context Protocol

The style-context subagent is optional. Use it only when the dispatcher needs coarse styling hints to choose skeleton density and class structure. It must never provide colors, exact measurements, text copy, or freeform visual descriptions.

## Dispatch Timing

Dispatch style-context only after image paths are listed and batched, and only after the main workflow has enough user settings to know whether style hints will be useful for output generation.

Recommended timing:

1. Create image read batches.
2. Dispatch signature subagents for structural signatures.
3. Optionally dispatch style-context subagents over the same batches, in parallel with or immediately after signature dispatch.
4. Validate style hints before using them in component skeleton or CSS decisions.

The main agent image-reading boundary still applies: if style-context requires image reading, that reading happens inside the style-context subagent, not in the main agent.

## Return Contract

Return only JSON. Do not wrap it in markdown, code fences, headings, comments, or prose.

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "pending.png",
      "style_hints": {
        "density": "normal",
        "corner_radius": "medium",
        "type_hierarchy_levels": 3,
        "primary_action_count": 1,
        "is_mobile_viewport": true,
        "shadow_presence": "card"
      }
    }
  ]
}
```

## Allowed Keys

`style_hints` must contain exactly these keys:

| Key | Type | Allowed values |
|---|---|---|
| `density` | string | `compact`, `normal`, `loose` |
| `corner_radius` | string | `none`, `small`, `medium`, `large` |
| `type_hierarchy_levels` | integer | `1` through `5` |
| `primary_action_count` | integer | `0` or greater |
| `is_mobile_viewport` | boolean | `true` or `false` |
| `shadow_presence` | string | `none`, `card`, `modal`, `overlay` |

No other keys are allowed anywhere inside `style_hints`.

## Forbidden Content

Style hints must not include:

- Colors or palette names.
- Exact numeric measurements such as pixel widths, font sizes, spacing values, or border radii.
- Text copy from the image.
- Freeform descriptions, summaries, rationale, or visual commentary.
- Component structure. Structure belongs in the signature subagent return.
- Signature notes keys such as `overlay_type`, `float_anchor`, `divider`, `tab_active`, or `list_count`.

## Invalid Examples

Invalid because it includes colors and exact measurements:

```json
{
  "density": "normal",
  "corner_radius": "12px",
  "primary_color": "#1677ff"
}
```

Invalid because it includes freeform description and text copy:

```json
{
  "density": "compact",
  "description": "The page has a blue header and says Submit Order"
}
```

Invalid because it uses unsupported enum values:

```json
{
  "density": "spacious",
  "corner_radius": "rounded",
  "type_hierarchy_levels": 6,
  "primary_action_count": 1,
  "is_mobile_viewport": "yes",
  "shadow_presence": "soft"
}
```

## Validation Rules

Validate style-context returns before using them:

- The return is parseable JSON and the entire output is the JSON object.
- `batch` exactly matches the dispatched batch id.
- `images.length` equals the number of paths in the batch.
- Every `filename` is a basename from the batch path list.
- Every batch filename appears exactly once.
- `style_hints` contains exactly the six allowed keys.
- Enum fields match the allowed values exactly.
- `type_hierarchy_levels` is an integer from 1 through 5.
- `primary_action_count` is an integer greater than or equal to 0.
- `is_mobile_viewport` is a boolean, not a string.
- No colors, exact measurements, text copy, or freeform descriptive fields appear.

Failure handling matches the signature return protocol:

1. First failure: re-dispatch the same style-context batch with concrete validation errors inside the dispatcher-instructions fence.
2. Second failure: pause and ask the user whether to provide corrected JSON, skip style hints for that batch, or stop the workflow.

If style-context is skipped or invalidated, continue the signature-based workflow without style hints.
