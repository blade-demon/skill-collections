# 第一次来？从这里开始

> 3 分钟读完。读完你能判断 ① 这个工具是不是你想要的 ② 接下来去哪。

---

## 1. 这是什么

`design-to-spec` 是一个 **coding 前的需求与设计精细化 harness**：把 UI 设计稿 + 接口文档 + 交互描述，转成一份可被前端、后端、测试、产品共同评审的规格包。

它不是文档生成器。它的核心价值是**在 coding 开始前把模糊点显式登记下来**——用结构化契约 + 机器校验脚本，防止"开发完才发现 X 没考虑到"。

---

## 2. 谁该用 / 不该用

**适合**：把一个 **UI 单元**（一个组件、一个页面、一个模块）转成可实现的规格包。

**不适合**：

- 纯美学反馈（"这个好看吗"）
- 像素级 CSS 抄写
- 多页面流程一次性塞进来

如果你的目标横跨多个页面或多步流程，**每个独立 UI 单元各跑一次**，最后产物拼装即可。一次跑产出一份规格包，对应一个 `<component-name>/` 目录。

---

## 3. 解决什么问题

如果你在前端交付里见过下面任意一个，这个工具就是为你做的：

- **需求评审完没共识**：散会后产品、后端、前端各自记得不一样的细节，coding 时才发现分歧
- **开发完才发现接口缺字段 / 枚举不全 / 错误码没对齐**：要么改接口要么改 UI，每次都要回头扯皮
- **测试和埋点后补改坏业务逻辑**：写完代码再贴埋点 / 加测试，破坏了原本能跑的业务路径

工具不能消灭这些问题，但能把它们**前移到 coding 之前**——这时候改一行 YAML 比改一份代码便宜 10 倍。

---

## 4. 你会得到什么

跑完一次会产出 **3 份契约 + 3 份输出文件**：

```
design-spec/<component-name>/
├── contracts/
│   ├── ui-schema.yaml       — 视觉枚举 + 状态 + 布局
│   ├── api-schema.yaml      — 接口 + 字段 + 错误码 + 分页
│   └── mapping-logic.yaml   — 触发 + 绑定 + 状态机
├── notes.md                 — 设计决策 + 数据契约 + 开放问题
├── data-fetching.md         — 请求链路 + 错误处理（开发者直接入口）
└── specs/<cap>/spec.md      — OpenSpec 行为规格（可测试 Scenario）
```

加上机器可校验的 **trace 锚点**（`component:<id>` / `binding:<idx>` / `state:<id>` / `request:<id>`），让最终产物不会偷偷漂移。

---

## 5. 上手成本

| 项 | 要求 |
|---|---|
| 运行环境 | Node.js ≥ 18 |
| 依赖安装 | 单次 `npm install`（仅一个包：`js-yaml`） |
| 第一次跑通时间 | 约 5 分钟（用内置 `today-windvane` sample） |
| 真正用在自己需求上 | 第一个组件 30–60 分钟，熟悉后 15–30 分钟 |

---

## 6. 30 秒安装

```bash
cd <你的项目>/design-to-spec
npm install
npm test          # 预期：33 项全过
```

如果 `npm test` 没全过，环境出问题了，先解决再继续。

---

## 7. 第一次跑

用内置的 `today-windvane` sample 跑一遍，看看产出长什么样：

```bash
node scripts/generate-output.js \
  --ui examples/today-windvane/contracts/ui-schema.yaml \
  --api examples/today-windvane/contracts/api-schema.yaml \
  --mapping examples/today-windvane/contracts/mapping-logic.yaml \
  --out-dir /tmp/today-windvane-out
```

跑完去看 `/tmp/today-windvane-out/`：

- 先翻一遍 **`spec.md`**——这是给测试和评审用的"可断言行为"
- 再看 **`data-fetching.md`**——这是给前端开发者用的"请求实现细节"
- 最后看 **`notes.md`** 的「开放问题」节——这是 P0/P1 待确认锚点，coding 前必须关闭

**想看不同形态的 sample？** 内置两份回归对照（仅 contracts + 输出）：

