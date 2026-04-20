# today-windvane — 设计笔记

> 由 `design-to-spec` 技能生成。此文件是协作草稿 —— 「开放问题」和 `needs_human_input` 标志就是期待人类编辑的锚点。

## 为什么

打开投资小程序的用户想要一个快速、有观点的答案来回答「今天应该关注什么」。一张带有单一热点和一只推荐基金的「今日风向」卡片将这种判断压缩到一张卡片上，用户三秒内可采取行动，且卡片每日变化、锚定回头用户的参与循环。

## 决策

- **Sparkline v1 用 `<image>`，后续升级 canvas 2d** — 后端预渲染的 PNG 零运行时成本、无 canvas 图层问题；数据契约接受 `string | number[]` 以保持升级源兼容。
- **卡片不拥有路由，宿主页面拥有** — 组件只发出 `tap-hotspot` / `tap-buy` 事件，匹配现有 `vertical-scroll` 约定，使卡片可在「发现」等非首页复用。
- **两个行业标签用 CSS grid 双列而非 flex 百分比** — `grid-template-columns: repeat(2, minmax(0, 1fr))` 自动带有 `min-width: 0` 等价修正，使 `text-overflow: ellipsis` 实际生效。
- **左侧「热点」徽章走图片资产而非代码绘制** — mockup 中徽章是红橙渐变 + 垂直 stacked 文字的单一设计单元，由设计交付 PNG/WebP（`badgeIconUrl`）。组件内不复刻 `<text>` 堆叠 + 渐变 CSS——这能避免跨端字体渲染漂移，且允许设计随活动节气更换徽章视觉而无须发版。`<image>` 宽高由 prop 强制 `32rpx × 40rpx`，`mode="aspectFit"`。

## 数据契约

> 模拟场景：接口文档 `GET /api/v1/today/recommendation` 已提供，API 字段标注升级为 `api (mapped)`；未出现在接口文档中的字段保留 `prop` / `ui-only` 标注。

```ts
interface TodayWindvaneProps {
  hotspot: {
    badgeIconUrl: string;   // source: api (mapped) — 「热点」徽章图片资源（PNG/WebP），由设计交付；组件不自绘文字
    title: string;          // source: api (mapped) — 标题，UI 中截断为 1 行
    tags: Array<{
      name: string;         // source: api (mapped) — 行业名称，UI 中截断为 1 行
      change: number;       // source: api (mapped) — 5.14 表示 +5.14%；允许负数
      hot?: boolean;        // source: api (mapped) — 默认 true；控制火焰图标
    }>;
    detailUrl?: string;     // source: api (mapped) — 通过 tap-hotspot 携带，内部不使用
  };
  fund: {
    code: string;           // source: api (mapped) — 宿主页面用于路由
    name: string;           // source: api (mapped) — 基金名称，UI 中截断为 1 行
    yearChange: number;     // source: api (mapped) — 「近一年涨幅」百分比（可负）
    sparkline: string | number[];  // source: api (mapped) — 图片 URL 或原始点数组；允许 v1 字符串 URL / v2 点数组
    ctaLabel?: string;      // source: api (mapped) — 默认「买一笔」
  };
  isLoggedIn: boolean;      // source: prop — 由宿主页面传入，决定 CTA 是否走 login_gate 分支
  loading?: boolean;        // source: prop — 父组件控制骨架态
  error?: { code: string; message: string };  // source: prop — 父组件传入，触发 error 态与重试按钮
}

// 内部状态（不在 Props 中）
// - `isBadgeLoaded: boolean`  // source: ui-only — 徽章图片加载完成后隐藏占位

interface TodayWindvaneEvents {
  'tap-hotspot': (detail: { hotspot: TodayWindvaneProps['hotspot'] }) => void;
  'tap-buy':     (detail: { fundCode: string }) => void;
  'tap-retry':   (detail: { errorCode: string }) => void;    // error 态重试按钮
  'tap-login':   (detail: {}) => void;                        // disabled 态未登录 CTA 触发登录流
}
```

### 接口字段映射表

> 接口：`GET /api/v1/today/recommendation`，无请求参数，返回当日单条推荐数据。

