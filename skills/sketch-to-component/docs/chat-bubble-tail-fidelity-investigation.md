# 聊天气泡尾巴保真度调研报告

> 状态:调研（不含代码改动）
> 范围:Sketch → d2c preview 的聊天气泡裁剪遮罩（clipping-mask）尾巴渲染
> 触发样例:`skills/sketch-to-component/resource/d2c.sketch` 中「我要订深圳的酒店」「是的」用户气泡
> 关联:PR #56（6-PR-5，渐变 + 裁剪遮罩 preview 支持）

## 1. 现象

设计切图里,用户气泡是一只**蓝色渐变、右下角平滑外延出连续小尾巴**的语音气泡（iMessage 风格)。

preview 生成的 HTML 里,同一个气泡:

- 主体蓝色渐变、左上/右上/左下圆角正确,**右下角为硬直角**;
- 尾巴是一个**略微脱开、带白色缝隙的独立小块**,颜色比气泡主体偏平偏浅,轮廓与设计不一致。

3 个原始问题（直角气泡、文字灰框、尾巴外飘)在 PR #56 合并后已基本修复,本报告只针对**残留的尾巴渲染保真差距**。

## 2. 证据

样例气泡节点结构（来自 `visual-view.json`):

```
group "组件/bubble/self" [184,112 175x48]
├─ shape/rectangle "矩形"  [0,0 168x48]   ← 气泡主体
├─ group "尾巴" [168,27 7x21]  MASKED      ← 尾巴容器(父节点带 maskedContent)
│   └─ shape/rectangle "蒙版备份 19" [-151.5,-27 161.5x48] r=76.5  ← 被裁的大圆角矩形
└─ text "我要订深圳的酒店" [16,12 136x24]
```

实际产出的 CSS:

```css
/* ① 主气泡 rect —— 有一圈 0.5px 纯白内描边 */
.d2c-node-0a87bce9... {
  background-image: linear-gradient(146.95deg, #689dff, #277dff); /* 渐变 */
  border: 0.5px solid #ffffffff; /* 白边,画在右缘 x=168 */
  border-radius: 21px 21px 0px 21px; /* 右下 = 0,直角 */
}

/* ② 尾巴 group —— overflow:hidden 的 7x21 窗口 */
.d2c-node-14458f49... {
  left: 168px;
  top: 27px;
  width: 7px;
  height: 21px;
  overflow: hidden;
}

/* ③ 尾巴里的蒙版矩形 —— 超大圆角矩形,平涂蓝 */
.d2c-node-534b9db4... {
  left: -151.5px;
  top: -27px;
  width: 161.5px;
  height: 48px;
  background-color: #287dffff; /* 平涂,不是渐变 */
  border-radius: 76.5px;
}
```

原始数据佐证:

- 主气泡 border:`{color:#FFFFFFFF, thickness:0.5, position:1(inside)}` —— 真实存在的 0.5px 内描边。
- 主气泡 radius:`{topLeft:21, topRight:21, bottomRight:0, bottomLeft:21}` —— 右下直角是设计本意（尾巴在此接出)。

## 3. 根因分析

| 现象                         | 直接原因                                                                                                 | 代码位置                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 气泡与尾巴间**白色缝隙**     | `0.5px solid #FFFFFF` 白边正画在右缘 x=168,而尾巴 group 自 x=168 起,白边把两者切开                       | `generate-preview.ts:146`                           |
| 尾巴**色差**(偏平偏浅)       | 气泡主体是渐变 `#689DFF→#277DFF`,尾巴蒙版矩形是平涂 `#287DFF`,接缝处不连续                               | 数据本身(两个独立 shape)+ `generate-preview.ts:137` |
| 尾巴像**独立小块**、右下生硬 | `overflow:hidden` 仅用「7x21 包围盒裁一个大圆角矩形的角」近似真实蒙版,产出被裁的矩形圆角而非平滑外延轮廓 | `generate-preview.ts:162-163`                       |

### 架构层根因

PR #56 的裁剪遮罩处理是**包围盒近似**:

1. normalize 阶段在 `visual.ts:177` 把蒙版层（`hasClippingMask:true`)直接 `return undefined` **整层丢弃**,只在父节点 `markMaskedContent()` 打 `style.raw.maskedContent` 标记（`visual.ts:261 / 396`)。**真实蒙版几何因此丢失。**
2. preview 阶段 `generate-preview.ts:162-163` 据该标记给父节点加 `overflow:hidden`,用包围盒裁剪近似。

