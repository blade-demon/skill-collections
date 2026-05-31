# 文本渐变保真度调研报告

> 状态:已定位真因,方案已选,落地中
> 范围:Sketch → d2c normalize/preview/codegen 的**文本节点渐变填充**渲染
> 触发样例:"推荐理由："4 字渐变标题(蓝 → 紫)在 preview 渲染为单色
> 关联:[stage-3-ir-fidelity-audit.md](./stage-3-ir-fidelity-audit.md)、[chat-bubble-tail-fidelity-investigation.md](./chat-bubble-tail-fidelity-investigation.md)(同期 fidelity 调研)

## 1. 现象

设计稿里"推荐理由："4 字是从左到右**蓝紫色线性渐变**;preview 渲染出来的是**单色**(偏暗的青/灰),与设计完全不一致。

## 2. 证据

### 2.1 Sketch 源数据

Sketch 的文本节点把"渐变文本"编码为:

- `attributedString.attributes[0].attributes.MSAttributedStringColorAttribute` —— **缺失**或为占位色(渐变时不可靠)
- `style.fills[0]` —— `fillType: 1`(渐变),携带完整 `gradient: { gradientType, from, to, stops }`,其中 `color` 字段是 base/占位色

这与"形状节点的渐变填充"编码完全一致,只是宿主节点是 text。

### 2.2 IR 产物(`visual-view.json`)

样例文本节点经 normalize 后:

```json
{
  "kind": "text",
  "text": { "content": "推荐理由：", "style": { "color": "#XXXXXXXX" } },
  "style": {
    /* fills 字段缺失 */
  }
}
```

—— `style.fills` 不见了,渐变信息完全丢失;`text.style.color` 是 base/占位 hex,与设计不符。

### 2.3 Preview CSS

```css
.d2c-node-...-text {
  color: #XXXXXXXX; /* 单色,非渐变 */
}
```

没有 `background-image`、没有 `background-clip: text`。

## 3. 根因分析