| 接口字段名 | 接口类型 | 枚举值（全量） | UI 中展示为 | 来源标注 | 备注 |
|-----------|---------|--------------|------------|---------|------|
| `hotspot.badgeIconUrl` | `string` | — | 左侧热点徽章图片（32rpx×40rpx，`aspectFit`） | `api` | CDN URL，必传；组件不自绘文字渐变 |
| `hotspot.title` | `string` | — | 热点标题，单行省略 | `api` | 必传；建议最长 20 字 |
| `hotspot.tags[].name` | `string` | — | 行业标签名，单行省略 | `api` | 最多 2 条；超出截断 |
| `hotspot.tags[].change` | `number` | — | `+5.14%` / `-3.21%`，连续值 | `api` | 正值绿色，负值红色；UI 自行格式化 |
| `hotspot.tags[].hot` | `boolean` | `true` → 火焰图标显示；`false` → 隐藏 | 火焰图标 | `api` | 缺省视为 `true` |
| `hotspot.detailUrl` | `string` | — | 不展示，经 `tap-hotspot` 事件透传 | `api` | 可空（无详情页时为 `null`） |
| `fund.code` | `string` | — | 不展示，作为路由参数和埋点参数 | `api` | 必传 |
| `fund.name` | `string` | — | 基金名称，单行省略 | `api` | 必传 |
| `fund.yearChange` | `number` | — | `近一年涨幅 +5.14%`，连续值 | `api` | 可负；UI 自行格式化带符号 |
| `fund.sparklineUrl` | `string` | — | 折线图图片 URL（v1） | `api` | v1 字符串 URL；v2 预留 `sparklinePoints: number[]`；可空时收缩为单行 |
| `fund.ctaLabel` | `string` | — | CTA 按钮文案 | `api` | 可空，前端默认 `买一笔` |

## 数据获取方式

> 组件自行调接口并维护日级本地缓存；父组件通过 `loading` / `error` Props 可覆盖内部状态（用于页面级骨架同步）。

| 接口/方法名 | 调用时机 | 请求关键参数 | 响应关键字段 | 缓存策略 | 补充说明 |
|-----------|---------|------------|------------|---------|---------|
| `GET /api/v1/today/recommendation` | 组件挂载（`onReady`）；缓存命中则跳过 | 无 | `hotspot`, `fund` | 本地存储 TTL = 当日 24:00 | key 格式：`today_recommendation_YYYY-MM-DD` |

### 数据获取补充说明

- **分页 / 无限滚动**：不涉及，当日单条推荐
- **并发请求**：无，单接口返回全量数据
- **竞态处理**：无高频触发场景；「重试」触发时先忽略前次在途响应（⚠️ 待确认：request 封装是否提供 abort 能力）
- **重试策略**：失败后用户手动点「重试」触发，不自动重试
- **鉴权方式**：token 放 header，由全局 request 封装统一处理
- **Mock 方案**：本地 JSON 文件 / ⚠️ 待确认项目是否已接入 Mock 平台

## 状态枚举

| 状态         | 触发条件                                           | UI 表现                                       | 必需  |
| ---------- | ---------------------------------------------- | ------------------------------------------- | --- |
| `loading`  | 父页面 `props.loading === true` 或 `data === undefined` | 容器内只渲染骨架（同高度的灰色块），避免高度抖动                    | ✅（mockup 未提供 → needs_human_input：骨架样式待签收） |
| `empty`    | 当日 `hotspot` 未编排（接口返回 `null`）                  | 整张卡片隐藏，宿主列表跳过此槽位                            | ✅（"完全隐藏 vs 占位提示" 待设计签收）                  |
| `partial`  | `hotspot.tags.length === 0` 或 `fund.sparkline` 缺失 | 标签网格不渲染（不留占位条）；sparkline 缺失时基金行收缩为单行       | 视情况（已在 spec 中覆盖部分） |
| `success`  | `hotspot` 与 `fund` 均完整                          | 默认视觉，对应 mockup                              | ✅                                       |
| `stale`    | 卡片 ≥ 24h 未刷新但仍命中本地缓存                          | 不变化（按产品决定不暴露 stale 状态，避免噪音）                | 不需要                                     |
| `error`    | 接口失败 / 校验失败                                    | 容器内显示行内错误兜底 + 「重试」按钮                       | ✅（mockup 未提供 → needs_human_input：错误兜底样式待签收） |
| `offline`  | 弱网 / 完全离线                                      | 复用 error 态文案，不区分                            | 不需要                                     |
| `disabled` | CTA「买一笔」在未登录态                                  | CTA 灰化，文案改为「登录后购买」，点击触发登录流程而非 `tap-buy` | ✅（对应开放问题 7）                            |

## 组件分解

