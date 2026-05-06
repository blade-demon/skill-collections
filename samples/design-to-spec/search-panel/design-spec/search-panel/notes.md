# SearchPanel — 设计笔记

> 由 `design-to-spec/scripts/generate-output.js` 根据 YAML 契约生成。此文件是协作草稿，`needs_human_input` 和开放问题需要人类确认。

## 为什么

`SearchPanel` 将设计稿中的可见结构、接口字段和交互状态固化为可实现规格。

## 决策

- **契约优先** — 本文仅使用 `contracts/*.yaml` 中的事实，不重新分析设计稿或接口文档。
- **状态可测试** — `required: true` 的状态会进入 OpenSpec Scenario。

## 数据契约

```ts
interface SearchPanelData {
  // data.results: object[];  // source: api — 命中条目列表；可能为空数组（empty 态）
  // data.results[].id: string;  // source: api — 条目唯一 ID
  // data.results[].title: string;  // source: api — 条目标题；前端单行截断
  // data.results[].summary: string | null;  // source: api — 条目摘要；可能为空字符串或 null；为 null 时整行隐藏
  // data.results[].score: number;  // source: api — 0.0-1.0 相关性评分；UI v1 不展示，未来用于排序
  // data.total: number;  // source: api — 命中总数；用于显示「共 N 条结果」
  // data.page: number;  // source: api — 当前页码
  // data.page_size: number;  // source: api — 每页条数
}
```

### 接口字段映射表

| 接口字段名 | 接口类型 | 枚举值（全量） | UI 中展示为 | 来源标注 | 备注 |
|-----------|---------|--------------|------------|---------|------|
| `data.results` | `object[]` | — | 由 Mapping_Logic.bindings 指定 | `api` | 命中条目列表；可能为空数组（empty 态） |
| `data.results[].id` | `string` | — | 由 Mapping_Logic.bindings 指定 | `api` | 条目唯一 ID |
| `data.results[].title` | `string` | — | 由 Mapping_Logic.bindings 指定 | `api` | 条目标题；前端单行截断 |
| `data.results[].summary` | `string` | — | 由 Mapping_Logic.bindings 指定 | `api` | 条目摘要；可能为空字符串或 null；为 null 时整行隐藏 |
| `data.results[].score` | `number` | — | 由 Mapping_Logic.bindings 指定 | `api` | 0.0-1.0 相关性评分；UI v1 不展示，未来用于排序 |
| `data.total` | `number` | — | 由 Mapping_Logic.bindings 指定 | `api` | 命中总数；用于显示「共 N 条结果」 |
| `data.page` | `number` | — | 由 Mapping_Logic.bindings 指定 | `api` | 当前页码 |
| `data.page_size` | `number` | — | 由 Mapping_Logic.bindings 指定 | `api` | 每页条数 |

### 接口元信息

| endpoint | auth_required | cache_key_fields | pagination | status_codes |
| -------- | ------------- | ---------------- | ---------- | ------------ |
| `GET /api/v1/search` | true | keyword, page | page | 200 |

### 错误结构映射表

| code | message_field | retryable | ui_state | notes |
| ---- | ------------- | --------- | -------- | ----- |
| `INVALID_KEYWORD` | `message` | false | `invalidKeyword` | 关键词为空或超长；UI 在 searchInput 下方红字显示后端 message |
| `RATE_LIMITED` | `message` | true | `error` | 触发限流；顶部 Toast 提示 + 5s 后自动重试 1 次 |
| `NETWORK_ERROR` | `message` | true | `error` | 网络层失败（HTTP 5xx / 超时 / 断网）；error 态 + 重试按钮 |
| `FORBIDDEN` | `message` | false | `error` | 未登录或 token 过期；前端跳转 /login，不进 error 态 |
| `INTERNAL_ERROR` | `message` | false | `error` | 服务端未分类错误；error 态 + 「服务异常，请联系管理员」文案 + 重试按钮 |

## 数据获取方式

| 接口/方法名 | 调用时机 | 请求关键参数 | 响应关键字段 | 缓存策略 | 补充说明 |
| --------- | ------- | ---------- | ---------- | ------- | ------- |
| `GET /api/v1/search` | `submitBtn.onClick OR searchInput.onEnterKey` | keyword, page, page_size | data.results, data.results[].id, data.results[].title, data.results[].summary, data.results[].score, data.total, data.page, data.page_size | 待项目确认 | request `searchRequest`, call_type `user_triggered` |

