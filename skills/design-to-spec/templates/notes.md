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
> 如果只有设计稿、没有接口文档 → 所有字段标 `source: api (inferred)`，并在「开放问题」里加「请确认接口字段名与类型」。

```ts
interface <ComponentName>Props {
  // <field>: <type>;  // source: api | derived | prop — <关于含义、格式的一行注释>
}

interface <ComponentName>Events {
  // 'event-name': (detail: <DetailType>) => void;  // <何时触发>
}
```

### 接口字段映射表（仅当用户提供接口文档时填写）

> 记录接口响应字段与 UI 展示含义的对应关系，作为数据契约的事实源。若用户回复「字段名即含义」则省略此表。
>
> **枚举字段处理原则**：枚举值必须全部列出，不得省略。每个枚举值在「UI 展示含义」列写明对应的视觉呈现（颜色 / 文案 / 图标 / 显隐规则）。枚举值缺失或不全的字段在「备注」列标 `needs_human_input: 枚举值未完整确认`，并在「开放问题」节补充追问。

| 接口字段名    | 接口类型                      | 枚举值（全量）        | UI 中展示为                                      | 来源标注                   | 备注                                    |
| ------------- | ----------------------------- | --------------------- | ------------------------------------------------ | -------------------------- | --------------------------------------- |
| `<fieldName>` | `string \| number \| boolean` | `VAL_A` / `VAL_B` / — | <每个枚举值对应的视觉规则，或「连续值，见备注」> | `api` / `derived` / `prop` | <可空性 / 格式约束 / needs_human_input> |

### Java DTO 草稿（仅当用户明确要求时输出）

> 根据推断的 Props 生成后端参考结构。类型映射规则：
>
> - 基础类型：`string → String`、`number → Double` 或 `Integer`（看精度）、`boolean → Boolean`、`string[] → List<String>`
> - **枚举字段 → 独立 Java `enum`**，枚举常量使用接口原始值的 UPPER_SNAKE_CASE 形式，并附 `@JsonValue` 标注原始值（字符串枚举）或序数（整型枚举）
> - 嵌套对象 → 独立内部 `record`
>
> **这是推断草稿，不是最终接口契约**，后端应以实际业务需求为准。

```java
// <ComponentName>DTO.java — AI 根据截图推断，供后端参考
public record <ComponentName>DTO(
    // <Type> <fieldName>,  // <UI 含义> — 请后端确认类型与可空性
) {

    // 枚举示例（有枚举字段时生成，无则省略）
    public enum <FieldName>Enum {
        // VAL_A("val_a"),  // UI 展示：<对应视觉规则>
        // VAL_B("val_b");  // UI 展示：<对应视觉规则>
        //
        // private final String value;
        // <FieldName>Enum(String value) { this.value = value; }
        // @JsonValue public String getValue() { return value; }
    }
}
```

## 数据获取方式

> 描述组件如何调用接口拿到数据。如果数据由父组件通过 Props 传入（纯展示组件），此节写「由父组件传入，无直接接口调用」并跳过下表。
>
> **字段说明**
>
> - **触发时机**：组件挂载时 / 用户操作触发 / 轮询 / 父组件调用方法 / 其他
> - **缓存策略**：无缓存 / 内存缓存（TTL） / 持久化缓存（storage） / SWR / 其他
> - **幂等性**：重复调用是否安全（对 GET 通常是，对 POST 需确认）

| 接口/方法名           | 调用时机                              | 请求关键参数     | 响应关键字段     | 缓存策略                | 补充说明                     |
| --------------------- | ------------------------------------- | ---------------- | ---------------- | ----------------------- | ---------------------------- |
| `<endpoint 或方法名>` | <挂载时 / 用户点击 / 滚动到底 / 其他> | <param1, param2> | <field1, field2> | <无缓存 / TTL=Xs / SWR> | <needs_human_input 或已确认> |

### 数据获取补充说明

- **分页 / 无限滚动**：<是否分页，page/cursor 参数名，pageSize 默认值>
- **并发请求**：<是否需要并行调多个接口，如何聚合结果>
- **竞态处理**：<旧请求返回时是否需要取消或忽略（如搜索框场景）>
- **重试策略**：<失败后是否自动重试，最大重试次数，退避策略>
- **鉴权方式**：<token 放 header / cookie / 无需鉴权>
- **Mock 方案**：<开发阶段如何 mock（MSW / 本地 JSON / 已有 mock server）>