| 现象                              | 直接原因                                                                                                | 代码位置                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IR 里看不到文本渐变               | text 节点的 `style.fills` 被**整组**跳过                                                                | [`normalize/visual.ts:684`](../scripts/src/normalize/visual.ts#L684)                                                                                                        |
| `text.style.color` 是占位/base 色 | `MSAttributedStringColorAttribute` 缺失,fallback 取 `fills[0].color` —— 渐变 fill 的 `color` 就是占位色 | [`normalize/visual.ts:530`](../scripts/src/normalize/visual.ts#L530)、[`:651`](../scripts/src/normalize/visual.ts#L651)                                                     |
| preview 只画单色                  | text 分支仅 emit `color:`,且 `shouldRenderBoxFill` 显式排除 text                                        | [`generate-preview.ts:208-218`](../../../packages/d2c-core/src/preview/generate-preview.ts#L208)、[`:243`](../../../packages/d2c-core/src/preview/generate-preview.ts#L243) |

### 架构层根因

[`extractStyle`](../scripts/src/normalize/visual.ts#L672) 的 text 分支为了规避 Gate-1 缺陷(2026-05-22 之前 text fill 会被 preview/codegen 画成实色块)采取了**一刀切**:

```ts
if (kind !== 'text') {
  const fills = normalizeFills(style.fills);
  if (fills.length > 0) result.fills = fills;
}
```

这条规则的本意是「文本的纯色 fill 已被 `text.style.color` 捕获,无需再保留」,但**渐变/图像 fill 不在 `text.style.color` 表达能力之内**,跟着被一并丢弃,这就是真因。

## 4. 影响面

- **normalize**([`scripts/src/normalize/visual.ts`](../scripts/src/normalize/visual.ts)):渐变在此被丢弃。修复必须从这里开始。
- **preview**([`packages/d2c-core/src/preview/generate-preview.ts`](../../../packages/d2c-core/src/preview/generate-preview.ts)):text 分支需要新增「渐变 → `background-clip: text`」路径。
- **codegen**([`packages/d2c-core/src/codegen/`](../../../packages/d2c-core/src/codegen/)):v1 是 **presentational stub**(`<div className={styles.root} />` + `display: block`),**完全不渲染任何样式**(grep 无 `fills/color/background/font`)。**当前不存在可修复的代码路径**;待 codegen 进入视觉保真阶段时,文本渐变会作为 IR 已有字段被一并消费,无需为此再回头改 IR。本报告把 codegen 列为「待视觉保真阶段对齐」。
- **IR / schema**:无需扩展。`Style.fills` 已经能承载渐变(`raw.gradient`),`shape` 节点是现成例子,text 复用即可。

## 5. 方案 A —— 保留渐变 fills + preview `background-clip: text`(已采纳)

**目标:** IR 完整保留文本渐变;preview 把渐变文本渲染为「背景渐变 + 文字镂空」。

**改动点:**

1. **normalize**([`visual.ts:684`](../scripts/src/normalize/visual.ts#L684)):text 节点不再整组跳过 fills,改为「**跳过纯色 fills、保留 gradient/image fills**」。纯色已被 `text.style.color` 捕获,渐变/图像则进入 `node.style.fills`。Gate-1 缺陷(被画成实色块)不会回归,因为预览的 text 分支根本不走 `shouldRenderBoxFill`,而是单独走"渐变 → `background-clip: text`"路径(详见步骤 2)。
2. **preview**([`generate-preview.ts:208`](../../../packages/d2c-core/src/preview/generate-preview.ts#L208)):text 分支在 emit `color:` 前先看 `style.fills[0]`,若是有效的线性渐变,emit
   ```css
   background-image: linear-gradient(...);
   -webkit-background-clip: text;
   background-clip: text;
   color: transparent;
   ```
   复用现成的 `linearGradientCss` 实现;radial/angular/数据缺失自动 fallback 到 `color:`(与形状节点的渐变 fallback 行为一致)。
3. **测试**:
   - `normalize-visual.test.ts` 新增「text 节点 + 渐变 fill → `style.fills[0].raw.gradient` 保留;纯色 fill 仍只走 `text.style.color`」。
   - `gradient-preview.test.ts` 新增「text 节点 + 线性渐变 → emit `background-clip: text; color: transparent;`,且不再 emit 实色 `color:`」。

**风险 / 回归:**

- 风险面集中在 normalize 的过滤条件:必须确保「纯色 fill」继续被丢弃,否则 Gate-1 缺陷可能复发。已有的 [`captures a text layer fill as text colour, never as a box background`](../scripts/src/__tests__/normalize-visual.test.ts#L197) 测试是兜底。
- `background-clip: text` 在 Safari 需要 `-webkit-` 前缀,两者并 emit。

**工作量:** 小(normalize 加 1 个 type 判断、preview 加 5 行 emit、2 条测试);不动 IR schema。

## 6. 方案 B —— 不采纳的方案

为完整起见列出。

- **B1. 给 `TextContent.style` 增加 `gradient` 字段。** 多余 —— IR 已有 `Style.fills` 能承载渐变,引入新字段会让 text/shape 渐变各走一套,增加 codegen/preview 分支。
- **B2. 把渐变拍平为 base 色单色。** 当前行为,缺陷的根源,放弃。
- **B3. 用 SVG `<text>` 渲染。** 需要 IR 新增 SVG fallback 路径,工作量大于方案 A 一个量级,且对 codegen 难以复用。等遇到 `background-clip: text` 表达不了的场景(多段渐变、stroke + fill 双效)再考虑。

## 7. 验证方式

- `npm run test:d2c`(覆盖 preview 渲染单元测试 + 增量 text gradient 测试)
- `npm run test:sketch`(覆盖 normalize 单元测试 + 增量 text gradient 测试)
- `npm run check:fixtures` / `npm run check:full`(快照与 IR fixture)
- 端到端:`extract → normalize → preview` 的 `resource/d2c.sketch`,手工核对"推荐理由："4 字是否为蓝紫渐变镂空文字。

## 8. 后续

- codegen 进入视觉保真阶段后,统一消费 `Style.fills` 渐变(与 shape 共用同一路径),无需为文本单独再开通道。
- 若日后遇到 `background-clip: text` 表达不了的文本效果(渐变 stroke、多段位置渐变、emoji 蒙版等),再走方案 B3(SVG `<text>`),仍以本调研里的 normalize 改动为前置:**渐变信息已在 IR**,届时只换渲染层。
