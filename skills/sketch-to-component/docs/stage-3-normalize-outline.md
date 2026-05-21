# Stage 3 蓝图 — Sketch Normalize(`raw-dsl.json` → `design-ir.json`)

> 本文是 [`../../../docs/design-source-to-component-implementation-plan.md`](../../../docs/design-source-to-component-implementation-plan.md)
> Stage 3 的详细蓝图。状态:**已并入一轮 review(2026-05-21),可作实现依据**。
>
> Stage 3 是整条管线最难的一环。本蓝图把**范围、精确契约、执行顺序、关键决策**钉死;
> 逐条规范化细则在实现时对脱敏 fixture 做 TDD 长出——不在蓝图里穷举。

---

## 1. 定位与范围

Stage 3 = 实现 Sketch provider 的 `normalize`:`RawArtifact`(payload 为 `SketchRawModel`)
→ d2c-core canonical `design-ir.json`。

**做**:选目标画板 → 清理 Sketch `_class` 树 → 产 `visual` 树;**very thin** 语义候选;
`source`/trace/`warnings`/稳定命名;组装完整 `SketchProvider`;产出过 `validateDesignIR()`。

**不做**:`visual-view` 派生 / HTML 预览(Stage 4);`semantic-view` / `interaction-spec` /
`component-plan`(Stage 5);codegen(Stage 6)。`interaction` 本阶段只产 `{ status: "draft" }`。

**标准**:产出**合法、对参考设计忠实**的 `design-ir.json` —— `visual` 必须扎实(Stage 4 预览
直接吃它),`semantic` 是**很薄**的启发式首版,**不追求完美**。

## 2. 输入 / 输出契约

```
输入:  RawArtifact { provider:'sketch', ref, payload: SketchRawModel, capturedAt }
输出:  DesignIR    v0.2.0
约束:  输出过 d2c-core validateDesignIR();走 normalizeAndValidate() 自检;normalize 确定性
       (同 raw-dsl.json → 同 design-ir.json,命名 / id / 排序全确定)
```

## 3. d2c-core 改动 — v0.2.0(决策已定)

`visual` / `semantic` 是所有下游(预览 / 语义 / codegen)的共享契约,必须定型。Stage 3 在
**d2c-core** 收紧 `DesignIRSchema`:

- 新增 `VisualBlock` / `VisualNode` / `Style` / `TextContent` / `AssetEntry` / `SemanticBlock` /
  `SemanticCandidate` 的 zod schema(放 `packages/d2c-core/src/ir/`)。
- `DesignIRSchema`:`visual` → `VisualBlockSchema`,`semantic` → `SemanticBlockSchema`。
- `DESIGN_IR_SCHEMA_VERSION` 升 `v0.2.0`;`version.ts` 的 `SUPPORTED_MINOR = 2`。
  (pre-1.0 minor = 破坏性;目前无任何 v0.1 IR 存在,升级无痛。)
- **原则**:`visual` 是**真契约**(机械、字段明确);`semantic` 只定**最小候选 envelope**
  ——props / events / states **不在 Stage 3 定死**(留 Stage 5)。schema 仍保持 provider 中立
  (`kind` 是通用枚举,不是 Sketch `_class`)。

## 4. `design-ir.json` v0.2.0 精确契约

```ts
DesignIR {
  schemaVersion: 'd2c.design-ir/v0.2.0'
  source: { provider: 'sketch'; ref: { filePath; fileName; documentId }; rootName?: string }
  visual: VisualBlock
  semantic: SemanticBlock
  interaction: { status: 'draft' }
  warnings: Warning[]                        // d2c-core WarningSchema
}

VisualBlock {
  artboard: { width: number; height: number }    // 根画板尺寸
  root: VisualNode                                // root.layout = {x:0,y:0,width,height}
  assets: AssetEntry[]                            // 资源索引表(节点按 id 引用,避免 Stage 4 反扫树)
}

AssetEntry {
  id: string
  ref: string                                     // 指向 SketchRawModel.assets 的 path
  kind: 'image' | 'font' | 'preview' | 'other'
  originalPath?: string                           // .sketch 内原始条目路径
}

VisualNode {
  id: string                                      // 稳定生成,确定性
  kind: 'frame' | 'group' | 'text' | 'image' | 'vector' | 'shape'
  name: string                                    // 稳定生成
  source: {                                       // = trace,回溯原始节点
    nodeId: string
    name?: string
    originalType?: string                         // Sketch 的 `_class` 放这里(字段名中立)
    provider?: string
  }
  layout: { x: number; y: number; width: number; height: number }   // 见 §5 坐标约定
  style?: Style
  text?: TextContent                              // 仅 kind:'text'
  assetRef?: string                               // 仅 kind:'image' → AssetEntry.id
  symbol?: {                                      // symbol 相关节点保留,供 Stage 5 抽象
    instanceId?: string
    masterId?: string
    overrides?: { path: string; value: unknown }[]
  }
  children: VisualNode[]                          // 按 §5 的 z-order 顺序
}

Style {                                           // 外壳从严、内部适度宽
  fills?: Fill[]
  borders?: Border[]
  effects?: Effect[]
  opacity?: number
  radius?: number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number }
  raw?: Record<string, unknown>                   // 逃生舱:暂未建模的样式
}
// Fill / Border / Effect:适度宽松对象(各含 type? / color? 等常用字段 + raw?),不锁死 Sketch。

TextContent {
  content: string
  style?: {
    fontFamily?: string
    fontSize?: number
    fontWeight?: number | string
    lineHeight?: number
    color?: string                                // #RRGGBBAA
    textAlign?: 'left' | 'center' | 'right' | 'justify'
  }
}

SemanticCandidate {                               // 最小 envelope —— Stage 3 只产这些字段
  nodeId: string                                  // → VisualNode.id
  candidateName: string
  confidence: 'low' | 'medium' | 'high'           // Stage 3 多为 low
  reason: string                                  // 命中的启发式
  symbolMasterId?: string
}
SemanticBlock { candidates: SemanticCandidate[] }  // 可为空 / 很薄
```

