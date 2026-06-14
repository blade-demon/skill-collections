# API 映射表样例（节选）

> 这是 `docs/.analysis/04-api-map-draft.md` 填好后的样子（虚构「订单」项目）。展示双向匹配 + 两类未匹配如何呈现。

## URL 拼接说明

- 前端 baseURL：`''`（同源），见 `src/api/http.ts:8`
- 前端代理：开发期 `vite.config.ts` 把 `/api` 代理到 `http://localhost:8080`
- 后端全局前缀：无（`context-path` 未配置）
- 拼接示例：前端 `getOrders → '/api/orders'` ＝ `GET /api/orders` → 对齐 `OrderController.list` 的 `/api/orders`

## API 映射表

| 业务模块 | 前端页面        | 前端 API 方法  | HTTP 方法 | URL                | 后端 Controller          | Service               | 数据访问               | 校验状态           | 置信度 |
| -------- | --------------- | -------------- | --------- | ------------------ | ------------------------ | --------------------- | ---------------------- | ------------------ | ------ |
| 订单     | OrderListPage   | getOrders()    | GET       | /api/orders        | OrderController.list     | OrderService.list     | OrderMapper.selectAll  | 双向匹配           | 高     |
| 订单     | OrderCreatePage | createOrder()  | POST      | /api/orders        | OrderController.create   | OrderService.create   | OrderMapper.insert     | 双向匹配           | 高     |
| 订单     | OrderDetailPage | getOrder(id)   | GET       | /api/orders/{id}   | OrderController.detail   | OrderService.getById  | OrderMapper.selectById | 双向匹配           | 高     |
| 订单     | OrderListPage   | exportOrders() | GET       | /api/orders/export | —                        | —                     | —                      | 未发现后端匹配接口 | 中     |
| 用户     | —               | —              | GET       | /api/admin/users   | UserController.adminList | UserService.adminList | UserMapper.selectPage  | 未发现前端调用     | 中     |

## 未匹配清单

### 前端有调用、后端没找到实现

- `exportOrders() → GET /api/orders/export` — 可能原因：导出走了独立网关/文件服务，或接口已规划未实现。待确认。

### 后端有接口、前端没找到调用

- `UserController.adminList → GET /api/admin/users` — 可能原因：管理后台是独立前端工程；或被 Postman/定时任务调用。待确认。

## 待确认项

1. `exportOrders` 的真实落点（本仓 / 网关 / 文件服务）需后端确认。
2. `/api/admin/*` 是否由另一前端工程消费，需确认仓库边界。
