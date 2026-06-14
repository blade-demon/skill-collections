# Phase 3 — Backend Index 模板

> 落盘到 `docs/.analysis/03-backend-index.md`。
> 输入：`01-discovery-report.md` 定位出的后端目录。只看后端源码，**不要碰前端**。
> 每个会进入最终文档的结论，按 `schemas/evidence-record.md` 追加一条到 `docs/.analysis/evidence-ledger.md`。
> 路径写真实相对路径；推断的职责标「推测」；不确定的进「待确认项」。
>
> **先跑种子（推荐）**：若 P2 已生成 `docs/.analysis/endpoints-seed.json`，直接复用；否则运行 `node skills/react-spring-project-doc/scripts/extract-endpoints.js --project <项目根> --out docs/.analysis/endpoints-seed.json`。把其中 `backend[]` 作为第 2 节 Controller URL 表的**基线清单**。**种子是基线不是事实**：逐条核对类前缀/方法映射、补全调用的 Service 与置信度；`confidence: needs-review`（`@RequestMapping` 多方法、常量/SpEL 路径）必须人工确认。

## 1. 启动与全局配置

- Spring Boot 启动类：`<…Application.java>`
- 全局请求前缀（`server.servlet.context-path` / `spring.mvc.servlet.path`）：<值或「无」>
- 端口：<server.port 值或默认 8080>
- 激活 profile：<dev/test/prod 或「未配置」>

## 2. Controller 列表 + URL Mapping

> 这是 P4 映射的右半边。每个 `@RequestMapping` 类前缀 + 方法级映射拼成完整 URL。

| Controller 类       | 类级前缀        | 方法       | HTTP 方法 | 完整 URL        | 调用的 Service 方法     | 文件     | 置信度     |
| ------------------- | --------------- | ---------- | --------- | --------------- | ----------------------- | -------- | ---------- |
| `<OrderController>` | `</api/orders>` | `<list()>` | GET       | `</api/orders>` | `<orderService.list()>` | `<path>` | <高/中/低> |

## 3. Service 列表

| Service 接口/类  | 关键方法                   | 调用的 Repository/外部 | 文件     | 一句话职责 | 置信度     |
| ---------------- | -------------------------- | ---------------------- | -------- | ---------- | ---------- |
| `<OrderService>` | `<list / create / cancel>` | `<OrderMapper>`        | `<path>` | <…>        | <高/中/低> |

## 4. 数据访问层（Repository / Mapper / DAO）

| 类型             | 名称            | 关键方法           | 对应表/XML                    | 文件     | 置信度     |
| ---------------- | --------------- | ------------------ | ----------------------------- | -------- | ---------- |
| <MyBatis Mapper> | `<OrderMapper>` | `<selectByStatus>` | `<t_order / OrderMapper.xml>` | `<path>` | <高/中/低> |

> MyBatis：记录 Mapper 接口与 XML 的对应；JPA：记录 `JpaRepository<Entity, Id>` 的实体与命名查询。

## 5. 数据模型（Entity / DTO / VO）

> 这里只登记**有哪些模型、在哪**，字段细节留到 P6。

| 模型类    | 类型（Entity/DTO/VO/Request/Response/Enum） | 文件     | 关联表（可确认时） | 置信度     |
| --------- | ------------------------------------------- | -------- | ------------------ | ---------- |
| `<Order>` | Entity                                      | `<path>` | `<t_order>`        | <高/中/低> |

## 6. 横切关注点

- Config 类：`<逐个列出 path + 一句话作用>`
- Interceptor / Filter：`<path + 作用：鉴权 / 日志 / 跨域>`
- 全局异常处理（`@ControllerAdvice`/`@ExceptionHandler`）：`<path + 统一返回结构>`
- 统一返回包装（如 `Result<T>` / `ApiResponse`）：`<path + 结构>`

### 安全与鉴权链（Spring Security，单列；这是新人/AI 高频盲区）

> 鉴权常通过过滤器链/注解织入，线性读单个 Controller 看不到。逐项定位、给 `path`，确认不了的标「待确认」，不要臆测顺序。

- 安全配置类：`<SecurityConfig / SecurityFilterChain Bean / WebSecurityConfigurerAdapter（旧版），path>`
- 认证过滤器：`<JWT / Session / OAuth2 过滤器，path + 在链上的位置（能确认时）>`
- 认证入口：`<登录接口 / AuthenticationManager / UserDetailsService 实现，path>`
- Token 机制：`<JWT 签发与校验位置 / 刷新 token / 「未发现」，path>`
- 方法级权限：`<@PreAuthorize / @Secured / @RolesAllowed 使用位置，或「未发现」>`
- 放行/白名单：`<permitAll / 匿名路径配置，path>`
- 待确认：`<AOP/反射织入、动态权限、外部鉴权服务等静态无法确认的点>`

## 7. 定时任务与异步

- `@Scheduled` 定时任务：`<path + 触发频率 + 作用，或「未发现」>`
- `@Async` / 消息队列消费者：`<path + 作用，或「未发现」>`

## 8. 外部系统调用

| 外部系统     | 调用方式                                 | 代码位置 | 用途 | 置信度     |
| ------------ | ---------------------------------------- | -------- | ---- | ---------- |
| <第三方支付> | <FeignClient / RestTemplate / WebClient> | `<path>` | <…>  | <高/中/低> |

## 9. 初步业务模块判断

- <模块>：<职责一句话>（置信度 <高/中/低>，证据：`<path>`）

## 10. 待确认项

1. <如：某 Controller 映射依赖运行时注解处理器，静态无法确认完整 URL>
2. <…>
