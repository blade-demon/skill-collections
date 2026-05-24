# Stage 3 IR 保真审计 — Post-Stage-4 Findings

> 本文是对 Sketch normalize 产物 `design-ir.json` 的一次系统保真审计,在 Stage 4 预览门禁
> 跑通后、进入 Stage 5 前执行。
>
> **起因**:Gate-1 评审手动抓出 D1 黑块缺陷(见 [`stage-3-normalize-outline.md`](./stage-3-normalize-outline.md)
> §18)—— 一个 schema 校验通过、零 warning、却语义错误的产物。说明"绿色构建 ≠ IR 正确":
> Stage 5(语义 / 组件方案)与 Stage 6(codegen)都直接消费 `design-ir.json`,须在它们依赖
> IR 之前做一次系统体检。
>
> **状态**:审计完成 2026-05-22。修复按批次推进,见 §6。

---

## 1. 审计范围与方法

- **输入**:真实 `d2c.sketch` → `extract` → `raw-dsl.json` → `normalize` → `design-ir.json`
  (D1 修复后版本,296 节点)。
- **方法**:`design-ir.json` 与 `raw-dsl.json` 逐维度比对 —— 文字样式、填充、边框 / 效果、
  symbol 展开、布局坐标、蒙版、资源映射、warning。
- **产物保密**:真实 IR / raw / 预览含绝对路径与业务内容,**不入库**;本文只记结论。
- **节点构成**:296 节点 —— shape 141 / group 73 / text 41 / frame 37 / image 4;最深 11 层。

## 2. 缺陷分级

- **A 类 — IR 保真缺陷**:产物字段缺失 / 错位 / 有损,会被 codegen 忠实放大。**须修**。
- **B 类 — 结构充分性缺口**:IR 合法、视觉可预览,但不足以支撑高质量 React 结构生成。
  **非 bug**,归 Stage 5。

## 3. A 类缺陷

### A1 — 行高 `lineHeight` 全丢

- **证据**:41/41 文字节点 `text.style.lineHeight` 缺失;raw 中 35 个文字图层有 **27 个**在
  `paragraphStyle` 带行高(`maximumLineHeight` / `minimumLineHeight`)。
- **根因**:`normalize/visual.ts` `extractText()` 从 `paragraphStyle` 只取了 `alignment`,
  未取行高。`TextContent.style.lineHeight` 字段存在却从不填。
- **codegen 影响**:文字行距全错,多行文本(气泡正文、说明文字)垂直节奏失真。
- **批次**:Batch 1 —— ✅ 已完成(2026-05-22):`extractText` 读 `maximumLineHeight`
  (退 `minimumLineHeight`);两者无 / 为 0 则留空(= auto)。

### A2 — 字重 `fontWeight` 全丢

- **证据**:41/41 无 `fontWeight`。字重实际编码在字体名后缀:`PingFangSC-Regular` /
  `-Medium` / `-Semibold`、`DINAlternate-Bold`、`PingAnNuanChengTi-Medium`。
- **根因**:`extractText()` 只取 `MSAttributedStringFontAttribute.attributes` 的 `name` /
  `size`,未把字体名后缀归一成中立字重。`TextContent.style.fontWeight` 字段存在却从不填。
- **codegen 影响**:粗体标题(酒店名、价格)全渲染成常规体,除非 codegen 自行反解 Sketch
  字体名 —— 而这属 provider 私有知识,应在 normalize 归一。
- **批次**:Batch 1 —— ✅ 已完成(2026-05-22):解析字体名末段已知权重词(Thin…Black →
  100…900)→ `fontWeight`,并剥离到基础族名;未命中已知后缀的字体名(如 `Helvetica`)原样
  不动 —— 不做品牌 / 别名映射。

### A3 — 渐变填充塌缩成单色

- **证据**:9 个 gradient 填充。`normalizeFills()` 对 `fillType:1` 标 `type:'gradient'`、
  取 `colorToHex(f.color)`(Sketch 渐变填充对象上的回退纯色)、`raw:{fillType:1}`。
  **`gradient` 对象(`stops` / `from` / `to` / `gradientType`)整个丢弃,连 `style.raw`
  都没留。**
