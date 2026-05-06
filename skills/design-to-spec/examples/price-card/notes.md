# PriceCard — 设计笔记

> 由 `design-to-spec/scripts/generate-output.js` 根据 YAML 契约生成。此文件是协作草稿，`needs_human_input` 和开放问题需要人类确认。

## 为什么

`PriceCard` 将设计稿中的可见结构、接口字段和交互状态固化为可实现规格。

## 决策

- **契约优先** — 本文仅使用 `contracts/*.yaml` 中的事实，不重新分析设计稿或接口文档。
- **状态可测试** — `required: true` 的状态会进入 OpenSpec Scenario。

## 数据契约

```ts
interface PriceCardData {
  // No API response fields. Data is expected from props or parent context.
}
```

## 数据获取方式

| 接口/方法名 | 调用时机 | 请求关键参数 | 响应关键字段 | 缓存策略 | 补充说明 |
| --------- | ------- | ---------- | ---------- | ------- | ------- |
| 无直接请求 | — | — | — | — | 数据由父组件或宿主上下文传入 |

## 状态枚举

| 状态 | 触发条件 | UI 表现 | required | source | scope | scope_components | render_assertion |
| ---- | -------- | ------- | -------- | ------ | ----- | ---------------- | ---------------- |
| `loading` | props 未就绪 / props === undefined | needs_human_input | false | policy | component | — | renders skeleton placeholder or hides cardContainer |
| `empty` | props.amount === 0 OR props.amount === null | needs_human_input | false | policy | component | — | renders empty state per parent decision |
| `success` | props.amount > 0 AND props.hasStock === true AND props.originalPrice === null | identified | true | visible | component | — | renders currencySymbol, amountText, subLabel; hides originalPriceText, discountBadge, stockOutOverlay |
| `discount` | props.amount > 0 AND props.hasStock === true AND props.originalPrice !== null AND props.discountPercent !== null | identified | true | visible | component | — | renders amountText in red, originalPriceText with strikethrough, discountBadge with -{n}% |
| `partial` | props.amount > 0 AND props.hasStock === true AND props.originalPrice !== null AND props.discountPercent === null | identified | true | visible | component | — | renders amountText, originalPriceText with strikethrough; hides discountBadge |
| `error` | props.amount < 0 OR props.currency 不在支持列表 | needs_human_input | false | policy | component | — | renders error placeholder or warns parent |
| `disabled` | props.hasStock === false | identified | true | visible | component | — | renders stockOutOverlay with stockOutLabel; greys out amountText and currencySymbol |

## 组件分解

| 组件 | type | semantic_type | parent_id | role | repeat_source | 目的 | 复用信号 |
| ---- | ---- | ------------- | --------- | ---- | ------------- | ---- | -------- |
| `cardContainer` | `Card` | `` | `root` | `container` | `` | 白底圆角卡片，180×200，整张卡片是顶层容器；不可点击，按钮等交互由父组件处理 | component-local |
| `stateBadge` | `Badge` | `` | `cardContainer` | `decoration` | `` | 卡片左上角的状态徽章（success/discount/partial/disabled）；颜色 + 文案随 props 变化；mockup 上显示是为了让评审者识别状态，生产环境可能不渲染 | component-local |
| `productImage` | `Image` | `` | `cardContainer` | `decoration` | `` | 100×60 商品占位图；URL 由 props.imageUrl 传入；缺失时使用占位灰图 | component-local |
| `currencySymbol` | `Text` | `` | `cardContainer` | `secondary` | `` | 货币符号；由 props.currency 决定（CNY=¥ / USD=$ / EUR=€）；与 amountText 紧贴 | component-local |
| `amountText` | `Text` | `` | `cardContainer` | `primary` | `` | 主价格数字；28px bold；折扣态时颜色变红；disabled 态时变浅灰；由 props.amount 渲染 | component-local |
| `originalPriceText` | `Text` | `` | `cardContainer` | `secondary` | `` | 划线原价；text-decoration:line-through；仅在 props.originalPrice 存在时渲染；右对齐紧挨 amountText | component-local |
| `discountBadge` | `Badge` | `` | `cardContainer` | `data_field` | `` | 折扣百分比徽章；红橙渐变；仅在 props.discountPercent 存在时渲染；显示格式 "-{n}%" | component-local |
| `subLabel` | `Text` | `` | `cardContainer` | `secondary` | `` | 副标签文案；不同状态文案不同（success="有库存 · 直接购买"，partial="活动价（无折扣 %）"）；具体文案由父组件传入或使用默认；mockup 中 discount 态未显示此文案，按 inferred 处理 | component-local |
| `stockOutOverlay` | `Card` | `` | `cardContainer` | `container` | `` | 缺货遮罩条；仅在 props.hasStock === false 时渲染；半透明黑底覆盖价格区，居中显示"已售罄" | component-local |
| `stockOutLabel` | `Text` | `` | `stockOutOverlay` | `primary` | `` | 缺货遮罩内的文案；白色加粗 14px；文案固定为「已售罄」 | component-local |

## 布局陷阱

- 卡片内部垂直堆叠：stateBadge（左上） → productImage（顶部居中） → 价格区（currencySymbol + amountText + originalPriceText 横排） → discountBadge / subLabel（条件渲染） → stockOutOverlay（绝对定位覆盖价格区，仅 disabled 态出现）

## 置信度地图

