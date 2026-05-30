# Case 3 Expected Signatures — 指数精选（含 Tab 切换）

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "image.png",
      "signature": {
        "T": "title + meta + action",
        "M": "nav -> list(card(title -> meta + action + action))",
        "B": "-",
        "O": "-",
        "F": "-"
      },
      "notes": {
        "tab_active": "港股指数"
      }
    }
  ]
}
```

预期 Step 6 决策：单图，一个独立组件。
