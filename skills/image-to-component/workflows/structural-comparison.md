# 结构对比工作流

在所有保留的 signature batch 校验通过后使用。

## 输入

- 来自 `protocols/subagent-return-format.md` 的已校验 signature JSON 对象。
- Step 2 用户意图声明（如有）。
- 来自文件名预分组或 Stage A 大目录分组的候选组。

## 机械规则

Step 6 必须先将全部已校验 signature batch 组装为 `{ "batches": [...] }`，再运行：

```bash
echo '<comparison input JSON>' | npm run compare-signatures
```

CLI 的 `{ valid: true, result }` 是机械对比结果的权威。CLI 输入或 slot 校验失败时，先修复输入，不得绕过 CLI 以人工判断基础 decision。

结构 skeleton = 去掉 leaf role，保留 container role 与拓扑。例：`title -> list(card(title -> meta))` 变为 `_ -> list(card(_ -> _))`。

先剥离 `O`，仅比较 `T`、`M`、`B` 以判断基础组件身份；`F` 仅记录 floating variant，不影响 identity：

| 条件                                           | 决策         |
| ---------------------------------------------- | ------------ |
| 结构 skeleton 相同，或仅差下方允许的 leaf 变化 | 候选同一组件 |
| 任一 container role 或拓扑不同                 | 不同组件     |
| 最小总 role 数 / 最大总 role 数 `< 0.5`        | 不同组件     |

role ratio **恰好 `0.5` 不触发**不同组件判断。

对候选同一组件：

leaf layout 投影会忽略 role 与 `?`，但保留每个 leaf 的 `->` / `+` 位置和 container 归属。
完全相同、uncertain 或 role swap 只有在该投影一致时才属于白名单。单 leaf 增删还必须能从较长 AST
删除恰好该 leaf，并保持其余 leaf 的完整布局不变。

| 差异                                                                 | 分类                                        |
| -------------------------------------------------------------------- | ------------------------------------------- |
| 相同 leaf layout 中 role 互换，如 `hint` 到 `status`                 | 状态 variant                                |
| 相同 leaf layout 中出现或消失 leaf `?`                               | 状态 variant，不确定                        |
| Leaf 增删：有序子序列恰差 1，且删除该 leaf 后其余 AST 完全一致       | 状态 variant                                |
| 某 slot 的 leaf-only 内容被完全替换                                  | 状态 variant                                |
| 相同 leaf 的 operator/container placement 变化或其他未解释 leaf 变化 | 结构 variant；`unresolved-leaf-variation`   |
| 未解释 leaf 变化跨 2+ 个不同 slot                                    | 结构 variant；`manual-multi-slot-variation` |
| 容器内重复次数变化，且可由上述单 leaf 增删规则解释                   | 状态 variant，数据驱动                      |

仅当四张及以上图片同时出现 leaf 增删与 leaf-only 整体替换，且没有任何 `different-components` pair 时，CLI 才加入 `manual-mixed-large-set` 并运行 `manual-review-exit.md`。若存在任一 `different-components` pair，顶层决策保持 `different-components`，优先于该人工复核 reason。

Overlay 处理：

- 剥离 `O` 后比较基础层。
- 将 `O` slot 单独聚合为 overlay 候选。
- 不同 `overlay_type` 表示不同 overlay 组件。
- `overlayGroups` 不改变基础 `decision`。

F-slot 出现/消失为 floating 状态 variant，本身不决定组件身份。

## 声明冲突检查

在 CLI 得出基础 `decision` **之后**，若用户在 Step 2 声明了关系，将其作为默认意图与机械结果对比：

| 声明               | 机械结果         | 动作                                                |
| ------------------ | ---------------- | --------------------------------------------------- |
| 同一组件，N 个状态 | 同一组件         | 应用声明并继续                                      |
| 同一组件，N 个状态 | 不同组件         | 暂停并询问强制合并、接受拆分或用 corrected 图片重启 |
| 不同组件           | 同一组件         | 应用声明；语义意图优先                              |
| 顺序流程           | 相同/手动 review | 使用 `step` 或 `phase` discriminator                |

## 退出

- 同一组件 / 状态 variant：继续 Image Connect，然后 prop 建模。
- 不同组件：按组件/组分别运行后续步骤。
- `manual-review`：先展示 `pairs[].slotDiffs` 以及顶层和 pair 级 reason codes，再运行 `manual-review-exit.md`。
- CLI 路由完成后，用户声明冲突或候选组冲突：运行 `candidate-group-conflicts.md`。