- **隐蔽性**:`color` 字段有值、无 warning —— 下游完全看不出这是有损产物。
- **codegen 影响**:9 处渐变背景变纯色。
- **批次**:Batch 1 —— ✅ 已完成(2026-05-22):渐变原始数据(stops / from / to /
  gradientType)保留进**每个 fill 自己的** `fill.raw.gradient`(非 `style` 级,支持单节点多
  渐变);`fill.type` 留 `gradient`、`color` 留 fallback。完整渐变建模(`Fill` schema 增
  gradient 字段)可后置。

### A4 — 蒙版 / 裁剪完全没建模

- **证据**:raw 中 **20 个**图层带 `hasClippingMask:true`;`VisualNode` schema
  (`packages/d2c-core/src/ir/visual.ts`)没有任何 `mask` / `clipsContent` / `clip` 字段。
- **根因**:`normalize/visual.ts` 忽略 `hasClippingMask`;蒙版图层与被裁兄弟节点都按普通
  节点产出,"裁剪关系"丢失。`clean-tree.ts` 也未实现 §7 承诺的"纯 mask 容器"处理。
- **codegen 影响**:圆角头像、酒店缩略图等会渲染成方角 / 内容溢出。预览阶段靠
  `.d2c-node { overflow:hidden }` 偶然遮掉一部分,但裁剪形状(圆角半径、自定义 path)未还原。
- **批次**:Batch 3 —— 须先设计 `VisualNode` 的 mask 语义(`clipsContent` / `mask` /
  `clipPathRef`),不要急着塞 raw。

### A5 — symbol 实例缩放时子节点坐标未换算 ⚠️ Stage 5 前置阻断项

- **证据**:30 个 symbol 实例中 **9 个被缩放**(实例 frame ≠ master frame);33 处"子节点
  越界父边界"中 **27 处**落在 symbol 子树内。例:
  - `猜你想要` 实例 181 / 182 / 247×48,master 311×48
  - `icon/首页/输入框/更多` 18×18,master 36×36
  - `img/bg` 375×1465,master 375×812
  - `icon/其他/声音备份 5` 16×16,master 32×32
- **根因**:`normalize/visual.ts` `normalizeSymbolInstance()` 把 master 子树**原样**展开 ——
  子节点保留 master 坐标系下的 `frame`,实例被拉伸 / 压缩时没有施加 `master → instance` 的
  缩放变换。Stage 3 §8 蓝图只写"就地展开 master 规范化子树",**漏掉了 resize / scale 与
  `resizingConstraint`**。
- **codegen 影响**:**这是 Stage 5 前置阻断项**。若不修,被错位子树喂给 semantic /
  component-plan,会基于错误布局做错误的组件抽象与列表项识别,codegen 把偏差一路放大。
- **批次**:Batch 2,**单独做** —— ✅ 已完成(2026-05-24):新增 `normalize/symbol-scale.ts`
  纯模块(`decodeResizingConstraint` + 8-case `applyConstraintAxis` + `applyConstraint` +
  `isResized`),`normalize/visual.ts` 通过 `containerResize` 上下文级联;`unsupported-symbol-
  transform` warning 标 rotation/flip 子节点。验证:`img/bg` 375×812 → 375×1465 正确铺满;
  嵌套 `AI星星` 继承外层 1.143× 横向缩放(frame 22.857×20);`猜你想要` chip 按 181/182/247
  各自宽度铺开;scale-induced OOB 7→0(剩余 OOB 为 rotation warning + 设计意图溢出 + 非 symbol
  容器的合法溢出)。详细公式与级联算法见 [`batch-2-symbol-scale-investigation.md`](./batch-2-symbol-scale-investigation.md)。

### A6 — 部分 symbol override 未应用

- **证据**:`symbol.overrides` 共 23 条 —— 13 条文字 override(`_stringValue`)已在 Stage 4
  `apply-overrides` 应用;另 **10 条**未支持:5 条 `symbolID`(嵌套 symbol 替换 —— 改的是
  "显示哪个子组件",结构性)、4 条填充色(`color:fill-0` / `fillColor`)、1 条边框色
  (`color:border-0`)。计入 `overrideUnsupported:10`。
