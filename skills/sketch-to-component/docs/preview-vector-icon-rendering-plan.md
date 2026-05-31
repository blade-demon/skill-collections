# Preview 矢量图标渲染方案

> 状态:方案(待 review,后实现)
> 范围:normalize（Sketch）→ d2c preview 的矢量形状(图标、评分心形/星星等)
> 动机:位图已能渲染真图([PR #61](https://github.com/blade-demon/skill-collections/pull/61) / [PR #62](https://github.com/blade-demon/skill-collections/pull/62)),但矢量图标仍为空/占位,preview 上方图标、评分星标缺失
> 关联:延续 [preview-real-image-assets-plan.md](./preview-real-image-assets-plan.md)

## 1. 现状(代码事实)

- preview 里的图标/评分心形都是 **`symbolInstance`**(如 `icon/导航栏/返回`、`icon/首页/星星`、`评分icon`),展开后内部是 **`shapePath` / `shapeGroup` / `oval` / `rectangle`** 矢量形状。本样例:127 个 shape 节点,其中 44 个 shapePath、12 个 shapeGroup。
- **IR 已丢弃矢量路径几何**:`visual-view` 里的 shapePath 节点只剩 `style`(fills / opacity / raw),没有任何 `points` / 路径数据。normalize 的 `extractStyle` 只保留 fills/borders/effects/opacity/radius/raw。
- **原始 DSL 保留完整贝塞尔几何**:shapePath 带 `points[]`,每个 `curvePoint` 含 `point` / `curveFrom` / `curveTo` / `hasCurveFrom` / `hasCurveTo` / `curveMode` / `cornerRadius`,外加 `isClosed`(本样例某图标 16 个点)。坐标是相对节点 frame 归一化的 0..1。
- **preview 主动跳过复杂矢量**:[generate-preview.ts](../../../packages/d2c-core/src/preview/generate-preview.ts) 的 `shouldRenderBoxFill()` 对 `shapegroup` / `shapepath` 返回 false,所以这些节点既不画盒子也无路径,等于不可见。
- 位图(`bitmap` → image)走的是 PR #61/#62 的真图路径,与本方案无关。

结论:**矢量图标无法靠位图字节还原(Sketch 不预渲染图标 PNG);唯一真渲染路径是「保留贝塞尔几何 → preview 输出内联 SVG `<path>`」。**

## 2. 目标 / 非目标

**目标**

- normalize 保留 `shapePath` / `shapeGroup` 的路径几何到 IR;
- preview 对矢量节点输出内联 SVG(`<path d=...>`),按其 fill/gradient 上色,几何与设计一致;
- 覆盖 symbol 内嵌图标(normalize 已展开 symbol,几何保留后自然覆盖)。

**非目标**

- 不处理位图(已由 PR #61/#62 覆盖);
- 不做 codegen 矢量产出(codegen 暂不渲染视觉样式,后续单独对齐);
- 不追求 Sketch 全部矢量特性(布尔运算 shapeGroup 的 even-odd / 多子路径合并先尽力而为,复杂情形降级 + 警告)。

## 3. 方案(SVG path 重建)

1. **normalize 保留几何。** `extractStyle` / 节点构建处提取 `shapePath` 的 `points[]`(point/curveFrom/curveTo/hasCurveFrom/To/curveMode/cornerRadius)与 `isClosed`,存入 IR。需扩展 IR:`VisualNode` 增加可选 `vector?: { path: VectorPath }`(或 `Style.vector`),`VectorPath` 描述子路径与点。坐标保持归一化 0..1(渲染时再乘 frame)。
2. **shapeGroup 合并。** 一个 shapeGroup 可含多条子 `shapePath` + 布尔操作;先按「多条独立子路径 + nonzero/evenodd 填充规则」尽力还原,无法处理的布尔运算降级为各子路径叠加并发 info 警告。
3. **preview 输出内联 SVG。** [generate-preview.ts](../../../packages/d2c-core/src/preview/generate-preview.ts) 对带 `vector` 的节点,在该节点 `<div>` 内输出一个 `<svg viewBox=...><path d=... fill=...>`:
   - 归一化点 → 绝对坐标:`x*frame.width`、`y*frame.height`;
   - `hasCurveFrom/To` 决定段是直线(`L`)还是三次贝塞尔(`C`,控制点取 curveFrom/curveTo);
   - `isClosed` → `Z`;fill 取节点 fill(纯色/渐变,渐变复用现有 `linearGradientCss` 逻辑或 `<linearGradient>`)。
   - 放开 `shouldRenderBoxFill` 对 shapePath/shapeGroup 的跳过(改为走 SVG 分支)。

## 4. 取舍 / 风险

- **IR schema 扩展**(新增 `vector`/`VectorPath`)牵动 `ir` 校验、`design-ir`/`visual-view` 的 hash 稳定性与既有 golden(需同步更新预期)。
- **贝塞尔坐标换算**(归一化点 + curveFrom/curveTo + curveMode + isClosed)是新逻辑,边界多:开放路径、单点、cornerRadius 圆角、shapeGroup 多子路径与布尔运算。
- **体积**:内联 SVG 会增大 HTML;图标通常点数不多,可接受;必要时按节点数设上限并降级。
- **确定性**:路径 `d` 串需固定小数精度(复用现有 `formatNumber`/`roundTo`)以保证 byte-stable。
- **降级策略**:任何无法可靠重建的矢量节点 → 回退现状(不画)并发 `vector-path-unsupported` info 警告,绝不报错中断。

## 5. 实现拆分(建议分 PR)

- **PR-1(normalize 保留几何 + IR 扩展):** 提取 shapePath/shapeGroup 几何进 IR;扩展 schema + 校验;补 normalize 单测;更新受影响 golden/hash。
- **PR-2(preview SVG 渲染):** 归一化点 → SVG path 转换器 + 内联 `<svg>` 输出;放开 shapePath/shapeGroup 跳过;补 preview 单测(直线/曲线/闭合/渐变填充/降级回退)。

## 6. 验证

- `npm run test:sketch` / `npm run test:d2c` / `npm run check:fixtures` / `npm run check:full`
- 端到端:`extract → normalize → preview`(用 `resource/d2c.sketch`),无头 Chrome 截图确认顶部图标、评分星标/心形按设计渲染,降级节点不报错。
- 新增:贝塞尔换算单测(已知点集 → 期望 `d` 串)、shapeGroup 多子路径用例、降级回退用例。
