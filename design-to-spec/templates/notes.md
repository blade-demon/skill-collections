# <组件名称> — 设计笔记

> 由 `design-to-spec` 技能生成。此文件是协作草稿，鼓励迭代修订 —— 「开放问题」和 `needs_human_input` 标志就是期待人类编辑的锚点。

## 为什么

<1-2 句话：用户价值、解决什么问题、成功是什么样>

## 决策

- **<决策名>** — <一句话理由>
- **<决策名>** — <一句话理由>
- **<决策名>** — <一句话理由>

## 数据契约

> 每个字段必须标注**来源**，放在 inline 注释里：
>
> - `source: api` —— 直接来自后端接口文档，字段名和类型必须与接口一致
> - `source: derived` —— 前端从其他字段派生；注释里写出派生公式（例如 `yearChange = (currentNav - yearAgoNav) / yearAgoNav * 100`）
> - `source: prop` —— 由父组件/宿主页面传入（例如 `isLoggedIn`），不来自接口也非派生
> - `source: ui-only` —— 组件内部状态（例如 `isExpanded`），不在 Props interface 中，而在「内部状态」小节
>
> 如果用户提供了接口文档 → 优先用文档字段名、类型、可空性，不要猜。接口有 UI 没用的字段不放入 Props。UI 有接口没有的字段必须标为 `source: derived` 或 `source: prop`，否则退化为 `needs_human_input`。
>
> 如果只有 mockup 没有接口文档 → 所有字段标 `source: api (inferred)`，并在「开放问题」里加「请确认接口字段名与类型」。

```ts
interface <ComponentName>Props {
  // <field>: <type>;  // source: api | derived | prop — <关于含义、格式的一行注释>
}

interface <ComponentName>Events {
  // 'event-name': (detail: <DetailType>) => void;  // <何时触发>
}
```

## 状态枚举

枚举此组件所有可观察的运行时状态。**每个标 ✅ 的状态在 `spec.md` 中至少要有 1 条对应 Scenario**；未在 mockup 中体现的状态保留 ✅ 标记并在备注里写「mockup 未提供 → needs_human_input」。

| 状态         | 触发条件                          | UI 表现           | 必需  |
| ---------- | ----------------------------- | --------------- | --- |
| `loading`  | 数据请求中 / 首次挂载未拿到数据             | <骨架屏 / spinner / 占位> | ✅   |
| `empty`    | 数据合法但内容为空（如 `tags: []`）       | <空文案 / 占位插画>    | ✅   |
| `partial`  | 部分可选字段缺失                      | <降级展示规则>        | 视情况 |
| `success`  | 完整数据可渲染                       | <主视觉，对应 mockup 默认态> | ✅   |
| `stale`    | 缓存过期但仍展示旧数据                   | <角标 / 灰化 / 不变化>  | 视情况 |
| `error`    | 请求失败 / 数据校验失败                 | <错误兜底 / 重试入口>   | ✅   |
| `offline`  | 网络不可达                         | <离线提示>          | 视情况 |
| `disabled` | 业务禁用（限购 / 黑名单）                | <CTA 灰化 + 文案替换> | 视情况 |

## 组件分解

| 组件       | 目的     | 复用信号             |
| -------- | ------ | ---------------- |
| `<名称>` | <一行目的> | `<复用信号>` |

## 布局陷阱

- **<陷阱名称>** — <一句话描述 + 修复>

## 置信度地图

| 元素 / 行为 | 状态                                      | 备注  |
| ------- | --------------------------------------- | --- |
| <元素>    | identified / inferred / needs_human_input | <备注> |

## 开放问题

1. <问题>
2. <问题>

## 计划提示

- `<snake_case 标签>`

## 交叉引用

- 输入 mockup：<路径 / 简述>
- 目标技术栈：<stack>
- 设计系统：<system 或 none>
- 规格增量：`./specs/<capability>/spec.md`

## 建议的下一步

将此 `notes.md` 输入 Superpowers `/plan`，传递 `--target <stack>` 和仓库根目录，以便规划器解决「开放问题」并生成实际任务分解。

## 埋点锚点

> 本节是下游 `design-to-track` 等埋点 skill 的输入。**不要在这里写完整的事件 schema**，只列出"需要被埋点覆盖的语义事件 + 触发条件"，下游 skill 负责把它转成具体 event name / property 字段。
>
> **覆盖原则**：spec.md 中所有以 `tap-` / `view-` / `enter-` / `submit-` 等前缀的事件，以及任何视为"主转化"或"主曝光"的 Scenario，都必须在此表中至少出现 1 行。明确不埋点的也要显式标 `not-tracked`，不要漏。

| 锚点 ID                           | 触发 Scenario（对应 spec.md 标题或 Requirement） | 类型                                    | 关键参数（语义层）           | 备注           |
| ------------------------------- | ----------------------------------------- | ------------------------------------- | -------------------- | ------------ |
| `<snake_case_id>`               | <Scenario 标题>                            | exposure / click / dwell / impression / not-tracked | <字段语义名，不是埋点 key>     | <业务问题 / 决策原因> |