## 状态枚举

枚举此组件所有可观察的运行时状态。**每个 `required: true` 的状态在 `spec.md` 中至少要有 1 条对应 Scenario**；未在 mockup 中体现但按组件策略必需的状态保留 `required: true`，并在备注里写「mockup 未提供 → needs_human_input」。

| 状态       | 触发条件                            | UI 表现                      | required | source   | render_assertion                                 |
| ---------- | ----------------------------------- | ---------------------------- | -------- | -------- | ------------------------------------------------ |
| `loading`  | 数据请求中 / 首次挂载未拿到数据     | <骨架屏 / spinner / 占位>    | true     | policy   | <renders loadingState>                           |
| `empty`    | 数据合法但内容为空（如 `tags: []`） | <空文案 / 占位插画>          | true     | policy   | <renders emptyState and hides contentList>       |
| `partial`  | 部分可选字段缺失                    | <降级展示规则>               | false    | inferred | <renders partial fallback>                       |
| `success`  | 完整数据可渲染                      | <主视觉，对应 mockup 默认态> | true     | visible  | <renders main content matching the mockup>       |
| `stale`    | 缓存过期但仍展示旧数据              | <角标 / 灰化 / 不变化>       | false    | inferred | <renders stale indicator or keeps prior content> |
| `error`    | 请求失败 / 数据校验失败             | <错误兜底 / 重试入口>        | true     | policy   | <renders errorState with retry affordance>       |
| `offline`  | 网络不可达                          | <离线提示>                   | false    | inferred | <renders offline notice>                         |
| `disabled` | 业务禁用（限购 / 黑名单）           | <CTA 灰化 + 文案替换>        | false    | inferred | <renders disabled affordance>                    |

## 组件分解

| 组件     | parent_id         | role                         | repeat_source         | 目的       | 复用信号     |
| -------- | ----------------- | ---------------------------- | --------------------- | ---------- | ------------ |
| `<名称>` | `<父组件或 root>` | `<primary/action/container>` | `<data.items[] 或空>` | <一行目的> | `<复用信号>` |

## 布局陷阱

- **<陷阱名称>** — <一句话描述 + 修复>

## 置信度地图

| 元素 / 行为 | 状态                                      | 备注   |
| ----------- | ----------------------------------------- | ------ |
| <元素>      | identified / inferred / needs_human_input | <备注> |

## 开放问题

1. <问题>
2. <问题>

## 计划提示

- `<snake_case 标签>`

## 交叉引用

- 输入设计稿：<路径 / 简述>
- 目标技术栈：<stack>
- 设计系统：<system 或 none>
- 规格增量：`./specs/<capability>/spec.md`

## 建议的下一步

将此 `notes.md` 输入 Superpowers `/plan`，传递 `--target <stack>` 和仓库根目录，以便规划器解决「开放问题」并生成实际任务分解。

## Traceability

> 机器校验锚点。润色文案时不要修改 `trace_id`。

| trace_id                      | kind      | source          | target                            | notes                  |
| ----------------------------- | --------- | --------------- | --------------------------------- | ---------------------- |
| `component:<componentId>`     | component | `<componentId>` | `<parent_id>`                     | <type / semantic_type> |
| `binding:<index>:<direction>` | binding   | `<source>`      | `<target>`                        | <transform>            |
| `state:<stateId>`             | state     | `<stateId>`     | `<scope_components 或 component>` | <required>             |

## 埋点锚点

> 本节是下游 `design-to-track` 等埋点 skill 的输入。**不要在这里写完整的事件 schema**，只列出"需要被埋点覆盖的语义事件 + 触发条件"，下游 skill 负责把它转成具体 event name / property 字段。
>
> **覆盖原则**：spec.md 中所有以 `tap-` / `view-` / `enter-` / `submit-` 等前缀的事件，以及任何视为"主转化"或"主曝光"的 Scenario，都必须在此表中至少出现 1 行。明确不埋点的也要显式标 `not-tracked`，不要漏。

| 锚点 ID           | 触发 Scenario（对应 spec.md 标题或 Requirement） | 类型                                                | 关键参数（语义层）         | 备注                  |
| ----------------- | ------------------------------------------------ | --------------------------------------------------- | -------------------------- | --------------------- |
| `<snake_case_id>` | <Scenario 标题>                                  | exposure / click / dwell / impression / not-tracked | <字段语义名，不是埋点 key> | <业务问题 / 决策原因> |
