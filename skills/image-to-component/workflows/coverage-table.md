# 覆盖表工作流

在目录树规划之后、输出或写入组件文件之前使用。

## 触发条件

对每个非平凡输出生成覆盖表，尤其是：

- 处理了多于一张截图。
- 生成多个组件或 status variant。
- 大目录分阶段工作流选择了代表。
- 任何候选组被拆分、合并、跳过或复用。

## 精确格式

```markdown
| Signature path   | Covering file(s)                                     | Component(s) | Status  |
| ---------------- | ---------------------------------------------------- | ------------ | ------- |
| T                | src/components/OrderPage/Header.tsx                  | Header       | covered |
| M.card[0].media  | src/components/OrderPage/components/QRCodeArea.tsx   | QRCodeArea   | covered |
| M.card[0].status | src/components/OrderPage/components/QRCodeArea.tsx   | QRCodeArea   | covered |
| B.meta           | src/components/OrderPage/components/Footer.tsx       | Footer       | reused  |
| O.modal          | src/components/OrderPage/components/ExpiredModal.tsx | ExpiredModal | pending |
```

## 字段

| 字段             | 含义                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Signature path   | 由 slot 与 role/container 位置构成的机械路径，如 `T.title`、`M.list.card[0].meta`、`O.modal.action` |
| Covering file(s) | 负责渲染该路径的输出文件                                                                            |
| Component(s)     | 负责该路径的组件名                                                                                  |
| Status           | `covered`、`reused` 或 `pending`                                                                    |

## Status 值

- `covered`：由所列组件/文件直接实现。
- `reused`：有意由共享/静态组件或现有项目组件覆盖。
- `pending`：有意尚未生成，表格后立即附简短原因。

## 规则

- 包含影响生成结构的每个 signature path。
- 不同文件/组件覆盖时，分别列出随 status 变化的路径。
- 大目录 Stage A coarse signature 仅用于分组时，不要列为最终覆盖，除非 Stage B 完整 signature 或显式代表覆盖。
- 表格须与目录树一致。不要列出不在计划输出中的文件。
- 任何 `pending` 行须有原因与下一步动作。

## 退出

当每个结构路径标记为 `covered`、`reused` 或 `pending` 且 pending 工作已说明时退出。
