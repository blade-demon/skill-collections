# Golden Signature 对比案例

这些示例使用 `protocols/subagent-return-format.md` 的结构化 JSON 形状。机械对比 `signature` 对象；不要要求子 agent 输出 markdown signature 块。

## Case A：二维码订单页

三张图为同一组件的状态。

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

决策：T/O/F 相同；M 差一个新增 `status` leaf；B 有 leaf 互换。结论：同一组件，3 个状态。

## Case B：列表页 vs 详情页

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

决策：M 容器拓扑不同：`list(card(...))` vs leaf 序列。结论：不同组件。

## Case C：详情页加确认对话框

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

决策：剥离 O 后基础层相同；O slot 成为独立 overlay 组件。

## Case D：登录表单 idle vs error

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

决策：M 在同一 form 拓扑内差一个新增 `hint` leaf。结论：同一组件，2 个状态。

## Case E：空状态 vs 有数据列表

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

决策：M 拓扑从单个 `empty` leaf 变为 `list(card(...))`。结论：不同组件。
