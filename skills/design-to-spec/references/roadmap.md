# design-to-spec 迭代路线图

**最近更新**: 2026-05-01
**当前版本**: 0.10.0（Node.js 链路迁移完成）
**单一事实源**: 本文件。冷冻设计在 [`future-tracking-stage.md`](./future-tracking-stage.md)。

---

## 一、定位

`design-to-spec` 不是普通提示词，也不是单一 OpenSpec 生成器，而是 **coding 前的需求与设计精细化 harness**。

核心目标是把前端需求交付中依赖资深工程师经验的判断前置并结构化：

- 设计稿中有哪些组件、状态和交互入口
- UI 消费哪些接口字段、枚举、错误码和分页信息
- 用户动作、请求、状态机、渲染断言如何对应
- 测试、埋点、验收标准在 coding 前是否可确认
- 哪些问题仍然阻塞实现，必须进入 `open_questions`

最终产物是产品、设计、测试、前端、后端、数据团队共同评审的门禁包。

---

## 二、目标形态

```
UI 设计稿 / 需求说明 / API 草案
        ↓
   design-to-spec
        ↓
contracts/*.yaml    notes.md    data-fetching.md
spec.md             test-design.md   tracking.md
        ↓
产品 / 设计 / 测试 / 后端 / 前端 / 数据评审
        ↓
OpenSpec / Superpowers / 其他 SDD 流程
        ↓
coding / 测试 / 埋点 / 验收
```

判断标准：

- AI 可消费
- 人可评审
- 脚本可校验
- 缺口可追踪
- 下游可执行

---

## 三、设计原则（功能加入的准入测试）

任何新功能进入 roadmap 前必须通过以下两条测试。**不通过则不加。**

**测试一：是否强化机器校验？**
新功能必须扩展 `validate-contracts.js` / `validate-output.js` 的覆盖范围，把"会漂移的事实"绑到契约上。

- 强化 ✅：tracking 事件强制有 owner / priority / 验证方法
- 不强化 ❌：换个 markdown 模板输出同样的契约（仅是格式适配）

**测试二：是否强制登记缺口？**
新功能必须给 `open_questions` / `needs_human_input` 增加新的可登记维度。

- 强化 ✅：test-design 中每个 Scenario 强制映射到测试点，缺映射打标
- 不强化 ❌：把已有产物换皮成另一个 SDD 框架的形式

把这两条作为门槛后，产物自然会少而尖。

---

## 四、路线图

### V0.10 — Node.js 链路稳定化（当前）

**已完成**：

- 三份契约（ui-schema、api-schema、mapping-logic）schema + validator
- 三份输出（notes.md、data-fetching.md、spec.md）确定性生成
- 从 Python 迁移到 Node.js（`scripts/*.js` + `npm test`）
- Trace 锚点系统（`component:`、`binding:`、`state:`、`request:`）

**待补**：

- `validate-contracts.js` / `generate-output.js` / `validate-output.js` 的 golden parity 测试齐全
- `npm test` 在 Node 18+ 全部通过
- `needs_human_input` 与 `open_questions` 使用规则明确化

**验收**：同一个设计稿多次生成结果稳定；`required: true` 状态全进 spec.md；后端能直接读懂 `api-schema.yaml`。

---

### V0.11 — 分发与上手

**目标**：从"作者能用"升级到"团队能用"。这是当前最大盲点。

**产出**：

- 至少 3 个不同形态的 golden sample（搜索列表、表单提交、向导步骤、详情页、面板配置中选 3 个）
- 一份 ≤ 15 分钟的 quickstart（区别于 operator-guide 的"零基础完整版"）
- 一份"团队接入指南"：如何在 codebase 安装、升级、贡献新 sample
- README 顶部加 distribution 章节

**验收**：非作者用户跟着 quickstart 在 30 分钟内跑出第一份完整产物。

**为什么排在 V0.11 而不是更晚**：skill 死亡的最常见原因是"功能完整但只有作者用"。在加更多功能前，先把分发管道打通。

---

### V0.12 — 真实项目盲测（≥3 个）

**目标**：用真实需求验证 v0.10 + v0.11 的产出可被非作者消费。

**操作**：

- 选 ≥ 3 个真实需求完整跑四阶段
- 至少 1 个交给非作者执行盲测
- 收集后端 / 测试 / 产品 / 数据 ≥ 3 条反馈
- 修复 v0.10 链路边界问题

**验收**：

- 后端能基于 `api-schema.yaml` 和 `data-fetching.md` 明确接口缺口
- 测试能基于 `spec.md` 设计基础测试场景
- P0 `open_questions` 全部认领到 owner

**门槛**：v0.12 之前**不上新功能**。如果盲测发现现有 4 份输出有 1 份从不被消费，砍掉而不是加新的。

---

### V0.13 — `test-design.md`（提前到 tracking 之前）

**目标**：把测试用例设计前移到 coding 前。

**为什么排在 tracking 之前**：

- 受众覆盖 100%（所有团队都要测试，但不是所有团队都有埋点 SDK）
- 实施难度低（90% 内容已在 spec.md 的 Scenario 里，相当于切片）
- 防漂移收益极高（防"测试用例与需求脱节"）
- 工作量约 6–8h，远低于 tracking 的 24h

**新增产物**：

```
design-spec/<component>/
└── test-design.md
```

**应覆盖**：功能测试场景、状态机测试、API mock 矩阵、错误码与异常路径、枚举字段覆盖、回归风险、探索性测试建议。

