# 证据账本样例（节选）

> 这是 `docs/.analysis/evidence-ledger.md` 填好后的样子（虚构的「订单」项目，仅示范格式与置信度联动）。对齐格式时读，不要整文件背。

## Evidence: E-001

- 结论：前端订单列表页通过 `getOrders()` 发起 `GET /api/orders` 请求
- 类型：API 映射
- 文件路径：`src/pages/order/OrderListPage.tsx`
- 符号：`OrderListPage` / `getOrders`
- 代码位置：`src/api/order.ts:12`
- 证据说明：`src/api/order.ts:12` 定义 `export const getOrders = () => http.get('/api/orders')`，`OrderListPage.tsx:28` 的 `useEffect` 内调用
- 置信度：高
- 状态：确定
- 是否允许进入最终文档：是

## Evidence: E-002

- 结论：后端 `OrderController.list()` 实现 `GET /api/orders`，委托 `OrderService.list()`
- 类型：API 映射
- 文件路径：`src/main/java/com/example/order/OrderController.java`
- 符号：`OrderController.list`
- 代码位置：`OrderController.java:34`
- 证据说明：类级 `@RequestMapping("/api/orders")` + 方法级 `@GetMapping`，方法体调用 `orderService.list(query)`
- 置信度：高
- 状态：确定
- 是否允许进入最终文档：是

## Evidence: E-003

- 结论：订单状态字段 `status` 取值为 0/1/2，分别表示待付款/已付款/已取消
- 类型：数据模型
- 文件路径：`src/main/java/com/example/order/OrderStatus.java`
- 符号：`OrderStatus`（枚举）
- 代码位置：`OrderStatus.java:5`
- 证据说明：枚举常量 `UNPAID(0)`、`PAID(1)`、`CANCELLED(2)`，带 `@JsonValue` 序列化为整型
- 置信度：高
- 状态：确定
- 是否允许进入最终文档：是

## Evidence: E-004

- 结论：`OrderListPage` 推测属于「订单管理」业务模块
- 类型：前端模块
- 文件路径：`src/pages/order/`
- 符号：目录级
- 代码位置：`src/pages/order/`
- 证据说明：仅依据目录命名 `order` 与路由 `/orders`，无显式模块声明
- 置信度：中
- 状态：推测
- 是否允许进入最终文档：是（文档中须标「（推测）」）

## Evidence: E-005

- 结论：订单创建可能存在库存校验
- 类型：业务链路
- 文件路径：`src/main/java/com/example/order/OrderService.java`
- 符号：`OrderService.create`
- 代码位置：`OrderService.java:51`
- 证据说明：`create()` 调用了 `inventoryClient.check(...)`，但 `inventoryClient` 指向外部服务，本仓内无实现，无法确认校验逻辑细节
- 置信度：低
- 状态：待确认
- 是否允许进入最终文档：否（仅进 troubleshooting.md / 待确认项）

---

> 注意 E-004 与 E-005 的联动：E-004「中」→「推测」→ 进文档但带标注；E-005「低」→「待确认」→ 不进正文。P8 会反查文档措辞是否越级。