近似在「裁掉外飘兄弟」这一目标上成立,但无法还原从气泡平滑外延的连续尾巴轮廓;叠加白边缝 + 色差,视觉上就读成「两块」。

## 4. 影响面

- **normalize**(`skills/sketch-to-component/scripts/src/normalize/visual.ts`):蒙版几何在此丢弃。任何「保留几何」的方案都要从这里改。
- **preview**(`packages/d2c-core/src/preview/generate-preview.ts`):边框、渐变、`overflow:hidden` 的发射点。
- **codegen**(`packages/d2c-core/src/codegen/`):**目前完全不渲染视觉样式**(grep 无 `fills/border/overflow/radius/background`)。故尾巴问题**当前仅存在于 preview**;codegen 仅在未来开始发射视觉样式时才受影响。
- **IR / schema**:深层方案需要扩展 `Style` 以承载蒙版路径几何(见方案 B)。

## 5. 方案 A —— 浅层快赢(消除割裂感)

**目标:** 让尾巴与气泡「粘」起来,色调一致;尾巴轮廓仍为近似。

**改动点:**

1. **去掉贴尾巴一侧的白边缝。** 对带 `maskedContent` 的容器、或其相邻边,抑制 border 在接缝边的绘制(例如该 rect 命中尾巴附着边时不发射 border,或改用 `box-shadow: inset` 等不产生外缝的画法)。
2. **让尾巴继承气泡同一填充。** 当尾巴蒙版矩形与气泡主体属同一气泡组时,用气泡主体的渐变填充尾巴,而非其自身平涂色。

**风险 / 回归:**

- 「相邻边」「同一气泡组」的识别需要一个稳定的判定条件,过宽会误伤正常 border / 正常填充。
- 改 border 发射逻辑会影响所有节点的 border CSS,需要现有 preview 快照 / golden 回归兜底。
- 仍是近似:尾巴轮廓不等于设计真实路径,只是「不割裂」。

**工作量:** 小(仅 preview 层 + 少量判定);不动 IR/normalize。

## 6. 方案 B —— 深层根治(真实蒙版几何 + clip-path)

**目标:** 气泡 + 尾巴当作**一个语音气泡形状**,按真实蒙版路径渲染并填同一渐变。

**改动点:**

1. **normalize 保留蒙版几何。** `visual.ts` 不再丢弃 `hasClippingMask` 层,而是提取其路径(`points[]` / `path`)存入父节点 `style`(需扩展 IR `Style`,新增如 `clipPath` 字段)。
2. **preview 用 SVG `clip-path` 还原。** `generate-preview.ts` 据保留的几何发射 `clip-path: path(...)`（或内联 `<clipPath>`)裁出真实尾巴轮廓,并用气泡渐变填充整形。
3. **codegen 对齐**(若届时已渲染样式)。

**风险 / 回归:**

- IR schema 扩展会牵动 `ir` 校验、`design-ir`/`visual-view` 的 hash 稳定性与既有 golden(需同步更新)。
- Sketch 路径 → CSS `clip-path`/SVG path 的坐标换算(含 `points[]` 的曲线控制点、`isClosed`、坐标系归一化)是新逻辑,边界条件多。
- 跨 normalize + preview(+ codegen)三处协同,改动面大,回归测试需新增专门样例。

**工作量:** 大(跨模块 + IR 扩展 + 新坐标换算 + 新测试)。

## 7. 取舍建议

- 若目标是「**preview 看起来不割裂、能交付评审**」:**方案 A** 性价比最高,可先落地;尾巴仍为近似但视觉连续。
- 若目标是「**像素级还原任意蒙版形状**(尾巴/异形裁剪/头像圆形遮罩等)」:需走**方案 B**,且应作为独立 stage 规划(IR 扩展 + 几何换算 + golden)。
- 两者不冲突:可先 A 止血,再在后续迭代里推进 B。

## 8. 验证方式

- `npm run test:d2c` / `npm run test:sketch` / `npm run check:fixtures` / `npm run check:full`
- 端到端复现:`extract → normalize → preview`（用 `resource/d2c.sketch`),无头 Chrome 截图比对「我要订深圳的酒店」「是的」气泡与设计切图。
- 方案 B 还需:新增蒙版几何的 normalize 单测 + preview clip-path 发射单测 + golden 更新。