**验收**：`spec.md` 中每个 Scenario 都映射到至少一个测试点；`api-schema.yaml` 中错误码和枚举值全部进测试矩阵。

**契约扩展**：mapping-logic.yaml 可选增加 `test_hints` 字段（mock 数据建议、探索性测试方向），不影响现有契约。

---

### V0.14 — 阶段 5 埋点设计（恢复实施）

**实施细节以 [`future-tracking-stage.md`](./future-tracking-stage.md) 为准**，本文档不复述。

**进入条件**：

- V0.13 完成且至少 1 个真实项目消费过 test-design.md
- 团队明确"埋点 SLA"：design 阶段就要求出 tracking spec
- internal-sdk 的强制属性 / 调用约束已对齐（见 future-tracking-stage.md 待补清单）

**估算工时**：约 24.5h（≈3 工作日），可拆为 PoC（generic adapter，~12h）+ 完整版（internal-sdk，~12h）两批次。

---

### V0.15 — 按真实需求加 1 个 SDD adapter

**目标**：当且仅当出现第二个 SDD 框架的真实消费者时，加一个 adapter。

**不在范围内（重要）**：

- 不预先做 5 个 adapter（OpenSpec / Superpowers / generic-sdd / backend-contract / qa-contract）
- 不为不存在的消费者做抽象

**理由**：真实团队基本只用 1 套 SDD 框架。多 adapter 抽象在没有 ≥ 2 个真实消费者时是 YAGNI。一旦真有第二个用户出现，此版本快速产出该 adapter（约 4–6h），不需要预设的"adapter 抽象层"——抽象层从第二个 adapter 中自然涌现。

---

### 长期愿景（不绑定版本号）

以下方向**不承诺时间**，作为持续话题。每一项都是季度级独立项目，列在版本号下会误导预期。

- **跨角色自动门禁**：从契约自动派生"待签收清单"（替代独立 `review-checklist.md`，避免元过程膨胀）
- **效果度量**：建立"每个用 skill 的需求填一份回顾问卷"流程，量化 coding 前发现问题数 / 后端返工次数 / 埋点后补次数；或改用案例研究（before/after 叙事对比）
- **系统打通**：与需求系统、Figma、OpenAPI 平台、测试平台、埋点平台、CI/PR 检查的整合（每项都是独立项目，按团队优先级单独立项）
- **跨组件 lint**：现在靠 operator-guide 第 5.5 节人工 grep；自动化版本是"持续话题"

---

## 五、不在范围内（显式放弃 + 理由）

为防止下次又被提出，把砍掉的方向显式列在这里。

| 砍掉项                            | 否决理由                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| 多 SDD 框架 adapter（5 个）       | 真实团队只用 1 套；为不存在的消费者建抽象 = YAGNI；有第二个真实用户时再加 1 个，不预设抽象层 |
| 独立的 `review-checklist.md` 文档 | 检查文档的检查文档，3 个月后没人维护；改为脚本从契约派生待签收清单                           |
| "评估指标"独立版本                | 没有度量基础设施，列成版本是空头承诺；改为案例研究或问卷流程                                 |
| "组织级研发门禁"独立版本          | 6 个系统整合各是季度级项目；改为不绑版本的长期愿景                                           |
| 任何不强化两条准入测试的功能      | 见第三节"准入测试"                                                                           |

---

## 六、风险与应对

### 风险一：产物过多，团队不愿看

应对：

- 产物分层：核心门禁只看摘要和 P0 问题
- 细节留给对应角色
- 评审用 checklist 而不是全文逐段读

### 风险二：AI 生成的细节仍然有幻觉

应对：

- contracts 是事实源
- 不确定项必须进 `open_questions`
- schema 和 validate 脚本负责结构校验
- 人类评审负责业务正确性

### 风险三：后端和测试消费成本高

应对：

- 增加 role-specific 输出（V0.13 的 test-design.md、V0.14 的 tracking.md）
- 给后端生成接口缺口清单（从 `api.open_questions` 派生）
- 给测试生成测试矩阵（从 spec.md 派生）

### 风险四：被误解为"文档自动化"

应对：

强调 skill 不是多写文档，而是在 coding 前建立门禁：

> 没有门禁产物，不进入 coding。
> 有门禁产物但 P0 未关闭，也不进入 coding。

每次加新功能时回答："这个新东西强化了机器校验或缺口登记吗？" 不强化 = 文档自动化，砍。

### 风险五：版本号膨胀，每个版本都加东西不删东西

应对：

- 每个版本必须有"完成定义"和"准入测试"
- V0.12 盲测发现某产物从不被消费 → 砍掉而不是改进
- 长期愿景明确不绑版本号，避免 8 个版本一起喊但没一个落地

---

## 七、近期优先级（next 4 weeks）

```
1. 完成 v0.10 收尾（生成器测试 + parity 验证）
2. v0.11 分发：3 个 golden sample + quickstart
3. 启动 v0.12 真实项目盲测（找 1 个志愿者团队）
4. 不动 tracking、不动 adapter、不动 test-design
```

---

## 八、一句话总结

`design-to-spec` 的迭代方向是从"设计稿转规格"升级为"前端需求交付的 coding 前 harness"。每个版本通过两条准入测试（强化机器校验 + 强制登记缺口）控制功能膨胀，把原本依赖资深工程师经验的需求细化过程，沉淀为团队可复制的研发基础设施。
