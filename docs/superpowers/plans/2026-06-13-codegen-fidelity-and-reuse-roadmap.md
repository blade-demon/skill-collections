# Codegen 保真与复用修复路线图(G1/G2/G3 + S-PR-2)

日期：2026-06-13
依据：[2026-06-13 全管线对比报告](../../reports/codegen-vs-preview-fidelity-run-2026-06-13.md)
背景：[2026-06-11 first run](../../reports/codegen-vs-preview-fidelity-run-2026-06-11.md) 已定义 G/S 双轴策略。

> 这是**任务级路线图**,不是逐步 TDD 计划。每项给目标/根因/做法/文件/验收/规模,
> 落地时各自展开成 `docs/superpowers/plans/` 下的实现计划并独立成 PR。

## 总目标

让 React codegen 产物在「形」(像素保真)与「魂」(工程语义)两轴向 preview 对齐:
消除橙色气泡(渐变)、缺失图标(矢量)、字体宿主依赖三个像素缺陷,并让 S-PR-1 的折叠
契约在 codegen 产物层真正兑现(复用而非内联重复)。

## 不变量(每个 PR 都必须保持)

- 保留 #77 child import guard 及其回归测试;codegen 坐标永远 parent-relative 直接定位(勿回退 PR-1)。
- 确定性:同输入 ⇒ 字节一致产物;新增排序用码元比较,勿用 `localeCompare`(见 [[skill-collections-worktree-name-pitfall]] 同源的确定性纪律)。
- 范围严格不混:一 PR 一关注点;golden 只随对应 PR 变更。
- 共享逻辑走纯函数:G1/G3/G2 统一把 preview 的渲染逻辑提到 `packages/d2c-core/src/style/`(新建),
  preview 与 codegen **同源消费**,杜绝两端分叉再漂移。

## 依赖与推荐顺序

```
G1 渐变 ─┐
G3 矢量 ─┼─(三者互相独立,但都改 generate.ts / generate-preview.ts,串行避免冲突)
G2 字体 ─┘
          └────▶ S-PR-2 codegen 消费折叠(放最后:代表组件先拿到正确渐变+矢量,再被 8× 复用)
```

推荐落地顺序:**G1 → G3(+harness 可见性 metric) → G2 → S-PR-2**。
理由:G 系列小而确定、先行清像素债;S-PR-2 大且跨链路,等代表组件视觉正确后再折叠,
避免「把一个还在渲染橙色气泡的组件复用 8 次」。

---

## PR-G1(P0):codegen 渐变填充对齐 preview

- **根因**:codegen [`generate.ts:197-198`](../../../packages/d2c-core/src/codegen/react/generate.ts) 只读 `fill.color`
  输出 `background-color`,无 gradient 分支;preview [`generate-preview.ts:211`](../../../packages/d2c-core/src/preview/generate-preview.ts)
  对 shape 走 `linearGradientCss`、对文字走 background-clip:text(L263-267)。
  结果:蓝色气泡(`#689DFF→#277DFF`,146.95deg)渲染成橙色实色 `#FA5900`,渐变标题文字变实色。
- **做法**:
  1. 把 `linearGradientCss`(L525)+ 渐变 stop 解析提为 `src/style/gradient.ts` 纯函数,preview 改为消费它(零行为变化)。
  2. codegen 盒子填充:`fills[0].type === 'gradient'` → `background-image: linear-gradient(...)`;radial/angular/解析失败回退 `fill.color` 实色(与 preview 同语义,不静默丢色)。
  3. codegen 文字:渐变文字 → background-clip:text + transparent;落不出渐变时回退实色。
- **文件**:新建 `src/style/gradient.ts`;改 `codegen/react/generate.ts`、`preview/generate-preview.ts`;两端单测 + 真实节点数值回归(146.95deg 气泡、渐变标题)。
- **验收**:harness 7 条 backgroundColor/color 失败清零;两端 gradient CSS 逐字节同源;候选页气泡恢复蓝色。
- **规模**:小,单包内,确定性高。

## PR-G3(P1):矢量节点 inline SVG + harness 可见性 metric

- **根因**:preview 用 `renderVectorSvg`(L338)/`renderCompoundSvg`(L113)+ `svgGradientFill`(L570)
  输出 inline `<svg>`(本次 preview 38 个);codegen `shouldRenderBoxFill`([`generate.ts:171`](../../../packages/d2c-core/src/codegen/react/generate.ts))
  对矢量节点跳过填充 → 空 div(codegen `<svg>` 0 个)。caret/tab 图标/状态栏 wifi·电池/语音输入全部缺失。
- **做法**:
  1. 把 `renderVectorSvg` / `renderCompoundSvg` / `vectorPathData`(L364)/ `svgGradientFill` 提为 `src/style/vector-svg.ts` 纯函数;preview 改消费。
  2. codegen 在 TSX 输出 inline `<svg>`(单文件、确定性、不引第三方);gradient fill 复用 G1 的解析。
  3. **harness 补 metric**(原 G4):对 semantic 覆盖节点断言「baseline 有可见绘制(svg/背景图/文本)时 candidate 同样有」,堵住当前空 div 盲区。
