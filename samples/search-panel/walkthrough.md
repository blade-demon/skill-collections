# Walkthrough: search-panel

> 这份文档记录从 `inputs/` 到 `design-spec/` 是怎么一步步推导出来的。读它能看到 4 阶段 skill 的真实运转过程，而不是事后看到一份完成品却不知道每一步发生了什么。

---

## Stage 1 — 视觉提纯（WAITING_FOR_UI）

**输入**：`inputs/design.svg`，4 状态对照面板（idle / loading / success / empty + error）。

**skill 输出（节选）**：

```
SearchPanel [Card]
|-- * searchInput [Input] - 搜索关键词
|-- * submitBtn [Button] - 搜
|-- ? validationHint [Text] - INVALID_KEYWORD 红字提示，样式待设计签收
`-- resultsRegion [Card]
    |-- guideText [Text] - idle 引导文案
    |-- skeletonRow [Skeleton] - loading 占位（repeat 3）
    |-- resultCount [Text] - "共 N 条结果"
    |-- resultList [List] - data.results[]
    |   `-- resultItem [Card] - data.results[]
    |       |-- resultTitle [Text]
    |       `-- resultSummary [Text]
    |-- emptyIcon [Icon]
    |-- emptyText [Text] - "未找到相关结果"
    |-- errorIcon [Icon]
    |-- errorText [Text]
    `-- * retryButton [Button] - 重试

状态覆盖：idle(visible) / loading(visible) / success(visible) / empty(visible) / error(visible) / invalidKeyword(⚠️ needs_human_input)
```

**几个关键决策**：

1. **`validationHint` 标 `confidence: needs_human_input`** —— design.svg 没画 INVALID_KEYWORD 的红字提示样式（位置、字号、颜色都没定），所以打标签 + 进 `mapping.open_questions[mapping-q1]` P0。**不静默猜测**是 skill 的核心纪律。

2. **`resultsRegion` 作为中间容器** —— 设计稿只有一根分隔线，但内部 5 种状态切换（guideText / skeletonRow / resultList / empty / error）都挂在这个区域下。把它作为显式容器让状态切换有家可归，否则所有结果区元素都直接挂 `searchPanel`，丢失语义层级。

3. **`skeletonRow` 用 `type: Skeleton`** —— v0.10 schema 已扩展支持，比硬塞 `Custom` 更准确。

4. **`disabled` 状态拆出来作为 `required: false`** —— submitBtn 在 keyword 为空时灰化，本质上是 element-level 的局部状态，用 `scope: element` + `scope_components: [submitBtn]` 表达，避免污染顶层 4 个基础状态。

5. **`invalidKeyword` 也用 element 作用域** —— 同上，仅影响 `validationHint` + `searchInput`，不让整个组件进入"全局错误"。

**用户确认环节**（如果是真实会话）：

```
✅ 识别到以下 UI 组件：
  容器: searchPanel, resultsRegion, resultList, resultItem
  交互: searchInput(Input), submitBtn(Button), retryButton(Button)
  待确认: validationHint(Text) — INVALID_KEYWORD 红字提示样式

状态覆盖：idle / loading / success / empty / error 五个 required；invalidKeyword required（关键错误码必须有 Scenario）；disabled optional（element 级局部态）

⚠️ 待确认：validationHint 视觉设计未在设计稿中体现，实现前需补充 — P0

是否无误并继续第二步？
```

→ 「确认」→ 落盘 `contracts/ui-schema.yaml` → 进入阶段二。

---

## Stage 2 — 接口提纯（WAITING_FOR_API）

**输入**：`inputs/api.md`，包含 `GET /api/v1/search` 完整文档。

**skill 输出**：

```yaml
api:
  endpoints:
    - id: searchAll
      url: /api/v1/search
      method: GET
      params: [keyword, page, page_size]
      response_fields: [data.results, data.results[].id, .title, .summary, .score, data.total, data.page, data.page_size]
      error_shape: [INVALID_KEYWORD, RATE_LIMITED, NETWORK_ERROR, FORBIDDEN, INTERNAL_ERROR]
```

**几个有意思的取舍**：

1. **`data.results[].score` 留下了** —— 当前 UI 不展示这个字段（我们后续做 stage 1 时也没在视觉里看到它）。但 `api.md` 写了「未来用于排序」。stage 2 的判断：响应字段只要"组件实际消费"才进 schema；这里 score **目前没消费**。
   - 选项 A：删除（YAGNI）
   - 选项 B：保留但加 P1 open_question
   - 选了 B，登记为 `api-q1`。理由是后端已经在返回，删除会让 UI/后端 schema 短期内漂移；保留 + 标注更稳。

