# Batch 2 调查 — Sketch Symbol 实例缩放 / transform 换算公式

> Post-Stage-4 IR 保真审计 A5 项([`stage-3-ir-fidelity-audit.md`](./stage-3-ir-fidelity-audit.md))
> 的实现前调查。**纯只读分析**,产出 Batch 2 修复所需的 transform 公式、级联规则、
> fixture 设计、范围边界。
>
> 状态:调查完成 2026-05-24,**待 review**。Review 通过后再实现 + 专门 fixture + 回归测试。

---

## 1. 起因

IR 保真审计 A5:`normalizeSymbolInstance` 把 master 子树**原样**展开 —— 子节点保留 master
坐标系下的 `frame`,实例被拉伸 / 压缩时没有施加 `master → instance` 的换算。结果在真实
`d2c.sketch` 上:30 个 symbol 实例中 9 个被缩放;33 处"子节点越界父边界"里 27 处落在
symbol 子树内。

A5 是 **Stage 5 前置阻断项** —— 不修,后续 semantic / component-plan 会基于错位子树做
错误抽象。

## 2. 真实数据现状(`d2c.sketch`)

### 2.1 9 个被缩放的实例

| 实例名 | inst | master | scaleX | scaleY |
|---|---|---|---|---|
| icon/首页/输入框/更多 | 18×18 | 36×36 | 0.500 | 0.500 |
| 组件/首页/底部功能推荐备份 | 96×32 | 84×32 | 1.143 | 1.000 |
| 组件/首页/底部功能推荐备份 4 | 96×32 | 84×32 | 1.143 | 1.000 |
| img/bg | 375×1465 | 375×812 | 1.000 | 1.804 |
| 猜你想要 ×3 | 181/182/247×48 | 311×48 | 0.582–0.794 | 1.000 |
| icon/其他/声音备份 5 | 16×16 | 32×32 | 0.500 | 0.500 |
| icon/首页/星星 | 20×20 | 16×16 | 1.250 | 1.250 |

**覆盖到的模式**:等比缩小 / 等比放大 / 仅 X 拉伸 / 仅 Y 拉伸 —— 都有。Batch 2 必须支持
所有这些。

### 2.2 全项目 `resizingConstraint` 分布

| rc 值 | 出现次数 | 解码(set = 自由 / cleared = 固定) |
|---|---|---|
| 63 | 259 | right:free｜width:flex｜left:free｜top:free｜height:flex｜bottom:free(全自由,默认) |
| 45 | 24 | 仅 width 固定 + height 固定,四边都自由(定尺寸、按中心比例平移) |
| 9 | 8 | left:pin + bottom:pin + width/height fix(锚定左下角,定尺寸) |
| 10 | 3 | left + right + bottom 三边 pin + height fix(横向铺满 + 底对齐) |
| 12 | 3 | right:pin + bottom:pin + width/height fix(锚定右下角,定尺寸) |
| 41 | 3 | left:pin + width/height fix(锚定左上角,定尺寸,垂直自由) |
| 36 | 2 | right:pin + top:pin + width/height fix(锚定右上角,定尺寸) |
| 54 | 2 | right:pin + top:pin,W/H 都 flex |
| 37 | 1 | top:pin + width/height fix(顶部锚定,定尺寸,水平按中心比例) |

实现必须按位解码、覆盖**所有 9 种**实际出现的值(不能写一个等比缩放就交差)。

### 2.3 嵌套 symbol 实例

- `组件/首页/底部功能推荐` master 内含 1 个嵌套 symbolInstance(`AI星星` 图标)。
- `猜你想要` master 内含 2 个嵌套 symbolInstance。

→ 共 5 个 resized 实例的子树里有嵌套 symbol。**缩放必须级联**:外层 1.143×1.0 的缩放会让
内层 `AI星星`(原 20×20,在 master 内位置 10,6)落到一个 22.86×20 的新位置,这就把内层
变成了一个 1.143× 横向缩放的实例,**它自己的 master 子节点还得再算一遍**。

### 2.4 rotation / 翻转

resized master 子树共 1413 层中:`rotation != 0`:7 ｜ `isFlippedHorizontal`:3 ｜
`isFlippedVertical`:2。**少但非零**。

