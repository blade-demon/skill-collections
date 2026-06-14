# API Map Record 格式

`docs/.analysis/04-api-map-draft.md` 映射表里每一行的字段定义。

## 列定义

| 列              | 含义                                  | 取值规则                        |
| --------------- | ------------------------------------- | ------------------------------- |
| 业务模块        | 该接口所属业务域                      | 与 `02`/`03` 的模块判断一致     |
| 前端页面        | 调用该 API 的页面组件                 | 真实组件名；多个用 `/` 分隔     |
| 前端 API 方法   | 发起请求的前端方法名                  | `funcName()`，来自 `02` 第 5 节 |
| HTTP 方法       | GET/POST/PUT/DELETE/PATCH             | 大写                            |
| URL             | 拼接后的实际请求路径                  | 路径模板形式，`{id}` 保留占位   |
| 后端 Controller | 匹配到的 Controller 方法              | `Class.method`；未匹配写 `—`    |
| Service         | Controller 调用的 Service 方法        | `Class.method`；未知写 `—`      |
| 数据访问        | Service 调用的 Mapper/Repository 方法 | `Class.method`；未知写 `—`      |
| 校验状态        | 匹配结论                              | 见下方枚举                      |
| 置信度          | 高/中/低                              | 按证据强度                      |

## 校验状态枚举

| 值                   | 含义                                        |
| -------------------- | ------------------------------------------- |
| `双向匹配`           | 前端有调用，后端有实现，URL+方法对齐        |
| `未发现后端匹配接口` | 前端发起，但后端找不到对应 Controller       |
| `未发现前端调用`     | 后端有接口，前端无调用方                    |
| `部分匹配（待确认）` | URL 近似但有差异（前缀/动态拼接）需人工确认 |

## 一行示例

```markdown
| 订单 | OrderListPage | getOrders() | GET | /api/orders | OrderController.list | OrderService.list | OrderMapper.selectAll | 双向匹配 | 高 |
```

> 每条「双向匹配」与每条未匹配，都要在证据账本登记一条对应 Evidence（类型：API 映射）。未匹配项的置信度通常为「中/低」，状态为「推测/待确认」。
