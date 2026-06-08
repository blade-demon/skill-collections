# sketch-to-component Provider 架构

## 概述

`sketch-to-component` 是共享设计源管线的 Sketch provider 适配器。

权威 D2C 契约见 [`../../../docs/design-source-to-component/architecture.md`](../../../docs/design-source-to-component/architecture.md)。本 provider 文档不得重新定义：

- 规范 IR 命名或 schema 位置；
- preview、IR 或 package 输出目录；
- review gate 数量或 gate 语义；
- target package 布局；
- barrel export 规则；
- target stack 默认值。

Sketch 特定提取接入共享管线：

```text
.sketch file (direct ZIP parse)        # first / primary extraction path
  — or — SketchMCP (later alternative)
-> Sketch provider extractor (extractRaw)
-> output/ir/raw-dsl.json
-> output/ir/design-ir.json
-> shared preview, contract, and target-package pipeline
```

**提取方式（2026-05-21）。** 首要提取路径为**直接 `.sketch` 文件解析** —— `.sketch` 是 JSON 的开放 ZIP，因此 `extractRaw` 可离线、可检视、fixture 友好。SketchMCP 是同一 seam 上的后续替代：两种采集策略收敛于一个内部 `SketchRawModel`，因此添加 MCP 时 `normalize` 与共享管线不受影响。当前本地文件采集路径仍是已实现的采集路径 —— 见 [`stage-2-extract-raw-outline.md`](./stage-2-extract-raw-outline.md)。Normalize 与 preview 现已基于该本地 raw artifact 构建。下方 `Prerequisites` 与 `Configuration` 描述的是*后续* SketchMCP 路径，而非当前本地文件路径。

## 当前已实现范围

已实现的垂直切片现达 Gate 1 preview：

- `extract --file <path> --out <dir>` 读取本地 `.sketch` ZIP 并写入 `<out>/ir/raw-dsl.json`；
- `normalize --raw <path> --out <dir>` 将 Sketch raw 数据转为校验后的 `<out>/ir/design-ir.json`；
- `preview --ir <path> --out <dir>` 调用共享 `d2c-core` preview 辅助并写入 Gate 1 HTML/review artifact。

SketchMCP、远程文档采集、完整资源导出、交互建模、component-plan 生成与 target package codegen 仍为未来范围。

## 何时使用

在以下情况适用本 provider：

- 用户希望通过 D2C 转换 Sketch 设计；
- 有本地 `.sketch` 文件 —— 当前采集入口，经 `extract --file`；
- SketchMCP 可用（后续提取路径，非 Stage 2）；
- 仓库含已提交的 Sketch 衍生 raw 或规范 artifact；
- 用户询问 Sketch provider 行为、限制或验证。

纯截图输入属于 `image-to-component`，非本 provider。

## 角色分工

| 角色                                 | 职责                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 持有本地 `.sketch` 的操作者 _(当前)_ | 运行 `extract`、`normalize`、`preview`，从本地文件达 Gate 1。                                      |
| 设计师（Sketch + SketchMCP）_(未来)_ | 提取所选 frame、资源与参考帧图片。                                                                 |
| 无 Sketch 的开发者                   | 基于已提交的 `output/ir/` artifact、review gate 及未来生成的 `output/package/` 工作。              |
| 共享 D2C 引擎                        | 拥有规范 IR 视图、HTML preview、未来 interaction spec、component plan、target package 输出与验证。 |

只要所需的 `output/ir/raw-dsl.json`、`output/ir/design-ir.json` 及 asset/reference artifact 已提交或以其他方式提供，Sketch provider 应使开发者构建无需 Sketch。

## 前置条件

### 设计师机器

- 已安装并运行 Sketch.app。
- 目标文档已打开。
- 目标 Frame 已选中或可寻址。
- SketchMCP 在配置 URL 响应，默认为 `http://localhost:31126/mcp`。

探测示例：

```bash
curl -sS -X POST "$SKETCH_MCP_URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
```

期望 MCP 服务器自称为 SketchMCP 或等效配置的 Sketch connector。

### 开发者机器

- Node 版本符合仓库要求。
- 存在已提交规范 artifact 时无需 Sketch 安装。
- 可访问定义 target stack、token、命名、BEM 与 package export 规则的项目规则。

## 配置

Provider 配置应仅描述 Sketch 访问与输出根。不得定义独立 IR 或 package 契约。

推荐形状：

```json
{
  "mcpUrl": "http://localhost:31126/mcp",
  "outputRoot": "output",
  "frames": [
    { "name": "home", "frameId": "selected" },
    { "name": "settings", "frameId": "settings-frame-id" }
  ]
}
```

`SKETCH_MCP_URL` 可覆盖 `mcpUrl`。

`outputRoot` 下的输出位置遵循全局架构：

