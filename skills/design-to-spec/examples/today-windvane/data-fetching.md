# today-windvane — 数据获取逻辑设计

> 由 `design-to-spec` 技能生成，素材来源：接口文档（`GET /api/v1/today/recommendation`）+ 设计稿反推。
>
> **阅读对象**：实现该组件的前端开发者。无需阅读 `notes.md` 全文，本文件自包含。
>
> **⚠️ 待确认** 标记表示信息来源为推断或用户描述不完整，需在实现前与相关方核实。

---

## 数据流向

```
GET /api/v1/today/recommendation（组件自调，onReady 触发）
  → wx.getStorage（命中日级缓存时跳过网络请求）
    → 组件本地 state（hotspot, fund, status）
      → today-windvane/hot-news-row（hotspot props）
      → today-windvane/fund-reco-row（fund props）
```

**说明**：组件自行负责接口调用与日级本地缓存。父页面仅通过 `isLoggedIn` prop 控制 CTA 交互分支；`loading` / `error` props 为可选覆盖——父页面显式传入时优先于组件内部状态（适用于页面级骨架需要同步多张卡片加载态的场景）。

---

## 触发时机与条件

| 触发事件 | 前提条件 | 备注 |
|---------|---------|------|
| 组件挂载（`onReady` / `created`） | 当日本地缓存不存在或已过期 | 缓存命中时跳过请求，直接渲染 `success` 态 |
| 用户点击「重试」按钮 | 当前状态为 `error` | 重置状态为 `loading`，重新发起请求 |
| `props.loading = true`（父组件接管） | 父组件显式传入 | 组件内部状态机暂停，强制展示骨架；`props.loading` 恢复 `false` 后内部状态机继续 |

---

## 请求链路

### 主数据请求

- **接口**：`GET /api/v1/today/recommendation`
- **调用方式**：⚠️ 待确认（统一 request 封装 / 原生 `wx.request`）
- **请求参数**：无（服务端根据登录态返回当日推荐；`isLoggedIn` 仅影响 CTA 行为，不作为请求参数传入）
- **响应关键字段**：

  | 字段 | 类型 | 说明 |
  |------|------|------|
  | `hotspot` | `object \| null` | 当日热点；`null` 表示未编排，触发 `empty` 态 |
  | `hotspot.badgeIconUrl` | `string` | 热点徽章图片 CDN URL |
  | `hotspot.title` | `string` | 热点标题 |
  | `hotspot.tags[]` | `array` | 行业标签列表，最多 2 条 |
  | `hotspot.tags[].change` | `number` | 涨跌幅，正负均有 |
  | `hotspot.tags[].hot` | `boolean` | 火焰图标显隐 |
  | `hotspot.detailUrl` | `string \| null` | 热点详情链接，可空 |
  | `fund` | `object` | 推荐基金信息 |
  | `fund.code` | `string` | 基金代码，路由/埋点参数 |
  | `fund.sparklineUrl` | `string \| null` | 折线图 URL；空时基金行收缩为单行 |
  | `fund.ctaLabel` | `string \| null` | CTA 文案；空时前端默认「买一笔」 |

### 辅助请求

无。单接口返回全量数据，不需要并行或串行补充请求。

---

## 分页与无限滚动

不涉及。接口返回当日单条推荐，无列表分页。

---

## 缓存与复用策略

- **缓存策略**：本地存储（`wx.setStorageSync`），TTL = 当日 24:00（取设备本地时间）
- **缓存粒度**：按日期字符串作为 key，格式：`today_recommendation_YYYY-MM-DD`
- **失效触发**：① 超过 TTL（次日首次挂载时自动失效）；② ⚠️ 待确认：运营后台是否需要强制刷新（推送通知或版本更新时清除缓存）
- **`stale` 态处理**：按产品决定不暴露 `stale` 状态，缓存数据直接展示、无视觉标识（见 `notes.md` 状态枚举 `stale` 行）

---

## 错误分级与降级策略

