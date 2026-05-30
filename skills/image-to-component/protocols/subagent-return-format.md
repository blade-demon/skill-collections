# Signature 子 Agent 返回格式

Signature 子 agent 必须为每个派发的读取 batch 返回一个结构化 JSON 对象。派发方在任何结构对比前按 schema 与字段规则校验该对象。

## 契约

仅返回 JSON。不要用 markdown、代码围栏、标题、注释或散文包裹。

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

### 顶层字段

| 字段     | 必填 | 类型   | 规则                                                    |
| -------- | ---: | ------ | ------------------------------------------------------- |
| `batch`  |  yes | string | 须与派发方提供的 batch id 完全一致，如 `batch-1`。      |
| `images` |  yes | array  | 须含 batch 中每个输入路径恰好一个对象。无多余、无遗漏。 |

### 图片字段

| 字段        | 必填 | 类型   | 规则                                                       |
| ----------- | ---: | ------ | ---------------------------------------------------------- |
| `filename`  |  yes | string | 仅 basename，匹配 batch 中一个输入图片路径。不含目录路径。 |
| `signature` |  yes | object | 须含恰好五个 slot 键 `T`、`M`、`B`、`O`、`F`。             |
| `notes`     |  yes | object | 仅含 allowlisted note 键。已知可选键 absent 时用 `null`。  |

### Signature Slot 对象

`signature` 须含恰好这些键：

```json
{
  "T": "<slot expression or '-'>",
  "M": "<slot expression or '-'>",
  "B": "<slot expression or '-'>",
  "O": "<slot expression or '-'>",
  "F": "<slot expression or '-'>"
}
```

Slot 表达式使用 `signature-spec.md` 的语法与词汇表：

- Role 词：`nav`、`title`、`meta`、`media`、`form`、`list`、`card`、`action`、`status`、`hint`、`brand`、`empty`。
- 运算符：`:`、`->`、`+`、`()`、`-`、`?`。
- 缺失 slot 的 JSON 值为字符串 `"-"`。
- Slot 值不得含 slot 标签。用 `"T": "nav"`，不用 `"T": "T: nav"`。
- Slot 键须为对象字段，非自由文本行。

### Notes Allowlist

`notes` 仅可含这些键：

| 键             | 允许值                                        |
| -------------- | --------------------------------------------- |
| `overlay_type` | `modal`、`drawer`、`toast`、`sheet` 或 `null` |
| `float_anchor` | `br`、`bl`、`tr`、`tl` 或 `null`              |
| `occluded`     | slot.role 路径字符串数组，或 `null`           |
| `divider`      | `dashed`、`solid`、`dotted` 或 `null`         |
| `tab_active`   | 匹配可见 tab 标签的 string，或 `null`         |
| `list_count`   | 整数、`≥N` / `>=N` 形式 string，或 `null`     |

不允许其他键。拒绝 visual 或描述性键，如 `bg`、`color`、`shadow`、`radius`、`font_size`、`theme`、`description`、`summary`。

必需 note 关系：

- 若 `signature.O` 非 `"-"`，`notes.overlay_type` 须为 `modal`、`drawer`、`toast` 或 `sheet` 之一。
- 若 `signature.F` 非 `"-"`，`notes.float_anchor` 须为 `br`、`bl`、`tr` 或 `tl` 之一。

## 校验

派发方经 `npm run validate-signature` 运行 `scripts/src/validate-signature.ts` 校验返回。无需自校验 —— 确保输出为裸 JSON（无 markdown 围栏、无散文），且上述每个字段存在且正确。

## 失败与重派发规则

校验失败按 batch 范围处理。

1. 首次失败：重派发同一 batch。仅在 `===dispatcher-instructions-begin===` / `===dispatcher-instructions-end===` fence 内注入具体校验错误。
2. 第二次失败：暂停工作流，展示错误 JSON 与校验错误。询问用户选择：

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

用户选择处理：

- A：用相同规则校验提供的 JSON。
- B：从后续对比中排除该 batch。
- C：干净停止工作流。

不要从散文推断缺失字段。不要用解析 markdown signature 块从畸形 JSON 恢复。重派发或请求 corrected JSON 对象。

## Batch 跟踪规则

- 派发方按处理顺序分配稳定 id：`batch-1`、`batch-2` 等。
- 子 agent 仅可返回其被分配 batch 的图片。
- 跨 batch 对比仅在每个保留 batch 有有效 JSON 后开始。
- 跳过的 batch 须记录为 excluded，不得参与组件/状态决策。
- 在派发方状态中保留 `batch` + `filename` 到源路径的映射；子 agent 返回 intentionally 仅含 basename。

## 完整示例

输入 batch：

```text
batch: batch-1
paths:
/project/screens/pending.png
/project/screens/used.png
```

有效返回：

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

无效返回示例：

- 含 JSON 的 Markdown 块：无效，因返回不是仅 JSON。
- `"filename": "/project/screens/pending.png"`：无效，filename 须为 basename。
- `"signature": "T: nav\nM: ..."`：无效，signature 须为对象。
- `"notes": { "shadow": "card" }`：无效，`shadow` 属于 style hints，非 signature notes。
