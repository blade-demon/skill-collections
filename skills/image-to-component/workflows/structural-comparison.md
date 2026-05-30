# 结构对比工作流

在所有保留的 signature batch 校验通过后使用。

## 输入

- 来自 `protocols/subagent-return-format.md` 的已校验 signature JSON 对象。
- Step 2 用户意图声明（如有）。
- 来自文件名预分组或 Stage A 大目录分组的候选组。

## 机械规则

结构 skeleton = 去掉 leaf role，保留 container role 与拓扑。例：`title -> list(card(title -> meta))` 变为 `_ -> list(card(_ -> _))`。

先剥离 `O`，仅比较 `T`、`M`、`B`、`F` 以判断基础组件身份：

| 条件                                           | 决策         |
| ---------------------------------------------- | ------------ |
| 结构 skeleton 相同，或仅差下方允许的 leaf 变化 | 候选同一组件 |
| 任一 container role 或拓扑不同                 | 不同组件     |
| 总 role 数差异超过 50%                         | 不同组件     |

对候选同一组件：

| 差异                                  | 分类                                       |
| ------------------------------------- | ------------------------------------------ |
| Leaf role 互换，如 `hint` 到 `status` | 状态 variant                               |
| 出现 leaf `?`                         | 状态 variant，不确定                       |
| Leaf 增删且总数变化 <= 1              | 状态 variant                               |
| 某 slot 的 leaf-only 内容被完全替换   | 状态 variant                               |
| 2+ 个不同 slot 中 leaf 增删           | 结构 variant；运行 `manual-review-exit.md` |
| 容器内重复次数变化                    | 状态 variant，数据驱动                     |

Overlay 处理：

- 剥离 `O` 后比较基础层。
- 将 `O` slot 单独聚合为 overlay 候选。
- 不同 `overlay_type` 表示不同 overlay 组件。

F-slot 出现/消失为状态 variant，本身不决定组件身份。

## 声明冲突检查

若用户在 Step 2 声明了关系，将其作为默认决策，但与机械结果对比：

| 声明               | 机械结果         | 动作                                                |
| ------------------ | ---------------- | --------------------------------------------------- |
| 同一组件，N 个状态 | 同一组件         | 应用声明并继续                                      |
| 同一组件，N 个状态 | 不同组件         | 暂停并询问强制合并、接受拆分或用 corrected 图片重启 |
| 不同组件           | 同一组件         | 应用声明；语义意图优先                              |
| 顺序流程           | 相同/手动 review | 使用 `step` 或 `phase` discriminator                |

## 退出

- 同一组件 / 状态 variant：继续 Image Connect，然后 prop 建模。
- 不同组件：按组件/组分别运行后续步骤。
- 结构 variant：运行 `manual-review-exit.md`。
- 候选组冲突：运行 `candidate-group-conflicts.md`。
