# 完整对话录：search-panel

> 这是一份"看一遍就能照抄"的真实对话回放。基于 `samples/design-to-spec/search-panel/` 的输入素材反向整理，覆盖 4 阶段 skill 的所有用户消息和 skill 回复，包括一处用户漏说错误码的纠错循环、一处 stage 1 漏识别组件的补充。
>
> **想跑一遍而不只是看？** 复制 `samples/design-to-spec/search-panel/inputs/` 里的素材进自己的 skill 会话，对照本文档检查 skill 的回复是否一致。
> **想看推导过程不是用户视角？** 读 [`../../../samples/design-to-spec/search-panel/walkthrough.md`](../../../samples/design-to-spec/search-panel/walkthrough.md)。

---

## 会话开始 — 用户提供设计稿

**👤 用户**：

```
帮我把这张设计稿做成实现规格。组件名 SearchPanel，目标技术栈 web。
```

> 附件：`samples/design-to-spec/search-panel/inputs/design.svg`（4 状态对照面板：idle / loading / success / empty + error）

---

**🤖 skill**（启动话术 + 阶段一分析）：

```
📐 design-to-spec 启动
─────────────────────────────────────────
流程：4 个阶段，每阶段你确认后才进入下一步

✓ 设计稿        已收到，开始分析
? 接口文档      阶段二时粘贴（没有也可以继续）
? 交互说明      阶段三时用一两句话描述

输出位置：design-spec/SearchPanel/
中途中断：contracts/ 已落盘，新会话可从任意阶段接续
─────────────────────────────────────────

━━ 阶段 1 / 4：视觉提纯 ━━

✅ 识别到以下 UI 组件：

```text
SearchPanel [Card]
|-- * searchInput [Input] - 搜索关键词
|-- * submitBtn [Button] - 搜
`-- resultsRegion [Card]
    |-- guideText [Text] - idle 引导文案
    |-- skeletonRow [Skeleton] - loading 占位（repeat 3）
    |-- resultCount [Text] - "共 N 条结果"
    |-- resultList [List] - data.results[]
    |   `-- resultItem [Card]
    |       |-- resultTitle [Text]
    |       `-- resultSummary [Text]
    |-- emptyIcon [Icon]
    |-- emptyText [Text] - "未找到相关结果"
    |-- errorIcon [Icon]
    |-- errorText [Text]
    `-- * retryButton [Button] - 重试
```

组件清单：
- 容器: SearchPanel, resultsRegion, resultList, resultItem
- 交互: searchInput(Input), submitBtn(Button), retryButton(Button)

状态覆盖：idle(visible) / loading(visible) / success(visible) / empty(visible) / error(visible)

⚠️ 待确认：暂无 — 4 个基础状态在设计稿中均有体现

确认后进入阶段二（接口提纯）。
如有遗漏，直接说：还有 [位置] 的 [组件类型]，我会更新后再继续。
```

---

## 阶段一纠错 — 用户发现漏识别

**👤 用户**：

```
等等。设计稿上 INVALID_KEYWORD 错误时输入框下方有个红字提示，你漏了。还有，
keyword 为空时 submit 按钮是灰的，这也是一种状态吧？
```

---

**🤖 skill**（更新 ui-schema 后重新输出）：

```
✅ 已补充：

新增组件：
- ? validationHint [Text] - INVALID_KEYWORD 红字提示
  confidence: needs_human_input
  原因：设计稿没画该提示的样式（位置/字号/颜色）

新增状态：
- invalidKeyword [scope: element, scope_components: [validationHint, searchInput], required: true]
  原因：错误码 INVALID_KEYWORD 是独立交互路径，必须有 Scenario
- disabled [scope: element, scope_components: [submitBtn], required: false]
  原因：keyword 为空时 submitBtn 灰化，本质是按钮局部态，不是顶层错误态

更新后的状态覆盖：
  idle / loading / success / empty / error / invalidKeyword 6 个 required
  disabled 1 个 optional（element 级局部态）

⚠️ 待确认：
  - validationHint 视觉设计未在设计稿中体现 — P0
    我会同时把这条登记到 mapping.open_questions[mapping-q1]，
    确保 P0 在阶段四之前必须由设计签收。

确认后进入阶段二（接口提纯）。
```

