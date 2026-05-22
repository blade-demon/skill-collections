# 技术栈提示：通用 Web（React / Vue / Svelte / HTML）

当目标技术栈是基于浏览器的 Web 框架时使用这些注意事项和约定。将它们融入 `notes.md` —— 不要融入 `spec.md`。

## 组件模型

- **React**：带 hooks 的函数组件。Props 通过 TypeScript 类型化。事件是处理 props（`onBuy`、`onOpenHotspot`）。避免超过 2 层以上的 prop drilling —— 要么将状态放在一起，要么使用 context/store。
- **Vue**：`<script setup>` SFC。Props 通过 `defineProps`，事件通过 `defineEmits`。在适用的地方使用 `v-model` 进行双向绑定。
- **Svelte**：props 通过 `export let`，事件通过 `createEventDispatcher`。Store 用于跨组件状态。

在 `notes.md` 中将框架名称作为明确决策命名，以便下游工具可以选择正确的脚手架。

## 布局陷阱

- `**min-width: 0` 在 flex 子元素上\*\* —— 与小程序相同的陷阱。具有 `flex: 1` 和截断文本的 flex 子元素除非应用 `min-width: 0` 否则会拒绝收缩到其固有内容宽度以下。这几乎在每个省略号布局中都会咬人。
- `**text-overflow: ellipsis`\*\* 需要 `overflow: hidden` 和 `white-space: nowrap` 一起使用。或者对多行截断使用 `display: -webkit-box; -webkit-line-clamp: N; -webkit-box-orient: vertical; overflow: hidden;`（尽管有前缀，但得到广泛支持）。
- **行中的固定宽度 chips**：CSS grid 与 `grid-template-columns: repeat(2, minmax(0, 1fr))` 比 flex 百分比更干净，因为 `minmax(0, 1fr)` 已经包含了 `min-width: 0` 修复。
- **容器查询**（`@container`）现在得到广泛支持，在组件本地响应行为方面优于媒体查询。当组件需要适应其父宽度而不是视口时，优先使用它们。
- **固定宽高比的媒体**：`aspect-ratio: 16 / 9` 是现代方式；避免 `padding-bottom: 56.25%` hack。

## 交互和无障碍

- 每个交互元素都需要可达的键盘路径：`<button>` 而不是 `<div onClick>`；如果你绝对需要 `<div>`，给它 `role="button"`、`tabIndex={0}`，并在 `onKeyDown` 中处理 `Enter` / `Space`。
- 仅图标按钮需要一个 `aria-label`。
- Feed 行中装饰性的 `>` chevron 不应该是可聚焦元素 —— 周围的行是焦点目标。
- 按下/活动状态需要可见的焦点环（`:focus-visible` 而不仅仅是 `:focus`），以免妨碍鼠标用户。

## 性能

- **Sparklines/微型图表**：SVG 通常是正确的默认选择（小、可访问、在任何 DPR 下都清晰）。仅在 >1k 点或动画时才切换到 canvas。如果后端可以预渲染图表为 PNG，如果数据是静态 per-item 的，那也是有效的。
- **图片尺寸**：始终提供 `width` 和 `height` 属性或 `aspect-ratio` 以防止布局偏移。对折叠下方的图像使用 `loading="lazy"`。
- **Bundle 影响**：你添加的每个原子组件都应该证明其 bundle 成本。在 `notes.md` 的「决策」中明确列出任何新的运行时依赖（图表库、动画库），以便下游 plan 阶段可以评估。

## 状态和数据

- 数据获取：SWR / React Query / TanStack Query / Vue Query 都解决同一系列问题（缓存、重新验证、错误状态）。根据项目约定选择一个；在 `notes.md` 的「决策」中说明。
- CTA 按钮（「买入一手」）的乐观更新可以让 feed 感觉更快，但需要失败时的回滚路径。如果 设计稿暗示需要服务器交互的 CTA，在 `notes.md` 的「开放问题」或「计划提示」中将其标记为风险。

## 样式方法

指出项目使用哪一种：

- **CSS Modules** / **vanilla CSS**：并置样式，最小运行时。
- **Tailwind**：utility 类，每个组件成本低，需要构建步骤和设计令牌映射。
- **CSS-in-JS**（styled-components、Emotion）：灵活但有运行时成本和 SSR 注意事项。
- **无样式 headless 库**（Radix、Headless UI）：处理无障碍原语，让你带来自己的样式。

如果项目有选定的 approach，匹配它；如果没有，选择仍然给你设计令牌纪律的最轻量选项。

## 响应式和 RTL

- 设计稿通常显示一个宽度。询问（或标记）：布局是响应式的吗？如果是，断点是什么？
- RTL 支持：如果产品面向阿拉伯语或希伯来语市场，组件必须使用 `dir="rtl"` 工作。Margin/padding 逻辑属性（`margin-inline-start` 而不是 `margin-left`）使这自动完成。

## 测试策略

在 `notes.md` 的「计划提示」中打上以下标签，提示下游 plan 阶段铺出测试阶梯：

1. `unit_test_required` —— 数据契约的单元测试（给定 fixtures 渲染）
2. `state_coverage_storybook` —— 覆盖主要状态的 Storybook / Histoire story（加载、空、长内容、短内容）
3. `a11y_check_required` —— 使用 axe 或类似的无障碍检查
4. `visual_regression`（如果团队有 Chromatic / Percy）

这些标签设定对"完成"的衡量标准，而不强制规划者的手。
