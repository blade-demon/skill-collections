# React Codegen Layout Projection Design (stack/inline → flex)

日期：2026-06-07
PR：PR-3（React codegen fidelity 系列；PR-1 坐标基准 / PR-2 资产 已合入 master）
关联：`docs/codegen-react-bottleneck-audit-2026-06-06.md` 问题 3（`layoutPlan` 未进入 React CSS）

## Context

`component-plan.body.layoutPlan` 已携带 `stack` / `inline` / `absolute` 三类
`PlannedLayout`，但 React generator 完全忽略它：`componentCss()` 给**每个**渲染节点
写死 `position: absolute; left/top/width/height`。真实 `d2c.sketch` 上 47 条 layout 里
有 `stack:1` / `inline:1`，却仍被绝对定位复刻。

上游已经确定了方向（[`semantic/derive.ts:536`](../../../packages/d2c-core/src/semantic/derive.ts) —
`axis === 'y' ? 'stack' : 'inline'`），且只在「重复模式覆盖容器**全部**子节点」时升级
（[`derive.ts:532`](../../../packages/d2c-core/src/semantic/derive.ts)）。但
`PlannedLayout` 只有 `strategy` / `constraints[]` / `caveats[]`，**没有 gap / 轴 / 对齐**
字段（派生时算过 gap 但丢弃）。

## Goal

把**已确认**的 `stack` / `inline` `PlannedLayout` **投影**为 flex CSS：容器输出
`display: flex` + 方向，其直接子节点改为 flow（去绝对定位），在 0.5px 容差内保持原几何。

这是「将已确认的 `layoutPlan` 投影为 CSS」，**不是第二套 layout inference**：不重新判断
布局类型、不改变上游已决定的 strategy。

## Non-Goals

- 不扩上游 layout inference：`absolute` strategy 仍绝对定位（247 条不动）。
- 不实现 `grid` / `overlay`：enum 里有，但上游从不产出 → 无真实输入可测。
- 不把 gap / 轴 / 对齐回灌进契约（保持 codegen-local；上游传参留作后续）。
- 不碰资产链路 / 命名 / vector；**不动 PR-2 的 asset golden**。

## Mapping（投影规则）

容器（命中 `stack`/`inline` `PlannedLayout` 的节点）CSS：

```css
display: flex;
flex-direction: column; /* stack；inline → row */
align-items: flex-start; /* 禁止 stretch */
gap: <Gpx>;
padding: <Tpx> <0> <0> <Lpx>; /* 由首项坐标生成，保留起始偏移 */
/* 容器保留自身 width/height 与其它视觉样式 */
```

直接子节点 CSS：

```css
position: relative; /* 仍作绝对定位后代的 containing block，不可变 static */
flex: 0 0 auto; /* 保留显式宽高，不伸缩 */
width: <wpx>;
height: <hpx>;
/* 无 left/top，无 position:absolute */
```

- **方向**：`stack` → `column`，`inline` → `row`（来自 strategy，不再判断）。
- **gap**：沿主轴排序后，相邻间距（`next.start − prev.end`）的**算术平均值**（与上游
  gap 算法一致）。均值 × (n−1) = Σ实际 gap ⇒ 保留**首尾**跨度，但**不保证中间项位置**：
  上游允许 gap 有 2px / 15% 波动（[`derive.ts:453`](../../../packages/d2c-core/src/semantic/derive.ts)），
  非均匀间距用均值会让中间项漂移。因此**仅当**用均值重建出的每个子项主轴位置与实际相差
  ≤ 0.5px 时才发 flex，否则回退（见 guard）。
- **align**：`align-items: flex-start`（不 stretch）。
- **padding**：由首项相对容器的坐标生成（`padding-top = first.y`，`padding-left = first.x`），
  保留内容块的起始偏移；为负则回退（见 guard）。
- **子项 `position: relative`**：去掉 absolute 后必须保留 `relative`——原 absolute 同时让节点
  成为其绝对定位后代的 containing block；直接删 position 会使嵌套子孙相对错误祖先定位
  （真实 inline 的 5 个直接子项都带嵌套子节点）。