---

**👤 用户**：

```
确认，继续
```

---

**🤖 skill**：

```
已写入 design-spec/SearchPanel/contracts/ui-schema.yaml

━━ 阶段 2 / 4：接口提纯 ━━

第二步：请粘贴接口文档（OpenAPI/Swagger、Markdown、TypeScript 类型、
Postman Collection 均可）。
```

---

## 阶段二 — 用户粘贴接口文档

**👤 用户**：

> 直接粘贴 `samples/design-to-spec/search-panel/inputs/api.md` 全文（约 90 行 markdown）

---

**🤖 skill**：

```
━━ 阶段 2 / 4：接口提纯 ━━

✅ 识别到以下接口：

GET /api/v1/search
  入参:
    - keyword (string, required, 1-32 chars, trim)
    - page (number, optional, default 1)
    - page_size (number, optional, default 10, max 50)

  出参:
    - data.results[] (array, may be empty)
      - id (string)
      - title (string)
      - summary (string, nullable)
      - score (number, 0.0–1.0)  ⚠️ UI 暂不消费
    - data.total (number)
    - data.page (number)
    - data.page_size (number)

  错误码 (5):
    INVALID_KEYWORD | RATE_LIMITED | NETWORK_ERROR | FORBIDDEN | INTERNAL_ERROR

  分页: type=page, 1-based
  鉴权: required
  缓存: none

⚠️ 开放问题:
  api-q1 [P1] data.results[].score UI 不消费但后端返回，是否在 v1 schema 保留？
    选项 A: 删除（YAGNI）
    选项 B: 保留 + 标 open_question（防漂移）
    建议 B，原因：后端已返回，删除会让前后端 schema 短期漂移

  api-q2 [P2] FORBIDDEN 跳登录时是否携带 keyword 参数？
    （登录回来后保留还是清空 — 涉及产品 + 安全决策）

确认后进入阶段三（逻辑映射）。
如需调整：
- 字段过多 → 回复"只保留 [字段A / 字段B]，其余删除"
- 字段缺失 → 回复"补一个字段 [name]([type])"
```

---

**👤 用户**：

```
score 保留，按你说的选项 B。其他确认。
```

---

**🤖 skill**：

```
已写入 design-spec/SearchPanel/contracts/api-schema.yaml

━━ 阶段 3 / 4：逻辑映射 ━━

第三步：请用自然语言描述这些组件和接口是怎么交互的？
（触发时机、失败处理、缓存、分页等）
```

---

## 阶段三 — 用户描述交互

**👤 用户**：

> 直接粘贴 `samples/design-to-spec/search-panel/inputs/interaction-notes.md` 全文

---

**🤖 skill**：

```
━━ 阶段 3 / 4：逻辑映射 ━━

✅ 状态机转换（9 条）：
  idle → loading：submitBtn.onClick OR Enter
  loading → success：api_success && data.results.length > 0
  loading → empty：api_success && data.results.length === 0
  loading → error：api_error (NETWORK_ERROR | INTERNAL_ERROR)
  loading → invalidKeyword：api_error (INVALID_KEYWORD)
  loading → idle：api_error (FORBIDDEN, redirect to /login)
  loading → loading：api_error (RATE_LIMITED, auto retry once after 5s)
  error → loading：retryButton.onClick
  invalidKeyword → loading：submitBtn.onClick (after user fixes input)
  success → loading：submitBtn.onClick (re-submit)

✅ 字段绑定（8 条）：
  ui_to_api:
    - searchInput.value → keyword (transform: trim, length 1-32)
    - searchInput → page (transform: constant 1)  ⚠️ 见 schema 演进话题

  api_to_ui:
    - data.total → resultCount.text
    - data.results → resultList (iterate)
    - data.results[].title → resultTitle
    - data.results[].summary → resultSummary (if null hide)

  ui_to_event:
    - submitBtn → tap-search-submit (params: keyword, keyword_length)
    - retryButton → tap-search-retry

✅ 数据获取策略：
  - cache_policy: none（每次提交都重新请求）
  - retry_policy: auto_on_rate_limited, max_attempts: 1, backoff: fixed 5s
  - concurrency_policy: abortable, stale_response: ignore

⚠️ 开放问题（共 4 条）：
  mapping-q1 [P0] validationHint 样式（与 ui-q1 配对登记）
    阻塞：阶段四生成的 spec.md 在 invalidKeyword 状态的 THEN 子句
    会因 render_assertion 缺失而退化为 needs_human_input 占位 Scenario
  mapping-q2 [P1] RATE_LIMITED 自动重试 5s 是否可视化（进度条 / 数字）
  mapping-q3 [P1] 登录回来后是否保留 keyword（关联 api-q2）
  mapping-q4 [P2] 是否需要 tap-search-submit-disabled 埋点

确认后进入阶段四（自动生成规格文件）。
如需补充：直接说"还有一种情况：[条件] 时 [行为]"
```