2. **`error_shape` 全部 5 个错误码都进** —— 4 个 `ui_state: error` + 1 个 `ui_state: invalidKeyword`，这正好与 stage 1 的状态对齐。如果只有视觉，error 态会被合并成单一 state；接口文档让我们把 INVALID_KEYWORD 拎出来作为独立状态。**视觉 + 接口两份输入互相交叉验证**，这是 4 阶段架构的核心价值之一。

3. **`pagination.type: page`** + 留下 `total / page / page_size` 响应字段 —— 即便 UI v1 不分页，分页元数据进 schema，让 v2 加分页 UI 时不需要改 api-schema，只需补 mapping。

4. **`auth_required: true`** —— 影响 FORBIDDEN 的处理路径，必须保留。

**用户确认**：

```
✅ 识别到以下接口：
  GET /api/v1/search
    入参: keyword(string, required), page(number, optional), page_size(number, optional)
    出参: data.results[8 字段], data.total, data.page, data.page_size
    错误码: INVALID_KEYWORD | RATE_LIMITED | NETWORK_ERROR | FORBIDDEN | INTERNAL_ERROR
    分页: page (1-based)
    鉴权: required

⚠️ 开放问题:
  api-q1 [P1] data.results[].score 是否在 v1 schema 中保留（YAGNI vs 防漂移）
  api-q2 [P2] FORBIDDEN 跳登录时是否携带 keyword

是否无误并继续第三步？
```

→ 「确认」→ 落盘 `contracts/api-schema.yaml` → 进入阶段三。

---

## Stage 3 — 逻辑映射（WAITING_FOR_MAPPING）

**输入**：`inputs/interaction-notes.md`，描述触发 / 状态机 / 错误处理 / 并发。

**stage 3 注入了前两阶段的完整 YAML**——这是关键。LLM 推理时 context 里同时有 ui-schema 和 api-schema，所以它知道：
- "submit 触发" 的 submit 在 ui-schema 里就是 `submitBtn`
- "传 keyword" 的 keyword 在 api-schema 里就是 `params.keyword`
- "返回 results" 的 results 在 api-schema 里是 `data.results`

如果跳过前两阶段直接进 stage 3，LLM 会把这些字段名脑补出来，可能和真实接口对不上。

**skill 输出（节选）**：

```yaml
mapping:
  data_fetching:
    requests: [{ id: searchRequest, trigger: submitBtn.onClick OR Enter, endpoint: searchAll, ... }]
    cache_policy: { strategy: none }
    retry_policy: { strategy: auto_on_rate_limited, max_attempts: 1, backoff: "fixed 5s" }
    concurrency_policy: { abortable: true, stale_response: ignore }

  bindings:
    - ui_to_api: searchInput → keyword (trim + length 1-32)
    - ui_to_api: searchInput → page (constant 1)
    - api_to_ui: data.total → resultCount
    - api_to_ui: data.results → resultList (iterate)
    - api_to_ui: data.results[].title → resultTitle
    - api_to_ui: data.results[].summary → resultSummary (if null hide)
    - ui_to_event: submitBtn → tap-search-submit
    - ui_to_event: retryButton → tap-search-retry

  state_machine: 9 transitions covering all (from, event) → to
```

**几个值得记录的处理**：

1. **9 条 state_machine transitions** —— 比想象中多。一开始我以为只有 idle→loading→{success|empty|error} 三条，实际上还包括：
   - error → loading（retry）
   - success → loading（再次提交）
   - invalidKeyword → loading（修正后再提交）
   - loading → idle（FORBIDDEN 跳登录）
   - 等等
   
   这些都是 `interaction-notes.md` 里隐含但需要显式登记的。skill 提示用户「列出所有 from-to 路径」时把它们都挖出来。

2. **`ui_to_api: searchInput → page` transform 是 `constant 1`** —— v1 不分页，但前端调用必须传 page。直接绑定到 `searchInput` 显然不对（页码不来自输入框）。这种"形式上是 ui_to_api 但值是常量"的边界，目前用 transform 字段表达。**是否需要新增一种 `constant_to_api` direction？** 登记为 v0.13+ 的 schema 演进话题，不阻塞当前 sample。

3. **`retry_policy.strategy: auto_on_rate_limited`** —— 大多数项目的 retry 是统一的（"全部网络错误自动重试 N 次"）。这里只对 RATE_LIMITED 自动重试一次，且 5s 固定退避。这种细颗粒度策略**直接来自 interaction-notes**，不是 skill 默认假设。

4. **`mapping.open_questions` 4 条**：
   - `mapping-q1 [P0]` — validationHint 样式（与 ui-schema 的 needs_human_input 配对登记，符合 contracts.md §使用规则）
   - `mapping-q2 [P1]` — 5s 倒计时是否可视化
   - `mapping-q3 [P1]` — FORBIDDEN 回来后是否保留 keyword（关联 api-q2）
   - `mapping-q4 [P2]` — 是否需要 `tap-search-submit-disabled` 埋点

