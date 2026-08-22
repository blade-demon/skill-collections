# image-to-component 确定性结构比较器设计

## 背景

`image-to-component` 已能将截图压缩成经过校验的结构 signature，并在
`workflows/structural-comparison.md` 中描述同一组件、多状态、不同组件和人工复核的判断规则。
但 Step 6 目前仍由 agent 按文档手工执行，无法通过自动测试证明黄金案例的判断长期稳定。

现有回归 fixture 全是单截图，`tests/README.md` 因此明确记录了“同一组件多状态判断尚未覆盖”。
`examples/golden-cases.md` 已提供五组机器可表达的 signature，其中 Case A 的
`pending`、`used`、`expired` 正好覆盖该缺口。

文档还存在一处规则优先级歧义：一般规则要求“两个以上 slot 的 leaf 增删进入人工复核”，
而 Case A 同时在 M、B 两个 slot 变化，却明确要求判为同一组件状态。将规则代码化时需要消除该矛盾。

## 目标

新增确定性的 TypeScript 结构比较器和 CLI，使已校验 signature 可以自动得到：

- 基础组件判断：`same-component`、`different-components` 或 `manual-review`；
- 每对图片的稳定 reason code 与逐 slot 差异；
- 每张图片的机械结构 skeleton；
- 与基础组件身份分离的 overlay 分组；
- 可由 Vitest 覆盖的多状态黄金回归。

## 非目标

- 不新增、合成或修改截图。
- 不自动读取图片或调用视觉模型。
- 不处理 Step 2 用户声明、Image Connect 或 candidate-group 决策门控；这些仍由工作流消费机械结果后执行。
- 不自动生成 props 或组件 skeleton 代码。
- 不改变 signature JSON、role 词汇表或 slot 语法。

## 模块边界

### Slot AST

扩展 `scripts/src/lib/slot-parser.ts`，让现有 parser 在校验语法的同时构造 AST。
保留 `validateSlotExpr()` 的返回形状与行为，避免破坏现有调用方；新增解析 API 供比较器复用。

AST 需要表达：

- leaf role 与可选的 `?`；
- container role 及其嵌套表达式；
- `->` 序列；
- `+` 横向并列；
- 缺失 slot `-`。

比较器不得再实现第二套正则或 parser。语法校验与结构分析必须共享同一 AST，以免 grammar 演进后发生漂移。

### 机械比较库

新增 `scripts/src/lib/structural-comparison.ts`，提供纯函数接口。该模块只接收已解析或已校验的 signature，
不读取文件、不输出 prompt、不处理用户选择。

它负责：

1. 为 T/M/B/F 生成结构 skeleton；
2. 统计 role 数并分析 leaf 差异；
3. 对所有图片执行全量两两比较；
4. 按固定优先级汇总总体 decision；
5. 独立聚合 O slot 与 `overlay_type`。

### CLI

新增 `scripts/src/compare-signatures.ts`，并在 scripts package 中暴露 `compare-signatures` 命令。
CLI 从 stdin 读取一个或多个已校验 batch：

```json
{
  "batches": [
    {
      "batch": "batch-1",
      "images": [
        {
          "filename": "pending.png",
          "signature": { "T": "title", "M": "card(meta)", "B": "-", "O": "-", "F": "-" },
          "notes": {}
        },
        {
          "filename": "used.png",
          "signature": { "T": "title", "M": "card(meta -> status)", "B": "-", "O": "-", "F": "-" },
          "notes": {}
        }
      ]
    }
  ]
}
```

CLI 展平 batch，但拒绝跨 batch 重复文件名。它仍会执行 schema 与 slot 语法防御性校验，
因此错误输入不会进入比较算法。

## 输出契约

成功输出使用带 `valid` 字段的稳定 JSON：

```json
{
  "valid": true,
  "result": {
    "decision": "same-component",
    "reasonCodes": ["leaf-added"],
    "skeletons": [
      {
        "filename": "pending.png",
        "slots": { "T": "_", "M": "card(_)", "B": "-", "F": "-" }
      },
      {
        "filename": "used.png",
        "slots": { "T": "_", "M": "card(_ -> _)", "B": "-", "F": "-" }
      }
    ],
    "pairs": [
      {
        "left": "pending.png",
        "right": "used.png",
        "decision": "same-component",
        "reasonCodes": ["leaf-added"],
        "slotDiffs": [
          {
            "slot": "M",
            "kind": "leaf-added",
            "left": "card(meta)",
            "right": "card(meta -> status)",
            "roleDelta": 1
          }
        ]
      }
    ],
    "overlayGroups": []
  }
}
```

