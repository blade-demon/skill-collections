# today-windvane — add-today-windvane 的增量规格

## ADDED Requirements

### Requirement: 热点行展示

The system SHALL 以单行展示当天最热话题，左侧为作为图片资产加载的「热点」徽章（`hotspot.badgeIconUrl`），中间为单行截断的热点标题，标题下方为固定行业标签双列网格。

#### Scenario: 徽章作为图片资产加载

- WHEN 渲染 `hotspot.badgeIconUrl === "https://cdn.example.com/hot.png"`
- THEN DOM 中 `querySelector('.hot-badge')` 是 `<image>` 元素
- AND 其 `src` / `href` 等于该 URL
- AND 组件内不存在显式的「热」「点」文本节点（`textContent` 不包含独立字符）
- WHEN `badgeIconUrl` 为空字符串或未定义
- THEN `console.warn` 调用 1 次，warning 包含字符串 `badgeIconUrl`
- AND 组件渲染尺寸等同的透明占位节点（不自绘文字兜底）

#### Scenario: 标题超出单行宽度

- WHEN `hotspot.title` 渲染宽度 > 标题容器可用宽度
- THEN 标题元素 `scrollWidth > clientWidth` 为 true
- AND 元素 `textContent` 末尾可见 `…` 字符
- AND 元素高度等于 `line-height × 1`

#### Scenario: 行业标签以等宽双列渲染

- WHEN `hotspot.tags.length === 2`
- THEN 两个标签容器的 `getBoundingClientRect().width` 相等（差值 ≤ 1px）
- AND 两者 `offsetTop` 相等
- AND 单个标签名称溢出时，**该标签自身** `scrollWidth > clientWidth`，另一标签不受影响

### Requirement: 热点标签格式化

The system SHALL 渲染每个行业标签，标签包含可选火焰图标、行业名称，以及两位小数、带显式符号、以正/负色令牌着色的涨跌幅。

#### Scenario: 正 / 负 / 零 涨跌幅

- WHEN `hotspot.tags[i].change === 5.14`
- THEN 文本为 `+5.14%`，color 等于正数令牌 `--color-up`
- WHEN `hotspot.tags[i].change === -3.20`
- THEN 文本为 `-3.20%`，color 等于负数令牌 `--color-down`
- WHEN `hotspot.tags[i].change === 0`
- THEN 文本为 `+0.00%`，color 等于正数令牌（产品约定零非中性）

#### Scenario: 精度超出两位小数

- WHEN `hotspot.tags[i].change === 5.1447`
- THEN 文本为 `+5.14%`（四舍五入到两位）

#### Scenario: 火焰图标开关

- WHEN `hotspot.tags[i].hot === true` 或字段省略
- THEN 标签 DOM 包含 `.flame-icon` 节点，位于名称左侧
- WHEN `hotspot.tags[i].hot === false`
- THEN `querySelector('.flame-icon')` 返回 `null`
- AND 名称起始 `offsetLeft` 等于标签容器 `padding-left`

### Requirement: 热点行点击行为

The system SHALL 当热点行被点击时发出 `tap-hotspot` 事件，以完整的 `hotspot` 对象作为 detail，并 SHALL 不在组件内部执行导航。

#### Scenario: 用户点击热点行空白处

- WHEN 用户点击热点行上任意非子交互区域
- THEN 组件派发 `tap-hotspot` 事件 1 次
- AND `event.detail.hotspot` 引用等于输入的 `hotspot` 对象
- AND 组件未调用 `wx.navigateTo` / `router.push` 等任何导航 API

#### Scenario: hotspot 为空时点击不派发

- WHEN `hotspot` 为 `null`，用户点击卡片区域（fund 行）
- THEN 组件不派发 `tap-hotspot`

### Requirement: 基金推荐行展示

The system SHALL 以单行展示推荐基金，包含左侧 sparkline、中间单行截断的基金名称与「近一年涨幅」（两位小数带符号百分比），以及右侧 CTA 药丸按钮。

#### Scenario: 基金名称溢出中间列

- WHEN `fund.name` 渲染宽度 > 中间列 `clientWidth`
- THEN 名称元素 `scrollWidth > clientWidth` 为 true
- AND `textContent` 末尾可见 `…`
- AND sparkline 与 CTA 的 `offsetLeft` 保持固定（不被挤压位移）