→ 「确认」→ 落盘 `contracts/mapping-logic.yaml` → 进入阶段四。

---

## Stage 4 — 规格组装（GENERATING_SPEC）

**这一阶段不再用 LLM 推断**。skill 直接调用确定性脚本：

```bash
node design-to-spec/scripts/validate-contracts.js \
  --ui contracts/ui-schema.yaml \
  --api contracts/api-schema.yaml \
  --mapping contracts/mapping-logic.yaml
# OK: contracts are valid

node design-to-spec/scripts/generate-output.js \
  --ui contracts/ui-schema.yaml \
  --api contracts/api-schema.yaml \
  --mapping contracts/mapping-logic.yaml \
  --out-dir design-spec/search-panel
# OK: generated design spec at samples/search-panel/design-spec/search-panel
```

产出：

```
design-spec/search-panel/
├── contracts/                       # 三份 YAML 复制进去
├── notes.md                         # 设计决策 + 数据契约 + 开放问题
├── data-fetching.md                 # 请求链路 + 错误处理 + 状态机
└── specs/search-panel/spec.md       # OpenSpec 行为规格
```

**生成完后跑校验**：

```bash
node design-to-spec/scripts/validate-output.js --strict ...
# OK: output files are valid
```

`--strict` 校验包含：
- 所有 `required: true` 状态在 spec.md 都有 Scenario
- 所有 `request:<id>` 在 data-fetching.md 出现
- 所有 `ui_to_event` 事件在 notes.md 或 spec.md 出现
- Trace 锚点（component / binding / state / request）完整
- `## Traceability` 表存在且无遗漏

如果任何一条不通过，`--strict` 会以非 0 退出，说明 markdown 偷偷漂离了契约。这一步是阶段四"不再推断"的硬性保障。

---

## 关键 open questions（回到产品 / 设计 / 后端 / 数据团队）

| ID | 优先级 | 内容 | Owner（建议） |
|---|---|---|---|
| `mapping-q1` | P0 | INVALID_KEYWORD 红字提示样式 | 设计 |
| `api-q1` | P1 | results[].score 是否在 v1 schema 保留 | 后端 + 前端 |
| `mapping-q2` | P1 | RATE_LIMITED 5s 倒计时可视化 | 产品 |
| `mapping-q3` | P1 | FORBIDDEN 回来是否保留 keyword | 产品 + 安全 |
| `api-q2` | P2 | FORBIDDEN 跳登录是否携带 keyword | 产品 |
| `mapping-q4` | P2 | tap-search-submit-disabled 埋点 | 数据团队 |

**P0 不关闭不进 coding**（per `design-to-spec/references/contracts.md` §评审退出标准）。本 sample 的 `mapping-q1` 暂时按"灰色 12px 文字、searchInput 下方 4px 间距、`#F53F3F`"的占位实现，等设计签收后回填到 ui-schema 并重跑生成。

---

## 这个 sample 暴露了什么 skill 级问题

1. **`ui_to_api` 的 transform 字段被用来表达常量绑定**（page = 1）。语义上更干净的是新增一种 `constant_to_api` direction 或 `value_source: ui | constant | derived`。**记录但不在 v0.11 修**——价值低，等第二个真实需求遇到同样问题再考虑。

2. **多个 `from` 状态都通向 loading**（idle / error / success / invalidKeyword 都能 → loading）。spec.md 生成出来有 4 条 "loading state after ..." Scenario，事件不同但 to 一样，可读性略弱。**记录但不在 v0.11 修**——和 OpenSpec 的"按 from-event 分组" Scenario 习惯有关，等更多 sample 确认后再决定要不要在 generate-output 里聚合。

这两条已经登记到 `design-to-spec/docs/roadmap.md`（V0.13+ 的 schema 演进话题），不阻塞本 sample 完成。

---

## 给读者的下一步

读完这份 walkthrough，建议你按这个顺序往下：

1. 翻 `design-spec/search-panel/notes.md`、`data-fetching.md`、`specs/search-panel/spec.md` —— 看上面那些 contracts 怎么变成可读 markdown
2. 翻 `src/main.js` —— 看 spec 怎么变成可运行代码
3. 跑 `npm run dev`，按按钮看四态切换是否和 design.svg 对得上
4. 试着改 `inputs/interaction-notes.md` 的某条规则（比如「不要 abort，旧请求到达就丢弃」），重跑 stage 3 + stage 4，看 spec 怎么变

最后一步是这个 sample 真正想给你的练习：**用契约控制 AI 的不确定性**。