## Safe-projection guard（不安全几何 → 保留 absolute 子项定位 + 确定性 warning）

flex 依赖 DOM 源顺序与几何一致，因此在以下情况**不投影 flow 布局，保留直接子项原有的
absolute positioning**并输出一条确定性 warning。这里 projection 返回的
`kind:'absolute'` 表示“容器子项继续绝对定位”，**不表示容器自身一定是 absolute**：
component `.root` 仍是 relative block；普通嵌套容器自身仍由其父布局决定。投影绝不抛错，
因为保留原有子项定位始终是合法、可运行的输出。

1. **< 2 个子项**：无 gap 可投影。
2. **缺失节点**：容器的某直接子节点没有可用 visual 几何 / 不在渲染集合。
3. **DOM 顺序不匹配**：子节点的 `childIds` 发射顺序 ≠ 主轴排序顺序（flex 按 DOM 顺序
   布局，不按坐标 → 会视觉错位）。
4. **负 gap**：任一相邻间距 < 0（子项重叠 / 错序）。
5. **负 padding**：`first.x < 0` 或 `first.y < 0`。
6. **主轴位置漂移 > 0.5px**：用均值 gap 重建每个子项主轴起点
   （`pos[0]=lead`，`pos[i]=pos[i-1]+size[i-1]+meanGap`），与实际主轴起点比较，任一 |差| > 0.5px。
7. **跨轴起点方差 > 0.5px**：`align-items: flex-start` 会把所有子项跨轴起点对齐到
   stack 的 `padding-left` / inline 的 `padding-top`；任一子项实际跨轴起点与首项相差
   > 0.5px → 会漂移。

warning 文案**精确字符串**（含容器 nodeId + 具体原因），同输入同输出；多容器回退时
warning **不重复、顺序确定**。7 条模板、排序规则、去重 key、返回方式锁定在 plan
「Warning 契约」。

> 注：#6/#7 把保真直接焊进投影——flex 只在能在 0.5px 内复刻原绝对几何时才发，否则
> 保留 absolute 子项定位。真实快照里两个 layout 的 similarity 均为 1.00（均匀 gap、对齐一致），
> 不会被挡。

## Architecture / Components

- **新增纯函数** `projectStackInlineLayout(plan, childrenRects)`（codegen-local，无 IO）：
  输入容器的 `stack|inline` 策略 + 直接子项的 rect（按 `childIds` 顺序），返回
  `{ kind: 'flex', direction, gapPx, padding } | { kind: 'absolute', warning }`（命中
  guard 时回退）。承载上面的 mapping + guard 全部逻辑，可被纯单测穷举。
- **`react/generate.ts`**：
  - context 增加 `layoutPlanBySemanticId: Map<string, PlannedLayout>`（由
    `componentPlan.body.layoutPlan` 建立）。
  - `componentCss()` 须区分三种载体（真实 stack/inline 都落在 **planned component 自身**，
    渲染为 `.root`（[`generate.ts:396`](../../../packages/d2c-core/src/codegen/react/generate.ts)），
    而 CSS 循环只遍历其子节点（[`generate.ts:432`](../../../packages/d2c-core/src/codegen/react/generate.ts)）——
    若只改子节点循环会漏掉 `.root`）：
    1. **component 自身的 layoutPlan**（`semanticNodeId === component.semanticNodeId`）→ 投影到
       `.root`（`.root` 由 `position:relative` 升级为 `display:flex`，子项为其直接渲染子节点）。
    2. **普通嵌套容器**（非 root 的渲染节点）→ 投影到其 `.node_xxx` class。
    3. **child-component wrapper**（父组件里指向子组件的边界节点）→ 作为父容器的一个 flow
       子项参与排布，但**不在父这里消费子组件自己的 layoutPlan**（子组件 `.root` 自行处理）。
  - **容器自身定位与 `display:flex` 正交**：定位由「父」决定，`display:flex` 由「自身计划」决定。
    1. component `.root`：`position:relative` 不变，叠加 `display:flex`。
    2. 普通嵌套容器、**父非 flex**：保留 `position:absolute` + `left/top`，叠加 `display:flex`
       （仍被父绝对定位，内部对子项 flex）。
    3. 普通嵌套容器、**父为 flex**：自身作父的 flow 子项（`position:relative` +
       `flex:0 0 auto`，保留显式宽高、无 `left/top`），同时叠加 `display:flex`。否则嵌套
       flex 容器会丢失定位、被挪到父级 (0,0)。
  - flex 容器的**直接子项**写 flow：`position:relative` + `flex:0 0 auto` + 显式宽高，无
    `left/top`/`absolute`。回退时容器自身定位不变，直接子项继续 absolute positioning；
    warning（精确串）汇入 `CodegenFilePlan.warnings`（模板/排序/去重/返回见 plan
    「Warning 契约」）。
  - 非目标节点仍 absolute；**顶层 component 的 layout strategy 为 absolute 时，其 `.root` 保持
    默认 `position:relative` block**（root 从不是 absolute）。

