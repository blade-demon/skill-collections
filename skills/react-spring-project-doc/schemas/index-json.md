# `index.json` 结构化索引 — 字段格式

> P7 生成 `docs/index.json`：一份**机器可读**的代码库索引,供 AI 助手快速加载、支持问答,无需正则去啃散文文档。
> 它**只装配 `.analysis` 产物与证据账本**,与 8 份散文文档同源、不引入新结论。P8 用 `validate-docs.js` 对它做确定性校验。
>
> 设计原则:① 每条带证据的结论都引用一个 `E-xxx`(回指证据账本);② 所有 `file` 写真实相对路径、`line` 写真实行号;③ 不确定的进 `openQuestions`,不塞进结构化字段冒充事实。

## 顶层结构

```jsonc
{
  "schemaVersion": "1.0", // 必填,本 schema 版本
  "generatedAt": "2026-06-14", // 必填,生成日期
  "commit": "<sha 或 unknown>", // 对应提交
  "project": {
    "name": "<项目名>",
    "stack": { "frontend": "React 18 + Vite", "backend": "Spring Boot 3", "db": "MySQL" },
  },
  "codeMap": {
    // 必填,关键位置地图(来源 01)
    "frontend": {
      "entry": "<path>",
      "routes": "<path>",
      "apiClient": "<path>",
      "store": "<path 或 null>",
    },
    "backend": {
      "mainClass": "<path>",
      "controllers": "<dir>",
      "services": "<dir>",
      "repositories": "<dir>",
      "models": "<dir>",
      "security": "<path 或 null>",
      "migrations": "<dir 或 null>",
    },
  },
  "symbols": [
    /* 关键符号锚点,见下 */
  ],
  "api": [
    /* 接口映射,见下 */
  ],
  "flows": [
    /* 业务链路,见下 */
  ],
  "dataModels": [
    /* 数据模型,见下 */
  ],
  "channels": [
    /* 非 REST 通道(MQ/WS/SSE/GraphQL/gRPC),可选,见下 */
  ],
  "evidence": [
    /* 证据条目,必须与 evidence-ledger.md 对应,见下 */
  ],
  "openQuestions": ["<全局待确认项字符串>"],
}
```

`codeMap`、`api`、`evidence`、`schemaVersion`、`generatedAt` 为**必填**(数组可为空 `[]`);其余可省略或为 `null`。

## `symbols[]` — 关键符号锚点

```jsonc
{
  "name": "OrderController",
  "kind": "controller",
  "file": "<path>",
  "line": 34,
  "evidence": "E-001",
}
```

- `kind`：`controller | service | repository | entity | dto | enum | component | hook | store | config | security | other`
- `name` 须为代码里**真实定义**的符号(P8 用定义匹配校验)。

## `api[]` — 接口映射(来源 04)

```jsonc
{
  "id": "API-001",
  "module": "订单",
  "method": "GET",
  "url": "/api/orders",
  "frontend": { "fn": "getOrders", "file": "<path>", "line": 12 }, // 无前端调用时为 null
  "backend": {
    "handler": "OrderController.list",
    "file": "<path>",
    "line": 34,
    "service": "OrderService.list",
    "repository": "OrderMapper.selectAll",
  }, // 无后端实现时为 null
  "status": "matched", // matched | frontend-only | backend-only | partial
  "confidence": "high", // high | medium | low
  "evidence": "E-002",
}
```

## `flows[]` — 业务链路(来源 05,id 与 business-flows.md 的 `F-N` 一致)

```jsonc
{
  "id": "F-1",
  "name": "用户下单",
  "completeness": "complete", // complete | partial | incomplete | needs-review
  "steps": [
    { "stage": "controller", "symbol": "OrderController.create", "file": "<path>", "line": 40 },
  ],
  "evidence": "E-010",
}
```

- `stage`：`entry | route | page | event | apiCall | http | controller | service | repository | model | response | render | error | breakpoint`

## `dataModels[]` — 数据模型(来源 06)

```jsonc
{
  "id": "M-1",
  "name": "Order",
  "kind": "entity",
  "file": "<path>",
  "table": "t_order",
  "fields": [
    {
      "name": "status",
      "type": "Integer",
      "nullable": false,
      "enum": ["0=待付款", "1=已付款", "2=已取消"],
    },
  ],
  "usedByApi": ["API-001"],
  "usedByFlow": ["F-1"],
  "evidence": "E-020",
}
```

## `channels[]` — 非 REST 通道(可选,来源 04 第 5 节)

> MQ / WebSocket / SSE / GraphQL / gRPC 等不走 HTTP URL 的通道。无则省略或空数组。

```jsonc
{
  "id": "CH-001",
  "type": "kafka-consumer", // kafka-producer|kafka-consumer|rabbit-*|websocket|sse|graphql|grpc|scheduled|other
  "name": "order.created", // topic/endpoint/操作名;动态拼接时填占位并在 openQuestions 记
  "handler": "OrderListener.onMsg",
  "file": "<path>",
  "line": 20,
  "frontend": null, // 前端对应消费/订阅(如 WS 客户端、GraphQL hook),无则 null
  "confidence": "high",
  "evidence": "E-030",
}
```

P8 校验 `channels[].file` 路径存在、`handler` 类有定义（`--symbols`）、`evidence` 落在 `evidence[]` 内,与其它数组同等对待。

## `evidence[]` — 证据条目(必须与 `evidence-ledger.md` 对应)

```jsonc
{
  "id": "E-001",
  "file": "<path>",
  "line": 34,
  "confidence": "high",
  "claim": "类级 @RequestMapping(\"/api/orders\")",
}
```

- **每个 `E-xxx` 都必须在 `evidence-ledger.md` 里存在**(P8 校验);其它字段引用的 `evidence` 也必须落在本数组里。

## P8 确定性校验(`validate-docs.js`)会检查

1. JSON 可解析,必填顶层键齐全。
2. 所有 `file` 路径真实存在(复用路径索引)。
3. `--symbols` 时,`symbols[].name` 与 `api[].backend.handler` 的类在代码里有**定义**。
4. 每个 `evidence[].id` 都能在 `evidence-ledger.md` 找到;各字段的 `evidence` 引用都落在 `evidence[]` 内。
5. 引用完整性:`dataModels[].usedByApi`/`usedByFlow` 指向真实的 `api[].id`/`flows[].id`。
