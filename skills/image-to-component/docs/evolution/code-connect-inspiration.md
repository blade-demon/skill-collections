# Code Connect 思路对本 Skill 的启发

本文档记录 image-to-component skill 在设计 **decision-gate** 和 **token-ledger** 两套机制时，从 Figma Code Connect 借鉴的核心思路。用于后续迭代时回溯设计动机，避免在演进过程中丢失原始意图。

---

## 背景：Code Connect 解决的问题

Figma Code Connect 解决的核心问题是：**设计稿中的组件 ↔ 代码库中的组件**之间的映射不能依赖 AI/工具的猜测，必须由开发者**显式声明**。

它的两个关键机制：

1. **`hasCodeConnect()` 检查** —— 在生成/查询代码时，先判断「这个 Figma 组件是否已经被显式绑定到代码组件」。如果没有，工具不会盲目生成；它会要么报告"未绑定"，要么回退到保守输出。
2. **`figma.connect()` 元数据** —— 开发者写一个 `*.figma.tsx` 文件，明确声明 Figma 组件 → 代码组件 + props 映射 + 示例。这份元数据是单一事实源（single source of truth）。

这两个机制让设计→代码的映射变成**显式、可审计、可版本控制**的过程，而不是 AI 在生成时即兴猜测。

---

## 启发点 1：`hasCodeConnect()` → Decision-Gate

### Code Connect 的做法

伪代码：

```ts
function generateCodeForFigmaNode(node) {
  if (!hasCodeConnect(node)) {
    // 没有显式绑定 → 不生成、不猜测
    return { status: "unmapped", suggestion: "Define figma.connect() for this node" };
  }
  const mapping = getCodeConnect(node);
  return renderFromMapping(mapping);
}
```

**关键设计：** 检查在生成**之前**发生。未绑定的节点不会进入代码输出，而是被标记为「需要开发者处理」。

### 我们的 Decision-Gate

把同一思想搬到 skill 中：每个不确定的决策**在代码生成之前**必须通过一个用户确认门（gate）。

伪代码：

```
for each detected_token in style_extraction_result:
  if detected_token.confidence == "high" and exists_in_project_tokens:
    mark as "provided" (auto-approved, parallel to hasCodeConnect() == true)
  else:
    add to token_ledger as "pending"
    
if any token_ledger row is "pending":
  show decision-gate (A/B/C)
  wait for user
  apply user's decisions
  
proceed_to_code_generation()  # 只使用 confirmed 的映射
```

### 映射关系一览

| Code Connect | image-to-component |
|---|---|
| `hasCodeConnect(node)` 检查 | Image Connect / Style Connect 的 decision-gate |
| `true` → 直接用绑定 | `status: provided` → 直接生成代码 |
| `false` → 报告 unmapped、不生成 | `status: pending` → 进 ledger，等待用户决定 |
| 开发者补 `figma.connect()` | 用户在 gate 选 A/B/C，把 pending 解决为 provided/create/hardcoded |
| 工具不在未绑定时即兴生成 | 主代理不在未确认 token 时即兴生成 CSS |

### 为什么这层借鉴是核心的

如果没有 gate，AI 在面对未匹配的 token 时只有两条路：**猜一个**或者**编一个新的**。Code Connect 教给我们的关键一课是：**不绑定不生成**是一个比"尽力猜测"更安全、更可审计的默认行为。

decision-gate 在我们的 skill 中起的就是这个"未绑定不生成"的闸门作用。

---

## 启发点 2：`figma.connect()` 元数据 → Token-Ledger 的「建议名 + 状态」双轨结构

### Code Connect 的做法

一个典型的 `figma.connect()` 文件：

```ts
import figma from "@figma/code-connect";
import { Button } from "./Button";

figma.connect(Button, "https://www.figma.com/file/xxx?node-id=1:2", {
  props: {
    label:   figma.string("Label"),
    variant: figma.enum("Variant", { Primary: "primary", Secondary: "secondary" }),
    icon:    figma.boolean("HasIcon"),
  },
  example: (props) => <Button variant={props.variant}>{props.label}</Button>,
});
```

注意它的双轨设计：

1. **建议/提议轨**：`props.label = figma.string("Label")` —— 这是**对应关系的提议**，告诉系统"Figma 那边的 Label 文本对应代码这边的 label prop"。
2. **状态/激活轨**：这个文件存在 + 被工具读取 + 没有报错 = **mapping 已生效**。

这两条轨是分开的：**提议**和**激活**不是同一回事。可以有"建议但未激活"（文件存在但工具发现 props 不匹配）的中间状态。

### 我们的 Token-Ledger 双轨

token-ledger 的列设计直接对应这个双轨思想：

