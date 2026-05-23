# Region Signature Specification

Use this specification to compress each UI image into mechanically comparable region signature slot expressions. Signature subagents must wrap these expressions in the JSON return contract from `protocols/subagent-return-format.md`.

## Position Slots

| Slot | Definition                                                               |
| ---- | ------------------------------------------------------------------------ |
| `T`  | Top of screen, 0-20%                                                     |
| `M`  | Middle of screen, 20-80% (visual center of mass)                         |
| `B`  | Bottom of screen, 80-100%                                                |
| `O`  | Overlay (Modal / Drawer / Toast, with backdrop or clear z-index)         |
| `F`  | Floating element detached from document flow (FAB, edge-anchored button) |

For slots that do not exist, fill `-`. All five slot keys (`T`, `M`, `B`, `O`, `F`) must be present in the returned signature object; omission is not allowed.

## Role Vocabulary

```
nav | title | meta | media | form | list | card | action | status | hint | brand | empty
```

| Word     | Meaning                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------- |
| `nav`    | Navigation bar, back button, tabs, breadcrumb, segmented control                                |
| `title`  | Page or section main heading                                                                    |
| `meta`   | Time, ID, count, subtitle, and other supplementary info（动态信息，如副标题、时间、单号、数量） |
| `media`  | Image, QR code, icon illustration (any graphical subject)                                       |
| `form`   | Input field, dropdown, switch                                                                   |
| `list`   | A repeating structure with 2 or more items                                                      |
| `card`   | A business-object unit that can be moved as a whole                                             |
| `action` | Button, clickable link                                                                          |
| `status` | Status marker: loading spinner, success/error badge, stamp, watermark (pure leaf node)          |
| `hint`   | Static descriptive text, prompt copy（静态文案，如操作提示、说明文字；不用于副标题）            |
| `brand`  | Logo, copyright, brand mark                                                                     |
| `empty`  | Placeholder, empty-state illustration                                                           |

## Operators

| Operator | Meaning                                                     | Precedence       |
| -------- | ----------------------------------------------------------- | ---------------- |
| `:`      | Slot binding                                                | -                |
| `->`     | Vertical sequence (top to bottom)                           | low              |
| `+`      | Horizontal juxtaposition (left to right)                    | higher than `->` |
| `()`     | Container grouping; only follows `list`/`card`/`form`/`nav` | -                |
| `-`      | Slot missing                                                | -                |
| `?`      | Occluded/uncertain, suffix on a single role                 | -                |

No other operators may be introduced (`|`, `*`, `&`, `~`, `//`).

Key constraints:

- Neither side of `+` is allowed to contain a bare `->` sequence. When a horizontal cell needs a vertical arrangement inside it, wrap it in a named container: `media + card(title -> meta -> meta)`.
- `card()` may be used as a pure structural grouping container; visible shadow/rounded corner/border is not required.
- `status`, `hint`, `brand`, `empty`, `media`, `title`, `meta` are pure leaf nodes and must not be followed by `(`.
- `overlay` is only the position slot `O`; it is not a role word and must not appear in a role position.

## Card Test

Using `card` is allowed if either main test is satisfied:

1. It can repeat inside `list()` (i.e., it is a list item).
2. It can be clicked / selected / expanded / collapsed as a whole.

Auxiliary references (do not force when uncertain): multiple internal fields jointly describe the same business object; there are local action buttons inside it.

