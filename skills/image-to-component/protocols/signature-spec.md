# 区域 Signature 规范

使用本规范将每张 UI 图片压缩为可机械对比的区域 signature slot 表达式。Signature 子 agent 必须将这些表达式包装在 `protocols/subagent-return-format.md` 的 JSON 返回契约中。

## 位置 Slot

| Slot | 定义                                                          |
| ---- | ------------------------------------------------------------- |
| `T`  | 屏幕顶部，0–20%                                               |
| `M`  | 屏幕中部，20–80%（视觉质心）                                  |
| `B`  | 屏幕底部，80–100%                                             |
| `O`  | Overlay（Modal / Drawer / Toast，带 backdrop 或明显 z-index） |
| `F`  | 脱离文档流的浮动元素（FAB、边缘锚定按钮）                     |

不存在的 slot 填 `-`。返回的 signature 对象必须包含全部五个 slot 键（`T`、`M`、`B`、`O`、`F`）；不允许省略。

## Role 词汇表

```
nav | title | meta | media | form | list | card | action | status | hint | brand | empty
```

| 词       | 含义                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| `nav`    | 导航栏、返回按钮、tabs、breadcrumb、segmented control                        |
| `title`  | 页面或区块主标题                                                             |
| `meta`   | 时间、ID、数量、副标题及其他补充信息（动态信息，如副标题、时间、单号、数量） |
| `media`  | 图片、二维码、图标插画（任何图形主体）                                       |
| `form`   | 输入框、下拉、开关                                                           |
| `list`   | 含 2 个及以上条目的重复结构                                                  |
| `card`   | 可作为整体移动的业务对象单元                                                 |
| `action` | 按钮、可点击链接                                                             |
| `status` | 状态标记：loading spinner、成功/错误 badge、印章、水印（纯 leaf 节点）       |
| `hint`   | 静态描述文字、提示文案（静态文案，如操作提示、说明文字；不用于副标题）       |
| `brand`  | Logo、版权、品牌标识                                                         |
| `empty`  | 占位、空状态插画                                                             |

## 运算符

| 运算符 | 含义                                           | 优先级    |
| ------ | ---------------------------------------------- | --------- |
| `:`    | Slot 绑定                                      | -         |
| `->`   | 垂直序列（自上而下）                           | 低        |
| `+`    | 水平并列（从左到右）                           | 高于 `->` |
| `()`   | 容器分组；仅跟在 `list`/`card`/`form`/`nav` 后 | -         |
| `-`    | Slot 缺失                                      | -         |
| `?`    | 被遮挡/不确定，后缀于单个 role                 | -         |

不得引入其他运算符（`|`、`*`、`&`、`~`、`//`）。

关键约束：

- `+` 两侧不允许含 bare `->` 序列。水平单元格内需垂直排列时，用命名容器包裹：`media + card(title -> meta -> meta)`。
- `card()` 可作为纯结构分组容器；不要求可见阴影/圆角/边框。
- `status`、`hint`、`brand`、`empty`、`media`、`title`、`meta` 为纯 leaf 节点，后不得跟 `(`。
- `overlay` 仅是位置 slot `O`；不是 role 词，不得出现在 role 位置。

## Card 测试

满足以下主测试之一即可使用 `card`：

1. 可在 `list()` 内重复（即列表项）。
2. 可作为整体点击 / 选中 / 展开 / 折叠。

辅助参考（不确定时不强制）：多个内部字段共同描述同一业务对象；内部有局部 action 按钮。

**容器边界规则**：若元素视觉上被 card 包裹（如 QR 码、status 印章、出现在 card 边框/背景内的 meta 行），**必须**放在 `card(...)` 内，不得作为顶层序列项追加在 card 之后。写 `card(...) -> media -> status` 表示这些元素在 card 外；应写 `card(... -> media -> status)`。

## Slot 表达式语法

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

容器可递归嵌套；无深度限制。

## 填表流程

对每张图按序回答：

Q1 T slot：从词汇表选 role，用 `->` / `+` 连接，或填 `-`。
Q2 M slot：同上；允许容器嵌套。
Q3 B slot：同上；常见 `action + action` 或 `nav`。
Q4 O slot：填 `-` 或容器表达式；非 `-` 时在 notes 含 `overlay_type = modal | drawer | toast | sheet`。
Q5 F slot：填 `-` 或单个 role；非 `-` 时在 notes 含 `float_anchor = br | bl | tr | tl`。

