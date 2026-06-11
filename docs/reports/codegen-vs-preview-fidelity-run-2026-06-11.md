# Codegen vs Preview 全管线对比与优化计划

日期：2026-06-11
输入：`skills/sketch-to-component/resource/d2c.sketch`（375×1173 聊天页，248 节点）

## 本次运行

完整链路全部跑通，生成包零运行时错误（浏览器 console 干净，#77 import guard 有效）：

```text
extract   2 pages、5 assets、3 extracted images
contract  visual/semantic/interaction/component-plan + manifest
preview   3 real assets、0 placeholders、overrideApplied 13
approve   presentational sign-off
codegen   133 files、3 assets emitted（PR-2 资产通道已生效）
```

产物与对比报告（gitignored，可重跑复现）：

```text
.d2c-run-compare/                  # 管线产物（ir/ design-spec/ generated/ preview/）
.d2c-run-compare/harness/review.html   # baseline vs candidate 并排截图 + 逐节点 metrics
.d2c-run-compare/viewer/           # candidate vite 页面（launch.json: d2c-run-compare-candidate, :5181）
```

harness（`visual-harness:codegen --fixture .d2c-run-compare --candidate-url http://127.0.0.1:5181/`）
对 248 个语义节点做了逐节点对比：**全部节点 present，root 尺寸一致，relativeX/Y 零失败**
（PR-1 坐标基准修复 + PR-3 flex 投影在真实输入上成立）。剩余 **17 条失败，归因为两类**；
另有一类 harness 抓不到但截图可见。

## 差异根因（均已实证）

### A. codegen 丢渐变填充 —— 7 条 backgroundColor/color 失败（P0，最显眼）

IR 里渐变填充形如 `{ color: '#FA5900FF', type: 'gradient', raw.gradient: {...蓝色 stops} }`，
其中 `color` 是 Sketch 残留的旧实色。两端处理分叉：

- preview（`packages/d2c-core/src/preview/generate-preview.ts`）：shape 走 `linearGradientCss`
  （L525）输出 `background-image: linear-gradient(...)`；text 走 background-clip:text +
  transparent color（L256–271）。
- codegen（`packages/d2c-core/src/codegen/react/generate.ts` L196–198）：只读 `fills[0].color`
  输出 `background-color` —— **没有任何 gradient 分支**。

结果：蓝色渐变聊天气泡渲染成橙色实色（`#FA5900`），「推荐理由：」渐变标题变实色。
本设计稿共 **13 个渐变节点（含 1 个渐变文字）** 受影响。
实证节点：`node-e42a1d899004646b`、`node-0a87bce9…`（146.95deg 蓝渐变气泡）、
`node-79d2ea…`（180deg）、`node-3d37110c…`/`node-f42c8770…`（白色渐变遮罩）、
`node-58aaa0e0…`（92.31deg）、`node-2e8552af…`（渐变文字）。

### B. 字体解析依赖宿主文档 lang —— 9 条 rect width 失败（P0，影响所有文本测量）

两端输出的 CSS **逐字节一致**（`font-family: "PingFangSC"`，裸族名、无 fallback），文本内容
也一致，但 CDP `CSS.getPlatformFontsForNode` 显示实际命中字体不同：

| 页面             | 文档 lang               | 实际字体                              | 节点宽度 |
| ---------------- | ----------------------- | ------------------------------------- | -------- |
| baseline preview | `en`（index.html 写死） | Times + Songti SC（族名解析失败回退） | 223.98   |
| candidate viewer | `zh`                    | **PingFang SC**（命中）               | 237.94   |

把 baseline 的 lang 翻成 `zh` 后宽度精确变为 237.94 —— 9 条宽度失败 100% 由此解释。
Chromium 仅在中文文档语境下把 `"PingFangSC"` 别名解析到 PingFang SC。

两层含义：① **candidate 反而更接近设计意图**（Sketch 字体就是 PingFangSC-Regular），
baseline 才是错的；② 生成的组件包嵌入任意宿主页面，**lang 不受我们控制**，裸族名输出
让视觉保真依赖宿主——必须健壮化。

### C. 矢量节点缺 inline SVG —— harness 盲区，截图可见（P1）

- preview：shapePath/compoundSvgPath 渲染真实轮廓 inline `<svg>`（generate-preview.ts
  L115、L302–352，含 `svgGradientFill`）。
- codegen：`shouldRenderBoxFill`（generate.ts L171–179）对这些节点直接跳过填充，
  输出**空定位 div**，无任何视觉内容。

本设计稿 **38 个矢量节点**受影响：深度思考的 caret ▾、底部 tab 图标、语音输入图标、
状态栏 wifi/电池等全部缺失。harness 没抓住是因为空 div 的背景色两边都透明，
而它不比较节点子树是否有可见绘制内容。

### D. harness 自身盲区（P1，伴随修复）