- **性质**:Stage 4 §6 蓝图明确把图片 / 嵌套 symbol override 定为 best-effort + warning
  —— **属已知限制,非回归**。
- **codegen 影响**:10 处实例渲染为 master 默认内容。
- **批次**:Batch 4 —— 保留 warning,进 Stage 6 或后续独立 "override fidelity" 批次。

## 4. B 类 — 结构充分性缺口(非 bug,归 Stage 5)

不作为 bug 立即修。IR 合法、视觉可预览,但**绝对布局不足以支撑高质量 React 结构生成**:

- **嵌套语义未知**:296 节点含 73 group + 37 frame、最深 11 层。Sketch 分组常是设计师随手
  编组,codegen 会把每层变成组件 / `<div>`。哪些分组是真实组件边界、哪些该拍平,IR 当前不区分。
- **布局是绝对坐标**:节点只有 `x/y/w/h`,raw 的 `resizingConstraint` / auto-layout 方向
  未进 IR。codegen 要推 flex / grid 缺少依据 —— 与 A5 同源(都没消费 Sketch 的尺寸 /
  约束语义)。

→ Stage 5 蓝图须正面回答:component-plan 如何判定组件边界;布局推断(绝对坐标 → flex /
grid)的能力与边界。建议在 Stage 5 蓝图开一节"布局推断能力缺口"承接本条。

## 5. 查过没问题的项(clean bill)

- **D1 / D2 已修**:41 个文字节点 0 个携带 `style.fills`(见 `stage-3-normalize-outline.md`
  §18 / `stage-4-preview-outline.md` §15)。
- **图片 ↔ asset 映射一致**:4 个 image 节点 / 3 个 distinct `assetRef` / 3 条 `visual.assets`。
- **文字内容无 fallback 误用**:raw 中 0 个文字图层缺 `attributedString.string`;
  `content === 图层名`(41 中 34 例)是 Sketch 把文字图层按内容自动命名的习惯,非
  `extractText` 回退 bug。
- **52 条 warning 全良性**:26 低置信语义候选(info)+ 25 隐藏节点跳过(info)+ 1 缺失
  symbol master(已知 —— 原 `.sketch` 内的悬空引用)。
- 颜色统一 `#RRGGBBAA`;borders(25 节点)/ effects(14)/ radius(64)均有覆盖。
- normalize 确定性:同 raw 跑两次字节级一致(`normalize.test.ts` 覆盖)。

## 6. 修复批次

| 批次        | 内容                                                            | 性质                                                             | 状态                                  |
| ----------- | --------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| **Batch 1** | A1 lineHeight、A2 fontWeight、A3 gradient → `fill.raw.gradient` | 必修,小而准;`extractText` / `normalizeFills`                     | ✅ 已完成(2026-05-22,test:sketch 33)  |
| **Batch 2** | A5 symbol instance scale transform                              | 必修,**单独做**;需专门 fixture + 回归测试;动代码前先深挖换算公式 | ✅ 已完成(2026-05-24,test:sketch 54) |
| **Batch 3** | A4 mask / clipping                                              | 须先设计 `VisualNode` mask schema 语义,再实现                    | ⬜ schema 设计先行                    |
| **Batch 4** | A6 symbolID / color / border override                           | 已知限制,保留 warning                                            | ⬜ 顺延(Stage 6 / 独立 override 批次) |

**批次纪律 —— 不散修、不混批**:Batch 1 三项同源(都在 `extractText` / `normalizeFills`),
可收进一个 commit;Batch 2 必须独立,因为它牵涉坐标换算、嵌套 symbol、override path、
`resizingConstraint`,混进 Batch 1 会让回归范围失控。

> ⚠️ **A5 是 Stage 5 前置阻断项 —— 必须在 Stage 5 蓝图定稿前修完。** 理由:Stage 5 的
> semantic / component-plan 直接消费 `visual` 树做组件抽象与列表项识别;若 symbol 缩放导致
> 子树错位,抽象会建立在错误布局上,codegen 把偏差一路放大。

**推进顺序**:Batch 1 → Batch 2 → Batch 3;Batch 4 顺延。每批次产出按 D1 / D2 先例补单测、
`tsc --noEmit` + `test:d2c` / `test:sketch` 全绿后提交。