| 组件                              | 目的                        | 复用信号            |
| ------------------------------- | ------------------------- | --------------- |
| `today-windvane`                | 容器、数据编排、事件发出              | business-specific |
| `today-windvane/hot-news-row`   | 顶行：徽章 + 标题 + 标签网格 + chevron | business-specific（内部） |
| `today-windvane/fund-reco-row`  | 底行：sparkline + 名称/涨幅 + CTA | business-specific（内部） |
| `components/common/hot-tag`     | 火焰图标 + 行业名称 + 涨跌幅          | atom-candidate  |
| `components/common/sparkline`   | 内联迷你趋势图（图片或 canvas）        | atom-candidate  |
| `components/common/pill-button` | 可配置标签的轮廓药丸 CTA            | atom-candidate  |

## 布局陷阱

- **`flex: 1` 中间列缺 `min-width: 0`** — 热点标题行和基金名称行都有带截断文本的 `flex: 1` 中间槽，每个都需要 `min-width: 0`，否则省略号静默失效。
- **双列固定宽度标签** — 使用 `grid-template-columns: repeat(2, minmax(0, 1fr))` 而非 flex 百分比；`minmax(0, ...)` 自带省略号所需的 min-width-zero 修正。
- **单行省略号用 `<view>` 而非 `<text>`** — `<text>` 的折行行为偶尔出问题；配 `overflow: hidden; white-space: nowrap; text-overflow: ellipsis;`。
- **CTA 必须用 `catchtap` 而非 `bindtap`** — 避免父行可点击时同时触发 `tap-buy` 和 `tap-hotspot`。
- **`1rpx` 发丝边框在部分 Android 微信构建中消失** — 如 QA 标记，使用 transform-scale 发丝图案回退。

## 置信度地图

| 元素 / 行为                  | 状态                | 备注 |
| ----------------------- | ----------------- | -- |
| 卡片标题「今日风口」              | identified        | mockup 逐字 |
| 「热点」左侧堆叠徽章              | identified        | 橙色药丸 |
| 热点标题截断                  | identified        | 设计稿显示尾部 `…` |
| 两个行业标签固定宽度行             | identified        | 明确注释「一行2，固定宽度度」 |
| 标签 `+5.14%` / `+99.99%` 格式化 | identified        | mockup 可见 |
| 热点行右侧 chevron           | identified        | 可见 `>` |
| 点击热点行导航                 | inferred          | chevron + 行框架强烈暗示，但目的地未注 |
| 基金名称截断                  | identified        | 「示例宽基指数基金 A 类…」 |
| sparkline 图片 vs canvas   | inferred          | 设计选定 v1 图片；mockup 未指定 |
| CTA「买一笔」发出事件不路由         | inferred          | 镜像 `vertical-scroll` 约定 |
| 整卡是否可点击                 | needs_human_input | feed UI 常见但 mockup 未确认 |
| 加载 / 骨架状态               | needs_human_input | mockup 未显示 |
| 数据缺失时的空状态               | needs_human_input | spec 提议「省略缺失行」需设计签收 |
| sparkline 图片失败的错误态      | needs_human_input | 未显示 |
| 长按行为                    | needs_human_input | 可能「无操作」但值得确认 |
| 视口 <360rpx 时的行为         | needs_human_input | 固定宽度标签可能冲突 |

## 开放问题

1. `tap-hotspot` 导航到何处？详情页、webview 还是外链？（影响 `detailUrl` 字段。）
2. 整张卡片可点击，还是仅热点行和 CTA 可点击？（影响冒泡模型和 CTA 的 `catchtap`。）
3. 加载态是骨架闪烁、静态占位符，还是隐藏直到加载？
4. 每日热点尚未编排时：完全隐藏卡片，还是显示提示？
5. sparkline 图片加载失败：回退 PNG、空置，还是重试？
6. 卡片宽度固定还是响应式？
7. 未登录时 CTA「买一笔」是启用还是先触发登录？
8. `tap-hotspot` 和 `tap-buy` 的分析事件命名？

## 计划提示

- `needs_perf_check`（v2 canvas 升级时）
- `needs_a11y_pass`（GA 前）
- `new_atom:hot-tag`
- `new_atom:sparkline`
- `new_atom:pill-button`
- `backend_contract_required`（sparkline 形状、基金数据源）
- `analytics_wiring_required`（两个事件）
- `skeleton_state_required`（Q3）
- `empty_state_required`（Q4）
- `error_state_required`（Q5）
- `cross_platform_test_required`（iOS + 低端 Android）
- `design_signoff_required`（Q1–Q7）