#### Scenario: Sparkline 为字符串 URL

- WHEN `fund.sparkline === "https://cdn.example.com/spark.png"`
- THEN 渲染 `<image>` 元素，其 `src` 等于该字符串

#### Scenario: Sparkline 为点数组（v1 降级）

- WHEN `fund.sparkline` 是 `number[]`
- THEN 组件调用 `console.warn` 一次，warning 包含字符串 `sparkline`
- AND 渲染与字符串分支**相同尺寸**的空占位节点（`offsetWidth` / `offsetHeight` 相等）
- AND 组件不派发任何 `error` 事件

### Requirement: 基金 CTA 点击行为

The system SHALL 在已登录状态下当 CTA 被点击时发出 `tap-buy` 事件，以基金代码作为 detail，并 SHALL 阻止点击冒泡到热点行或任何父级处理器（未登录态的 CTA 行为见「非 success 状态切换」Requirement）。

#### Scenario: 点击 CTA 不触发父级

- WHEN 用户点击 CTA 药丸按钮，且父级热点行监听 `tap-hotspot`
- THEN 组件派发 `tap-buy` 1 次，`event.detail.fundCode === fund.code`
- AND 父级 `tap-hotspot` 监听器接收到 0 次事件

#### Scenario: CTA 标签回退

- WHEN `fund.ctaLabel === "立即申购"`
- THEN CTA 元素 `textContent === "立即申购"`
- WHEN `fund.ctaLabel` 省略或为空字符串
- THEN CTA 元素 `textContent === "买一笔"`（默认）

### Requirement: 部分数据弹性

The system SHALL 当仅提供 `hotspot` 或 `fund` 之一时只渲染对应一行（另一行 DOM 缺席），两者都缺失时完全不渲染（根节点无子元素、`offsetHeight === 0`、无卡片边框或 padding）。

#### Scenario: 仅 hotspot 存在

- WHEN `hotspot` 对象存在，`fund` 为 `null` 或 `undefined`
- THEN 热点行 DOM 存在
- AND `querySelector('.fund-row')` 返回 `null`
- AND 组件根节点高度等于热点行自然高度（无空占位）

#### Scenario: 仅 fund 存在

- WHEN `fund` 对象存在，`hotspot` 为 `null` 或 `undefined`
- THEN 基金行 DOM 存在
- AND `querySelector('.hotspot-row')` 返回 `null`

#### Scenario: 两者都缺失（对应 empty 状态）

- WHEN `hotspot` 和 `fund` 都为 null/undefined
- THEN 组件根节点 `children.length === 0`
- AND 根节点 `offsetHeight === 0`

### Requirement: 非 success 状态切换

The system SHALL 在 loading / error / disabled 三种非 success 态下渲染对应的降级 UI，且降级节点与 success 态容器同高度，避免列表布局抖动。

<!-- needs_human_input: 骨架样式待设计签收（对应 notes.md 开放问题 3）。下面 Scenario 以数据契约级断言占位，视觉细节等 design 补全后升级。 -->

#### Scenario: loading 态显示骨架

- WHEN 父组件传入 `loading === true`，`hotspot` / `fund` 均 undefined
- THEN `querySelector('.skeleton')` 不为 null
- AND `querySelector('.hotspot-row')` 和 `querySelector('.fund-row')` 均为 null
- AND 根节点 `offsetHeight` 与相同视口宽度下 success 态高度差值 ≤ 2rpx

<!-- needs_human_input: 错误兜底视觉样式待设计签收（对应 notes.md 开放问题 5） -->

#### Scenario: error 态显示重试按钮

- WHEN 父组件传入 `error` 对象非 null
- THEN `querySelector('.error-state')` 不为 null
- AND error 节点内 `querySelector('[data-role="retry"]')` 不为 null
- AND 用户点击重试按钮派发 `tap-retry` 事件 1 次，`event.detail.errorCode === error.code`

#### Scenario: disabled 态未登录用户点击 CTA

- WHEN `isLoggedIn === false`，用户点击 CTA 药丸按钮
- THEN CTA 元素 `textContent === "登录后购买"`
- AND 组件派发 `tap-login` 事件 1 次
- AND 组件**不**派发 `tap-buy` 事件
- AND CTA 元素具有类名 `.disabled` 或 `disabled` 属性