- 矢量内容不可见性检不出（见 C）；
- baseline 与 candidate 文档 lang 不一致，字体噪声会掩盖真正的布局回归（见 B）；
- 无像素级 diff 兜底。

## 优化计划（分 PR，范围严格不混）

延续 fidelity 分 PR 惯例；所有 PR 保留 #77 import guard 及其回归测试，
codegen 坐标永远 parent-relative 直接定位（勿回退 PR-1）。

### PR-G1（P0）：codegen 渐变填充对齐 preview

- 把 `linearGradientCss`（+ 渐变 stop 解析）从 `generate-preview.ts` 提为共享纯函数
  （建议 `packages/d2c-core/src/utils/` 或新建 `src/style/`，preview 与 codegen 同源消费）。
- `visualStyleDeclarations`：`fills[0].type === 'gradient'` → `background-image: linear-gradient(...)`；
  解析失败/radial/angular 回退 `fill.color` 实色（与 preview 同语义，不静默丢色）。
- `textStyleDeclarations`：渐变文字 → background-clip:text + transparent，落不出渐变时回退实色。
- 回归测试用真实节点数值（146.95deg、#689DFF→#277DFF 气泡；渐变标题文字）。
- 验收：harness 7 条 backgroundColor/color 失败清零；两端 CSS 渐变值逐字节同源。

### PR-G2（P0）：字体栈健壮化 + 文档 lang 对齐

- 渲染端（preview + codegen 同改）输出健壮 font stack：维护小型别名表
  （`PingFangSC` → `"PingFang SC", "PingFangSC"`），尾部统一追加 `sans-serif`。
- preview `index.html` 的 lang 不再写死 `en`（取设计源语言或可配，默认 zh 数据集应为 zh）。
- harness：baseline 与 candidate 页面 lang 钉死一致，消除测量噪声。
- 验收：9 条宽度失败清零；且把 candidate viewer 改成 `lang="en"` 复测仍零宽度失败
  （证明不再依赖宿主 lang）。

### PR-G3（P1）：矢量节点 inline SVG 输出

- 把 preview 的 vector/compound SVG 构建（L302–352 + `svgGradientFill`）抽为共享纯函数，
  codegen 在 TSX 里输出 inline `<svg>`（保持单文件、确定性；不引第三方）。
- 影响 38 节点；caret/图标/状态栏可见。
- 验收：候选页与 baseline 截图矢量区域一致；新增「矢量节点有可见绘制内容」metric 后零失败。

### PR-G4（P1）：harness 盲区补强

- 新 metric：对 semantic 覆盖节点断言「baseline 有可见绘制内容（svg/背景图/文本）时
  candidate 同样有」；可选 per-node 像素 diff 兜底（阈值化，避免反锯齿噪声）。
- 把真实 `design-ir.json`（可提交，`.sketch` 不可）纳入 fixture，CI visual gate 从
  synthetic golden 升级为真实输入回归基线（呼应 2026-06-06 审计 P0-2）。

### 后置（不进本轮）

- radial/angular 渐变（CSS conic-gradient 可覆盖 angular，preview 同步提升）；
- border position（inside/center/outside → box-shadow/outline 映射）；
- 组件语义化命名（审计 P1-5）；layoutPlan 更多 strategy 投影。

## 复现

```bash
TSX=node_modules/.bin/tsx; CLI=skills/sketch-to-component/scripts/src/cli.ts
$TSX $CLI extract  --file skills/sketch-to-component/resource/d2c.sketch --out .d2c-run-compare
$TSX $CLI contract --file skills/sketch-to-component/resource/d2c.sketch --out .d2c-run-compare \
  --mode presentational --interaction-mode deferred \
  --approval-reason "full pipeline compare run" --approved-by blade --approved-at 2026-06-11T00:00:00Z
$TSX $CLI preview  --design-ir .d2c-run-compare/ir/design-ir.json --out .d2c-run-compare/preview --assets .d2c-run-compare/ir/assets
$TSX $CLI approve  --spec .d2c-run-compare/design-spec --approved-by blade --approved-at 2026-06-11T00:00:00Z --acknowledge-behavior-stubbed
$TSX $CLI codegen  --spec .d2c-run-compare/design-spec --design-ir .d2c-run-compare/ir/design-ir.json --assets .d2c-run-compare/ir/assets --out .d2c-run-compare/generated
cp .d2c-run-compare/ir/design-ir.json .d2c-run-compare/design-ir.json && ln -sfn ir/assets .d2c-run-compare/assets
# 起 candidate viewer（一个只渲染生成包根组件的 vite 页面，复用 fixtures 已装的 react/vite）：
fixtures/apps/react-vite/node_modules/.bin/vite --config .d2c-run-compare/viewer/vite.config.mjs  # :5181
# 然后跑 harness：
$TSX skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts \
  --candidate-url http://127.0.0.1:5181/ --fixture .d2c-run-compare --out .d2c-run-compare/harness
```
