# Phase 4 — API Map 模板

> 落盘到 `docs/.analysis/04-api-map-draft.md`。
> 输入：`02-frontend-index.md` 第 5 节（前端 API 方法）+ `03-backend-index.md` 第 2 节（Controller URL）。
> **本阶段不重新读源码**，只对两份索引做双向匹配。匹配规则见下；记录字段见 `schemas/api-map-record.md`；样例见 `examples/api-map-example.md`。
> 若有 `docs/.analysis/endpoints-seed.json`，它的 `frontend[]`/`backend[]` 两侧 URL 清单已是确定性抽取结果，可直接作为匹配两端，省去重新整理；但匹配成立与否仍以已核对进 `02`/`03` 的结论为准，`needs-review` 项不得当作已确认。
> 每条成立或不成立的映射，都按 `schemas/evidence-record.md` 追加证据账本（类型：API 映射）。

## 1. URL 拼接说明（先写清楚，再开始匹配）

> 前端路径原文 + baseURL + 代理/网关前缀 = 实际请求 URL；后端类级前缀 + 方法映射 = 实际服务 URL。两者对齐才算匹配成功。

- 前端 baseURL：`<值或来源>`
- 前端统一前缀/代理改写：`<vite proxy 规则 / 网关 / 「无」>`
- 后端全局前缀（context-path）：`<值或「无」>`
- 拼接示例：前端 `getOrders → '/api/orders'` ＋ baseURL `''` ＝ `GET /api/orders` → 对齐后端 `OrderController.list` 的 `/api/orders`。

## 2. 映射规则

1. **正向**：每个前端 API 方法，按拼好的 URL+HTTP 方法去后端 Controller 里找对应方法。
2. **反向**：每个后端 Controller 方法，回查前端是否有方法调用它。
3. 找不到后端实现的前端请求 → 校验状态标 **未发现后端匹配接口**。
4. 找不到前端调用的后端接口 → 校验状态标 **未发现前端调用**（可能是内部接口/废弃/被其他客户端调用，存疑标待确认）。
5. URL 含路径参数（`/orders/{id}`）、查询参数差异时，以路径模板对齐，不因 `{id}` 不同判为不匹配。

## 3. API 映射表

| 业务模块 | 前端页面        | 前端 API 方法   | HTTP 方法 | URL             | 后端 Controller          | Service               | 数据访问                  | 校验状态 | 置信度     |
| -------- | --------------- | --------------- | --------- | --------------- | ------------------------ | --------------------- | ------------------------- | -------- | ---------- |
| <订单>   | <OrderListPage> | `<getOrders()>` | GET       | `</api/orders>` | `<OrderController.list>` | `<OrderService.list>` | `<OrderMapper.selectAll>` | 双向匹配 | <高/中/低> |

> 校验状态取值：`双向匹配` / `未发现后端匹配接口` / `未发现前端调用` / `部分匹配（待确认）`。
>
> **接口很多时**本表会很宽、可读性下降：可按业务模块**分块成多张小表**（每模块一张），或拆成「核心接口表 + 附录全量表」，避免一张巨宽表难以阅读。

## 4. 未匹配清单（重点交接项）

### 前端有调用、后端没找到实现

- `<方法 + URL>` — 可能原因：<拼接前缀漏判 / 走了别的服务 / 接口已下线>（待确认）

### 后端有接口、前端没找到调用

- `<Controller.method + URL>` — 可能原因：<内部/定时调用 / 被移动端等其他客户端调用 / 废弃>（待确认）

## 5. 待确认项

1. <如：动态拼接的 URL（模板字符串变量）无法静态对齐>
2. <…>