## 状态枚举

| 状态 | 触发条件 | UI 表现 | required | source | scope | scope_components | render_assertion |
| ---- | -------- | ------- | -------- | ------ | ----- | ---------------- | ---------------- |
| `idle` | 组件初始挂载，未提交过任何搜索 | identified | true | visible | component | — | renders searchInput, submitBtn, guideText; hides resultList, emptyIcon, errorIcon, retryButton |
| `loading` | 用户点击 submitBtn 后，请求未返回前 | identified | true | visible | component | — | renders 3 skeletonRow placeholders; submitBtn 半透明禁用并显示加载圆环 |
| `success` | api_success AND data.results.length > 0 | identified | true | visible | component | — | renders resultCount with data.total, resultList with data.results[].title and .summary |
| `empty` | api_success AND data.results.length === 0 | identified | true | visible | component | — | renders emptyIcon and emptyText; hides resultList |
| `error` | api_error with code in (NETWORK_ERROR, RATE_LIMITED, INTERNAL_ERROR) | identified | true | visible | component | — | renders errorIcon, errorText (text varies per code), and retryButton |
| `invalidKeyword` | api_error with code === INVALID_KEYWORD | needs_human_input | true | policy | element | validationHint, searchInput | renders validationHint with backend message under searchInput; resultsRegion stays in idle |
| `disabled` | searchInput.value.trim().length === 0 | identified | false | inferred | element | submitBtn | renders submitBtn greyed out and non-responsive |

## 组件分解

| 组件 | type | semantic_type | parent_id | role | repeat_source | 目的 | 复用信号 |
| ---- | ---- | ------------- | --------- | ---- | ------------- | ---- | -------- |
| `searchPanel` | `Card` | `` | `root` | `container` | `` | 顶层卡片容器；白底圆角 12，宽度自适应；包含输入区和结果区两段，由 1px 分隔线区隔 | component-local |
| `searchInput` | `Input` | `` | `searchPanel` | `primary` | `` | 主输入框；placeholder「搜索关键词」；focus 时蓝色描边；长度 1-32，超长依赖后端校验 | component-local |
| `submitBtn` | `Button` | `` | `searchPanel` | `action` | `` | 蓝色主按钮；keyword 为空时灰化不响应；loading 态半透明并显示加载圆环 | component-local |
| `validationHint` | `Text` | `` | `searchPanel` | `secondary` | `` | INVALID_KEYWORD 时显示的红字提示；位置/字号/颜色 mockup 未画，待设计签收 | component-local |
| `resultsRegion` | `Card` | `` | `searchPanel` | `container` | `` | 结果区容器；不同状态切换不同子树（guideText / skeletonRow / resultList / emptyIcon+emptyText / errorIcon+errorText+retryButton） | component-local |
| `guideText` | `Text` | `` | `resultsRegion` | `secondary` | `` | idle 态居中引导文案 | component-local |
| `skeletonRow` | `Skeleton` | `` | `resultsRegion` | `decoration` | `[1, 2, 3]` | loading 态占位条；2 行（标题 14px + 摘要 10px），3 项重复 | atom-candidate |
| `resultCount` | `Text` | `` | `resultsRegion` | `secondary` | `` | success 态顶部计数；文案模板「共 {data.total} 条结果」 | component-local |
| `resultList` | `List` | `` | `resultsRegion` | `container` | `data.results[]` | success 态结果列表；按 results 数组重复渲染 resultItem | atom-candidate |
| `resultItem` | `Card` | `` | `resultList` | `data_field` | `data.results[]` | 单条结果容器；包含 title + summary；底部 1px 浅灰分隔线（最后一条无） | atom-candidate |
| `resultTitle` | `Text` | `` | `resultItem` | `primary` | `data.results[]` | 单行截断（text-overflow:ellipsis）；12px 500 weight；来自 data.results[].title | atom-candidate |
| `resultSummary` | `Text` | `` | `resultItem` | `secondary` | `data.results[]` | 单行截断；11px 灰色；来自 data.results[].summary；summary 为 null 时整行隐藏 | atom-candidate |
| `emptyIcon` | `Icon` | `` | `resultsRegion` | `decoration` | `` | empty 态放大镜图标；居中；灰色描边 | component-local |
| `emptyText` | `Text` | `` | `resultsRegion` | `secondary` | `` | empty 态文案；居中；灰色 | component-local |
| `errorIcon` | `Icon` | `` | `resultsRegion` | `decoration` | `` | error 态红色感叹号图标；圆形红底白字 | component-local |
| `errorText` | `Text` | `` | `resultsRegion` | `primary` | `` | error 态文案；不同 error code 对应不同文案（NETWORK_ERROR / RATE_LIMITED / INTERNAL_ERROR） | component-local |
| `retryButton` | `Button` | `` | `resultsRegion` | `action` | `` | error 态重试按钮；轮廓蓝按钮；点击后用最近一次 keyword 重新发请求 | component-local |

