# Preview 真实图片渲染方案

> 状态:方案(待实现)
> 范围:extract（Sketch）→ d2c preview 的图片资源
> 动机:preview 现在把所有图片画成灰色占位 SVG,酒店照片/图标/评分等全成破图,严重影响肉眼评审
> 关联:延续聊天气泡保真度调研 [chat-bubble-tail-fidelity-investigation.md](./chat-bubble-tail-fidelity-investigation.md)

## 1. 现状(代码事实)

- `.sketch` 内含真实位图(本样例 `images/*.png` 共 3 张,约 2.3MB)。
- [open-sketch-file.ts](../scripts/src/open-sketch-file.ts) 用 `fflate.unzipSync` 把**整个 zip(含 `images/`)解压进内存** `entries: Map<string, Uint8Array>`。
- [acquire-from-file.ts](../scripts/src/acquire-from-file.ts) 已按 `images/` 前缀识别图片并遍历到其 `bytes`。
- **但 extract 只输出 `raw-dsl.json`,图片字节读完即丢**;normalize / preview 全程拿不到原图。
- preview 因此对每个 image 节点生成灰色占位 SVG([generate-preview.ts](../../../packages/d2c-core/src/preview/generate-preview.ts) `renderPlaceholderSvg`)。
- 附带既有缺口:design-ir 的 `body.assets` 当前为空(normalize 未把资源登记进去,仅发 `missing-asset` 警告),`AssetEntry.originalPath` 未可靠映射到 zip 内路径。

结论:**真图就在解压后的内存里,preview 拿不到只是"没传下去",而非拿不到。**

## 2. 目标

- preview 对 image 节点**优先渲染真实图片**;
- 真图不可得时**回退**现有占位 SVG(不删除占位逻辑);
- 保持 extract / normalize 输出的确定性,不破坏既有 golden 与 `check:fixtures`。

## 3. 非目标

- 不处理矢量导出(shape/vector)转 SVG;本方案只针对位图(`bitmap` → image)。
- 不改 codegen(codegen 目前不渲染视觉样式,后续单独对齐)。
- 不做图片压缩 / 缩放优化(后续可选)。

## 4. 方案

1. **extract 落盘真图。** extract 阶段把内存中的 `images/*` 字节写入产物 assets 目录(如 `<out>/assets/<id>.<ext>`),字节已在手,成本极低。产出清单里登记每个资源的输出相对路径。
2. **打通资源登记链路。** 让 raw 模型的 assets 真正传入 normalize,使 `AssetEntry` 带上 `originalPath`(zip 内路径)与稳定 `id`;design-ir `body.assets` 不再为空。
3. **preview 优先真图 + 回退。** image 节点解析其 `assetRef → AssetEntry → 落盘文件`:
   - 命中真图:`background-image: url(./assets/<id>.<ext>)`;
   - 未命中(缺失/外部/override 未解析):保留现有占位 SVG。
   - preview 产物把真图随包拷出(引用相对路径,**不 base64 内联**,避免 HTML/CSS 膨胀)。

## 5. 取舍 / 风险

- **保留占位作为 fallback**——符号 override、外部图、缺失图仍需兜底。
- **拷贝文件、引用相对路径,不内联**——本样例约 2.3MB,内联会撑爆 HTML/CSS。
- **确定性**:preview 不像 codegen 那样逐字节比对;真图是固定字节、拷贝即可,但需确认 `check:fixtures` / 既有 preview 测试不受影响。
- **资源登记改动**会影响 design-ir 的 `body.assets`(从空变非空),需同步更新相关单测 / hash 预期。
- **体积**:产物目录会带上真图;在 `.gitignore` 与文档里说明生成物不入库。

## 6. 实现拆分(建议分 PR)

- **PR-1(extract + asset 登记):** extract 落盘 `images/*`;打通 raw assets → `AssetEntry.originalPath`;补 extract / normalize 单测;design-ir `body.assets` 非空。
- **PR-2(preview 渲染):** preview 优先真图 + 占位回退;真图随产物拷出;补 preview 单测(真图命中 / 缺失回退两路)。

## 7. 验证

- `npm run test:sketch` / `npm run test:d2c` / `npm run check:fixtures` / `npm run check:full`
- 端到端:`extract → normalize → preview`(用 `resource/d2c.sketch`),无头 Chrome 截图确认酒店照片/图标显示真图、缺图节点仍为占位。
