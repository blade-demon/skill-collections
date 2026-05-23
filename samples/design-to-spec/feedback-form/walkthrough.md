# Walkthrough: feedback-form

> 第二个 hands-on sample。重点不是重复 search-panel 的流程，而是展示 **表单类组件** 跑同一套 4 阶段时哪些位置变得不同。

---

## 与 search-panel 的形态对照

|                  | search-panel                          | feedback-form                                      |
| ---------------- | ------------------------------------- | -------------------------------------------------- |
| 主导 binding     | `api_to_ui`（接口→UI）                | `ui_to_api`（多个 UI 字段→请求体）                 |
| 接口字段位置     | `params`（GET query）                 | `request_body`（POST 提交体）                      |
| 表单字段数       | 1                                     | 3                                                  |
| validation 层次  | 单层（后端 INVALID_KEYWORD）          | 双层（前端 + 后端 VALIDATION_FAILED）              |
| 字段级状态       | invalidKeyword（element-scoped 1 个） | emailInvalid + commentInvalid 2 个，element-scoped |
| success 渲染什么 | 列表 + 计数                           | 完全替换表单为感谢页                               |

抓这些差异点读 contracts 比读全文更高效。

---

## Stage 1 — 视觉提纯

**输入**：`inputs/design.svg`，4 状态对照（idle / submitting / success / error）。

**关键决策**：

1. **`ratingGroup` 用 `type: Custom` + `semantic_type: rating-stars`**
   schema 的基础类型枚举里没有"评分组件"。继续硬塞 `Button[]` 或 `Custom` 不带语义都不对。`Custom + semantic_type` 是正解 —— `type` 给 schema 校验通过，`semantic_type` 保留业务语义。这条规则在 `references/contracts.md §UI_Schema` 写过，feedback-form 是它第一次落地。

2. **`commentField.type: Input` + `semantic_type: textarea`**
   理由同上 —— Input 是基础类型，`semantic_type: textarea` 区分单行 vs 多行。

3. **3 个 element-scoped 状态**：`emailInvalid` / `commentInvalid` / `rateLimited`
   都用 `scope: element` + `scope_components: [...]` 限定作用范围。这避免了"输入一个邮箱格式错误，整个表单进入 error 态"的语义错乱。`rateLimited` 仅影响 submitBtn（按钮变倒计时禁用）；`emailInvalid` 仅影响 emailField + emailHint。

4. **`feedbackIdText.confidence: needs_human_input`**
   设计稿把「参考编号 #FB-3142」按"普通副文案"画了，但参考编号通常需要可被用户记下来（可复制 / 醒目）。skill 不静默猜，标 needs_human_input + 进 mapping-q2 P1。

5. **`success` 状态不是"在原表单上叠加"，是完全替换**
   render_assertion 写 `hides ratingGroup, commentField, emailField, submitBtn`。在实现里这意味着 success 态走另一棵 DOM 子树，不是 v-if 控制。

---

## Stage 2 — 接口提纯

**关键决策**：

1. **首次用上 `request_body`**
   v0.10 schema 已经有 `request_body` 字段（自 0.8.0 添加），但 today-windvane 和 search-panel 都是 GET 方法 + `params`，没机会用到。feedback-form 的 POST 让 `request_body` 第一次真正落地。3 个字段的写法跟 `params` 类似，但多了 `nullable` 字段（rating / comment 是 false，email 是 true）。

2. **rating 是 number 但用 enums 限定 1-5**
   严格说应该用 `minimum: 1, maximum: 5` 但当前 schema 不支持数值范围；用 `enums: [1, 2, 3, 4, 5]` 显式列出全部合法值是等价方案。这种"用 enum 替代 range"的模式是当前 schema 限制下的妥协，不是缺陷。

3. **VALIDATION_FAILED 的 `data.field_errors`**
   schema 的 `error_shape` 没有"嵌套结构"字段。`data.field_errors` 的形状（`{field: message}` map）只能在 `notes` 里描述。这是当前 error_shape 的表达力不足之处 —— 登记在 api-q1 P2，等更多 sample 验证后看是否要给 schema 加 `error_data` 字段。

4. **保留 `data.submitted_at`**
   UI v1 不展示这个字段，但跟 search-panel.api-q1 一样的取舍：保留并标 P2 open question。后端在返回，删掉容易漂移。

---

## Stage 3 — 逻辑映射

**关键决策**：

1. **多个 `ui_to_api` binding 指向同一个 endpoint 的不同 body 字段**

   ```yaml
   - direction: ui_to_api
     source_ui: ratingGroup
     target_api: rating
   - direction: ui_to_api
     source_ui: commentField
     target_api: comment
   - direction: ui_to_api
     source_ui: emailField
     target_api: email
   ```

   这是契约第一次出现"同 endpoint，多个 ui_to_api 平行 binding"的形态。validate-contracts.js 的 cross-ref 校验通过 — 因为它对每条 binding 单独检查 source_ui 在 components、target_api 在 params/request_body 里存在即可。验证了多 binding 的 schema 表达没问题。

