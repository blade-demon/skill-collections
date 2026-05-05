# 评审指南（PM / QA / 后端 / 数据）

> 给非作者的产出消费者用。读完知道 ① 这份规格包给我的部分在哪 ② 签收前必须确认什么 ③ 哪类问题该回退给作者重做。

> 作者视角的产出原则在 [SKILL.md](../SKILL.md)；如何跑一份新的规格在 [operator-guide.md](./operator-guide.md)。本指南只面向「拿到一份产出后做评审」的人。

---

## 0. 你拿到了什么

```
design-spec/<component-name>/
├── contracts/                 — 三份 YAML 事实契约
│   ├── ui-schema.yaml         视觉枚举 / 状态 / 布局
│   ├── api-schema.yaml        接口 / 字段 / 错误码 / 分页
│   └── mapping-logic.yaml     触发 / 绑定 / 状态机
├── notes.md                   设计决策 / 数据契约 / 开放问题 / 埋点锚点
├── data-fetching.md           请求链路 / 错误处理 / 状态机（开发者直接入口）
└── specs/<cap>/spec.md        OpenSpec 行为规格（可测试 Scenario）
```

**纪律**：`contracts/` 是事实源，markdown 是产物。**评审反馈一律落到 contracts/，不要直接改 markdown**——markdown 改了不重新跑生成器，会被下次重跑覆盖；CI 也会因为 trace 锚点缺失报错。

机器校验已确保的事项（CI 通过 = 这些事都对了，你可以跳过）：

- 三份 YAML 之间引用一致（component / state / endpoint / request / binding 不会引用不存在的对象）
- `required: true` 状态都有 render_assertion 和对应 Scenario
- markdown 里的 trace 锚点（`state:<id>` / `component:<id>` / `binding:<idx>` / `request:<id>`）齐全

**机器查不出的事**全在下面四张表里——这是评审的重点。

---

## 1. PM / 产品经理视角

**优先读**：`notes.md` §为什么 + §决策 + §开放问题 + §埋点锚点；`spec.md` 头部的 Requirements 标题列表

**不需要读**：`api-schema.yaml`、`data-fetching.md` 内部细节、契约 YAML 字段

### 签收 checklist

- [ ] **设计意图正确**：`notes.md §为什么` 写的"用户场景 / 核心价值"和你的 PRD 一致（不是文字抄写，是意图一致）
- [ ] **状态覆盖与设计稿一致**：`notes.md §状态枚举` 表的 4 个基础状态（loading / empty / success / error）都有对应的视觉处理；如果你设计了第 5 种（如 `disabled` / `partial`），它应该出现在表里
- [ ] **开放问题归你的归齐**：`notes.md §开放问题` 中的 P0 是否都已认领 owner 并定了关闭时间——**P0 不关不进 coding**
- [ ] **埋点齐**：`notes.md §埋点锚点` 表里所有 `tap-*` / `view-*` 是否覆盖你期望的关键交互点；不埋点的明显标 `not-tracked`（不是漏行）
- [ ] **`needs_human_input` 都已解释**：spec.md 中带 `needs_human_input` 占位的 Scenario 是不是都已配 P0/P1 open question；不许默认靠开发猜

### 必须回退给作者重做的信号

- 设计稿明确画了某个状态，但 `notes.md §状态枚举` 没列 → 回退："请补 X 状态"
- spec.md 出现"正确显示"、"优雅降级"等含糊措辞 → 回退："THEN 子句要可断言，例：renders .empty-state with 'no results'"
- 某 P0 open question 已经在 sprint 评审里口头讨论过结论 → 回退："请把结论写进 contracts，不要口头共识"

---

## 2. QA / 测试视角

**优先读**：`spec.md` 全文；`api-schema.yaml` §endpoints + §error_shape；`notes.md §状态枚举`

**不需要读**：`ui-schema.yaml` 视觉细节、`mapping-logic.yaml` 内部 binding

### 签收 checklist

- [ ] **每个 required state 至少 1 条 Scenario**：spec.md 里 4 个基础状态 + 业务自定义状态都各自至少有 1 条；非 happy-path Scenario 数 ≥ 1
- [ ] **Scenario WHEN 引用具体字段值**：例 `data.results.length === 0`，不是 "无数据时"；THEN 指向可断言的 DOM/事件，不是 "正确显示"
- [ ] **枚举值全部展开为独立 Scenario**：`api-schema.yaml` 里所有有 `enums:` 的字段，每个值都生成独立 Scenario（错误码 NETWORK_ERROR / NOT_FOUND / FORBIDDEN 应各占一条）
- [ ] **错误码 → 测试矩阵**：`api-schema.yaml §error_shape` 列出的错误码都有 mock 数据预案；`notes.md §开放问题` 中"P0 错误码视觉缺失"已认领
- [ ] **状态间转换条件无歧义**：`mapping-logic.yaml §state_machine` 中没有两条 from 同状态、event 同条件但 to 不同的转换（这会让测试无法判断 expected state）
- [ ] **重试 / abort / 缓存策略可测**：`mapping-logic.yaml` 中 `retry_policy` / `concurrency_policy` / `cache_policy` 不是 "default" 占位；如果是 default，回退要求作者填具体策略或登记 P1

