# Stage 4 蓝图 — Visual View 派生 + HTML 预览(门禁 1)

> 本文是 [`design-source-to-component-implementation-plan.md`](./design-source-to-component-implementation-plan.md)
> Stage 4 的详细蓝图。状态:**已定稿,可实现**(review 通过,2026-05-21)。
>
> Stage 4 是**共享管线**的第一阶段——代码在 `packages/d2c-core/`,provider 中立(吃 canonical
> `design-ir.json`,与 Sketch/MasterGo 无关)。具体渲染细则在实现时对脱敏 fixture 派生出的
> `design-ir.json` 做 TDD 长出。

---

## 1. 定位与范围

Stage 4 = 把 canonical `design-ir.json` 派生成可视觉评审的 **HTML 预览**,并停在**门禁 1**。

**做**:`design-ir.json` → `visual-view.json`(派生视图)→ `preview/index.html` + `preview.css`

- `visual-review-report.md`;停在门禁 1,返回 `requiresApproval`。

**不做**:`semantic-view` / `interaction-spec` / `component-plan`(Stage 5);代码生成(Stage 6);
自动截图 diff(见 §3 决策,后置)。

**标准**:产出一份**能让人打开浏览器做视觉评审**的预览——布局、文本、样式、结构对参考设计
忠实;图片可用占位。**不追求像素级**。

## 2. 输入 / 输出契约

```
输入:  design-ir.json(d2c-core DesignIR v0.2.0)
输出:  ir/views/visual-view.json   (派生视图)
       preview/index.html
       preview/preview.css
       preview/assets/             (占位资源,见 §8)
       preview/visual-review-report.md
门禁:  生成后停止,返回 requiresApproval='gate-1';人如何确认由 CLI/skill 驱动,core 不管交互
约束:  derive-visual-view / generate-preview 确定性(同 design-ir → 同 HTML/CSS)
```

## 3. 核心决策(已定 — review 通过,2026-05-21)

> 以下 5 项均按推荐定稿;下文正文已按这些结论编写。

1. **资源** —— 推荐 **placeholder-first**:`image` 节点在预览里渲染成带尺寸/asset-id 的占位块,
   不导出真实图片。理由:真实字节不在 `design-ir.json` 里(Stage 2 只留 manifest),导出需重开
   `.sketch`、实现 `Provider.exportAssets`——是独立一块。`d2c.sketch` 仅 3 张位图,占位损失小;
   矢量/形状/文本/symbol 图标都能正常渲染。真实资源导出**后置**为 Stage 4 之后的小专项。
2. **visual-view 的 body 结构** —— 推荐**复用 `VisualBlock`**:`derive-visual-view` 产出的还是
   `{artboard, root, assets}` 同形树,只是 symbol override 已应用、asset 已解析。d2c-core 把
   `VisualViewSchema.body` 收紧成 `VisualBlockSchema`,不另造一套渲染节点。
3. **自动截图 diff** —— 推荐 **Stage 4 不做**。门禁 1 本质是**人**打开 `index.html` 看。自动像素
   diff 需 headless 浏览器(重依赖)+ 噪声阈值调参,后置为独立专项。
4. **preview CSS** —— 独立 `preview.css`(每节点一条类规则),`index.html` 引用——遵架构
   "HTML Preview Gate" 的 `preview/index.html` + `preview/preview.css`。
5. **pipeline runner 范围** —— Stage 4 只做 `design-ir.json → 预览产物 + 门禁1 信号`的**薄入口**;
   完整 extract→normalize→preview→codegen runner 后置。

## 4. 4A — `derive-visual-view`

`design-ir.json.visual` → `visual-view.json`。派生不是简单复制,要做两件实事:

- **应用 symbol override**(Stage 3 遗留,本阶段**必做**,见 §6)。
- **解析 asset 引用**:`VisualNode.assetRef`(= `AssetEntry.id`)对应到 `visual.assets` 的条目;
  预览阶段标注其为占位(§8)。