返回形状：

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

最小示例：

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

## Notes 词汇表

`notes` 字段使用固定键集。未列出的任何键无效，signature 须拒绝。

| 键             | 何时必填               | 允许值                                           | 用途                                                |
| -------------- | ---------------------- | ------------------------------------------------ | --------------------------------------------------- |
| `overlay_type` | `O` slot 非 `-` 时必填 | `modal` \| `drawer` \| `toast` \| `sheet`        | 标识 overlay 子类型供 Step 6 overlay 对比           |
| `float_anchor` | `F` slot 非 `-` 时必填 | `br` \| `bl` \| `tr` \| `tl`                     | 标识 F-slot 锚角                                    |
| `occluded`     | 可选                   | slot.role 路径列表，如 `[T.meta, M.card.title]`  | 标记图片中部分遮挡的位置                            |
| `divider`      | 可选                   | `dashed` \| `solid` \| `dotted`                  | 捕获 `card(...)` 内或 slot 间有结构意义的分隔线样式 |
| `tab_active`   | 可选                   | 与 `nav(...)` 内可见 tab 标签匹配的 plain string | 当 `M` 含 `nav(...)` tabs 时标识选中 tab            |
| `list_count`   | 可选                   | 整数或 `≥N` / `>=N` 形式                         | 当 `list(...)` 条目数对对比有结构意义时             |

**`notes` 中禁止**：

- Visual 样式键（`bg`、`color`、`shadow`、`radius`、`font_size`、`theme` 等）—— 描述外观而非结构。
- 自由形式描述字符串。
- 上表未列出的任何键。

有效 notes 示例：`{ "overlay_type": "modal", "divider": "dashed" }`
无效 notes 示例：`{ "bg": "gradient_warm", "divider": "dashed" }` —— `bg` 禁止。

## 禁止形式

以下示例为可读性标注 slot；实际子 agent 输出中，这些是 `signature.T`、`signature.M` 等下的 JSON 对象值，而非 markdown signature 行。

| #   | 反例                                                                     | 问题                                                                           | 正确示例                                                                    |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1   | `M: status(error -> retry)`                                              | `status` 为纯 leaf 节点                                                        | `M: status -> action`                                                       |
| 2   | `M: section(title -> list)`                                              | `section` 不在词汇表                                                           | `M: title -> list(card)`                                                    |
| 3   | `O: overlay(card)`                                                       | `overlay` 不是 role 词                                                         | `O: card(...)`, notes `overlay_type=modal`                                  |
| 4   | `M: title \| meta`                                                       | `\|` 禁止                                                                      | 选一个；不确定写 `title?`                                                   |
| 5   | `{ "T": "nav, M: list" }`                                                | Slot 不能合并为一个字符串值                                                    | 用独立对象字段：`{ "T": "nav", "M": "list", "B": "-", "O": "-", "F": "-" }` |
| 6   | （省略 B/O/F 行）                                                        | 不出现的 slot 须写 `-`                                                         | `B: -`, `O: -`, `F: -`                                                      |
| 7   | `M: card*3`                                                              | `*` 禁止                                                                       | `M: list(card)`                                                             |
| 8   | `B: action -> action`                                                    | 并排用 `+`                                                                     | `B: action + action`                                                        |
| 9   | `M: title->meta`                                                         | 运算符两侧须有空格                                                             | `M: title -> meta`                                                          |
| 10  | `M: a + (b -> c)`                                                        | `+` 右侧不允许 bare `->` 序列                                                  | `M: a + card(b -> c)`                                                       |
| 11  | `M: card(media + card(title -> meta -> meta)) -> media + status -> meta` | 视觉上在 card 内的元素写在了 card 外；须在括号内                               | `M: card(media + card(title -> meta -> meta) -> media -> status -> meta)`   |
| 12  | `M: card(card(media + card(title -> meta -> meta)) -> media -> status)`  | 水平并列结构（`+`）已在父 card() 内时，不要再额外套一层 card() 包裹            | `M: card(media + card(title -> meta -> meta) -> media -> status)`           |
| 13  | `T: title -> hint`                                                       | `hint` 只用于静态提示文案；页面副标题、时间戳、编号等动态补充信息应使用 `meta` | `T: title -> meta`                                                          |