| 元素 / 行为 | 状态 | 备注 |
| ----------- | ---- | ---- |
| `cardContainer` | identified | 白底圆角卡片，180×200，整张卡片是顶层容器；不可点击，按钮等交互由父组件处理 |
| `stateBadge` | inferred | 卡片左上角的状态徽章（success/discount/partial/disabled）；颜色 + 文案随 props 变化；mockup 上显示是为了让评审者识别状态，生产环境可能不渲染 |
| `productImage` | identified | 100×60 商品占位图；URL 由 props.imageUrl 传入；缺失时使用占位灰图 |
| `currencySymbol` | identified | 货币符号；由 props.currency 决定（CNY=¥ / USD=$ / EUR=€）；与 amountText 紧贴 |
| `amountText` | identified | 主价格数字；28px bold；折扣态时颜色变红；disabled 态时变浅灰；由 props.amount 渲染 |
| `originalPriceText` | identified | 划线原价；text-decoration:line-through；仅在 props.originalPrice 存在时渲染；右对齐紧挨 amountText |
| `discountBadge` | identified | 折扣百分比徽章；红橙渐变；仅在 props.discountPercent 存在时渲染；显示格式 "-{n}%" |
| `subLabel` | inferred | 副标签文案；不同状态文案不同（success="有库存 · 直接购买"，partial="活动价（无折扣 %）"）；具体文案由父组件传入或使用默认；mockup 中 discount 态未显示此文案，按 inferred 处理 |
| `stockOutOverlay` | identified | 缺货遮罩条；仅在 props.hasStock === false 时渲染；半透明黑底覆盖价格区，居中显示"已售罄" |
| `stockOutLabel` | identified | 缺货遮罩内的文案；白色加粗 14px；文案固定为「已售罄」 |
| `loading` | needs_human_input | props 未就绪 / props === undefined |
| `empty` | needs_human_input | props.amount === 0 OR props.amount === null |
| `success` | identified | props.amount > 0 AND props.hasStock === true AND props.originalPrice === null |
| `discount` | identified | props.amount > 0 AND props.hasStock === true AND props.originalPrice !== null AND props.discountPercent !== null |
| `partial` | identified | props.amount > 0 AND props.hasStock === true AND props.originalPrice !== null AND props.discountPercent === null |
| `error` | needs_human_input | props.amount < 0 OR props.currency 不在支持列表 |
| `disabled` | identified | props.hasStock === false |

## 开放问题

1. [P2] 未来如果 PriceCard 需要自己拉取价格（例如做促销活动倒计时），是否新增 GET /api/v1/price/:id 接口？目前 props-only 是按当前业务约定。
2. [P2] schema 当前三种 binding direction 都假设有 API 或事件出口。props-only 组件的 props→UI 映射目前只能写在 components[].notes 里，建议在 v0.13+ 引入 props_to_ui direction 或专门的 props 字典节。
3. [P1] props.discountPercent 的合法范围是 (0, 100) 还是 [0, 100]？为 0 时是否仍渲染徽章？需产品确认。
4. [P1] props.amount === 0 时进入 empty 还是 success？mockup 未画 empty 视觉，需设计签收。

## 计划提示

- `generated_from_contracts`
- `validate_output_required`

## 交叉引用

- 输入契约：`./contracts/ui-schema.yaml`、`./contracts/api-schema.yaml`、`./contracts/mapping-logic.yaml`
- 规格增量：`./specs/price-card/spec.md`

## 建议的下一步

将完整输出目录交给规划或实现流程；下游不应重新阅读原始设计稿，而应消费本目录和 `contracts/*.yaml`。

## Traceability

| trace_id | kind | source | target | notes |
| -------- | ---- | ------ | ------ | ----- |
| `component:cardContainer` | component | `cardContainer` | `root` | type `Card`, semantic `` |
| `component:stateBadge` | component | `stateBadge` | `cardContainer` | type `Badge`, semantic `` |
| `component:productImage` | component | `productImage` | `cardContainer` | type `Image`, semantic `` |
| `component:currencySymbol` | component | `currencySymbol` | `cardContainer` | type `Text`, semantic `` |
| `component:amountText` | component | `amountText` | `cardContainer` | type `Text`, semantic `` |
| `component:originalPriceText` | component | `originalPriceText` | `cardContainer` | type `Text`, semantic `` |
| `component:discountBadge` | component | `discountBadge` | `cardContainer` | type `Badge`, semantic `` |
| `component:subLabel` | component | `subLabel` | `cardContainer` | type `Text`, semantic `` |
| `component:stockOutOverlay` | component | `stockOutOverlay` | `cardContainer` | type `Card`, semantic `` |
| `component:stockOutLabel` | component | `stockOutLabel` | `stockOutOverlay` | type `Text`, semantic `` |
| `state:loading` | state | `loading` | `component` | required `false` |
| `state:empty` | state | `empty` | `component` | required `false` |
| `state:success` | state | `success` | `component` | required `true` |
| `state:discount` | state | `discount` | `component` | required `true` |
| `state:partial` | state | `partial` | `component` | required `true` |
| `state:error` | state | `error` | `component` | required `false` |
| `state:disabled` | state | `disabled` | `component` | required `true` |

## 埋点锚点

| 锚点 ID | 触发 Scenario（对应 spec.md 标题或 Requirement） | 类型 | 关键参数（语义层） | 备注 |
| ------- | ----------------------------------------- | ---- | ---------------- | ---- |
| `not-tracked` | 无交互事件 | not-tracked | — | 契约未声明 `ui_to_event` 绑定 |
