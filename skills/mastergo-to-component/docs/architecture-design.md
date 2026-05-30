# mastergo-to-component Provider 架构

## 范围

`mastergo-to-component` 是共享设计源管线的 MasterGo provider 适配器。

权威 D2C 契约见 [`../../../docs/design-source-to-component-architecture.md`](../../../docs/design-source-to-component-architecture.md)。本 provider 文档不得重新定义：

- 规范 IR 身份或 schema 位置；
- preview、IR 或 package 输出目录；
- review gate 数量或 gate 语义；
- barrel export 结构；
- target stack 输出形状。

> **状态（2026-05-21）：** MasterGo provider 实现延后。Sketch provider 的 raw-extraction 阶段
> 先行作为离线去风险探针（`.sketch` 为本地可检视格式）；MasterGo extractor 在其服务端 DSL 契约
> 可可靠获取后再跟进。见
> [`../../../docs/design-source-to-component-implementation-plan.md`](../../../docs/design-source-to-component-implementation-plan.md)。

Provider 实现必须接入全局契约：

```text
MasterGo URL
-> MasterGo provider extractor
-> output/ir/raw-dsl.json
-> output/ir/design-ir.json
-> shared preview, contract, and target-package pipeline
```

首个参考设计仍为：

```text
https://mastergo.com/file/192813714739577?fileOpenFrom=home&page_id=M&devMode=true&layer_id=2%3A0031
```

对该参考，`layer_id=2:0031` 此前代表根页面 `财资小助手对话页`。

## Provider 职责

MasterGo provider 仅拥有 provider 特定工作：

| 职责     | Provider 规则                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------- |
| URL 解析 | 解析 `https://mastergo.com/file/{fileId}`，将 URL 编码的 `layer_id`（如 `2%3A0031`）解码为 `2:0031`。    |
| 认证     | 从 shell 环境读取 `MASTERGO_TOKEN`，永不打印 token 值。                                                  |
| DSL 获取 | 为解析出的 `fileId` 与 `layerId` 请求 MasterGo DSL。                                                     |
| Raw 保留 | 运行完整管线时将 provider 数据保存为 `output/ir/raw-dsl.json`。                                          |
| 来源追溯 | 在规范 IR 的 `source` 或 trace 记录下保留 source id、source 名称、节点类型、file id、page id、layer id。 |
| 资源导出 | 导出或记录 MasterGo 图片、SVG、图标、蒙版及未解析的资源占位符。                                          |
| 参考帧   | 在 MasterGo 支持时导出 provider 渲染的 frame 或 layer 图片供截图 diff。                                  |
| 规范化   | 将 MasterGo 特定节点转为全局架构描述的规范 `output/ir/design-ir.json` 目标。                             |
| Warnings | 对有损转换、不支持的节点类型、缺失资源、低置信度 semantic candidate 及跳过的截图 diff 发出 warning。     |

所有 provider 特定字段必须隔离在 `source` 元数据或 trace 记录下。下游 preview 与目标代码生成必须消费规范 IR 视图与契约，而非 raw MasterGo DSL。

## 非目标

- 不定义 MasterGo 专用 IR 文件。
- 不定义 MasterGo 专用输出树。
- 不定义独立的 preview 审批流程。
- 不定义独立的 React 包布局或 barrel export 契约。
- 在两个全局 gate 均通过前不生成目标代码。
- 不将 annotation 视为 mandatory；零 annotation 运行须按全局 semantic fallback 规则降级。

## 运行时模块

实现时，provider 包应将 provider 特定模块与共享 D2C 阶段分离：

```text
scripts/src/
  cli.ts
  parse-url.ts
  fetch-dsl.ts
  export-assets.ts
  export-reference-frame.ts
  normalize-design-ir.ts
  write-provider-artifacts.ts
  types.ts
```

| 模块                          | 职责                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `parse-url.ts`                | 提取 `fileId`、可用的 `pageId` 及解码后的 `layerId`。                                |
| `fetch-dsl.ts`                | 安全读取 `MASTERGO_TOKEN` 并获取 MasterGo raw DSL。                                  |
| `export-assets.ts`            | 导出或 ledger 图片、SVG、图标、蒙版及占位符资源。                                    |
| `export-reference-frame.ts`   | 导出截图 diff 使用的参考 frame/layer 图片。                                          |
| `normalize-design-ir.ts`      | 将 MasterGo raw DSL 转为规范 `output/ir/design-ir.json` 形状。                       |
| `write-provider-artifacts.ts` | 写入 `raw-dsl.json`、provider trace、资源及参考帧 artifact，除非显式请求否则不覆盖。 |
| `types.ts`                    | 仅定义 MasterGo raw 适配器类型与 provider trace 辅助。规范 IR 类型属于共享管线。     |
| `cli.ts`                      | 暴露 provider 入口，交接给共享 preview、contract 与包生成管线。                      |

