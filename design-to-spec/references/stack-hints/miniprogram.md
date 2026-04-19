# 技术栈提示：微信小程序

当目标技术栈是微信小程序（原生，或使用 `glass-easel` 组件框架或传统 `exparser` 框架）时使用这些注意事项和约定。将它们融入 `design.md` 的"布局陷阱"和"决策"部分 —— 不要融入 `spec.md`，后者保持行为聚焦。

## 组件模型

- 原生组件作为四文件包存在：`index.wxml` + `index.wxss` + `index.js` + `index.json`。
- `index.json` 声明 `"component": true` 和用于嵌套自定义组件的 `usingComponents` 映射。
- `glass-easel`（现代框架，通过 `app.json` 中的 `"componentFramework": "glass-easel"` 指示）支持更好的类型检查和链式 API，但大多数现有社区示例仍为传统框架编写 —— 将其视为大部分兼容但验证语法。
- 属性使用 `properties: { xxx: { type: Object, value: {} } }`。事件通过 `this.triggerEvent('name', detail, options)` 发出。

## 单位和小号

- 使用 `rpx` 进行响应式尺寸（设计设备上 `750rpx === 100vw`）。使用一致的比率转换设计像素值。
- 对于排版，`px` 或 `rpx` 都可以；团队通常选择一个并坚持下去。在 `design.md` 中明确说明是哪一个。
- `rpx` 中的固定宽度可以与 `flex-shrink: 0` 组合，当你需要 flex 行内真正锁定的宽度时。

## 布局陷阱

- `**min-width: 0` 在 flex 子元素上** 对于包含单行截断文本的任何子元素是必需的。没有它，`text-overflow: ellipsis` 会静默失败。对于任何具有 `flex: 1` 加截断的行，明确指出这一点。
- **单行省略号使用 `text` vs `view`**：`<text>` 有怪癖的换行行为；使用 `<view>` 加 `overflow: hidden; white-space: nowrap; text-overflow: ellipsis;` 更可靠。
- **每行两个固定宽度的标签**：对每个标签使用 `display: flex` + `flex: 0 0 50%`（或显式 `rpx` 宽度）+ 每个标签 `overflow: hidden`。当内容混合长度时，朴素的 `inline-block` 会破坏。
- **发丝线边框**（`1rpx` 或 `1px`）：在 iOS 变体渲染上，发丝线可能消失或加倍。基于 transform 的发丝线技巧（通过 `transform: scale(0.5)` 的 0.5px）是安全的 fallback。
- **在滚动内滚动很痛苦。** `<scroll-view>` 嵌套在页面 `<scroll-view>` 内需要显式的 `enhanced` / `scroll-y` 设置，在 Android 上仍可能失败。如果可能，避免。

## 图表、canvas、图片

- 对于微型价格/趋势图表（sparkline）：优先使用 `<canvas type="2d">`（新 API）而不是传统 canvas。旧 canvas 是浮在 WXML 上方的原生层，会破坏堆叠上下文。
- 如果后端可以预渲染图表为 PNG，使用 `<image mode="aspectFit">` —— 零运行时成本。
- 在 `design.md` 中将 canvas 和 image 之间的决定作为明确决策。

## 事件和点击

- `bindtap` 冒泡。`catchtap` 阻止冒泡。**任何可点击卡片内的按钮必须使用 `catchtap`** 否则点击按钮也会触发卡片的导航处理器。
- 长按是 `bindlongpress`。没有原生悬停。
- 无障碍：小程序的无障碍支持有限。`aria-*` 不适用；在可用的地方通过 `hover-class` / `focusable` 属性使用 `aria-label`。这是已知缺口 —— 将其表面化为风险。

## 状态管理

- 本地组件状态：`data: {}` + `setData(...)`。避免在低端设备上使用大型 `setData` 有效载荷；优先使用部分键更新（`setData({ 'a.b.c': value })`）。
- 全局状态：要么是应用级 `globalData`（简单情况），要么是 pub/sub 事件总线。团队经常通过 `mobx-miniprogram-bindings` 添加 MobX。如果组件依赖于共享状态，在 `design.md` 中标记状态策略。

## 真机注意事项

- iOS 微信和 Android 微信渲染不同：
  - `backdrop-filter`（Android 上通常不支持）
  - `<image>` 中 SVG 支持（Android 有间歇性 bug；优先使用 PNG）
  - `:active` 伪类延迟
- 在 `notes.md` 的「计划提示」里打上 `device_test_required` 标签，提醒下游 plan 阶段把"真机验证（iOS + 低端 Android）"列为任务，而不仅仅是"开发者工具预览"。

## 设计系统对齐

如果项目使用 TDesign MiniProgram、Vant Weapp 或 ColorUI：

- TDesign：组件类前缀 `t-`，图标从 `tdesign-icons-view` 导入。
- Vant Weapp：使用 `van-` 前缀，文档完善，广泛采用。
- ColorUI：类 utility 风格，无 JS 运行时。

在 `design.md` 中注明选择的系统，并优先复用其原子组件而不是手写。