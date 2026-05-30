# Style Context 协议

Style-context 子 agent 为可选。仅当派发方需要 coarse 样式提示以选择 skeleton 密度与 class 结构时使用。绝不得提供颜色、精确尺寸、文案或自由形式 visual 描述。

## 派发时机

仅在图片路径已列出并分批后派发 style-context，且主工作流已有足够用户设置以知样式提示是否对输出生成有用。

推荐时机：

1. 创建图片读取 batch。
2. 派发 signature 子 agent 获取结构 signature。
3. 可选：对相同 batch 派发 style-context 子 agent，与 signature 派发并行或紧随其后。
4. 在用于组件 skeleton 或 CSS 决策前校验 style hints。

主 agent 读图边界仍适用：若 style-context 需读图，读图发生在 style-context 子 agent 内，非主 agent。

## 返回契约

仅返回 JSON。不要用 markdown、代码围栏、标题、注释或散文包裹。

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

## 允许的键

`style_hints` 须含恰好这些键：

| 键                      | 类型    | 允许值                             |
| ----------------------- | ------- | ---------------------------------- |
| `density`               | string  | `compact`, `normal`, `loose`       |
| `corner_radius`         | string  | `none`, `small`, `medium`, `large` |
| `type_hierarchy_levels` | integer | `1` through `5`                    |
| `primary_action_count`  | integer | `0` or greater                     |
| `is_mobile_viewport`    | boolean | `true` or `false`                  |
| `shadow_presence`       | string  | `none`, `card`, `modal`, `overlay` |

`style_hints` 内外不允许其他键。

## 禁止内容

Style hints 不得包含：

- 颜色或 palette 名称。
- 精确数值测量，如像素宽度、字号、间距、圆角。
- 图片中的文案。
- 自由形式描述、摘要、理由或 visual 评论。
- 组件结构。结构属于 signature 子 agent 返回。
- Signature notes 键，如 `overlay_type`、`float_anchor`、`divider`、`tab_active`、`list_count`。

## 无效示例

无效：含颜色与精确测量

```json
{
  "density": "normal",
  "corner_radius": "12px",
  "primary_color": "#1677ff"
}
```

无效：含自由描述与文案

```json
{
  "density": "compact",
  "description": "The page has a blue header and says Submit Order"
}
```

无效：使用不支持的 enum 值

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

## 校验规则

使用前校验 style-context 返回：

- 返回为可解析 JSON，且整个输出即为 JSON 对象。
- `batch` 与派发的 batch id 完全一致。
- `images.length` 等于 batch 路径数。
- 每个 `filename` 为 batch 路径列表中的 basename。
- 每个 batch filename 恰好出现一次。
- `style_hints` 含恰好六个允许键。
- Enum 字段与允许值完全匹配。
- `type_hierarchy_levels` 为 1–5 的整数。
- `primary_action_count` 为 >= 0 的整数。
- `is_mobile_viewport` 为 boolean，非 string。
- 不得出现颜色、精确测量、文案或自由描述字段。

失败处理与 signature 返回协议相同：

1. 首次失败：在同一 style-context batch 内于 dispatcher-instructions fence 注入具体校验错误后重派发。
2. 第二次失败：暂停并询问用户提供 corrected JSON、跳过该 batch 的 style hints，或停止工作流。

若 style-context 被跳过或无效，继续无 style hints 的基于 signature 工作流。