2. **15 条 state_machine transitions**
   比 search-panel 的 9 条多得多。原因：
   - 5 种业务响应分支（success / validationFailed / rateLimited / error / forbidden）= 5 条 from submitting
   - validationFailed → idle（用户编辑字段）= 1 条
   - error → submitting（用户重提）= 1 条
   - rateLimited → idle（倒计时结束）= 1 条
   - success → idle（点 reset）= 1 条
   - idle → submitting（首次提交）= 1 条
   - 4 条 element-scoped 字段验证转换（idle → emailInvalid / commentInvalid 各 1，invalid → idle 各 1）= 4 条

   spec.md 自动生成的 Scenario 全部覆盖。读起来略冗长（"loading state after ... AND ..."）但这就是诚实记录的代价 —— 漏掉一条转换比啰嗦更危险。

3. **email 的 transform 表达"如果空就省略字段"**
   `transform: "trim() before submit; if empty omit field; non-empty must match email regex"`
   这种"条件性省略"目前只能写在 transform 自然语言里，generator 不会从这里产出代码。所以 src/main.js 里手写了 `if (formState.email !== "") body.email = ...`。这块是契约表达力的边界 —— 登记到 v0.13+ schema 演进话题。

4. **没有 retry，`retry_policy.strategy: none`**
   写操作不能盲目重试（后端不保证幂等，可能产生多条反馈）。这跟 search-panel 的 RATE_LIMITED 自动重试一次形成对比 —— **写操作和读操作的 retry 策略本质不同**，sample 里把这点显式登记进契约。

---

## Stage 4 — 规格组装

```bash
$ node skills/design-to-spec/scripts/validate-contracts.js ...
OK: contracts are valid

$ node skills/design-to-spec/scripts/generate-output.js ...
OK: generated design spec at samples/design-to-spec/feedback-form/design-spec/feedback-form

$ node skills/design-to-spec/scripts/validate-output.js --strict ...
OK: output files are valid
```

无障碍跑通。这个 sample 复用 search-panel 已经探过的所有路径，没踩新坑。

---

## 关键 open questions

| ID           | 优先级 | 内容                                                                                                     |
| ------------ | ------ | -------------------------------------------------------------------------------------------------------- |
| `mapping-q1` | P1     | RATE_LIMITED 30s 倒计时视觉（按钮上数字 / 进度条）                                                       |
| `mapping-q2` | P1     | feedbackIdText 是否可复制；样式待设计签收（与 ui.feedbackIdText.confidence: needs_human_input 配对登记） |
| `api-q1`     | P2     | VALIDATION_FAILED.data.field_errors 后端字段名是否与前端字段名严格一致                                   |
| `api-q2`     | P2     | data.submitted_at 是否在 v1 schema 中保留                                                                |
| `mapping-q3` | P2     | 是否需要提交确认弹窗                                                                                     |
| `mapping-q4` | P2     | rating 取消（同颗第二次点击）的语义是否需要顶层 Scenario                                                 |

P0 一个都没有 —— 这个 sample 的设计稿和接口文档在准备时就比较完整，反而是 search-panel 当时 INVALID_KEYWORD 视觉缺失暴露了真问题。**P0 缺失不代表 sample 质量更高**；只代表准备阶段没踩坑。

---

## 这个 sample 暴露了什么 skill 级问题

1. **`error_shape` 缺 `error_data` 字段** —— VALIDATION_FAILED 的 `data.field_errors` 嵌套结构无法在 schema 里表达，只能写在 notes。登记 api-q1。
2. **`type: Custom` + `semantic_type` 模式需要更多文档** —— 这是 schema 的逃生舱，但目前在 contracts.md 只一笔带过；sample 可以作为它的活文档参考。
3. **多个 `ui_to_api` binding 指向同一个 endpoint 的不同 body 字段** —— 工作正常，没问题，但这是个值得在 references/contracts.md 加示例的形态。
4. **rating 这种"组件内部状态变化不构成顶层状态机转换"** —— 当前契约把它隐藏在 component.notes 里，spec.md 不会有对应 Scenario。这是有意取舍（避免 spec.md 被组件内部交互淹没），但需要在 contracts.md 明确"什么进 state_machine、什么不进"。登记 mapping-q4。

这 4 点全部不阻塞 v0.11，记到 roadmap V0.13+ 的 schema 演进话题即可。

---

## 给读者的下一步

1. 跑 `npm run dev`，把 6 个 mock 模式各点一遍，看：
   - mock=success → submitting → success（注意 submit 时表单字段全部 disabled）
   - mock=validation-failed → 表单回到 idle，但 emailHint 显示后端的 message（覆盖前端 hint）
   - mock=rate-limited → 按钮 30 秒倒计时
   - mock=network-error → 顶部红条 + 字段值保留 + 按钮恢复
2. 对比 `src/main.js` 和 search-panel 的 `src/main.js`，看：
   - render 函数怎么从单一渲染分裂成 `renderForm` + `renderSuccess`
   - `frontendValidationPasses()` 函数对应 spec 中"提交时机的多条件 AND"
   - rate-limit countdown 怎么用 `setInterval` 实现 element-scoped 状态的时间退出
3. 试着改 `inputs/api.md` 给 `email` 加 enum（比如限定 `*.company.com` 域名），重跑生成，看 contracts.md 怎么变化

---

读完这两个 sample（search-panel + feedback-form），你应该能看到：

- skill 的 4 阶段架构对**形态完全不同的 UI 单元**都管用
- 契约层把"读操作 vs 写操作 / 单字段 vs 多字段 / 单层校验 vs 双层校验"等结构性差异显式表达出来
- src/ 的代码长度和复杂度跟随契约的复杂度线性增长，没有"代码远超 spec 描述"的情况 —— 这正是 spec 作为契约的价值