```markdown
| Token ID | Visual trait | Suggested token name | Confidence | Status | User action |
|---|---|---|---|---:|---|
| token-002 | Card shadow  | `--shadow-elevation-2` | high | pending  | Confirm mapping |
| token-001 | Border radius| `--radius-md`          | high | provided | Exists in project |
```

**双轨分解：**

| 轨道 | Code Connect 对应 | token-ledger 列 | 含义 |
|---|---|---|---|
| **建议轨** | `figma.string("Label")` 这段声明 | `Suggested token name` + `Confidence` | AI 提议的映射候选 + 置信度 |
| **状态轨** | 文件存在 + 工具校验通过 | `Status` + `User action` | 该映射当前是否生效、用户需做什么 |

### 关键洞察：为什么必须分开

如果只有"建议名"一列（合并轨），就会变成：

```
| Token | Suggested |
| ...   | --radius-md |
```

这等于在隐式地告诉代码生成器"就用这个"，回到了 AI 即兴生成的老路。

分开为两轨后：

- **建议轨** 是 AI 的工作产物，可以多、可以错、可以低置信度。
- **状态轨** 是用户的工作产物，决定哪个建议会进入代码。

代码生成器永远只读 **状态轨 = `provided` / `reused` / `create` / `hardcoded`** 的行；`pending` 行被拦在生成之外，正如 Code Connect 中未声明的节点被拦在生成之外。

### 一个具象类比

| | Code Connect | token-ledger |
|---|---|---|
| AI 提议 | 工具扫描 Figma 节点，给出可能对应的代码组件候选 | 子代理提取 style hint，给出可能对应的 token 名 |
| 建议名形式 | `figma.connect(Button, ...)` 草稿 | `Suggested token name: --radius-md` |
| 状态激活 | 开发者 review、调整、commit 该文件 | 用户在 gate 选择 A/B/C，更新 status |
| 代码生成读取 | 只读 committed 的 `*.figma.tsx` | 只读 `Status != pending` 的行 |

---

## 未借鉴的部分（边界）

为避免后续迭代时混淆，明确**没有**搬过来的部分：

| Code Connect 特性 | 是否借鉴 | 原因 |
|---|---|---|
| `hasCodeConnect()` 检查机制 | ✅ 借鉴 | 映射为 decision-gate |
| `figma.connect()` 双轨元数据 | ✅ 借鉴 | 映射为 token-ledger 列结构 |
| `*.figma.tsx` 文件作为单一事实源 | ❌ 未借鉴 | skill 是一次性生成场景，元数据持久化由 `.image-to-component.rules.md` 承担，不需要每个映射一个文件 |
| `figma.string/enum/boolean()` 类型化助手 | ❌ 未借鉴 | 我们的 token 类型由 style-context-spec.md 的枚举约束，不需要在 ledger 中重新定义类型语义 |
| Storybook / CI 集成 | ❌ 未借鉴（当前阶段） | 仅在 `render-verification.md` 中预留入口，未做强绑定 |
| Variant 矩阵展开 | ⚠️ 部分借鉴 | 通过 status 字段隐式表达（pending/expired 等），未做矩阵化 |

---

## 后续演进方向

这份借鉴打开了几条可延展的路径，按优先级排序：

1. **把 `.image-to-component.rules.md` 升级为持久化的 token-ledger 上游**  
   类比：让规则文件起 `figma.connect()` 文件的"单一事实源"作用。下次运行时不再从零提议，而是先 lookup 已确认的 token 映射。

2. **为 Image Connect 也补一份独立的"组件元数据描述文件"**  
   类比 `*.figma.tsx`，让用户可以一次声明"我项目中的 `<Button>` 对应 action 角色 + 这些 props"，避免每次都让 AI 现场扫描候选。

3. **引入 confidence 衰减 / TTL 机制**  
   Code Connect 的元数据是开发者维护、不会自然失效的；我们的 token-ledger 可能因为项目 token 重命名而过期。可以借鉴它的"确定性"，反过来在我们这边补一个失效检查。

4. **多代理协同时的 gate 合并**  
   当未来出现并行的 Image Connect + Style Connect + Asset Handling 三个 gate 时，应该考虑合并为一个总 gate，避免用户被多次打断。Code Connect 的批量处理模式可参考。

---

## 一句话总结

> Code Connect 的核心哲学是「**未声明不生成**」。我们把"声明"这个动作从"开发者预先写 `figma.connect()` 文件"改造成"用户在 decision-gate 里现场确认"，把"事实源"从持久化的 `*.figma.tsx` 改造成会话级的 token-ledger，但**未声明不生成**这条铁律完整保留。

---

**记录时间：** 2026-05-16  
**对应实现：** `workflows/style-connect.md`、`workflows/image-connect.md`、`docs/ledger-and-gate-pattern.md`