- **文件**:新建 `src/style/vector-svg.ts`;改 codegen `generate.ts`、preview `generate-preview.ts`、harness `codegen-golden.ts`;约 38 节点。
- **验收**:候选页矢量区域与 baseline 截图一致;新 metric 零失败;底部 tab / 状态栏图标可见。
- **规模**:中,SVG 构建逻辑较多但纯函数化后可控。
- **依赖**:G1 先行(共用 gradient 解析)。

## PR-G2(P0 但可后置):字体栈健壮化 + 文档 lang 对齐

- **根因**:两端输出裸族名 `"PingFangSC"`(codegen [`generate.ts:234-235`](../../../packages/d2c-core/src/codegen/react/generate.ts)、preview L251-252),
  实际命中字体依赖宿主文档 lang——preview index.html 写死 `lang=en` 导致 baseline 解析失败回退(223.98),
  candidate `lang=zh` 命中 PingFang SC(237.94)。组件包嵌入任意宿主,lang 不可控。
- **做法**:
  1. 渲染端(preview + codegen 同改)输出健壮 font stack:小型别名表(`PingFangSC` → `"PingFang SC", "PingFangSC"`),尾部统一追加 `sans-serif`,提为 `src/style/font-stack.ts`。
  2. preview `index.html` lang 不再写死 en(取设计源语言,默认 zh)。
  3. harness:baseline 与 candidate 页面 lang 钉死一致,消除测量噪声。
- **文件**:新建 `src/style/font-stack.ts`;改 codegen、preview、harness。
- **验收**:10 条宽度失败清零;且把候选 viewer 改 `lang=en` 复测仍零宽度失败(证明不再依赖宿主 lang)。
- **规模**:小。
- **顺序说明**:候选已比 baseline 更贴设计意图,纯像素紧迫性低于 G1,故排 G1/G3 之后。

## PR-S-PR-2(P0):codegen 消费折叠 + 绑定重新安置

- **根因**:codegen 完全忽略 `componentDefinitions` / `componentInvocations`。本次产物中代表实例
  渲染为 `<StatusBar/>`(各 1 次),其余 5 个非代表实例已被移出 `body.components` → 被**内联**进父组件
  (根组件第二个状态栏展开 7 个 div、重复 `'9:41'`)。折叠价值未兑现,可读性反降。
- **做法**(跨 5C 收尾 + codegen 主体):
  1. codegen 消费 `componentDefinitions`:每个 definition 生成**一个**参数化组件(propSchema 的 text/assetRef 槽 → React props 接口)。
  2. codegen 消费 `componentInvocations`:在每个调用点渲染 `<Definition {...bindings}/>` + placement,**而非内联**;8 个 invocation 全部走复用。
  3. `nodeMap` 驱动模板节点 ↔ 实例节点映射(用于 `data-d2c-node-id` 归属与 key)。
  4. 放宽 S-PR-1 折叠守卫:interactive 绑定不再阻断折叠,而是**重新安置到 invocation**(见 [[d2c-stage7-reuse-binding-guard]]——S-PR-2 才可放宽,重新安置后才放行)。
  5. unique metric:harness 断言折叠 master 在所有调用点都是命名组件(0 内联重复子树)。
- **文件**:改 `codegen/react/generate.ts`(definition/invocation 消费)、可能触及 5C `derive-component-reuse.ts` 守卫放宽;harness 新 metric;codegen golden 重生。
- **验收**:8 个 invocation 全渲染为 `<Definition/>` 复用;props 接口生成;harness 仍全 present + relativeX/Y 零失败;interactive fixture 不再被绑定守卫阻断;两次运行字节一致。
- **规模**:大,跨链路。建议自身再拆 2 个 PR(S-PR-2a:definition→参数化组件 + invocation→复用调用;S-PR-2b:绑定重新安置放宽守卫)。
- **依赖**:G1 + G3 先行(代表组件先视觉正确)。

---

## 一览

| PR      | 轴 | 优先级 | 规模 | 关键产出 | 验收锚点 |
| ------- | -- | ------ | ---- | -------- | -------- |
| G1 渐变 | 形 | P0 | 小 | `src/style/gradient.ts` 同源 | harness 7 色失败→0 |
| G3 矢量 | 形 | P1 | 中 | `src/style/vector-svg.ts` + 可见性 metric | 38 矢量节点可见 |
| G2 字体 | 形 | P0↓ | 小 | `src/style/font-stack.ts` + lang 对齐 | 10 宽度失败→0,lang 无关 |
| S-PR-2  | 魂 | P0 | 大(拆 2) | codegen 消费 definition/invocation | 8 invocation 全复用,0 内联重复 |

共同架构线索:`packages/d2c-core/src/style/` 沉淀渐变/矢量/字体三个纯函数,
preview 与 codegen 同源消费——这是消除「两端逻辑分叉」这一类缺陷的结构性收口。
