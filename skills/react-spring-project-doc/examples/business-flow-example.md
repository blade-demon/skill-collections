# 业务链路样例（节选）

> 这是 `docs/.analysis/05-business-flows-draft.md` 里一条链路填好后的样子（虚构「订单」项目）。展示「部分完整」如何如实标注。

## 链路 F-1：用户下单

| 环节                 | 内容                                                       | 证据文件:行                                                |
| -------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| 用户入口             | 订单创建页点击「提交订单」                                 | `src/pages/order/OrderCreatePage.tsx:88`                   |
| 前端路由             | `/orders/new`                                              | `src/router/index.tsx:24`                                  |
| 前端页面组件         | `OrderCreatePage`                                          | `src/pages/order/OrderCreatePage.tsx`                      |
| 触发事件             | `handleSubmit`                                             | `src/pages/order/OrderCreatePage.tsx:60`                   |
| 前端 API 方法        | `createOrder(payload)`                                     | `src/api/order.ts:20`                                      |
| HTTP 方法 + URL      | `POST /api/orders`                                         | `src/api/order.ts:20`                                      |
| 请求参数             | `items: OrderItem[]`, `addressId: number`                  | `src/types/order.ts:14`                                    |
| 后端 Controller 方法 | `OrderController.create`                                   | `OrderController.java:42`                                  |
| 后端 Service 方法    | `OrderService.create`                                      | `OrderService.java:51`                                     |
| 数据访问方法         | `OrderMapper.insert`                                       | `OrderMapper.java:18`                                      |
| 涉及数据模型         | `OrderRequest`（入参）, `Order`（实体）, `OrderVO`（返回） | `src/main/java/com/example/order/`                         |
| 返回数据             | `Result<OrderVO>`，含 `orderId`, `status`                  | `OrderVO.java:8`                                           |
| 前端如何渲染返回     | 成功后 `navigate('/orders/'+orderId)` 跳详情 + toast       | `OrderCreatePage.tsx:72`                                   |
| 异常路径             | 表单校验失败→行内报错；后端返回非 0 code→toast 错误文案    | `OrderCreatePage.tsx:75` / 响应拦截器 `src/api/http.ts:30` |

**完整性判断**：部分完整
**判断理由**：用户入口 → 前端 API → Controller → Service → Mapper → 返回 → 渲染 主干每环都有证据。但 `OrderService.create:58` 调用了外部 `inventoryClient.check()` 做库存校验，该客户端指向外部服务，本仓无实现，无法确认校验是否阻断下单（对应 E-005）。
**待确认项**：库存校验的具体规则与失败时的下单行为，需后端/库存服务确认。

---

> 关键点：主干闭环但有一个外部断点，所以判「部分完整」而**不是**「完整」。进最终文档 `business-flows.md` 时这条标注必须保留，不能写成「下单流程完整闭环」。