| Sample | 形态 | 看什么 |
|---|---|---|
| `examples/today-windvane/` | 自取数据卡片 | 完整的接口 + 状态机 + 错误码 + 分页 |
| `examples/price-card/` | props-only 纯展示组件 | 退化路径：`api.endpoints` 空、`bindings` 空、状态由 props 驱动 |

**想看完整的 inputs → spec → 实现 全流程？** 上一层有手动验证 sample（含 `inputs/` 原始材料 + `walkthrough.md` 过程记录 + `src/` 可运行代码）：

| Sample | 形态 | 看什么 |
|---|---|---|
| `../samples/search-panel/` | GET + 列表 | 主导 binding 是 `api_to_ui`；状态机焦点在数据获取 + abort + retry |
| `../samples/feedback-form/` | POST + 表单 | 主导 binding 是 `ui_to_api`；多字段双层校验；request_body / element-scoped invalid 状态 |

看完心里有数后，再用自己的设计稿跑一次（去 [operator-guide](./references/operator-guide.md) §1 找最简指令）。

---

## 8. 下一步去哪

按你现在想做的事选：

| 我现在想…… | 去读 |
|---|---|
| 真的拿一个自己的设计稿跑一次 | [operator-guide.md §1 五分钟最小例子](./references/operator-guide.md) |
| 多张设计稿 / 多个页面怎么处理 | [operator-guide.md §2 多视觉稿场景](./references/operator-guide.md) |
| 没接口文档 / 接口未定 | [operator-guide.md §4 没有接口文档怎么办](./references/operator-guide.md) |
| context 不够用了 | [operator-guide.md §3](./references/operator-guide.md) |
| 多组件项目怎么做不漂移 | [operator-guide.md §5 跨组件复用](./references/operator-guide.md) |
| 字段含义、契约约束、校验规则 | [references/contracts.md](./references/contracts.md) |
| 工具的工作原理和 4 阶段架构 | [SKILL.md](./SKILL.md) |
| 这工具未来还会做什么 | [docs/roadmap.md](./docs/roadmap.md) |

---

## 9. 常见疑问

**Q：没接口文档行不行？**
行。阶段二可以跳过或写"预期接口"，缺失字段会自动进 `api.open_questions`，等接口出来后改 YAML 重跑即可。详见 [operator-guide §4](./references/operator-guide.md)，可参考 `examples/price-card/`（props-only 纯展示组件，`api.endpoints: []`）。

**Q：多张设计稿（loading / empty / error 各一张）怎么传？**
同一次会话一起传，告诉 skill 每张代表什么状态。详见 [operator-guide §2](./references/operator-guide.md)。

**Q：产物能给后端直接看吗？**
能。`api-schema.yaml` 是后端入口，`data-fetching.md` 含请求链路 + 错误码 + 分页。但**第一次给后端前先自己读一遍**——AI 生成的细节可能有幻觉，`open_questions` 标的就是不确定的地方。

**Q：spec.md 里的 Scenario 是 OpenSpec 格式，我们没用 OpenSpec 怎么办？**
v0.10 的 Scenario 是 OpenSpec 风格但兼容大多数 BDD 测试框架。如果团队用其他 SDD 框架，按 [roadmap V0.15](./docs/roadmap.md) 的计划，等真有第二个消费者出现时会加 adapter；现在先按 OpenSpec 风格读，关注 `WHEN ... THEN ...` 的语义即可。

**Q：跑完发现某些字段写错了，怎么改？**
直接改 `contracts/*.yaml`，重跑 `node scripts/generate-output.js`。契约是事实源，markdown 是产物，永远从契约改。

**Q：这跟普通的 prompt 工程有什么不一样？**
两点关键区别：
1. **机器校验**：`scripts/validate-contracts.js` + `scripts/validate-output.js` 会在每次生成时检查契约一致性、必需状态覆盖、trace 锚点完整性。普通 prompt 没有这层。
2. **缺口必须显式登记**：不确定的地方必须写进 `open_questions` 或 `needs_human_input`，不允许 LLM 静默猜测。详见 [contracts.md §使用规则](./references/contracts.md)。

---

读完这篇，你应该能决定要不要继续。要继续就直接进 [operator-guide §1](./references/operator-guide.md)；想看路线图先看 [docs/roadmap.md](./docs/roadmap.md)。
