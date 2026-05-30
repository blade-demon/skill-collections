# 降级模式工作流

仅当正常 image-to-component 路径无法为所选 target 产出可运行代码时使用降级模式。

## 触发条件

- 用户选择「其他 framework」。
- 子 agent 派发不可用且用户不允许主 agent 读图。
- 安全写文件所需项目上下文缺失且用户选择仅 chat 的结构输出。

## 子 agent 不可用菜单

若无法派发 signature 子 agent，除非用户显式允许，主 agent 不得读图。询问：

```text
Subagent dispatch is unavailable in this environment, so the main agent cannot read images while preserving the structure-only boundary. Please choose:

A. Provide structured signatures manually - I will paste JSON following protocols/subagent-return-format.md; the skill resumes at signature validation.
B. Allow the main agent to read images this run - accepts the trade-off that the structure-only boundary will be relaxed for this invocation only.
C. Cancel the skill - exit cleanly with no output.
```

## 其他 Framework 输出

用户选择不支持 framework 时：

- 不生成 React 或 Vue 代码。
- 将 Step 11 目录树作为纯结构建议输出。
- 输出由 signature 派生的组件树。
- 说明所选 framework 不支持可运行代码生成。
- 建议将结构手工迁移到目标 framework。

## 手动 Signature

若用户手动提供结构化 signature：

- 使用相同 signature 校验规则校验。
- 失败时展示精确错误，请求 corrected JSON、跳过或停止。
- 成功则恢复结构对比。

## 退出

在以下情况退出降级模式：

- 有效 signature 可用且可恢复对比。
- 用户允许单次边界放宽。
- 用户取消。