## 5. layout 坐标约定(写死)

- `layout.x` / `layout.y` 是**相对父节点左上角的局部坐标**。
- 根节点(目标画板)`layout = { x: 0, y: 0, width: artboard.width, height: artboard.height }`。
- `visual.artboard.width/height` = 根画板尺寸。
- `children` 按**渲染顺序(z-order)**排列:`index 0 = 最底层 / 最先绘制`,直接沿用 Sketch
  `layers` 数组顺序——**不按字母排序**(语义顺序,不可乱)。

## 6. `visual` 规范化规则(要点)

- **`_class` → `kind`**:`artboard`/`frame`→`frame`;`group`→`group`;`text`→`text`;
  `bitmap`→`image`;`shapePath`/`oval`/`rectangle`/`shapeGroup`→`shape`;`svg*`/`path`→`vector`。
  未知 `_class` → 最近 kind + 一条 warning。`_class` 原值进 `source.originalType`。
- **layout**:取 Sketch 节点 `frame` 的 x/y/w/h,按 §5 约定换算成局部坐标。
- **style**:规范化 `fills` / `borders` / `shadows`(→`effects`)/ `opacity` / 圆角(→`radius`);
  颜色统一 `#RRGGBBAA`。建不出模型的进 `style.raw`。
- **text**:从 `attributedString` / `stringAttribute` 抽 `content` 与 `TextContent.style` 字段。
- **assets**:`bitmap` 节点 → 在 `visual.assets` 建一条 `AssetEntry`,节点 `assetRef` 指其 `id`;
  对应不上 → warning + 占位条目。

## 7. 节点树清理

折叠 / 丢弃对代码生成无意义的层,**每次清理记一条 warning,不静默丢**:空 frame/group、纯 mask
容器、只包一个有意义子节点的匿名 group(透传)、纯装饰矩形(可降级为父背景/边框)。必须**保留**
影响布局、裁剪、mask、z-order 的有意义信号。

## 8. symbol 处理

实测:屏幕画板 9 个 `symbolInstance`,`symbolMaster` 在另一页。

- `symbolInstance` → 一个 `VisualNode`,**就地展开** master 的规范化子树进 `children`。
- `VisualNode.symbol` **保留 `instanceId` / `masterId` / `overrides` trace** —— 否则 Stage 5
  想抽组件会丢信息。
- `overrideValues` → `symbol.overrides`(path + value);也可作语义候选的线索。
- **循环 / 递归保护**:解析时跟踪已访问的 `masterId`,遇环 → 停止展开 + warning。
- 组件抽象(instance 不展开、复用 master)**留 Stage 5 component-plan**,Stage 3 不做。

## 9. `semantic` —— very thin candidates

零标注(Sketch 无 `@component` 体系),Stage 3 只产**三类很薄的候选**,给 Stage 5 当输入,
不让 Stage 5 从零开始:

1. `symbolInstance` / `symbolMaster` → 候选(带 `symbolMasterId`);
2. 命名命中(`组件/` `icon/` 等前缀)→ 候选;
3. 重复结构的 group → 列表项候选。

拿不准 → 不臆造,`confidence: 'low'` + warning。**不产 props / events / states**——那是 Stage 5。

## 10. 稳定命名 + id

确定性(同输入同输出,供回归 diff):设计名 → 代码名(`财资小助手对话页`→`ChatAssistantPage`、
`组件/系统/状态栏-亮底`→`StatusBar`);中文/符号无法转写 → 回退 `Section{n}` / `Node{n}`;
`VisualNode.id` 用基于 source nodeId 的确定性派生,不用随机/递增易漂移值。

## 11. warnings

每处有损 / 不确定记一条 `Warning`(d2c-core `WarningSchema`):未知 `_class`、mask 未还原、
asset 对应不上、低置信候选、symbol 环、节点超量截断等。

## 12. 执行顺序 — 3A / 3B / 3C(仍是一个 Stage)

