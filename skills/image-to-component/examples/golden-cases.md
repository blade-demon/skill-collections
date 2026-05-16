# Golden Signature Comparison Cases

These examples use the structured JSON shape from `protocols/subagent-return-format.md`. Compare the `signature` objects mechanically; do not ask subagents to emit markdown signature blocks.

## Case A: QR-code order page

Three images are states of the same component.

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "pending.png",
      "signature": {
        "T": "title -> meta",
        "M": "card(media + card(title -> meta -> meta) -> media)",
        "B": "hint -> action + hint",
        "O": "-",
        "F": "-"
      },
      "notes": { "divider": "dashed" }
    },
    {
      "filename": "used.png",
      "signature": {
        "T": "title -> meta",
        "M": "card(media + card(title -> meta -> meta) -> media -> status)",
        "B": "meta",
        "O": "-",
        "F": "-"
      },
      "notes": { "divider": "dashed" }
    },
    {
      "filename": "expired.png",
      "signature": {
        "T": "title -> meta",
        "M": "card(media + card(title -> meta -> meta) -> media -> status)",
        "B": "meta",
        "O": "-",
        "F": "-"
      },
      "notes": { "divider": "dashed" }
    }
  ]
}
```

Decision: T/O/F are identical; M differs by one added `status` leaf; B has a leaf-node swap. Conclusion: same component, 3 states.

## Case B: List page vs detail page

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "list.png",
      "signature": {
        "T": "nav",
        "M": "list(card(title -> meta + status))",
        "B": "nav",
        "O": "-",
        "F": "-"
      },
      "notes": {}
    },
    {
      "filename": "detail.png",
      "signature": {
        "T": "nav",
        "M": "title -> meta -> media -> status -> form",
        "B": "action + action",
        "O": "-",
        "F": "-"
      },
      "notes": {}
    }
  ]
}
```

Decision: M container topology differs: `list(card(...))` vs a leaf sequence. Conclusion: different components.

## Case C: Detail page plus confirm dialog

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "normal.png",
      "signature": {
        "T": "nav",
        "M": "title -> meta -> media -> form",
        "B": "action + action",
        "O": "-",
        "F": "-"
      },
      "notes": {}
    },
    {
      "filename": "confirm-modal.png",
      "signature": {
        "T": "nav",
        "M": "title -> meta -> media -> form",
        "B": "action + action",
        "O": "card(title -> meta -> action + action)",
        "F": "-"
      },
      "notes": { "overlay_type": "modal" }
    }
  ]
}
```

Decision: after stripping O, the base layer is identical; the O slot becomes an independent overlay component.

## Case D: Login form idle vs error

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "idle.png",
      "signature": {
        "T": "title -> meta",
        "M": "form(form -> form -> action)",
        "B": "hint",
        "O": "-",
        "F": "-"
      },
      "notes": {}
    },
    {
      "filename": "error.png",
      "signature": {
        "T": "title -> meta",
        "M": "form(form -> form -> hint -> action)",
        "B": "hint",
        "O": "-",
        "F": "-"
      },
      "notes": {}
    }
  ]
}
```

Decision: M differs by one added `hint` leaf inside the same form topology. Conclusion: same component, 2 states.

## Case E: Empty state vs filled list

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "empty.png",
      "signature": {
        "T": "nav",
        "M": "empty",
        "B": "action",
        "O": "-",
        "F": "-"
      },
      "notes": {}
    },
    {
      "filename": "filled.png",
      "signature": {
        "T": "nav",
        "M": "list(card(title -> meta))",
        "B": "action",
        "O": "-",
        "F": "-"
      },
      "notes": {}
    }
  ]
}
```

Decision: M topology changes from a single `empty` leaf to `list(card(...))`. Conclusion: different components.