其中：

- `decision` 是总体基础组件判断；
- `reasonCodes` 聚合影响总体判断的稳定原因；集合级原因（如 `manual-mixed-large-set`）只出现在此处；
- `skeletons` 按输入图片顺序记录 `filename` 与 T/M/B/F `slots` 的机械 skeleton；
- `pairs` 按输入顺序生成稳定的 `(i, j)` 两两结果，包含 `left`、`right`、pair `decision`、
  `reasonCodes` 与 `slotDiffs`；每个 slot diff 记录 slot、差异类型、左右原始表达式及 role delta；
- `overlayGroups` 按 `overlay_type` 分组，记录对应文件和 O slot skeleton；无 overlay 的图片不建立伪分组。

错误输出为：

```json
{
  "valid": false,
  "errors": ["具体错误"]
}
```

无效 JSON、schema 错误、slot 语法错误、重复文件名或不足两张图片均以非零状态退出。

## 结构 Skeleton

结构 skeleton 保留 container role、容器嵌套以及 `->` / `+` 拓扑，将所有 leaf role 归一化为 `_`。
`?` 不进入 skeleton，但作为 leaf 差异单独记录。

用于身份判断的 **container topology** 是 AST 的另一种投影：保留 container role、container 之间的
父子关系及连接方式，但忽略 leaf 身份与 leaf 数量。比较器不能直接用展示用 skeleton 字符串相等
代替 container topology 比较，否则合法的 leaf 增删会被误判为容器变化。leaf-only slot 在该投影中
没有 container；其内容变化交给 leaf 差异规则判断。

leaf 差异分类还使用完整的 **leaf layout 投影**：忽略 leaf 的 role 与 `?`，但保留每个 leaf 在 AST
中的 `->` / `+` 位置和 container 归属。完全相同、`uncertain-leaf` 与 `leaf-swap` 只有在该投影一致时
成立。单 leaf 增删不仅要求 role 与 `?` 的有序子序列且数量恰差 1，还必须能从较长 AST 删除恰好
该 leaf 后得到较短 AST；其余 leaf 的操作符位置和 container 归属不得变化。

示例：

```text
title -> list(card(title -> meta))
```

转换为：

```text
_ -> list(card(_ -> _))
```

`-` 保持为 `-`。O 不参与基础 skeleton 汇总。

## 判断算法与优先级

### Pair 判断

每对图片按以下顺序判断：

1. 比较 T/M/B 的 container 类型、container 父子关系与 container 之间的操作符拓扑；任一不一致即
   `different-components`，reason 为 `container-topology-changed`。
2. 比较 T/M/B 的总 role 数（F 和 O 不计入阈值）。若 `minRoleCount / maxRoleCount < 0.5`，判为
   `different-components`，reason 为 `role-count-threshold-exceeded`。恰好 0.5 不触发该规则。
3. F slot 的出现、消失或 leaf 变化记录为 `floating-variant`，不改变基础组件身份。
4. 对 container 拓扑一致的 slot 分类 leaf 差异：
   - leaf layout 投影一致时，leaf role 一对一互换：`leaf-swap`；
   - leaf layout 投影一致时，仅 `?` 出现或消失：`uncertain-leaf`；
   - role 与 `?` 有序子序列恰差一个，且从较长 AST 删除该 leaf 后其余 AST 完全一致：
     `leaf-added` 或 `leaf-removed`；
   - leaf-only slot 的内容整体替换：`whole-slot-replaced`。
5. 上述差异均可解释为状态变化，pair 判为 `same-component`。
6. 相同 leaf 的操作符或 container 归属发生变化，以及其他无法由上述规则解释、但未达到不同组件
   条件的复杂 leaf 变化，判为 `manual-review`，reason 为 `unresolved-leaf-variation`。

### 多 Slot 与大集合规则

“两个以上 slot 有变化”不再单独触发人工复核。只有两个以上基础 slot 中存在
**未被白名单规则解释**的 leaf 变化时，才输出 `manual-multi-slot-variation`。