## 布局陷阱

- 卡片内部垂直堆叠：searchInput + submitBtn 横排（输入区） → 1px 分隔线 → resultsRegion（结果区，根据状态切换不同子树）；validationHint 在 INVALID_KEYWORD 时插入到 searchInput 下方

## 置信度地图

| 元素 / 行为 | 状态 | 备注 |
| ----------- | ---- | ---- |
| `searchPanel` | identified | 顶层卡片容器；白底圆角 12，宽度自适应；包含输入区和结果区两段，由 1px 分隔线区隔 |
| `searchInput` | identified | 主输入框；placeholder「搜索关键词」；focus 时蓝色描边；长度 1-32，超长依赖后端校验 |
| `submitBtn` | identified | 蓝色主按钮；keyword 为空时灰化不响应；loading 态半透明并显示加载圆环 |
| `validationHint` | needs_human_input | INVALID_KEYWORD 时显示的红字提示；位置/字号/颜色 mockup 未画，待设计签收 |
| `resultsRegion` | identified | 结果区容器；不同状态切换不同子树（guideText / skeletonRow / resultList / emptyIcon+emptyText / errorIcon+errorText+retryButton） |
| `guideText` | identified | idle 态居中引导文案 |
| `skeletonRow` | identified | loading 态占位条；2 行（标题 14px + 摘要 10px），3 项重复 |
| `resultCount` | identified | success 态顶部计数；文案模板「共 {data.total} 条结果」 |
| `resultList` | identified | success 态结果列表；按 results 数组重复渲染 resultItem |
| `resultItem` | identified | 单条结果容器；包含 title + summary；底部 1px 浅灰分隔线（最后一条无） |
| `resultTitle` | identified | 单行截断（text-overflow:ellipsis）；12px 500 weight；来自 data.results[].title |
| `resultSummary` | identified | 单行截断；11px 灰色；来自 data.results[].summary；summary 为 null 时整行隐藏 |
| `emptyIcon` | identified | empty 态放大镜图标；居中；灰色描边 |
| `emptyText` | identified | empty 态文案；居中；灰色 |
| `errorIcon` | identified | error 态红色感叹号图标；圆形红底白字 |
| `errorText` | identified | error 态文案；不同 error code 对应不同文案（NETWORK_ERROR / RATE_LIMITED / INTERNAL_ERROR） |
| `retryButton` | identified | error 态重试按钮；轮廓蓝按钮；点击后用最近一次 keyword 重新发请求 |
| `idle` | identified | 组件初始挂载，未提交过任何搜索 |
| `loading` | identified | 用户点击 submitBtn 后，请求未返回前 |
| `success` | identified | api_success AND data.results.length > 0 |
| `empty` | identified | api_success AND data.results.length === 0 |
| `error` | identified | api_error with code in (NETWORK_ERROR, RATE_LIMITED, INTERNAL_ERROR) |
| `invalidKeyword` | needs_human_input | api_error with code === INVALID_KEYWORD |
| `disabled` | identified | searchInput.value.trim().length === 0 |

## 开放问题

1. [P1] data.results[].score 字段当前 UI 不展示，是否在 v1 就保留以便未来排序？或按 YAGNI 在 v2 再加？
2. [P2] FORBIDDEN 跳登录后是否应当通过 query 携带原 keyword（用户登录回来后重填）？产品诉求待确认（interaction-notes 待确认 3）
3. [P0] INVALID_KEYWORD 红字提示的样式（位置/字号/颜色）设计稿未画，待设计签收（也登记在 ui.validationHint.confidence: needs_human_input）
4. [P1] RATE_LIMITED 5s 自动重试是否需要倒计时可视化（进度条 / 数字）？产品待定
5. [P1] FORBIDDEN 跳登录后回来是否保留 keyword？产品 vs 安全权衡待定（关联 api.open_questions[api-q2]）
6. [P2] tap-search-submit 在 keyword 为空时按钮置灰不响应，是否需要单独埋点 tap-search-submit-disabled 来追踪误点？数据团队待评估

