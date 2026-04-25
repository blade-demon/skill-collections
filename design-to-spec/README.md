# design-to-spec — 使用指南

> 将 UI 设计稿和接口文档转换成结构化规格包，让后续 AI 或开发者稳定实现。

**当前版本**：`0.7.2`

`design-to-spec` 采用四阶段状态机：视觉提纯、接口提纯、逻辑映射、规格组装。前三阶段分别生成 YAML 契约，第四阶段只读取契约机械填充模板，不重新看图或重新推断接口。

```
WAITING_FOR_UI -> WAITING_FOR_API -> WAITING_FOR_MAPPING -> GENERATING_SPEC
       |                 |                   |                    |
 UI_Schema.yaml    API_Schema.yaml   Mapping_Logic.yaml    notes/data-fetching/spec
```

## 何时使用

适合：

- 你有 UI 截图、mockup、wireframe 或设计稿，想把它变成实现规格
- 你希望把视觉元素、接口字段、状态机和 OpenSpec Scenario 对齐
- 你需要产出 `notes.md`、`data-fetching.md`、`spec.md` 给后续 `/plan`、实现或评审使用

不适合：

- 纯美学反馈，例如“好不好看”
- 像素级 CSS 抄写
- 没有实现意图的浏览性讨论

## 输入

| 输入 | 必需 | 说明 |
| ---- | ---- | ---- |
| UI 设计稿 | 是 | 截图、SVG、Figma 导出图，或清晰的组件树描述 |
| 组件名称 | 推荐 | 缺失时从设计稿或语义推断 |
| 接口文档 | 推荐 | OpenAPI、Swagger、Markdown、TypeScript 类型、Postman Collection 均可 |
| 交互/数据说明 | 推荐 | 触发时机、失败处理、分页、缓存、轮询、父组件传参等 |
| 目标技术栈 | 可选 | `web`、`miniprogram` 等；用于加载对应 stack hints |

没有接口文档时，`API_Schema.endpoints` 为空，数据字段会降级为推断，并在开放问题中要求确认。

## 输出

```
<workspace>/design-spec/<component-name>/
├── notes.md
├── data-fetching.md
└── specs/<capability>/spec.md
```

- `notes.md`：设计决策、数据契约、状态枚举、组件分解、开放问题、埋点锚点
- `data-fetching.md`：请求链路、触发条件、分页缓存、错误分级、竞态处理、请求状态机
- `spec.md`：OpenSpec 行为规格，包含 `Requirement` 和可测试的 `Scenario`

## 运行流程

### 1. 视觉提纯

读取设计稿，输出 `UI_Schema`：

- 枚举所有可见元素，保留逐字文本、省略号、数值和单位
- 用 `parent_id` 表达层级，用 `repeat_source` 表达列表重复结构
- 标记每个元素的 `confidence`：`identified`、`inferred`、`needs_human_input`
- 补全 `loading`、`empty`、`success`、`error` 四个基础状态
- 为每个状态写 `render_assertion`，供 `spec.md` 机械生成 `THEN`

### 2. 接口提纯

读取接口文档，输出 `API_Schema`：

- 只保留组件实际消费的接口、参数和响应字段
- Header、鉴权等通用字段默认过滤
- 分页游标、排序、筛选、缓存 key 如果影响 UI 或请求状态，必须保留
- 枚举值必须完整列出；不确定时写 `enums: [UNKNOWN]` 并加入 `api.open_questions`

### 3. 逻辑映射

结合 `UI_Schema` 和 `API_Schema`，输出 `Mapping_Logic`：

- `data_fetching.requests[]` 记录一个或多个请求，包括触发时机、endpoint、call type、依赖关系
- `bindings[]` 记录 UI 到 API 参数、API 响应到 UI 元素的绑定
- `state_machine[]` 记录状态转换，每条转换包含 `event` 和 `render_assertion`
- 不确定项进入 `mapping.open_questions`，不静默猜测

### 4. 规格组装

读取三份 YAML 契约，生成三份文件：

- `notes.md` 从契约生成设计笔记和数据契约
- `data-fetching.md` 从请求清单和状态机生成数据获取设计
- `spec.md` 从 `state_machine.event` 和 `render_assertion` 生成 Scenario

第四阶段不得重新分析图片或接口文档。如果缺少可断言结果，生成 `needs_human_input` 占位 Scenario，并把问题加入开放问题。

## 关键规则

- 阶段顺序不可跳过，前三阶段都需要用户确认后再进入下一阶段
- YAML 契约是阶段间唯一事实源，输出文件不得绕过契约重新推断
- `required: true` 的状态必须在 `spec.md` 中至少有一条 Scenario
- `Requirement`、`Scenario`、`WHEN`、`THEN` 保持英文关键字，兼容 OpenSpec 验证器
- 改造既有组件时使用 `templates/spec-modified.md`，`MODIFIED Requirements` 下的 Requirement 标题必须与既有 spec 逐字一致

## 质量检查

阶段四前可运行契约校验脚本。脚本会先读取 `design-to-spec/schemas/*.json` 做结构校验，再检查三份契约之间的引用关系：

```bash
python3 design-to-spec/scripts/validate-contracts.py \
  --ui design-spec/<component>/contracts/ui-schema.yaml \
  --api design-spec/<component>/contracts/api-schema.yaml \
  --mapping design-spec/<component>/contracts/mapping-logic.yaml
```

YAML 读取优先使用 Python 包 `PyYAML`；若不可用，脚本会回退到 Ruby 标准库 `YAML`。JSON Schema 校验由脚本内置的 Draft 7 子集校验器完成，不需要安装 `jsonschema`。

校验内容包括：

- 契约是否符合对应 JSON Schema
- YAML 是否可解析
- `mapping.component` 是否等于 `ui.name`
- `components[].id`、`states[].id`、`api.endpoints[].id`、`requests[].id` 等关键锚点是否唯一
- `requests[].endpoint` 是否存在于 `api.endpoints`
- `bindings` 是否引用了存在的 UI component、API param 或 response field
- `state_machine.to` 是否指向存在的 UI state
- `required: true` 状态是否具备 `render_assertion`

阶段四后可运行输出校验脚本：

```bash
python3 design-to-spec/scripts/validate-output.py \
  --ui design-spec/<component>/contracts/ui-schema.yaml \
  --api design-spec/<component>/contracts/api-schema.yaml \
  --mapping design-spec/<component>/contracts/mapping-logic.yaml \
  --notes design-spec/<component>/notes.md \
  --data-fetching design-spec/<component>/data-fetching.md \
  --spec design-spec/<component>/specs/<capability>/spec.md
```

输出校验会检查 OpenSpec 关键字、`required: true` 状态覆盖、请求 endpoint 是否进入 `data-fetching.md`、`ui_to_event` 事件是否进入 `notes.md` 或 `spec.md`，以及开放问题和待确认章节是否存在。脚本优先解析结构化锚点：`notes.md` 的「状态枚举」表、「开放问题」编号列表和「埋点锚点」表；只有缺少结构化锚点时才退回弱文本匹配。开放问题改写导致的弱匹配默认输出 warning；加 `--strict` 可把 warning 作为错误处理。

## 下游使用

推荐把整个输出目录交给规划或实现流程，而不是只传单个文件：

```bash
/plan --target <stack> ./design-spec/<component-name>/
```

`notes.md` 提供设计和数据上下文，`data-fetching.md` 提供请求实现细节，`spec.md` 提供可测试验收标准。后续 skill 不应重新阅读原始设计稿，而应消费这三份文件作为单一事实源。