因此黄金 Case A 的 M 新增 `status` 与 B leaf-only 整体替换都属于可解释状态变化，
总体仍为 `same-component`。

当图片数不少于四张，且全量 pair 中同时出现 leaf 增删与整体替换等混合模式，
比较器输出 `manual-mixed-large-set`，要求 agent 使用黄金案例和人工 review 工作流确认。
纯粹重复同一种已解释差异不因图片数量自动降级。

### 总体判断

将所有 pair 结果按固定优先级汇总：

1. 任一 pair 为 `different-components` → 总体 `different-components`；
2. 否则任一 pair 为 `manual-review` → 总体 `manual-review`；
3. 否则总体 `same-component`。

这种全量两两比较避免只与第一张图比较造成非传递性遗漏。

### Overlay

O slot 不影响基础组件 identity：

- overlay 出现或消失只产生 overlay candidate；
- 相同 `overlay_type` 聚合为同一 overlay group；
- 不同 `overlay_type` 产生不同 group；
- group 保留各文件 O slot skeleton，供后续判断 overlay 自身是否需要进一步拆分。

## 错误处理

- CLI 对输入先运行 Zod schema 校验，再运行每个 slot 的 parser。
- 错误顺序必须稳定：batch 顺序、图片顺序、T/M/B/O/F slot 顺序。
- 一次返回所有可发现错误，便于 diagnostic redispatch，不在首个 slot 错误处提前结束。
- 比较库假定输入已有效；CLI 和调用方负责在边界处拒绝无效数据。
- reason code 是机器契约，面向用户的自然语言解释仍由工作流生成。

## 测试策略

### Parser 兼容性

- 保留现有 `validateSlotExpr()` 全部测试。
- 新增 AST 形状测试，覆盖 leaf、`?`、嵌套 container、`->`、`+` 与 `-`。

### 黄金案例

将 `examples/golden-cases.md` 的 Case A–E 作为机器可执行 fixture：

| Case                        | 预期结果                                        |
| --------------------------- | ----------------------------------------------- |
| A：pending / used / expired | `same-component`                                |
| B：列表页 / 详情页          | `different-components`                          |
| C：详情页 / 确认弹窗        | 基础 `same-component`，一个 modal overlay group |
| D：idle / error             | `same-component`                                |
| E：空状态 / 列表            | `different-components`                          |

### 边界与聚合

- F slot 出现/消失；
- 相同和不同 `overlay_type`；
- role 数比例恰好 0.5 与小于 0.5；
- 四张以上图片的单一变化模式与混合模式；
- 三张以上图片中仅一个 pair 触发不同组件；
- 多 batch 展平、稳定 pair 顺序与重复文件名拒绝；
- CLI 成功与失败退出状态。

## 文档集成

- `skills/image-to-component/SKILL.md`
  - Scripts 表新增 `compare-signatures`；
  - Step 6 明确调用 CLI，并根据 `decision` 路由到后续工作流。
- `skills/image-to-component/workflows/structural-comparison.md`
  - 以 CLI 输出为机械判断权威；
  - 修正“2+ slot”规则，使其只针对未解释差异；
  - 保留用户声明冲突检查与人工 gate。
- `skills/image-to-component/tests/README.md`
  - 移除“多状态未覆盖”说明；
  - 增加确定性黄金回归入口，同时保留现有截图人工回归说明。
- `skills/image-to-component/examples/golden-cases.md`
  - 保留供 agent 阅读的解释，与机器 fixture 使用同一组语义预期。

## 兼容性与演进

- 不修改现有 `BatchResultSchema` 与 signature 协议。
- 不删除或改变现有 npm script。
- `validateSlotExpr()` 继续作为公共校验入口。
- 比较器 reason code 视为后续工作流可依赖的稳定接口；新增 code 可以向后兼容，重命名或删除需要同步迁移文档与测试。
- 用户声明和 candidate group 逻辑暂不进入比较器，避免把交互语义固化进机械核心。

## 完成标准

- `npm run typecheck:image` 通过；
- `npm run test:image` 覆盖黄金 Case A–E 与所有边界项并通过；
- CLI 对 Case A 输出 `same-component`，对 Case B/E 输出 `different-components`；
- Case C 输出基础 `same-component` 和 modal overlay group；
- 文档不再声称同一组件多状态判断缺少自动覆盖；
- 不新增截图、视觉模型依赖或外部服务依赖。
