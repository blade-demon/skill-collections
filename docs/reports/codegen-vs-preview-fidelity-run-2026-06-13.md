# Codegen vs Preview 全管线对比与产物质量(S-PR-1 折叠落地后)

日期：2026-06-13
输入：`skills/sketch-to-component/resource/d2c.sketch`（375×1173 聊天页，248 语义节点）
对比基线：[2026-06-11 run](codegen-vs-preview-fidelity-run-2026-06-11.md)（S-PR-1 折叠合入前）

## 本次运行

完整链路全部跑通，生成包零运行时错误（候选页 console 干净，#77 import guard 持续有效）：

```text
extract   2 pages、5 assets、3 extracted images
contract  visual/semantic/interaction/component-plan + manifest（含 S-PR-1 折叠产物）
approve   presentational sign-off
preview   3 real assets、0 placeholders
codegen   121 files、3 assets emitted
```

产物（gitignored，可重跑复现）：`.d2c-run-compare/{ir,design-spec,preview,generated,harness,viewer}`，
harness 并排报告 `.d2c-run-compare/harness/review.html`，候选 vite 页 `:5181`。

## 视觉保真（harness 逐节点，248 节点，17 条失败）

**结构与布局零回归**：全部节点 present，root 尺寸一致，relativeX/Y 零失败——
PR-1 坐标基准 + PR-3 flex 投影在真实输入上依旧成立。

17 条失败与 [06-11 run](codegen-vs-preview-fidelity-run-2026-06-11.md) **同源同量**，
两类根因 G1/G2 仍未修：

- **7 条渐变/颜色失败（G1 未做，最显眼）**：codegen 只读 `fills[0].color` 输出实色，
  无 gradient 分支。蓝色聊天气泡（`#689DFF→#277DFF`，146.95deg）在候选页渲染成
  **橙色实色 `#FA5900`**，「推荐理由：」渐变文字变实色。codegen CSS 中 `linear-gradient`
  出现 **0 次**，preview 中通过 `linear-gradient` / background-clip:text 正确渲染。
  截图直观可见：baseline 气泡为蓝，candidate 气泡为橙。
- **10 条宽度失败（G2 未做）**：两端 CSS 逐字节一致（裸族名 `"PingFangSC"`），
  差异来自宿主文档 lang——baseline `lang=en` 解析失败回退（223.98），
  candidate `lang=zh` 命中 PingFang SC（237.94）。**candidate 反而更贴近设计意图**，
  但裸族名让保真依赖宿主 lang，仍需健壮化。

**矢量缺失（G3 未做，harness 盲区，截图可见）**：preview 输出 **38 个 inline `<svg>`**，
codegen 输出 **0 个**。矢量节点（深度思考 caret、底部 tab 图标、状态栏 wifi/电池、
语音输入图标）在候选页是空 div；仅 4 个走 `role="img"`+aria-label，其余裸空 div。

## React codegen 产物质量

### 形（像素）：见上，G1/G3 是主要缺口。

### 魂（工程语义）：S-PR-1 折叠已进 plan，但 codegen 尚未消费（S-PR-2 范围）

component-plan 已带折叠契约：**3 个 componentDefinition、8 个 componentInvocation、
3 组 fallback**（酒店卡、缩放 Icon、SuggestedPrompt 按不兼容原因稳定回退）。
3 个 definition 对应 `StatusBar`(×2)、`Icon`(×3)、`ArrowIcon3`(×3) 三个 symbol master。

**但 codegen 不消费 definition/invocation**，导致折叠在产物里呈半成品、且不对称：

- 每个 definition 的**代表实例**渲染为命名组件并被 import 一次（`<StatusBar/>`、`<Icon/>`、
  `<ArrowIcon3/>` 各 1 次）；
- 其余 **5 个非代表实例已从 `body.components` 移除**，codegen 没有对应组件，于是把它们的
  子树**内联**进父组件。例如根组件里第二个状态栏（`node-9dda5a52`）展开成 7 个内联 div、
  重复出现 `'9:41'`，与同级干净的 `<StatusBar/>` 形成强对比。

净效果：文件数 133→121（折叠移除约 4 个组件的文件），但**生成代码可读性在折叠组上反而更乱**
（一处复用、一处内联重复）。这是 S-PR-1/S-PR-2 既定边界的预期表现，需要 S-PR-2 让
codegen 消费 invocation（重复实例统一渲染为 `<Definition .../>`）才能兑现复用价值。

### 其余工程语义现状（与 06-11 一致）

| 维度     | 现状                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------- |
| 标签语义 | **285 个元素全是 `<div>`**（0 span / 0 button/img/input/ul/li）                                      |
| 数据流   | **0 props，文案/数字全写死**（deferred 模式不产 props）                                              |
| 命名     | 代表组件命名尚可（`StatusBar`/`ArrowIcon3`），其余仍是哈希/序号（`Nodea973bae5`、`Icon4–10`、`Ai2`） |
| 布局     | 仍以 absolute 定位为主（flex 仅 stack/inline 推断处）                                                |

## 结论与建议优先级

- **管线健康**：全链路跑通、零运行时错误、布局零回归、确定性折叠产物正确。
- **P0 G1 渐变**：最显眼的像素缺陷（橙色气泡），建议把 preview 的 `linearGradientCss`
  提为共享纯函数供 codegen 同源消费。
- **P0 S-PR-2 codegen 消费折叠**：当前折叠只在 plan 层、产物层呈不对称半成品，
  价值未兑现且可读性反降；让 codegen 把 invocation 渲染为复用调用是兑现 S-PR-1 的前提。
- **P1 G3 矢量 inline SVG / G2 字体栈健壮化**：分别消除矢量缺失与宿主 lang 依赖。