## 交叉引用

- 输入设计稿：见 `./input.svg`（干净版，作为 skill 输入的示例）和 `./input-annotated.svg`（带编号与 Legend 的教学版，映射每个视觉元素到 spec.md 的 Requirement / Scenario）。
  - 视觉摘要（供 Claude 读取的文字备份）：卡片标题「今日风口」；热点行：堆叠「热点」徽章、单行截断的示例热点标题、双标签「🔥示例行业 +5.14%」/「🔥另一行业名… +99.99%」、右侧 chevron；基金推荐行：上升 sparkline、「示例宽基指数基金 A 类…」、「近一年涨幅 5.14%」、轮廓「买一笔」CTA。
  - 设计师注释：「一行 2，固定宽度」。
  - 脱敏说明：所有行业、基金、事件文案均为虚构占位。
- 目标技术栈：miniprogram（原生微信，glass-easel）
- 设计系统：无（使用 `rpx` 的定制样式）
- 规格增量：`./specs/today-windvane/spec.md`

## 建议的下一步

将此 `notes.md` 输入 Superpowers `/plan`，传递 `--target miniprogram` 和仓库根目录，以便规划器验证 `components/vertical-scroll/*` 约定并在搭建原子组件前解决「开放问题」。

## 埋点锚点

分类说明：**曝光**（元素进入视口）/ **点击**（用户交互）/ **曝光+点击**（同一元素既要量"被看到"又要量"被点击"，常用于漏斗分子分母）。`Flag` 列与 `input-annotated.svg` Layer 2 的视觉标记一一对应，是两个文件共享的稳定 key——修改锚点 ID 时，Flag 应当保持稳定；删除/新增锚点时同步维护 SVG 的 flag 标记。

| Flag | 锚点 ID                                | 触发 Scenario（spec.md）                          | 类型       | 关键参数（语义层）                                   | 状态             | 备注                                            |
| ---- | ------------------------------------ | --------------------------------------------- | -------- | ------------------------------------------- | -------------- | --------------------------------------------- |
| E1   | `today_windvane.exposure`            | 卡片首次进入视口（≥ 50% 像素可见，持续 ≥ 300ms）              | 曝光       | `hotspot.title`, `fund.code`, `placement`     | ✓ ready        | 衡量首屏曝光转化率；命中即上报，节流到天级去重                       |
| C1   | `today_windvane.tap_hotspot`         | 用户点击热点行                                       | 点击       | `hotspot.title`, `hotspot.detailUrl`         | ✓ ready        | 次转化路径，配合 `tap_buy` 评估"看了没买"分流              |
| EC1  | `today_windvane.cta_expose` + `today_windvane.tap_buy` | CTA 首次进入视口（曝光）+ 已登录用户点击 CTA（点击）  | 曝光+点击  | 共享 `fund.code`, `fund.yearChange`, `is_logged_in` | ✓ ready        | 主转化漏斗：`cta_expose` 作分母、`tap_buy` 作分子，计算 CTA CTR |
| C2   | `today_windvane.tap_buy.login_gate`  | 未登录用户点击 CTA 触发登录流程而非 `tap_buy`                | 点击       | `fund.code`                                  | ✓ ready        | 用于追踪登录转化漏斗的入口                                 |
| C3   | `today_windvane.tap_retry`           | error 态用户点击「重试」                               | 点击       | `placement`, `error_code`                    | ⚠ needs_design | 衡量错误兜底的可恢复性；依赖 error 态视觉设计签收                  |
| E2   | `today_windvane.skeleton_shown`      | 进入 loading 态显示骨架（连续 ≥ 1s）                     | 曝光       | `placement`                                  | ⚠ needs_design | 监控接口慢响应频率，> 1s 算劣化；依赖骨架视觉设计签收                 |
| E3   | `today_windvane.error_shown`         | error 态出现                                     | 曝光       | `placement`, `error_code`                    | ⚠ needs_design | 用于触发告警；高频出现需要查后端；依赖 error 态视觉设计签收            |
| —    | `today_windvane.empty_shown`         | empty 态触发卡片隐藏前的判定                             | not-tracked | —                                           | —              | 隐藏行为对用户无感，按产品约定不上报                            |
| —    | `today_windvane.dwell`               | 卡片可见时长 ≥ 3s                                   | not-tracked | —                                           | —              | v1 不收集 dwell；待数据团队确认采样成本后再加                   |
