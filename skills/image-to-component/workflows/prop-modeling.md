# Prop 建模工作流

在结构对比与已确认的 Image Connect 决策之后使用。

## Diff 到 Prop 规则

| Diff 类型               | 建模                                   |
| ----------------------- | -------------------------------------- |
| `status` 出现/消失      | `status: StatusUnion` 驱动条件渲染     |
| `meta` 随 status 变化   | 具体数据 prop，如 `timestamp?: string` |
| `action` 随 status 消失 | 可选回调，如 `onRefresh?: () => void`  |
| 整 slot 替换            | `status` 或 `step/phase` 驱动条件渲染  |
| `hint` 随 status 消失   | 静态文案，非 prop                      |
| `media` 变化            | 按 `asset-handling.md` 的资源 props    |

对同一组件状态 variant，优先单一扁平 discriminator：

```ts
type OrderStatus = 'pending' | 'used' | 'expired';

interface ComponentProps {
  status: OrderStatus;
  timestamp?: string;
  onRefresh?: () => void;
}
```

Status 命名约定：`pending`、`used`、`expired`、`active`、`inactive`。

## Image Connect 约束

- 复用组件使用其现有 public API。
- 扩展组件仅添加可选 props/variant，除非用户批准 breaking change。
- 新建组件遵循 `.image-to-component.rules.md`。
- 除非用户显式要求，不要强迫调用方预计算 status 专用 prop 对象。

## 资源 Pass

在最终确定任何 `media` 节点或未知图标的 prop 名之前，运行 `asset-handling.md`。

## 退出

退出时提供：

- 根组件 public props。
- 子组件 props。
- 复用组件 import/API 说明。
- asset ledger 行（如有）。
