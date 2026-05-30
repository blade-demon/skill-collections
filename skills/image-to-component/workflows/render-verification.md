# 渲染验证工作流

仅当用户选择 write-file mode 且生成项目有本地渲染路径时使用本可选工作流。

## 触发条件

当以下全部为真时运行渲染验证：

- 文件已写入项目。
- 目标项目暴露 Storybook 或适合预览的 Vite 应用路由。
- Playwright 或等效浏览器自动化路径可用。
- 用户未要求跳过验证。

若无本地渲染路径，说明跳过渲染验证及原因。

## 设置偏好

| 可用路径       | 用法                                           |
| -------------- | ---------------------------------------------- |
| 现有 Storybook | 为每个 status/step variant 添加或使用 story    |
| 现有 Vite app  | 仅在项目约定安全时添加或使用临时 route/demo 页 |
| 均无           | 跳过渲染验证；不要臆造项目基础设施             |

除非用户显式要求，不要添加新渲染基础设施。

## 必需截图

捕获每个有意义 variant：

- 每个 status union 成员，如 `pending`、`used`、`expired`。
- 顺序流程的每个 `step` 或 `phase` 值。
- 存在 O-slot 输出时的 overlay 开/关状态。
- 仅当由 signature 或用户请求生成 empty/loading/error variant。

## 差异报告

仅产出人类可读报告。不要根据截图差异自动修复生成代码。

格式：

```markdown
## Render Verification

| Variant         | Screenshot                            | Result | Notes                                         |
| --------------- | ------------------------------------- | ------ | --------------------------------------------- |
| pending         | artifacts/OrderPage-pending.png       | pass   | Matches planned structure                     |
| used            | artifacts/OrderPage-used.png          | review | Footer action wraps differently than expected |
| expired + modal | artifacts/OrderPage-expired-modal.png | pass   | Overlay renders                               |

### Differences

- `used`: Footer action wraps to two lines; confirm whether this is acceptable.
- `expired + modal`: No structural differences found.
```

## 规则

- 验证引用资源能渲染，或 ledger 行存在处出现占位符。
- 验证无严重文字重叠或空白渲染。
- 验证 status variant 可独立选择。
- 用 plain language 报告差异。除非用户显式要求，不要尝试像素级匹配。
- 本工作流不要自动修复；编辑前询问。

## 退出

以已捕获截图与差异报告退出，或以清晰的跳过原因退出。
