# design-to-spec 契约参考

三份契约是阶段间的唯一通信协议。每个阶段严格按对应模板填写，不增删顶层 key。完整机器校验规则见 `schemas/*.json`；此文件说明字段语义和关键填写纪律。

## UI_Schema

参考模板：`templates/ui-schema.yaml`

关键字段：

- `ui.name`：PascalCase 组件名。
- `components[].id`：camelCase，组件内唯一。
- `components[].type`：粗分类；支持常见基础控件，也支持 `Table / Form / Modal / Dropdown / Switch / Tooltip / Chart / Avatar / Skeleton / Toast / Custom`。
- `components[].semantic_type`：可选业务语义；当 `type: Custom` 或基础类型不足以表达真实控件时填写，例如 `data-table`、`date-range-picker`、`dropdown-filter`。
- `components[].parent_id`：父组件 id；顶层写 `root`。
- `components[].role`：`primary / secondary / action / decoration / container / data_field`。
- `components[].repeat_source`：列表项绑定的数据源，例如 `data.results[]`；非重复组件写空字符串。
- `states[].required`：`true` 表示 `spec.md` 必须有 Scenario；纯展示组件可把请求相关状态标 `false`，但仍需写入状态表说明。
- `states[].source`：`visible / inferred / policy`。
- `states[].scope`：状态作用范围，`component / region / element / global`；未填时按 `component` 理解。
- `states[].scope_components`：局部状态影响的组件 id 列表；如表格局部 loading 只引用 `ordersTable`。
- `states[].render_assertion`：可断言的 DOM/事件结果，供阶段四机械生成 `THEN`，禁止阶段四重新猜。

填写规则：

- `states` 必须包含 `loading / empty / success / error` 四个基础状态；设计稿未画的标 `needs_human_input`，不省略。
- 复合图片资产（渐变背景 + 堆叠文字 + 规则边界）默认为单一 `Image` 组件和 URL 字段，不拆成 rect + text。
- 带交互暗示但未明确标注的元素用 `confidence: inferred`；真正模糊的用 `needs_human_input`。

## API_Schema

参考模板：`templates/api-schema.yaml`

关键字段：

- `api.endpoints[].id`：camelCase 短标识符，在 `Mapping_Logic.data_fetching.requests[].endpoint` 中引用。
- `params[]`：只记录组件实际传入的请求参数。
- `request_body[]`：只记录组件实际提交或由 UI 控制的 body 字段；字段结构与 `params[]` 类似，但包含 `nullable` 和 `enums`。
- `response_fields[]`：只记录组件实际消费的响应字段，点号路径可用 `items[].id` 形式。
- `response_fields[].enums`：枚举值必须完整列出；不确定时写 `[UNKNOWN]`。
- `auth_required`：鉴权会改变 UI 分支时必须保留，例如未登录 CTA、401 登录引导。
- `cache_key_fields`：影响请求缓存命中的参数或 body 字段。
- `pagination`：分页类型与 request/response 字段，支持 `none / page / cursor / offset / unknown`。
- `status_codes`：会影响 UI 的 HTTP 状态码。
- `error_shape[]`：业务错误结构，包含 `code / message_field / retryable / ui_state / notes`。
- `api.open_questions`：接口层未知项，例如枚举不完整、字段可空性冲突、分页字段含义不明。

填写规则：

- Header、鉴权等组件不消费的通用字段默认过滤。
- 分页游标、排序、筛选、缓存 key 等字段如果影响 UI 或请求状态，必须保留。
- 无接口文档时：`endpoints: []`，字段来源降级为 `inferred`，并把字段名/类型确认问题写入开放问题。

## Mapping_Logic

参考模板：`templates/mapping-logic.yaml`

关键字段：

- `mapping.component`：必须与 `UI_Schema.ui.name` 一致。
- `data_fetching.requests[]`：一个或多个请求；包含 `trigger / endpoint / call_type / loading_state / depends_on`。
- `data_fetching.cache_policy`：缓存策略、key 字段、TTL 和 stale 行为。
- `data_fetching.retry_policy`：手动/自动重试、最大次数和退避策略。
- `data_fetching.concurrency_policy`：abort、dedupe 和过期响应处理。
- `bindings[]`：
  - `ui_to_api`：UI 输入绑定到 API 参数。
  - `api_to_ui`：API 响应字段绑定到 UI 组件。
  - `ui_to_event`：UI 只触发组件事件，不直接调 API。
- `state_machine[]`：状态转换；`event` 写具体字段条件，`render_assertion` 写可断言结果。
- `mapping.open_questions`：交互、状态、缓存、分页、错误处理等逻辑未知项。

填写规则：

- `data_fetching.requests[].endpoint` 必须引用 `API_Schema.endpoints[].id`。
- `components[].id`、`states[].id`、`api.endpoints[].id`、`data_fetching.requests[].id` 和 `open_questions[].id` 必须在各自作用域内唯一。
- 同一个 endpoint 内的 `params[].name` 和 `response_fields[].name` 必须唯一。
- `bindings.source_ui / target_ui` 必须引用 `UI_Schema.components[].id`。
- `bindings.source_api` 必须引用 `API_Schema.response_fields[].name`。
- `bindings.target_api` 必须引用 `API_Schema.params[].name` 或 `API_Schema.request_body[].name`。
- `states[].scope_components[]` 必须引用 `UI_Schema.components[].id`。
- `state_machine.to` 必须引用 `UI_Schema.states[].id`。
- 两处都没有 `render_assertion` 时，不要重新看图补猜；增加 P0 开放问题，并生成 `needs_human_input` 占位 Scenario。

## 校验命令

阶段四前运行契约校验：

```bash
python3 design-to-spec/scripts/validate-contracts.py \
  --ui <path>/contracts/ui-schema.yaml \
  --api <path>/contracts/api-schema.yaml \
  --mapping <path>/contracts/mapping-logic.yaml
```

契约校验通过后运行确定性生成：

```bash
python3 design-to-spec/scripts/generate-output.py \
  --ui <path>/contracts/ui-schema.yaml \
  --api <path>/contracts/api-schema.yaml \
  --mapping <path>/contracts/mapping-logic.yaml \
  --out-dir <path>
```

`generate-output.py` 会把三份 YAML 复制到 `<path>/contracts/`，并生成 `notes.md`、`data-fetching.md`、`specs/<capability>/spec.md`。生成后的 markdown 可以润色，但不得引入契约外的接口、字段、状态或交互。

生成器会写入 trace 锚点：

- `component:<id>`：UI component 追踪
- `binding:<index>:<direction>`：binding 追踪，index 按 `Mapping_Logic.bindings[]` 1-based 顺序
- `state:<id>`：状态追踪，required state 必须进入 `spec.md`
- `request:<id>`：请求追踪，必须进入 `data-fetching.md`

如果 `notes.md` 有 `## Traceability`，`validate-output.py --strict` 会校验这些锚点。润色 markdown 时可以改文案，但不要改 trace id。

阶段四后运行输出校验：

```bash
python3 design-to-spec/scripts/validate-output.py \
  --ui <path>/contracts/ui-schema.yaml \
  --api <path>/contracts/api-schema.yaml \
  --mapping <path>/contracts/mapping-logic.yaml \
  --notes <path>/notes.md \
  --data-fetching <path>/data-fetching.md \
  --spec <path>/specs/<capability>/spec.md
```
