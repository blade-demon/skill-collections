---
name: image-to-component
description: 当用户指向 UI 截图或设计 mockup 图片目录，需要结构优先的组件 skeleton、状态对比、prop 建模或截图衍生 variant 时使用。若有 Sketch、Figma 或 MasterGo 源数据可用于高保真样式，应改用 design-source 工作流。
---

# image-to-component

## 概述

将 UI 截图目录转为带类型的组件 skeleton。**关键步骤是结构对比优先**：多张截图常代表同一组件的不同状态，而非多个组件。

这是**截图到 skeleton** 工作流。可从像素推断结构、variant、props 与资源需求，但截图不可靠地包含源级样式数据（如 design token、图层名、组件实例、可导出矢量或布局约束）。要从结构化设计数据高保真生成，请路由到 design-source 工作流 —— `sketch-to-component` / `mastergo-to-component` / `figma-to-component` provider（均在开发中）。

**硬上下文边界：** 主 agent 不得直接读取图片文件。图片读取仅发生在 signature 子 agent、coarse-signature 子 agent 或可选 style-context 子 agent 内。若子 agent 派发不可用，使用 `workflows/degraded-mode.md`。

## 路由图

仅在对应触发条件成立时加载支持文档：

| 区域                                   | 文件                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| 项目规则初始化                         | `workflows/init-project-rules.md`                                                    |
| 大目录与两阶段读取                     | `workflows/large-directory.md`                                                       |
| 子 agent 不可用 / 不支持框架           | `workflows/degraded-mode.md`                                                         |
| Coarse Stage A 协议                    | `protocols/coarse-signature-format.md`                                               |
| 完整 signature JSON 协议               | `protocols/subagent-return-format.md`                                                |
| 可选样式提示协议                       | `protocols/style-context-spec.md`                                                    |
| Signature 校验重派发                   | `workflows/diagnostic-redispatch.md`                                                 |
| Signature 摘要与 JSX 树输出            | `workflows/summarize-signatures.md`                                                  |
| 结构对比                               | `workflows/structural-comparison.md`                                                 |
| 手动结构 review                        | `workflows/manual-review-exit.md`                                                    |
| 候选组冲突                             | `workflows/candidate-group-conflicts.md`                                             |
| Image Connect reuse/extend/create 映射 | `workflows/image-connect.md`                                                         |
| Style Connect token 映射与 ledger      | `workflows/style-connect.md`                                                         |
| Style Plan CSS 生成输入                | `workflows/style-plan.md`                                                            |
| Prop 建模                              | `workflows/prop-modeling.md`                                                         |
| 资源与图标硬规则                       | `workflows/asset-handling.md`                                                        |
| 代码生成与模板                         | `workflows/code-generation.md` —— 调用 `scripts/generate-skeleton`                   |
| 输出与文件写入                         | `workflows/output-and-writing.md`                                                    |
| Scripts 包                             | `scripts/` —— validate-signature, validate-coarse, coverage-table, generate-skeleton |
| Signature 覆盖表                       | `workflows/coverage-table.md`                                                        |
| 可选渲染验证                           | `workflows/render-verification.md`                                                   |

语法与 role 词汇表始终使用 `protocols/signature-spec.md`。手动 review 触发或对比 4+ 个含混合 leaf 增删的 signature 时，阅读 `examples/golden-cases.md`。

## Scripts

所有命令从 `skills/image-to-component/scripts/` 运行。需要 Node.js 20+，首次使用需 `npm install` 一次。

| Script                     | 用法                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| 校验完整 signature 批次    | `echo '<json>' \| npm run validate-signature -- --batch batch-1 --expected-files a.png b.png` |
| 校验 coarse signature 批次 | `echo '<json>' \| npm run validate-coarse -- --batch batch-1 --expected-files a.png b.png`    |
| 比较完整 signature 集合    | `echo '<comparison input JSON>' \| npm run compare-signatures`                                |
| 生成覆盖表                 | `echo '<json>' \| npm run coverage-table`                                                     |
| 生成组件 skeleton          | `echo '<json>' \| npm run generate-skeleton`                                                  |