## 执行流程

### Step 1：校验 URL

输入示例：

```bash
npm run extract -- --url "<mastergo-url>" --out output
```

必需行为：

- 接受 MasterGo 文件 URL。
- 仅在 resolver 存在后接受 `/goto/` 链接。
- 解码 `layer_id`。
- `layer_id` 缺失或无法解析时以清晰错误停止。

### Step 2：安全检查 Token

必需行为：

- 任何网络调用前检查 `MASTERGO_TOKEN` 是否存在。
- 永不打印 token 值。
- 缺失 token 作为 fatal provider 提取失败 surfaced。

安全检查：

```bash
test -n "$MASTERGO_TOKEN" && echo "Token is set" || echo "Token is NOT set"
```

### Step 3：获取 MasterGo Raw DSL

必需行为：

- 为解析出的 `fileId` 与 `layerId` 请求 MasterGo DSL。
- 通过预期的 MasterGo 认证头发送 token。
- 运行完整管线时将 raw 响应保留在 `output/ir/raw-dsl.json` 以供追溯。
- 区分缺失 token、权限拒绝、无效 token、网络失败、URL 解析失败、空 frame 及不支持的节点族。

### Step 4：导出资源与参考帧

必需行为：

- 在 MasterGo API 暴露二进制或矢量内容时导出图片、SVG、图标及其他资源。
- 若二进制导出不可用，通过全局输出规则创建 asset ledger 条目与占位符。
- 可能时导出 provider 渲染的 frame 或 layer 图片供截图 diff。
- 若参考图片无法导出，按全局 Screenshot Diff Reference 节定义以 warning 继续。

### Step 5：规范化为规范 Design IR

必需行为：

- 写入 `output/ir/design-ir.json`，`schemaVersion` 匹配全局架构。
- 保留每个有用的 source 节点 id 与 source 节点名称。
- 将 provider 特定细节保留在 source 元数据或 trace 记录下。
- 将 MasterGo 节点类型转为规范 visual 与 semantic 字段。
- 记录低置信度 semantic candidate，而非静默批准。
- 对有损或不支持转换发出 warning。

对 `layer_id=2:0031`，provider 应避免将整个页面视为一个匿名组件。应保留足够 source 与布局信息，供共享 semantic mapper 提议有意义区域，如 page shell、navigation、conversation area、cards、action rows、input area。

## MasterGo 规范化指引

MasterGo DSL 可能包含低级设计概念，如：

```text
FRAME
INSTANCE
GROUP
LAYER
PATH
SVG_ELLIPSE
TEXT
layout
style
children
```

Provider 规范化应：

- 折叠无 visual 或 semantic 价值的 wrapper；
- 保留影响布局、裁剪、蒙版或 z-order 的 wrapper；
- 即使文本分散在嵌套 group 中也要提取 text 节点；
- 保留 Visual View 所需的 layout 与 style 数据；
- 存在时记录 component-instance 信息；
- 保留 repeated group 供后续 semantic 推断；
- 将 unsupported path 映射为带 warning 的 icon 或 shape candidate；
- 将业务语义留为 candidate，而非 approved contract。

## 参考设计候选区域

对首个参考设计，候选区域可能包括：

```text
StatusBar
TopNavBar
ChatBubble
SuggestionList
HotelRecommendationCard
RoomOptionRow
BottomInputBar
```

这些名称是提示，非 provider 级 contract。最终组件名、props、states、events 与 exports 必须来自共享 Semantic View、Interaction Spec 与 Component Plan，并通过 Gate 2。

## 验证重点

MasterGo provider 验证应覆盖 provider 自有行为：

- URL 解析与 `layer_id` 解码。
- 缺失 token 检测且无 token 泄漏。
- Raw DSL fixture 加载。
- 空 frame 检测。
- Source trace 保留。
- 资源与参考帧 warning 路径。
- 规范 `schemaVersion` 存在。
- Provider 特定数据隔离在 `source` 或 trace 记录下。

勿在此重复共享管线的输出包结构或 gate 语义测试。那些属于共享 design-source 管线。

## 开放问题

1. MasterGo 是否能为每个目标 frame 导出可靠的 provider 渲染参考图。
2. 哪些 MasterGo 资源族可自动导出 vs 须 ledger 为占位符。
3. `/goto/` URL 解析应由 provider 拥有还是跨 connector 工具共享。
4. 在另一 provider 验证相同需求后，哪些 MasterGo component-instance 字段应成为 provider 中立概念。