### 必须回退给作者重做的信号

- spec.md 某 Scenario 的 THEN 用 "and the user sees a friendly error" 这种主观措辞 → 回退："THEN 必须是可断言对象"
- error 态的 4 类错误码只有 1 条 Scenario 兜底 → 回退："枚举值要展开"
- 找不到任何"网络超时"、"abort"、"重复点击"相关 Scenario → 回退："请补 concurrency_policy 对应 Scenario"

---

## 3. 后端视角

**优先读**：`api-schema.yaml` 全文；`data-fetching.md` §请求清单 + §错误分级 + §缓存与并发；`notes.md §开放问题` 中 `api-*` 前缀的条目

**不需要读**：`ui-schema.yaml`、`spec.md`、`mapping-logic.yaml` 中 UI 侧 binding

### 签收 checklist

- [ ] **endpoint 列表与你正在写的接口一一对应**：URL / method / path 参数 / query 参数完全一致；不一致就回退给前端而不是默默改后端
- [ ] **request_body / response 字段类型可实现**：`type` 是后端可表达的（不出现 "string-or-number" 这种联合）；`nullable` 标注与后端实际语义一致
- [ ] **错误码穷尽**：`error_shape.error.code` 的枚举包含你后端会返回的所有 code；前端漏列 → 回退要求补；后端没的 → 标 `[UNKNOWN]` + 加 open question
- [ ] **分页 / 缓存 key 字段对齐**：`pagination.cursor_field` / `cache_key_fields` 与后端约定一致；不一致 → 立即对齐文档不进 coding
- [ ] **`auth_required` 与登录态约束一致**：true 时前端会带 token，false 时不带；后端实现要匹配
- [ ] **API open questions 都已答复**：`api-schema.yaml §open_questions` 是给后端的清单，逐条认领或答复

### 必须回退给作者重做的信号

- 某接口字段在 `response_fields` 里但你后端不会返回 → 回退："请前端确认是否真的消费这个字段，不消费则删掉"
- 错误码字段名后端用 `errCode` 但前端写 `code` → 立即对齐 schema，不要私下"知道就行"
- 接口路径有 typo / 漏 path 参数 → 回退作者重跑阶段二

---

## 4. 数据 / 埋点视角

**优先读**：`notes.md §埋点锚点` 表；`mapping-logic.yaml` 中 `direction: ui_to_event` 的 binding

**不需要读**：契约其他部分、视觉细节

### 签收 checklist

- [ ] **关键交互全埋点**：所有可点击元素（`ui.components` 中 `interactive: true` 且语义重要的）都有对应 `tap-*` 事件，或显式标 `not-tracked`
- [ ] **埋点参数齐**：每个事件的 properties 列出（不只是事件名，还有 user_id / item_id / 来源页等）；缺失 → P1 open question
- [ ] **PV / UV 切口对齐**：`view-*` 事件触发时机与产品想要的"打开页面"语义一致（首次 mount vs 每次 visible vs 数据加载完才算）
- [ ] **A/B 实验埋点不缺**：如果产品计划做 A/B，对应分组上报字段是否在事件 properties 中预留

### 必须回退的信号

- 同一个事件名出现在表中多次但 properties 不一致 → 回退："请合并或重命名"
- 关键转化漏斗某一步没有埋点 → 回退作者补 ui_to_event binding

---

## 5. 通用反模式（任何角色都该警惕）

| 现象 | 含义 | 处理 |
|---|---|---|
| 评审会上口头同意了某个改动，没人改 contracts | 共识没有事实源支撑，下次跑生成器会被覆盖 | 立即记录人要求作者改 yaml + 重跑 |
| 直接在 markdown 上批注修改建议 | 改完不会同步到 contracts | 把建议写在 PR comment 或 contracts/*.yaml 里 |
| 看到 `[UNKNOWN]` / `needs_human_input` 默认开发会处理 | 默认 = 把不确定性留到 coding 后才暴露 | 当场认领或登记 open question |
| `open_questions` 里 P0 一堆，依然在评 spec.md 细节 | 优先级反了——P0 阻塞 coding | 先关 P0 再聊 spec |
| markdown 看上去合理但和 contracts 不一致 | 可能 markdown 被手改、CI 没跑 | 跑 `node design-to-spec/scripts/validate-output.js --strict ...` 验证 |

---

## 6. 评审退出标准（进入 coding 前必须满足）

```
[ ] CI（contracts 校验 + output --strict）绿灯
[ ] 所有 P0 open questions 已关闭或转为已答复
[ ] PM 签收 §为什么 + §决策 + §埋点锚点
[ ] QA 签收 spec.md 中所有 required state Scenario
[ ] 后端签收 api-schema.yaml + error_shape
[ ] 数据签收 §埋点锚点表（如有埋点要求）
```

任一未满足 → 不进 coding。改 contracts → 重跑生成器 → 重新评审。

---

## 7. 一句话总结

> **CI 红 → 作者修；CI 绿但产品 / 测试 / 后端 / 数据有人不签 → 改 contracts 重跑；contracts 没问题但 markdown 看着别扭 → 改 contracts，不要改 markdown。**