## Testing Strategy

1. **core 单测**（`projectStackInlineLayout`）：column/row 方向、mean gap、padding；回退分支
   逐一覆盖（<2 / 缺节点 / 顺序不匹配 / 负 gap / 主轴漂移>0.5px / 跨轴方差>0.5px /
   负 padding）+ **精确字符串** warning。非均匀 `[10,30]` 用例断言 `kind:'absolute'`
   （即保留 absolute 子项定位，不发 flex）。
2. **core generate 测试**：**两种载体都覆盖**——component `.root` 自身投影为 flex，以及一个
   普通嵌套容器投影为 flex；子项 `position:relative`、无 absolute；inline → row；非目标节点
   与 `.root` 默认仍 absolute/relative；并分别覆盖嵌套 flex 容器的父为非 flex
   （容器保留 absolute + left/top）和父为 flex（容器自身 flow、无 left/top）两种定位；
   同输入字节稳定；回退场景产出确定性 warning。
3. **codegen-layout-golden（独立 fixture，不碰 asset golden）**：单个 fixture 同时含
   - 3 个垂直同类项（**作为某 planned component 的 `.root`**）→ 触发 `stack`
   - 3 个水平同类项（**普通嵌套容器**）→ 触发 `inline`，且其直接子项**各带嵌套子孙**
     （回归 `position:relative` containing-block：嵌套子孙几何不漂移）
   - 顶层 component 的 layout strategy 为 absolute（其 `.root` 保持 relative block），仅两个
     目标容器及其直接子项进入 flex flow。
     **先备好 design-spec（测试输入）→ 写 golden test 验红（golden-layout 包缺失）→ 再生成
     committed 包**；golden 字节比对 + `tsc -b && vite build`。
4. **visual harness（PR-3 必须纳入，含 CI）**：新增纯解析器
   `parseVisualHarnessArgs(argv)`，锁定默认 fixture、自定义 `--fixture` 与缺参失败语义；对比父容器、
   直接子项**及其嵌套子孙**的相对
   x/y/width/height，容差 **0.5px**；含一条**负向验证**（破坏 gap 或 flex-direction 后必须变红）。
   harness 参数化 `--fixture` 跑 asset / layout 两套，输出目录分开；CI（`check.yml` +
   `detect-visual-regression-changes.sh` + `visual-regression-ci.test.js` + 新挂载页测试）跑小
   fixture 且**原 asset gate 继续通过**；完整 `d2c.sketch` 仅作本地全链路验收（1 stack + 1
   inline 投影为 flex 且无位置回归）。

## Out of scope / Follow-up

- gap / 轴 / 对齐进契约（上游传参，替代 codegen-local 重推导）。
- `grid` / `overlay` 投影（需先有上游产出）。
- 扩大上游 stack/inline inference 覆盖率（本 PR 只消费已有计划）。
