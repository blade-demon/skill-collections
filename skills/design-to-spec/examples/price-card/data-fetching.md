# PriceCard — 数据获取逻辑设计

> 由 `design-to-spec/scripts/generate-output.js` 根据 YAML 契约生成。

## 数据流向

```
contracts/api-schema.yaml
  -> contracts/mapping-logic.yaml
    -> 组件 state / props
      -> UI 组件
```

## 触发时机与条件

| 触发事件 | 前提条件 | 备注 |
|---------|---------|------|
| 无请求 | 数据由父组件通过 Props 传入 | 纯展示组件 |

## 请求链路

### 请求清单

| request id | trace_id | 接口 | 触发时机 | call_type | 依赖 | 用途 |
| ---------- | -------- | ---- | -------- | --------- | ---- | ---- |
| — | — | 无直接接口 | — | — | — | 父组件供数 |

### 请求参数

无请求参数。
## 接口元信息

| endpoint | auth_required | cache_key_fields | pagination | error_shape |
| -------- | ------------- | ---------------- | ---------- | ----------- |
| — | false | — | none | — |
## 分页与无限滚动

不涉及，除非契约中的请求或开放问题另有说明。

## 缓存与复用策略

缓存策略未在契约中声明。

## 重试策略

重试策略未在契约中声明。

## 竞态与并发处理

如存在多请求依赖，按 `depends_on` 串联；重复触发时应忽略过期响应或取消旧请求，具体策略进入开放问题确认。

## 错误分级与降级策略

| 错误类型 | 触发条件 | UI 表现 | 是否可重试 | 备注 |
|---------|---------|---------|----------|------|
| 请求失败 | `api_error` 或请求被拒绝 | 进入 `error` 状态 | 是，若存在 retry 交互 | 以 Mapping_Logic.state_machine 为准 |
| 数据为空 | `api_success` 但数据满足 empty 条件 | 进入 `empty` 状态 | — | 不作为错误处理 |

## 状态机

| from | event | to | render_assertion |
| ---- | ----- | -- | ---------------- |
| `success` | props.originalPrice !== null AND props.discountPercent !== null | `discount` | renders amountText in red, originalPriceText with strikethrough, discountBadge with -{n}% |
| `success` | props.originalPrice !== null AND props.discountPercent === null | `partial` | renders amountText, originalPriceText with strikethrough; hides discountBadge |
| `success` | props.hasStock === false | `disabled` | renders stockOutOverlay with stockOutLabel; greys out amountText and currencySymbol |
| `discount` | props.discountPercent === null | `partial` | renders amountText, originalPriceText with strikethrough; hides discountBadge |
| `discount` | props.hasStock === false | `disabled` | renders stockOutOverlay with stockOutLabel; greys out amountText and currencySymbol |
| `partial` | props.discountPercent !== null | `discount` | renders amountText in red, originalPriceText with strikethrough, discountBadge with -{n}% |
| `partial` | props.hasStock === false | `disabled` | renders stockOutOverlay with stockOutLabel; greys out amountText and currencySymbol |
| `disabled` | props.hasStock === true | `success` | renders currencySymbol, amountText, subLabel; hides originalPriceText, discountBadge, stockOutOverlay |

## 父组件约定

若契约中无直接请求，父组件负责传入数据、loading、error 和交互回调。

## 待确认项汇总

| # | 待确认内容 | 需确认对象 | 优先级 |
|---|-----------|----------|-------|
| 1 | 未来如果 PriceCard 需要自己拉取价格（例如做促销活动倒计时），是否新增 GET /api/v1/price/:id 接口？目前 props-only 是按当前业务约定。 | PM / 设计 / 后端 | P2 |
| 2 | schema 当前三种 binding direction 都假设有 API 或事件出口。props-only 组件的 props→UI 映射目前只能写在 components[].notes 里，建议在 v0.13+ 引入 props_to_ui direction 或专门的 props 字典节。 | PM / 设计 / 后端 | P2 |
| 3 | props.discountPercent 的合法范围是 (0, 100) 还是 [0, 100]？为 0 时是否仍渲染徽章？需产品确认。 | PM / 设计 / 后端 | P1 |
| 4 | props.amount === 0 时进入 empty 还是 success？mockup 未画 empty 视觉，需设计签收。 | PM / 设计 / 后端 | P1 |