## 计划提示

- `generated_from_contracts`
- `validate_output_required`

## 交叉引用

- 输入契约：`./contracts/ui-schema.yaml`、`./contracts/api-schema.yaml`、`./contracts/mapping-logic.yaml`
- 规格增量：`./specs/search-panel/spec.md`

## 建议的下一步

将完整输出目录交给规划或实现流程；下游不应重新阅读原始设计稿，而应消费本目录和 `contracts/*.yaml`。

## Traceability

| trace_id | kind | source | target | notes |
| -------- | ---- | ------ | ------ | ----- |
| `component:searchPanel` | component | `searchPanel` | `root` | type `Card`, semantic `` |
| `component:searchInput` | component | `searchInput` | `searchPanel` | type `Input`, semantic `` |
| `component:submitBtn` | component | `submitBtn` | `searchPanel` | type `Button`, semantic `` |
| `component:validationHint` | component | `validationHint` | `searchPanel` | type `Text`, semantic `` |
| `component:resultsRegion` | component | `resultsRegion` | `searchPanel` | type `Card`, semantic `` |
| `component:guideText` | component | `guideText` | `resultsRegion` | type `Text`, semantic `` |
| `component:skeletonRow` | component | `skeletonRow` | `resultsRegion` | type `Skeleton`, semantic `` |
| `component:resultCount` | component | `resultCount` | `resultsRegion` | type `Text`, semantic `` |
| `component:resultList` | component | `resultList` | `resultsRegion` | type `List`, semantic `` |
| `component:resultItem` | component | `resultItem` | `resultList` | type `Card`, semantic `` |
| `component:resultTitle` | component | `resultTitle` | `resultItem` | type `Text`, semantic `` |
| `component:resultSummary` | component | `resultSummary` | `resultItem` | type `Text`, semantic `` |
| `component:emptyIcon` | component | `emptyIcon` | `resultsRegion` | type `Icon`, semantic `` |
| `component:emptyText` | component | `emptyText` | `resultsRegion` | type `Text`, semantic `` |
| `component:errorIcon` | component | `errorIcon` | `resultsRegion` | type `Icon`, semantic `` |
| `component:errorText` | component | `errorText` | `resultsRegion` | type `Text`, semantic `` |
| `component:retryButton` | component | `retryButton` | `resultsRegion` | type `Button`, semantic `` |
| `binding:1:ui_to_api` | binding | `searchInput` | `keyword` | transform `trim() && length 1-32` |
| `binding:2:ui_to_api` | binding | `searchInput` | `page` | transform `constant 1 (v1 不分页)` |
| `binding:3:api_to_ui` | binding | `data.total` | `resultCount` | transform `format as 「共 {total} 条结果」` |
| `binding:4:api_to_ui` | binding | `data.results` | `resultList` | transform `iterate; each item maps to resultItem child` |
| `binding:5:api_to_ui` | binding | `data.results[].title` | `resultTitle` | transform `` |
| `binding:6:api_to_ui` | binding | `data.results[].summary` | `resultSummary` | transform `if null then hide resultSummary` |
| `binding:7:ui_to_event` | binding | `submitBtn` | `tap-search-submit` | transform `{ keyword: searchInput.value, keyword_length: searchInput.value.length }` |
| `binding:8:ui_to_event` | binding | `retryButton` | `tap-search-retry` | transform `{ keyword: lastSubmittedKeyword, error_code: lastErrorCode }` |
| `state:idle` | state | `idle` | `component` | required `true` |
| `state:loading` | state | `loading` | `component` | required `true` |
| `state:success` | state | `success` | `component` | required `true` |
| `state:empty` | state | `empty` | `component` | required `true` |
| `state:error` | state | `error` | `component` | required `true` |
| `state:invalidKeyword` | state | `invalidKeyword` | `validationHint, searchInput` | required `true` |
| `state:disabled` | state | `disabled` | `submitBtn` | required `false` |

## 埋点锚点

| 锚点 ID | 触发 Scenario（对应 spec.md 标题或 Requirement） | 类型 | 关键参数（语义层） | 备注 |
| ------- | ----------------------------------------- | ---- | ---------------- | ---- |
| `tap-search-submit` | `tap-search-submit` | click | 由事件 detail 决定 | 从 `ui_to_event` 绑定生成 |
| `tap-search-retry` | `tap-search-retry` | click | 由事件 detail 决定 | 从 `ui_to_event` 绑定生成 |