输出格式：`validate-*` 脚本打印 `{"valid":true}` 或 `{"valid":false,"errors":[...]}`，失败时非零退出。`coverage-table` 打印 markdown 表。`generate-skeleton` 打印 `[{path,content}]` JSON 数组。

## 步骤骨架

### Step 0 —— 确保项目规则

解析目标项目根。若缺少 `.image-to-component.rules.md`，运行 `workflows/init-project-rules.md`；否则读取它作为项目约定权威。完成前不得读取图片。

### Step 1 —— 收集上下文

确认 framework、输出 mode、language、style stack 及是否启用可选样式提示。推荐默认：React、chat 输出、TypeScript、CSS Modules、样式提示关闭。不要假设缺失答案。

若用户有 Sketch、Figma 或 MasterGo 源数据且要求准确样式，暂停并路由到 design-source 管线，而非继续截图推断。仅当可用输入为截图/图片，或用户明确要求较低保真 skeleton 时在此继续。

### Step 2 —— 捕获用户意图

记录用户声明的图片关系：同一组件状态、不同组件或顺序流程步骤。将声明作为结构对比输入，须做冲突检查。

### Step 3 —— 列出文件并规划批次

运行 `ls <directory>` 或等效命令。图片数量处理、文件名预分组、Stage A coarse 扫描与 Stage B 完整 signature 选择使用 `workflows/large-directory.md`。

### Step 4 —— 派发子 agent

Stage A 大目录扫描：派发 `prompts/coarse-signature-prompt.md`，用 `protocols/coarse-signature-format.md` 校验。

每个完整 signature 批次：派发 `prompts/subagent-prompt.md`，用 `protocols/subagent-return-format.md` 校验。分配稳定 batch id 并放入 dispatcher-instructions fence。

若启用了样式提示，对相同批次派发 `prompts/style-context-prompt.md`，用 `protocols/style-context-spec.md` 校验。样式提示必须与结构 signature 分离。

若子 agent 派发不可用，运行 `workflows/degraded-mode.md`。

### Step 5 —— 校验并摘要 Signature

> **Script：** 收到子 agent JSON 后，从 `skills/image-to-component/scripts/` 运行校验：
>
> ```bash
> echo '<subagent return JSON>' | npm run validate-signature -- --batch batch-1 --expected-files file1.png file2.png
> ```
>
> 非零退出表示校验失败；打印的 `errors` 数组描述需修复项。Stage A coarse 批次改用 `npm run validate-coarse`。

对比前校验所有子 agent JSON。首次校验失败运行 `workflows/diagnostic-redispatch.md`；永不重发未改 prompt。第二次失败则请求 corrected JSON、跳过批次或停止。

Step 6 前运行 `workflows/summarize-signatures.md`，为每张图输出自然语言结构摘要与机械 JSX 组件树。除非调试校验，不要向用户展示 raw signature JSON。不要添加 signature 未携带的 visual 信息。

### Step 6 —— 对比结构

将全部已校验 batch 组装成 `{ "batches": [...] }` 后，先运行机械比较：

```bash
echo '<comparison input JSON>' | npm run compare-signatures
```

该命令输出 `{ "valid": true, "result": ... }`；仅当 `valid` 为 `true` 时使用 `result` 继续。`result.decision` 是 Step 6 的机械结果权威，按以下路径处理：

- `different-components`：按组件/组继续；若与用户的“同一组件”声明冲突，始终展示相关 reason codes。`pairs[].slotDiffs` 非空时展示它；若为空（例如 `role-count-threshold-exceeded` 在 leaf diff 前返回），改用 `result.skeletons` 与 Step 5 结构摘要展示左右结构差异，再等待用户选择强制合并、接受拆分或提供 corrected 图片。
- `manual-review`：展示 `pairs[].slotDiffs` 与顶层和 pair 级 reason codes，然后运行 `workflows/manual-review-exit.md`。
- `same-component`：继续 Image Connect。