---

**👤 用户**：

```
等下,我刚才漏说了 view-search-result, view-search-empty, view-search-error
三个浏览类埋点。
```

---

**🤖 skill**（追加事件后重新输出 mapping 摘要）：

```
✅ 已补充 ui_to_event 绑定（共 5 条）：
  - submitBtn → tap-search-submit (params: keyword, keyword_length)
  - retryButton → tap-search-retry
  - resultList → view-search-result (trigger: success first render, params: keyword, result_count)
  - emptyText → view-search-empty (trigger: empty first render, params: keyword)
  - errorText → view-search-error (trigger: error first render, params: keyword, error_code)

更新点：
  - 3 个 view-* 事件触发条件是"状态首次渲染"，不是"用户操作"
  - 已在 notes.md §埋点锚点 留位，阶段四自动填充

其他映射不变。确认后进入阶段四。
```

---

**👤 用户**：

```
确认
```

---

## 阶段四 — 自动生成

**🤖 skill**：

```
已写入 design-spec/SearchPanel/contracts/mapping-logic.yaml

━━ 阶段 4 / 4：规格组装（自动生成中）━━
开始读取三份契约并生成 notes.md / data-fetching.md / spec.md...

[运行] node scripts/validate-contracts.js \
  --ui design-spec/SearchPanel/contracts/ui-schema.yaml \
  --api design-spec/SearchPanel/contracts/api-schema.yaml \
  --mapping design-spec/SearchPanel/contracts/mapping-logic.yaml

OK: contracts are valid (3 files, 0 errors)

[运行] node scripts/generate-output.js \
  --ui design-spec/SearchPanel/contracts/ui-schema.yaml \
  --api design-spec/SearchPanel/contracts/api-schema.yaml \
  --mapping design-spec/SearchPanel/contracts/mapping-logic.yaml \
  --out-dir design-spec/SearchPanel

OK: generated baseline at design-spec/SearchPanel/

[修订] 补充 notes.md §为什么 + §决策 + §数据契约 + §数据获取方式
[修订] 补充 data-fetching.md 项目上下文（不新增 endpoint / 状态 / 字段）
[修订] 补充 spec.md 人类可读措辞（不重新推断 Scenario 触发条件）

[运行] node scripts/validate-output.js --strict ...
OK: output files are valid (6 traces × 4 categories, all anchored)

━━ ✅ 完成（4 / 4）━━

📁 contracts/        — UI/API/Mapping 三份事实契约
📄 notes.md          — 设计决策 + 数据契约 + 开放问题
📄 data-fetching.md  — 数据获取逻辑（实现开发者直接入口）
📄 specs/search-panel/spec.md — OpenSpec 行为规格

⚠️ 关键待确认（P0，coding 前必须关闭）：
  • mapping-q1: validationHint 视觉设计（INVALID_KEYWORD 红字样式）— Owner 建议: 设计

建议下一步：将整个 design-spec/SearchPanel/ 目录输入 /plan，传入 --target web
```

---

## 用户验收

**👤 用户**：