```text
output/
  preview/
  ir/
  package/
```

## Provider 职责

Sketch provider 仅拥有 Sketch 特定工作：

| 职责       | Provider 规则                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------- |
| Frame 解析 | 解析所选 frame 或配置的 frame id。                                                            |
| MCP 提取   | 通过 SketchMCP 获取 Sketch 文档/frame 数据。                                                  |
| Raw 保留   | 将 provider 响应保存为 `output/ir/raw-dsl.json`。                                             |
| 来源追溯   | 在规范 source 元数据或 trace 记录下保留 page、artboard、layer、symbol 与 override source id。 |
| 资源导出   | 在可用时导出图片、SVG、symbol、蒙版及未解析占位符。                                           |
| 参考帧     | 导出 Sketch 渲染的 frame 图片供截图 diff。                                                    |
| 规范化     | 将 Sketch 特定文档数据转为规范 `output/ir/design-ir.json`。                                   |
| Warnings   | 记录不支持的效果、蒙版、渐变、嵌套 override、缺失资源及低置信度 semantic candidate。          |

Raw Sketch 数据不得被 preview 或 target package 生成直接消费。

## Provider 规范化指引

Sketch 数据可能包括：

```text
Page
Artboard / Frame
Group
Shape
Text
Symbol Master
Symbol Instance
Override
Shared Style
Exportable asset
```

Provider 规范化应：

- 保留 source id 与 layer 名称以供追溯；
- 将 Symbol Master 与 Symbol Instance 映射为 semantic candidate，而非 approved contract；
- 将 Override 保留为带 confidence 的 candidate props；
- 保留 Visual View 所需的 visual 数据；
- 导出或 ledger 位图/矢量资源；
- 将不支持的蒙版、渐变、阴影、模糊及嵌套 symbol swap 记录为 warning；
- 将 Sketch 特定字段保留在 `source` 元数据或 trace 记录下。

## 命令

### 当前 —— 至 Gate 1 preview

当前 provider 脚本有意为本地且确定性：

| 命令                                            | 用途                                                           |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `npm install`                                   | 独立工作时安装 provider 脚本依赖。                             |
| `npm test`                                      | 运行 provider 自有测试。                                       |
| `npm run typecheck`                             | 对 provider 脚本做类型检查。                                   |
| `npm run extract -- --file <path> --out <dir>`  | 解析本地 `.sketch` 文件；写入 `<out>/ir/raw-dsl.json`。        |
| `npm run normalize -- --raw <path> --out <dir>` | 将 raw Sketch 数据规范化为校验后的 `<out>/ir/design-ir.json`。 |
| `npm run preview -- --ir <path> --out <dir>`    | 从 IR 生成 Gate 1 preview HTML 与 visual review artifact。     |
| 仓库根目录 `npm run test:sketch`                | 经根 workspace 运行 Sketch provider 测试。                     |
| 仓库根目录 `npm run typecheck:sketch`           | 经根 workspace 对 Sketch provider 脚本做类型检查。             |

### 未来 —— 尚未实现

以下描述 eventual 完整 provider 与共享管线：

| 能力                                  | 用途                                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| 经 SketchMCP / frame 选择的 `extract` | 提取所选远程/已打开 Sketch frame、资源与参考图。                   |
| Gate 2 contract 生成                  | 起草 semantic view、interaction spec 与 component plan 供 review。 |
| Target package 生成                   | Gate 2 批准后发出 React/TS/BEM 包输出。                            |

命令名可随 provider 成熟而演进；输出仍须遵循全局架构。

## Gates

本 provider 使用全局架构定义的 gate：

1. Gate 1：visual 保真的 HTML preview 批准。
2. Gate 2：Semantic View、Interaction Spec 与 Component Plan 的组件 contract 批准。

Sketch provider 可在任一 gate 之前提取与规范化。在两个 gate 均通过前不得生成或声称最终 target package 输出。

## 验证重点

Sketch provider 验证应覆盖 provider 自有行为：

- SketchMCP 连通性与失败报告。
- 所选 frame 或配置 frame 解析。
- Raw Sketch fixture 解析。
- Source trace 保留。
- Symbol、instance 与 override 作为 candidate 保留。
- 资源与参考帧导出或 warning 行为。
- 规范 `schemaVersion` 存在。
- Provider 特定数据隔离在 `source` 或 trace 记录下。

共享输出包结构、barrel export 形状、gate 语义、再生策略、token 对账与截图 diff 阈值由全局 design-source 架构拥有。

## 限制

- SketchMCP 可用性与认证因环境而异。
- 部分 Sketch visual 效果可能不支持，须变为 warning。
- 嵌套 symbol swap 在共享 component plan 批准前应仍为 candidate。
- Provider 不应承诺 handler 实现；交互语义须在 Gate 2 经开发者批准。