- 产出 render-ready 的 `VisualBlock` 同形树(决策 #2)。

`visual-view.json` 用 d2c-core 现有的 `VisualViewSchema` 信封:`{ kind:'visual-view',
generatedFrom, body }`,Stage 4 把 `body` 收紧为 `VisualBlockSchema`。

## 5. `visual-view.json` 结构

```ts
VisualView {
  kind: 'visual-view'
  generatedFrom: { schemaVersion, sourceRef?, designIrHash? }   // d2c-core GeneratedFromSchema
  body: VisualBlock        // { artboard, root, assets } —— override 已应用、asset 已解析
}
```

d2c-core 改动:`views.ts` 的 `VisualViewSchema.body` 从 `record(unknown)` 收紧为
`VisualBlockSchema`(复用 `visual.ts`),补单测。`design-ir` schemaVersion **不变**(v0.2.0;
visual-view 不是 design-ir)。

## 6. symbol override 应用(Stage 3 遗留,必做)

Stage 3 把 symbol 实例**就地展开成 master 默认子树**,override 只存进 `VisualNode.symbol.overrides`
(`{path, value}[]`),未应用。Stage 4 `derive-visual-view` 必须应用,否则被 override 的实例在
预览里显示 master 默认内容(多个气泡同一句默认文案)。

**范围**(务实):

- **文本 override 切实应用** —— 把 `value` 是文本的 override 落到展开子树里对应的 `text` 节点。
  这是高价值、常见的一类(聊天气泡、酒店名等)。
- **图片 / 嵌套 symbol 替换 override** —— best-effort;映射不到就记一条 warning,不强求。
- override 的 `path` ↔ 子树节点的对应是最 fiddly 的一环(Sketch 的 `overrideName` 编码)——
  映射不上的 override 一律 warning,不静默。

## 7. 4B — `generate-preview`(HTML / CSS 映射)

`visual-view.body` 的节点树 → `index.html` + `preview.css`。映射规则要点:

- **节点 → 元素**:`frame`/`group`/`shape`/`vector` → `<div>`;`text` → `<div>`(含文本);
  `image` → 占位 `<div>`(§8)。
- **定位**:每节点 `position:absolute; left/top/width/height` 取自 `layout`(局部坐标,
  Stage 3 §5 已定);父节点 `position:relative`。根 = 画板,尺寸 `artboard.width × height`。
- **样式 → CSS**:`fills[0]` → `background-color`(**仅盒子型节点** —— `text` 节点与
  `shapeGroup`/`shapePath` 矢量图标不画背景,见 §15 D2);`borders` → `border`;
  `effects` → `box-shadow`;`radius` → `border-radius`;`opacity`。
- **CSS 独立**:每节点一条类(按 `node.id`),`index.html` 引用 `preview.css`(决策 #4)。
- **确定性**:节点遍历按 children 顺序(已是渲染序),类名/规则顺序稳定。

## 8. 资源处理(placeholder-first)

- `image` 节点 → `preview/assets/` 下一个占位(如带 `asset-id` 与尺寸标注的 SVG/灰块),
  `index.html` 引用它。
- `visual-review-report.md` 列出所有占位项,提醒评审者"图片内容未还原"。
- 真实资源导出(`Provider.exportAssets` 重开 `.sketch` 取字节)**后置**。

## 9. `visual-review-report.md`

给人类评审者的 markdown 摘要:画板尺寸、节点数、文本节点数、占位图片清单、从 `design-ir.json`
带过来的 `warnings`(尤其 symbol override 未映射、missing-asset 等)、已知不还原项。让评审者
知道该重点看什么、哪些是已知偏差。

## 10. 4C — 门禁 1 + CLI + 薄 pipeline 入口

- d2c-core 加薄入口 `runPreview(designIr) → { visualView, html, css, report, requiresApproval:'gate-1' }`
  ——纯产出,**不做人机交互**(遵 core-headless 原则)。
- CLI:在 `skills/sketch-to-component/scripts/src/cli.ts` 加 `preview` 子命令
  (`preview --design-ir <path> --out <dir>`),调用 d2c-core 写 `preview/*` + `ir/views/visual-view.json`,
  打印"门禁 1:请打开 `preview/index.html` 评审,通过后再进 Stage 5"。
- 门禁 1 = 人打开 `index.html` 看 + 读 report。Stage 5 未实现前,无需自动 gate-passing 机制。

## 11. 执行顺序 — 4A / 4B / 4C(一个 Stage)

| 子段   | 内容                                                                                        |
| ------ | ------------------------------------------------------------------------------------------- |
| **4A** | d2c-core `VisualViewSchema.body` 收紧 + `derive-visual-view`(含 symbol override 应用)+ 单测 |
| **4B** | `generate-preview`(HTML/CSS 映射)+ `visual-review-report` + 单测                            |
| **4C** | `runPreview` 薄入口 + CLI `preview` 子命令 + 门禁 1 信号                                    |

## 12. 模块与文件

**d2c-core**(`packages/d2c-core/src/preview/`,新目录):

| 文件                      | 职责                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `derive-visual-view.ts`   | `design-ir.json` → `visual-view`(应用 override、解析 asset) |
| `apply-overrides.ts`      | symbol override 应用(§6)                                    |
| `generate-preview.ts`     | `visual-view` → `index.html` + `preview.css`                |
| `visual-review-report.ts` | 生成 `visual-review-report.md`                              |
| `run-preview.ts`          | 薄入口:`design-ir` → 全部预览产物 + `requiresApproval`      |

d2c-core `ir/views.ts`:收紧 `VisualViewSchema.body`。

**Sketch provider scripts**:`cli.ts` 加 `preview` 子命令(仅 CLI 接线,逻辑在 d2c-core)。

## 13. 测试方案 + 验证

- **离线单测**(对 Stage 3 的脱敏 fixture 派生出的 `design-ir.json`):`derive-visual-view`
  (override 应用、asset 解析)、`apply-overrides`、`generate-preview`(HTML/CSS 映射快照)、
  `visual-view` 过 `VisualViewSchema`。
- **确定性**:同 `design-ir.json` 跑两次 → `index.html`/`preview.css`/`visual-view.json` 字节级一致。
- **d2c-core 单测**:收紧后的 `VisualViewSchema` 正/反例。
- **端到端**(本地):`extract → normalize → preview` 对真实 `d2c.sketch` 跑通,人工打开
  `index.html` 抽查对参考设计是否忠实。
- `tsc --noEmit` 干净;`test:d2c` / `test:sketch` 全过。

## 14. 出口标准

- d2c-core `VisualViewSchema.body` 收紧为 `VisualBlock`,单测覆盖。
- `derive-visual-view` 应用 symbol 文本 override;映射不上的 override 记 warning。
- `generate-preview` 产出 `index.html` + `preview.css`,布局/文本/样式对参考设计忠实。
- `visual-review-report.md` 列出占位与 warning。
- `runPreview` 返回 `requiresApproval='gate-1'`;CLI `preview` 子命令可用。
- 预览产物确定性可复跑;`tsc --noEmit` 干净;两个测试套件全过。
- 真实 `d2c.sketch` 端到端 `extract → normalize → preview` 产出可评审的 `index.html`。
- 里程碑:据此发首版 `sketch-to-component/SKILL.md`(或架构文档),描述明确写"到预览门禁为止"。

## 15. 缺陷修订(预览评审发现)

> 对真实 `d2c.sketch` 预览做视觉评审时发现的预览层缺陷,逐条标注发现时机,记此备后续 review。

**D2 — `fills[0]` 无差别映射成 `background-color`**

- **现象**:① "根据您历史订单…"等文字节点变纯色块(详见 Stage 3 蓝图 §18 D1);
  ② 状态栏 wifi/信号、评分心形等矢量图标渲染成实心彩色方块。
- **根因**:原 §7 "`fills[0]` → `background`" 对所有节点 kind 一视同仁。文字节点的 fill
  本不该当背景;`shapeGroup`/`shapePath`(矢量图标碎片)用包围盒填充会得到误导性实心块。
- **蓝图缺陷**:§7 样式映射未按节点 kind 区分。
- **修订**:`generate-preview.ts` 增 `shouldRenderBoxFill(node)` —— `text` 节点、以及
  `source.originalType` 为 `shapeGroup`/`shapePath` 的 shape 节点不输出 `background-color`。
  补 `generate-preview.test.ts` 两条单测(文字 / 矢量节点不出背景)。文字侧的根因另在
  Stage 3 normalize 一并修掉(见 Stage 3 蓝图 §18 D1),此处为消费端防御,二者并存。
- **遗留**:矢量图标目前渲染为"空白"(不画实心块);真实图标还原需 SVG 资源导出 ——
  已在 §8 列为 Stage 4 之后的后置专项。

**D3 — 定宽文字盒 + `white-space: pre-wrap` 把字形裁掉**(2026-05-22,Batch 1 后复跑预览发现)

- **现象**:酒店价格 `643.08` 在预览里渲染成 `643.0`,末位 `8` 丢失。IR 保真审计 Batch 1
  (A2 正确补上 `fontWeight`)后复跑预览复查时发现。
- **根因**:`generate-preview`(§7)给文字节点设 `white-space: pre-wrap`,叠加定宽定高盒 +
  `.d2c-node { overflow: hidden }`。当渲染字体与设计字体度量不一致时(headless 浏览器无
  `DINAlternate`,改用更宽的替代字体;Batch 1 又正确补了 `font-weight:700` 使替代字体更宽),
  文本超出 Sketch 量得的盒宽 → `pre-wrap` 触发换行 → 第二行被固定高度 + `overflow:hidden`
  裁掉。
- **非 IR 缺陷**:`design-ir.json` 内容 `643.08`、`width:43`、`fontWeight:700` 均正确 ——
  这是**预览渲染保真问题**;Batch 1 让 IR 更准,反而暴露了预览生成器的这一弱点。
- **蓝图缺陷**:§7 文本映射默认浏览器字体度量与设计一致;无设计字体时"定宽盒 + `pre-wrap` +
  裁剪"会裁字。
- **修订(待定,非平凡)**:候选方向 —— ① 文字节点改 `white-space: pre`(但多行气泡靠自动
  换行,不能一刀切)② 预览不对文字盒做高度裁剪 ③ 嵌入 / 替换真实设计字体。**优先级低于 IR
  修复批次,顺延**;根治方案留待后续 Stage 4 预览增强专项里定。