## 3. resizingConstraint 位语义(权威)

来自官方 [`@sketch-hq/sketch-file-format-ts`](https://github.com/sketch-hq/sketch-file-format)
的 `ResizingConstraint` enum:

```
None   = 63   (全 bit 置位 = 全自由 = 默认)
Right  = 62   (63 − 1,bit 0 清零)
Width  = 61   (63 − 2,bit 1 清零)
Left   = 59   (63 − 4,bit 2 清零)
Top    = 55   (63 − 8,bit 3 清零)
Height = 47   (63 − 16,bit 4 清零)
Bottom = 31   (63 − 32,bit 5 清零)
```

**规则:bit 置位 = 自由,bit 清零 = 固定 / 锚定。**

| bit | 值 | 清零含义 |
|---|---|---|
| 0 | 1  | Right 锚定(右边距固定) |
| 1 | 2  | Width 固定(宽度不变) |
| 2 | 4  | Left 锚定(左边距固定) |
| 3 | 8  | Top 锚定(上边距固定) |
| 4 | 16 | Height 固定(高度不变) |
| 5 | 32 | Bottom 锚定(下边距固定) |

实现里用 6 个 bool flag 解码后再走单轴公式(§4),不要直接 switch rc 值。

## 4. 单轴换算公式

X 轴与 Y 轴**独立计算**(只取该轴 3 个 flag:`startPin`、`endPin`、`sizeFixed`)。每轴共
8 种组合(都包含在表里):

记号:`M` = 父在该轴的 master 尺寸,`I` = 父在该轴的 instance 尺寸,`c` = 子起点(master
内),`s` = 子尺寸,`tail = M − c − s`(子距末端 margin)。求 `c'`, `s'`。

| start | end | size | c′ | s′ | 含义 |
|---|---|---|---|---|---|
| pin | pin | flex | `c` | `s + (I − M)` | 两端固定,中间随父尺寸拉伸 |
| pin | pin | fix  | `c` | `s` | 过约束,startPin 优先 |
| pin | free | flex | `c` | `s * I/M` | 左锚 + 宽度按比例 |
| pin | free | fix  | `c` | `s` | 左锚 + 定尺寸 |
| free | pin | flex | `I − tail − s'` | `s * I/M` | 右锚 + 宽度按比例 |
| free | pin | fix  | `I − M + c` | `s` | 右锚 + 定尺寸(等价 `I − tail − s`) |
| free | free | flex | `c * I/M` | `s * I/M` | **全自由** = 按比例缩放(rc=63 默认) |
| free | free | fix  | `(c + s/2) * I/M − s/2` | `s` | 定尺寸 + 中心按比例(rc=45) |

边界:**M = 0** 时所有按比例的公式坍缩 → 该子节点跳过缩放、落 `unsupported-symbol-transform`
warning(理论上不该发生:master 维度为 0 是异常数据)。

## 5. 我们 9 个实际 rc 值对应的行为(逐项推导自 §4)

| rc | 含义 |
|---|---|
| 63 | X、Y 两轴都"free+free+flex" → 整体按 (I/M) 等比缩放(位置 + 尺寸) |
| 45 | 两轴 size 固定 + 两端自由 → 尺寸不变,位置按中心比例平移 |
| 9  | X:left pin + width fix(`c'=c, s'=s`)｜Y:bottom pin + height fix(`c'=I−M+c, s'=s`) |
| 10 | X:left+right pin + width flex(`c'=c, s'=s+(I−M)`)｜Y:bottom pin + height fix |
| 12 | X:right pin + width fix(`c'=I−M+c, s'=s`)｜Y:bottom pin + height fix |
| 41 | X:left pin + width fix(`c'=c, s'=s`)｜Y:free+free+fix(`c'=(c+s/2)*I/M−s/2, s'=s`) |
| 36 | X:right pin + width fix｜Y:top pin + height fix(`c'=c, s'=s`) |
| 54 | X:right pin + width flex｜Y:top pin + height flex |
| 37 | X:free+free+fix(中心比例)｜Y:top pin + height fix |

## 6. 嵌套 symbol 级联

**算法(自顶向下递归)**:

```
expandInstance(instance):
  master = lookup(instance.symbolID)
  // 该实例自身相对 master 的缩放(若同尺寸则 scale = 1)
  (sx, sy) = (instance.width / master.width,
              instance.height / master.height)
  // master 视角下的容器尺寸:master.width × master.height
  // 期望容器尺寸:instance.width × instance.height
  for child in master.layers:
    childNewFrame = applyConstraint(
      parentOldSize=(master.width, master.height),
      parentNewSize=(instance.width, instance.height),
      childFrame=child.frame,
      rc=child.resizingConstraint ?? 63)
    if child is symbolInstance:
      // 用 childNewFrame 替换 child 自身的 frame,
      // 然后递归进 expandInstance(把它当成"自己的"实例),
      // 内层依然按"它的 master vs 它的 new frame"再算一次
      expandInstance(childWithFrame=childNewFrame)
    else if child is container (group/artboard):
      recurseInto(child, parentOldSize=childFrame.size,
                          parentNewSize=childNewFrame.size)
    childWithFrame = childNewFrame  // attach to instance subtree
```

**关键不变量**:每一层递归只需要知道**该容器的 old size 与 new size**,不需要把累计 scale
矩阵传下去。约束是相对父的,父的尺寸变了,子按本层约束算就是对的。

## 7. rotation / 翻转

v1 范围内:

- **检测**:子节点 `rotation !== 0` 或 `isFlippedHorizontal/Vertical` → 落 warning
  `unsupported-symbol-transform`,**坐标仍按非旋转公式算**(等价于忽略 rotation/flip 对
  布局的影响)。
- **理由**:旋转后的 frame 还是包围盒,position 公式仍部分有效;真正完美的实现需要把
  rotation 也按约束变换,代价大、收益小(7/1413 ≈ 0.5%)。
- **顺延**:rotation/flip 完整支持留作单独小批次,与 A4 蒙版同级。

## 8. 边界与数值稳定性

- **M = 0**:跳过缩放、落 warning(同上)。理论不应发生。
- **浮点精度**:`scale = I/M` 直接用 IEEE-754 浮点,**不强行 round** —— 与 normalize 现有
  "frame x/y/w/h 保留浮点"约定一致;`normalize` 确定性测试已覆盖字节级稳定。
- **id 稳定**:`stableNodeId` / 命名不动 —— 子节点 id 来自 master nodeId,不会因为
  scale 改变。
- **trace**:`source.nodeId` 仍指向 master 内的原始 id(便于 review 时追溯)。

## 9. 实现下钩点

**文件**:`skills/sketch-to-component/scripts/src/normalize/visual.ts`

**主要改动**:

1. **新增** `applyConstraint(parentOld, parentNew, frame, rc)` 纯函数(实现 §4 公式表)。
2. `normalizeNode` / `normalizeSymbolInstance` 引入一个**容器尺寸上下文**
   `{ parentOldSize, parentNewSize }`,在递归调用时显式传递:
   - 普通 group / artboard:`parentOldSize = parentNewSize = readFrame(node)`(自身不被
     resize)。
   - symbolInstance 展开 master 子节点时:`parentOldSize = master.frame`,
     `parentNewSize = instance.frame`。
3. 每个子节点的 `layout` 走 `applyConstraint(parentOld, parentNew, frame, rc)` —— 替代
   现在直接用 master `frame`。
4. 子节点若是嵌套 symbolInstance:它的"new frame"作为它**自身的 instance frame**进入下一
   层递归;下一层 `parentOld = 它的 master.frame`,`parentNew = 它的 new frame` —— 自然
   级联。
5. 落 warning 的地方:rotation/flip(`unsupported-symbol-transform`)、master 尺寸为 0
   (`symbol-master-zero-dim`)。

**不动的部分**:
- symbol override 应用(在 Stage 4 `apply-overrides`,独立)。
- `symbol.overrides` trace 保留(继续走 `extractOverrides`)。
- text / style / asset 提取(Batch 1 修过,正交)。

## 10. fixture 与回归测试设计

**两类 fixture**:

1. **现有脱敏 fixture `sketch-raw.min.json`** —— 已含 9 个 resized 实例的真实情形。Batch 2
   后,跑一遍 `normalizeSketchRaw`,断言:33 个"越界父边界"的节点降到 ≤ 旋转/翻转余量(7
   个左右)。这是端到端回归。

2. **新增专门 transform fixture `fixtures/symbol-transform.min.json`** —— 最小化合成数据,
   每条公式各一个案例:
   - 1 个 master 64×64 + 1 个 instance 128×64(scaleX=2, scaleY=1),master 含 8 个子节点,
     各自 rc 覆盖 §5 列出的所有 9 种值(63/45/9/10/12/41/36/54/37)。
   - 1 个 master 含 1 个嵌套 symbolInstance(测级联):外层 64→128,内层 master 20×20、
     master 内 frame(10, 10, 20, 20)、rc=63 → 内层 instance frame(20, 10, 40, 20);
     内层 master 自己有 1 个子节点(0, 0, 20, 20)rc=63 → 内层展开后 (0, 0, 40, 20)。
   - 1 个 rotation != 0 的子节点(测 warning + 坐标按非旋转算)。

**单元测试(`__tests__/normalize-symbol-scale.test.ts` 新增)**:

- `applyConstraint` 8 种轴公式各一条 unit 测(纯函数,无 fixture)。
- 端到端:transform fixture 通过 `normalizeSketchRaw` 后,关键子节点 layout 精确匹配预期。
- 级联:嵌套 symbol 子节点最终落在外层 instance bounds 内。
- warning:rotation 子节点产生 `unsupported-symbol-transform` warning,坐标按 rc 公式算。
- 真实 `sketch-raw.min.json` 回归:展开后子节点越界数 ≤ N(旋转余量),与 baseline 对比
  字节级稳定(确定性)。

## 11. 不在 Batch 2 范围

- **rotation/flip 完整布局**:落 warning + 用平面公式,顺延。
- **symbolID override**(嵌套 symbol 替换):A6 / Batch 4。
- **shapePath / shapeGroup 内部 path 数据**:`points[]` 的 (x,y) 跟着 frame 缩放 —— 视觉
  影响小、且预览阶段图标是占位,留到 SVG 资源导出专项。
- **autoLayout 真正语义**(Sketch 3.0+ 的 group autoLayout):本设计文件不使用,本批次不
  覆盖。

## 12. 风险与开放问题

1. **shapePath/shapeGroup 内部点 OOB**:frame 算对了不代表内部 path 也对。本批次后,这些
   节点的 `layout` 框对了,但 vector 内容仍按 master 几何 —— 预览靠 `overflow:hidden` 遮
   掉。可接受(预览不是像素级)。
2. **过约束**(`pin + pin + fix`):§4 表里 "startPin 优先" 是我的选择,Sketch 的实际行为
   未经实测。我们数据里**不存在**这种 rc 值(检查:无 `width:fix` 同时 `left:pin + right:pin`
   的组合),所以这个分支不会被触发,实现里加 warning 标"理论不应发生"即可。
3. **嵌套 symbol 链超过 2 层**:本设计未见(`maxNestingDepth = 2`)。算法自然支持任意层,
   循环保护已在 `normalizeSymbolInstance` 现有(`visitedSymbols`)。
4. **`resizingConstraint` 缺失**:个别旧 Sketch 文件可能没这个字段 —— 实现里默认 63(全
   自由)。

## 13. 推荐推进顺序

1. **先实现 `applyConstraint` 纯函数 + 单元测试**(无 fixture 依赖,最容易验证公式正确)。
2. **接入 `normalizeNode` / `normalizeSymbolInstance`**(改动主要在容器尺寸上下文的传递)。
3. **加专门 transform fixture + 测试**。
4. **真实 `sketch-raw.min.json` 端到端回归**:对比 baseline,确认 OOB 节点数下降到余量水
   平。
5. **重生成预览**:确认 `更多` 图标、`猜你想要` 推荐位、`img/bg` 等位置视觉正常。
6. **提交**:`fix(d2c): Batch 2 — symbol-instance scale transform (A5)`。

---

**Review 通过后**再进入实现。本调查若有任何公式 / 范围 / 边界需要收紧或放宽,在 review
意见里指出。