**Container boundary rule**: If an element is visually enclosed inside a card (e.g., a QR code, a status stamp, or a metadata line that appears inside the card's border/background), it **must** be placed inside `card(...)`, not appended after it in a top-level sequence. Writing `card(...) -> media -> status` means those elements are outside the card; write `card(... -> media -> status)` instead.

## Slot Expression Grammar

```bnf
signature_object ::= "T" expr_or_missing, "M" expr_or_missing, "B" expr_or_missing, "O" expr_or_missing, "F" expr_or_missing
expr_or_missing  ::= expr | "-"
slot_id     ::= "T" | "M" | "B" | "O" | "F"
expr        ::= seq
seq         ::= row ( SP "->" SP row )*
row         ::= atom ( SP "+" SP atom )*
atom        ::= container | leaf
container   ::= cont_role "(" expr ")"
cont_role   ::= "list" | "card" | "form" | "nav"
leaf        ::= leaf_role "?"?
leaf_role   ::= "nav" | "title" | "meta" | "media" | "form" | "list"
              | "card" | "action" | "status" | "hint" | "brand" | "empty"
SP          ::= " "
```

Containers may nest recursively; there is no depth limit.

## Form-Filling Flow

For each image, answer in order:

Q1 T slot: Pick roles from the vocabulary, connect with `->` / `+`, or fill `-`.
Q2 M slot: Same as above; container nesting allowed.
Q3 B slot: Same as above; commonly `action + action` or `nav`.
Q4 O slot: Fill `-` or a container expression; when not `-`, include `overlay_type = modal | drawer | toast | sheet` in notes.
Q5 F slot: Fill `-` or a single role; when not `-`, include `float_anchor = br | bl | tr | tl` in notes.

Return shape:

```json
{
  "signature": {
    "T": "<Q1>",
    "M": "<Q2>",
    "B": "<Q3>",
    "O": "<Q4>",
    "F": "<Q5>"
  },
  "notes": {
    "overlay_type": null,
    "float_anchor": null,
    "occluded": null
  }
}
```

Minimal example:

```json
{
  "signature": {
    "T": "title -> meta",
    "M": "card(media + card(title -> meta) -> status)",
    "B": "action + hint",
    "O": "-",
    "F": "-"
  },
  "notes": {}
}
```

## Notes Vocabulary

The `notes` field uses a fixed key set. Any key not listed below is invalid and the signature must be rejected.

| Key            | When required                     | Allowed values                                                    | Purpose                                                                              |
| -------------- | --------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `overlay_type` | Required when `O` slot is not `-` | `modal` \| `drawer` \| `toast` \| `sheet`                         | Identifies overlay subtype for Step 6 overlay comparison                             |
| `float_anchor` | Required when `F` slot is not `-` | `br` \| `bl` \| `tr` \| `tl`                                      | Identifies F-slot anchor corner                                                      |
| `occluded`     | Optional                          | List of slot.role paths, e.g. `[T.meta, M.card.title]`            | Marks positions partially obscured in the image                                      |
| `divider`      | Optional                          | `dashed` \| `solid` \| `dotted`                                   | Captures a structurally meaningful divider style inside `card(...)` or between slots |
| `tab_active`   | Optional                          | Plain string matching one tab label inside a `nav(...)` container | When `M` contains `nav(...)` tabs, identifies which tab is selected                  |
| `list_count`   | Optional                          | Integer or `≥N` form                                              | When a `list(...)` item count is structurally meaningful for comparison              |

**Forbidden in `notes`**:

- Visual styling keys (`bg`, `color`, `shadow`, `radius`, `font_size`, `theme`, …) — these describe appearance, not structure.
- Free-form description strings.
- Any key not in the table above.

Example of a valid notes object: `{ "overlay_type": "modal", "divider": "dashed" }`
Example of an invalid notes object: `{ "bg": "gradient_warm", "divider": "dashed" }` — `bg` is forbidden.

## Forbidden Forms

The examples below name the affected slot for readability. In actual subagent output, these are JSON object values under `signature.T`, `signature.M`, etc., not markdown signature lines.

| #   | Anti-example                                                             | Problem                                                                                               | Correct example                                                                         |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `M: status(error -> retry)`                                              | `status` is a pure leaf node                                                                          | `M: status -> action`                                                                   |
| 2   | `M: section(title -> list)`                                              | `section` is not in the vocabulary                                                                    | `M: title -> list(card)`                                                                |
| 3   | `O: overlay(card)`                                                       | `overlay` is not a role word                                                                          | `O: card(...)`, notes `overlay_type=modal`                                              |
| 4   | `M: title \| meta`                                                       | `\|` is forbidden                                                                                     | Pick one; if uncertain write `title?`                                                   |
| 5   | `{ "T": "nav, M: list" }`                                                | Slots cannot be combined into one string value                                                        | Use separate object fields: `{ "T": "nav", "M": "list", "B": "-", "O": "-", "F": "-" }` |
| 6   | (omits B/O/F lines)                                                      | Slots that do not appear must be written as `-`                                                       | `B: -`, `O: -`, `F: -`                                                                  |
| 7   | `M: card*3`                                                              | `*` is forbidden                                                                                      | `M: list(card)`                                                                         |
| 8   | `B: action -> action`                                                    | Side-by-side uses `+`                                                                                 | `B: action + action`                                                                    |
| 9   | `M: title->meta`                                                         | Operators must have spaces on both sides                                                              | `M: title -> meta`                                                                      |
| 10  | `M: a + (b -> c)`                                                        | A bare `->` sequence is not allowed on the right side of `+`                                          | `M: a + card(b -> c)`                                                                   |
| 11  | `M: card(media + card(title -> meta -> meta)) -> media + status -> meta` | Elements visually inside the card are written outside `card()`; they must live inside the parentheses | `M: card(media + card(title -> meta -> meta) -> media -> status -> meta)`               |
| 12  | `M: card(card(media + card(title -> meta -> meta)) -> media -> status)`  | 水平并列结构（`+`）已在父 card() 内时，不要再额外套一层 card() 包裹                                   | `M: card(media + card(title -> meta -> meta) -> media -> status)`                       |
| 13  | `T: title -> hint`                                                       | `hint` 只用于静态提示文案；页面副标题、时间戳、编号等动态补充信息应使用 `meta`                        | `T: title -> meta`                                                                      |
