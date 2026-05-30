# 资源处理工作流

在定义 props 与生成目录树/代码 skeleton 时使用。

## 硬规则

- Media 节点仅变为 `src` 与 `alt` props。
- 不要从截图推断图标包名。
- 不要猜测图标组件名。
- 不要添加新图标包。
- 不要用 status 文本替换未知图标。
- 若图标或 media 资源无法可靠识别，保留资源占位符并在 `asset-ledger.md` 中记录。

## Prop 映射

| Signature role         | 生成 API                                                           |
| ---------------------- | ------------------------------------------------------------------ |
| `media` 图片/内容      | `{name}Src: string` 与 `{name}Alt: string`                         |
| 可选 `media`           | `{name}Src?: string` 与 `{name}Alt?: string`                       |
| 随 status 变化的 media | 使用按 status 的 data props 或由现有 `status` union 驱动的条件渲染 |
| 不可靠图标             | 占位组件/元素 + asset-ledger 行                                    |

signature 缺乏语义时使用通用名，如 `mediaASrc`、`mediaAAlt`。仅当用户、文件名或项目上下文提供时使用语义名。

## 精确 Asset Ledger 格式

创建或输出 `asset-ledger.md`，表格如下：

```markdown
| Asset ID  | Source image(s)       | Signature path  | Intended use            | Generated placeholder                                     | Required user action                           | Status  |
| --------- | --------------------- | --------------- | ----------------------- | --------------------------------------------------------- | ---------------------------------------------- | ------- |
| asset-001 | pending.png, used.png | M.card[0].media | QR/code-like media area | `mediaASrc` / `mediaAAlt` props                           | Provide final image URL or import path         | pending |
| asset-002 | expired.png           | T.media         | Unknown leading icon    | `<span className={styles.iconPlaceholder} aria-hidden />` | Identify icon asset or existing icon component | pending |
```

## Status 值

- `pending`：用户须提供资源、URL、import 路径或现有组件名。
- `provided`：用户已提供可靠资源引用。
- `reused`：已显式识别现有项目资源/组件。

## 无障碍

- 每个 media prop 须含 alt prop，除非用户确认资源为装饰性。
- 装饰性未知图标使用 `aria-hidden`，仍须出现在 ledger 中。
- 不要从 signature 未携带的截图内容伪造 alt 文本。

## 退出

当每个 media/图标节点由以下之一表示时退出：

- 具体 `src`/`alt` prop，
- 已确认现有资源/组件，或
- `asset-ledger.md` 中的一行。