| 错误类型 | 触发条件 | UI 表现 | 是否可重试 | 备注 |
|---------|---------|---------|----------|------|
| 网络超时 / 断网 | 请求未在 10s 内响应 / `wx.getNetworkType` 返回 `none` | 组件内 `error` 态 + 「重试」按钮 | 是，手动重试 | ⚠️ 待确认：超时时长是否与全局 request 封装对齐（建议 10s） |
| 服务端错误（5xx） | HTTP 状态码 ≥ 500 | `error` 态 + 「重试」按钮 | 是，手动重试 | 不自动重试，避免请求雪崩 |
| 未授权（401） | Token 过期或缺失 | ⚠️ 待确认：触发全局登录流程还是展示组件级 `error` 态 | 否 | 需与全局 request 拦截器协商统一处理方式 |
| 业务错误（4xx 其他） | HTTP 403 / 404 等 | `error` 态，不提供重试 | 否 | `error.code` 经 `props.error` 透传给父组件，由父层决定是否跳转 |
| 数据为空（`hotspot === null`） | 2xx 响应但 `hotspot` 字段为 `null` | `empty` 态：整张卡片隐藏，宿主列表跳过此槽位 | — | 不属于错误，属于正常运营态；见状态枚举 |
| 字段缺失（如 `sparklineUrl` 为空） | `fund.sparklineUrl === null \|\| undefined` | `partial` 态：基金行收缩为单行，不渲染折线图 | — | ⚠️ 待确认：是否需要上报前端监控 |

---

## 竞态与并发处理

**无竞态风险**。组件挂载时发起一次请求；用户点击「重试」时先忽略前次在途响应，再重新发起。

- **处理方案**：用请求时间戳对比，丢弃早于当前请求的响应
- **abort 能力**：⚠️ 待确认（小程序 request 封装是否提供 `abort` / `cancel` API；若无，时间戳对比方案即可）
- **并发上限**：同时最多 1 个请求

---

## 状态机

```
idle
  → loading（onReady，缓存未命中）
      → success（hotspot + fund 均完整）
      → partial（请求成功，但 fund.sparklineUrl 等可选字段缺失）
      → empty（hotspot === null → 卡片隐藏）
      → error（网络失败 / 5xx / 4xx）
          → loading（用户点击「重试」）
  → success（onReady，缓存命中，跳过 loading）
```

当 `props.loading === true` 时，组件强制进入骨架展示态，忽略内部状态机；`props.loading` 恢复 `false` 后，内部状态机继续。

**状态说明**：

| 状态 | 持久化 | 可并发 | 备注 |
|------|-------|-------|------|
| `idle` | — | — | 初始态，缓存检查前（极短暂） |
| `loading` | 否 | 否 | 发起请求中；⚠️ 待确认：骨架屏视觉方案待设计签收 |
| `success` | 是（日级缓存） | — | 缓存命中时跳过 `loading` 直接进入 `success` |
| `partial` | 是（日级缓存） | — | 部分可选字段缺失，降级展示 |
| `empty` | 是（日级缓存） | — | 卡片不渲染，宿主跳过此槽位 |
| `error` | 否 | — | 不缓存错误状态；重试后重走 `loading` |

---

## 待确认项汇总

| # | 待确认内容 | 需确认对象 | 优先级 |
|---|-----------|----------|-------|
| 1 | 401 处理方式：触发全局登录流程还是展示组件级 `error` 态 | 后端 / 前端架构 | P0 |
| 2 | 超时时长：建议 10s，是否与全局 request 封装对齐 | 后端 / 基础架构 | P1 |
| 3 <!-- oq:id=oq3 --> | 骨架屏视觉方案（`loading` 态）待设计签收 | 设计 | P1 |
| 4 <!-- oq:id=oq5 --> | `error` 态兜底视觉方案待设计签收 | 设计 | P1 |
| 5 | 运营后台是否需要强制清除缓存（推送 / 版本更新时） | PM / 后端 | P1 |
| 6 | `sparklineUrl` 等字段缺失是否需要上报前端监控 | 前端架构 / 数据团队 | P2 |
| 7 <!-- oq:id=oq8 --> | 小程序 request 封装是否提供 `abort` / `cancel` 能力 | 前端架构 | P2 |
