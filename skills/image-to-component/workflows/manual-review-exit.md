# 手动 Review 退出

当机械对比返回「结构 variant（手动 review）」时使用本工作流。

## 触发条件

结构 skeleton 相同但 leaf 节点差异过于歧义、无法自动分类时触发，尤其是：

- 2 个及以上不同 slot 中 leaf 节点增删。
- 4 个及以上 signature 间混合替换/增删模式。
- 无法仅从 signature role 推断业务含义。

## 必需 Prompt

询问决策前展示差异 slot signature 与差异位置：

```text
Structural skeletons are identical, but there are 2+ leaf-node differences; cannot decide mechanically.

Signature comparison:
Image 1  M: <image 1 M slot signature>
         B: <image 1 B slot signature>

Image 2  M: <image 2 M slot signature>
         B: <image 2 B slot signature>

Difference locations: <list specific locations and counts>

Please choose:
A. Different states of the same component (express differences via props)
B. Different components, structure is coincidentally similar (generate independent code skeletons)
C. Sequential steps of one flow that happen to share structure (generate a single component with a step/phase prop)
```

不要用模糊的「不确定」陈述替代。

## 结果

| 用户选择 | 动作                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| A        | 记录 `user confirmed: same component`；继续 prop 建模并将差异映射为 props/status                                         |
| B        | 记录 `user confirmed: different components, coincidentally similar structure`；对每张图/组件分别运行 prop 建模与代码生成 |
| C        | 记录 `user confirmed: sequential flow steps`；使用 `step` 或 `phase` discriminator，在该 discriminator 下建模逐步差异    |

## 说明

相同结构 skeleton 不能证明语义相同。多个无关页面可共享 `T: nav, M: list(form), B: action`，向导步骤可布局相同却代表不同阶段。

本工作流触发或对比 4+ 个含混合 leaf 变化的 signature 时，阅读 `examples/golden-cases.md`。