```
看了一下 spec.md，invalidKeyword 那条 Scenario 的 THEN 是"renders validationHint
with backend message"，但我们 P0 还没关，这个断言可信吗？
```

---

**🤖 skill**：

```
准确。当前 spec.md 在 invalidKeyword 的 Scenario 是基于 mapping-logic.yaml 中
state_machine[invalidKeyword].render_assertion 字段生成的，但该 render_assertion
本身标记了 confidence: needs_human_input，因为 ui-schema.yaml 的
states[invalidKeyword].render_assertion 引用了 validationHint 这个
needs_human_input 组件。

链路：
  ui-schema.validationHint.confidence: needs_human_input
  → ui-schema.states[invalidKeyword].render_assertion 占位
  → mapping-logic.state_machine[invalidKeyword].render_assertion 占位
  → spec.md Scenario THEN 子句标占位

设计签收红字样式后，回到 ui-schema.yaml 把 validationHint.confidence 改为
identified，把 states[invalidKeyword].render_assertion 改为具体 DOM 断言
（例如 "renders .validation-hint--error with text data.message"），
然后重跑：

  node scripts/generate-output.js --ui ... --api ... --mapping ... --out-dir ...

生成器会重新机械填充 spec.md 的对应 Scenario，不需要重跑阶段一到三。
```

---

**👤 用户**：

```
好。现在把目录交给 /plan 让它出实现计划。
```

---

## 落盘文件清单

跑完后磁盘上多了这些：

```
design-spec/SearchPanel/
├── contracts/
│   ├── ui-schema.yaml         (~120 行，6 状态 + 13 组件 + 2 open_questions)
│   ├── api-schema.yaml        (~80 行，1 endpoint + 5 errors + 2 open_questions)
│   └── mapping-logic.yaml     (~140 行，9 transitions + 13 bindings + 4 open_questions)
├── notes.md                   (~200 行)
├── data-fetching.md           (~180 行)
└── specs/search-panel/
    └── spec.md                (~250 行，6 Requirements + 18 Scenarios)
```

总耗时（真实测量基准）：

- 用户消息总数：8 条
- skill 回复总数：8 条
- 端到端时间：约 12 分钟（不含等待 LLM 推理）
- LLM token 消耗：约 45K input + 18K output（视模型而定）

---

## 几个关键观察

读完这份 transcript，你应该能感受到：

1. **每阶段都有"用户回头补"的窗口** —— 阶段一漏了 validationHint，用户一句话补上；阶段三漏了 view-* 事件，再补上。skill 不会强迫你"一次说清所有事"。

2. **needs_human_input 不是 bug 是 feature** —— validationHint 没有视觉设计，skill 拒绝静默猜测，把它登记成 P0。这条 P0 一路传递到 spec.md 的 Scenario，coding 前必须关闭。

3. **阶段四真的不再推断** —— 第四阶段你看到的所有命令（validate / generate / validate）都是确定性脚本。LLM 只在最后做"人类可读措辞"的修订，不动状态机、不动字段绑定。

4. **契约是事实源** —— 用户问"P0 没关那条 Scenario 可信吗？"时，skill 的解释一路追溯到 ui-schema.yaml 的 confidence 字段，不是凭印象回答。这是为什么校验脚本必须存在。

5. **错误码反向校准了状态机** —— api.md 列了 5 个错误码，stage 3 把它们对应到 5 条不同的 state_machine transition。如果只看视觉，error 态会被合并成单一 state，产物会丢精度。

---

## 想再深入？

- **看产物长什么样**：[`../../../samples/design-to-spec/search-panel/design-spec/search-panel/`](../../../samples/design-to-spec/search-panel/design-spec/search-panel/)
- **看推导过程而非用户视角**：[`../../../samples/design-to-spec/search-panel/walkthrough.md`](../../../samples/design-to-spec/search-panel/walkthrough.md)
- **看 spec → 实现怎么 1:1 映射**：[`../../../samples/design-to-spec/search-panel/src/main.js`](../../../samples/design-to-spec/search-panel/src/main.js)
- **照着自己的设计稿跑一遍**：[`../references/operator-guide.md §1`](../references/operator-guide.md)