| 子段 | 内容 |
|---|---|
| **3A** | d2c-core v0.2.0 schema(§3/§4)+ 脱敏 fixture(§14)+ d2c-core schema 单测 |
| **3B** | Sketch `visual` normalize(§5–§8)+ 产 `design-ir.json` + `Provider.normalize` |
| **3C** | very thin `semantic` 候选(§9)+ 组装 `SketchProvider` + CLI `normalize` 命令 |

3A 先行(契约 + fixture 是 3B/3C 的地基)。

## 13. 模块与文件

**d2c-core**:`packages/d2c-core/src/ir/` 加 visual/semantic schema、收紧 `DesignIRSchema`、
`version.ts` 升 v0.2.0、补单测。

**Sketch provider**(`skills/sketch-to-component/scripts/src/`):

| 文件 | 职责 |
|---|---|
| `normalize/select-artboard.ts` | 选目标画板(§待定 → §17 已定) |
| `normalize/sketch-nodes.ts` | Sketch `_class` 原始节点类型与读取助手 |
| `normalize/clean-tree.ts` | 节点树清理(§7) |
| `normalize/visual.ts` | 构建 `visual` 树(kind/layout/style/text/asset) |
| `normalize/symbols.ts` | symbol 解析 + trace 保留 + 循环保护(§8) |
| `normalize/semantic.ts` | thin 语义候选(§9) |
| `normalize/names.ts` | 稳定命名 + id(§10) |
| `normalize.ts` | 编排 `RawArtifact` → `DesignIR`;实现 `Provider.normalize` |
| `provider.ts` | 组装 `SketchProvider implements Provider`(`extractRaw` + `normalize`) |
| `cli.ts` | 加 `normalize` 命令(`raw-dsl.json` → `design-ir.json`) |

## 14. fixture 脱敏(关键前置 — 实现前先做)

真实 `raw-dsl.json`(3.1 MB,绝对路径 + 完整中文业务文本)**不入库**。流程:

1. Stage 2 CLI 对 `d2c.sketch` 产真实 `raw-dsl.json`(私有,gitignored)。
2. **最小化**:裁到目标屏幕画板 + 它实际引用的 symbol master,丢无关画板。
3. **脱敏**:中文业务文本(酒店名、价格等)替假数据;`ref.filePath` 改占位。
4. 提交 `scripts/src/__tests__/fixtures/sketch-raw.min.json` 作 normalize TDD 基线。

**人审**:可让 Codex 产出"**候选脱敏 fixture + 脱敏报告**"(列出替换了哪些文本),但**最终哪些
中文业务文本要替换,须由你/开发者审一遍**——不交 Codex 盲跑定稿。

## 15. 测试方案 + 验证

- **离线单测**(对脱敏 fixture):`select-artboard`、`clean-tree`、`visual` 构建、`symbols`
  (含循环)、`names` 确定性、`semantic` 候选、整体 `normalize` 产物过 `validateDesignIR()` 且
  `schemaVersion === v0.2.0`。
- **确定性测试**:同 fixture 跑两次 → 字节级一致。
- **d2c-core 单测**:新 visual/semantic schema 的正/反例。
- **端到端**(本地可验):`normalize` 真实 `raw-dsl.json` → 合法 `design-ir.json`,人工抽查
  `visual` 树对参考设计是否忠实。
- `tsc --noEmit` 干净;根 `test:sketch` / `test:d2c` 全过。

## 16. 出口标准

- d2c-core 升 `v0.2.0`,`visual`/`semantic` 有真 schema,单测覆盖。
- `normalize` 产物过 `validateDesignIR()`,`normalizeAndValidate()` 自检通过。
- `SketchProvider` 组装完成(`extractRaw` + `normalize` 都实接),CLI `normalize` 可用。
- 脱敏 fixture 的单测全过、离线、确定性可复跑。
- 真实 `d2c.sketch` 端到端产合法 `design-ir.json`,`visual` 树对参考设计忠实。
- `tsc --noEmit` 干净。
- **同步**:总纲 `architecture.md` / `-zh.md` 里 `design-ir.json` 示例的 `schemaVersion` 从
  `v0.1.0` 改 `v0.2.0`(否则架构文档误导)。

## 17. 已定决策(原待拍板,review 后定稿)

1. **`visual`/`semantic` 进 d2c-core 升 v0.2.0** —— ✅ 同意。`visual` 真契约;`semantic` 只最小
   候选 envelope,props/events/states 不在 Stage 3 定死。
2. **目标画板选择** —— ✅ 启发式 + `--artboard` 兜底,但**多候选不静默猜**:优先级
   `--artboard <id>` > `--artboard <精确名>` > 自动唯一候选;多候选 → 报错并列出候选。
3. **symbol** —— ✅ Stage 3 就地展开 master、不做抽象;但 IR 保留 `instanceId`/`masterId`/
   override trace,并加循环保护。
4. **fixture 脱敏** —— ✅ Codex 可出候选 + 脱敏报告,最终替换内容由人审。
5. **Stage 3 拆分** —— ✅ 一个 Stage,含 thin semantic,内部按 3A/3B/3C 顺序执行。