`result.overlayGroups` 始终独立处理，不改变基础 `decision`。完成上述 CLI 路由后，才执行 `workflows/candidate-group-conflicts.md` 的用户声明冲突检查和 candidate-group gate。

详细机械规则见 `workflows/structural-comparison.md`。

### Step 7 —— Image Connect

运行 `workflows/image-connect.md`。输出 reuse/extend/create 候选表，prop 建模前等待用户确认。

### Step 8 —— Style Connect（可选）

仅当 Step 1 启用了样式提示时运行。运行 `workflows/style-connect.md`。输出 token-ledger 表，代码生成前等待用户确认 token 映射。未启用样式提示则跳到 Step 9。

Token 决策确认后，运行 `workflows/style-plan.md` 创建 `SkeletonConfig.stylePlan` 对象。生成器消费 `stylePlan` 写入 CSS module 或 BEM CSS 文件。跳过样式提示则省略 `stylePlan`。

### Step 9 —— 定义 Props

运行 `workflows/prop-modeling.md`，对每个 `media` 节点或未知图标运行 `workflows/asset-handling.md`。

### Step 10 —— 生成代码 Skeleton

运行 `workflows/code-generation.md`，从 Step 9 建立的组件树与 prop 定义（及 Step 8 的 `stylePlan`（如有））构建 `SkeletonConfig` JSON。然后运行：

```bash
echo '<SkeletonConfig JSON>' | npm run generate-skeleton
```

输出为 `[{path, content}]` JSON 数组。将该数组作为 Step 11 的文件列表。不要读取 `templates/` —— 那些文件已移除。

### Step 11 —— 输出或写入文件

> **Script：** 构建 `CoverageInput` JSON（entries 含 signaturePath、files、components、status、optional note），然后运行：
>
> ```bash
> echo '<CoverageInput JSON>' | npm run coverage-table
> ```
>
> 将输出 markdown 直接粘贴到响应中。

运行 `workflows/output-and-writing.md`。始终先输出目录树，包含 `workflows/coverage-table.md`；有待处理资源时包含 `asset-ledger.md`；有待处理 token 决策时包含 `token-ledger.md`。

### Step 12 —— 可选渲染验证

仅在 write-file mode 下，当存在 Storybook 或安全 Vite preview 路由且用户未要求跳过验证时，运行 `workflows/render-verification.md`。

## 常见错误

| 错误                                 | 修复                                                          |
| ------------------------------------ | ------------------------------------------------------------- |
| 承诺截图高保真样式                   | 说明截图限制；有源数据时路由到 design-source 工作流           |
| 跳过 `.image-to-component.rules.md`  | 缺失时先运行 init                                             |
| 解析自由文本 signature               | 要求 `protocols/subagent-return-format.md` 的 JSON            |
| 将 Stage A coarse signature 当作最终 | 仅用于选择 Stage B 文件                                       |
| 重发相同错误 prompt                  | 用 `workflows/diagnostic-redispatch.md` 诊断                  |
| 跳过结构对比                         | props/代码前运行 `workflows/structural-comparison.md`         |
| 未请求就创建文件                     | 默认 chat 输出                                                |
| 主 agent 读图片                      | 派发子 agent 或使用 degraded-mode 菜单                        |
| 让样式提示改变结构                   | 保持 `style_hints` 分离                                       |
| 从截图臆造图标名                     | 使用 `workflows/asset-handling.md` 与 asset ledger            |
| 添加新图标包                         | 遵守 `.image-to-component.rules.md`；默认仅 `@iconify/react`  |
| 将 props 拆成状态专用对象            | 保持扁平 discriminator props                                  |
| JS 输出混用 TS 语法                  | 匹配所选 language                                             |
| 无 ledger 硬编码样式值               | 启用样式提示时用 `workflows/style-connect.md` 与 token-ledger |
| 未经用户批准臆造新 token             | 代码生成前须 Style Connect decision-gate                      |
| 跳过 style-connect gate 猜 token     | 运行 `workflows/style-connect.md` 并等待确认 A/B/C            |
