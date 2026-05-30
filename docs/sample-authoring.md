# 编写新 Sample

> 如何从「我有一个想演示的 UI 单元」走到完整的 `samples/<skill-name>/<sample-name>/` 目录，供他人阅读、运行与学习。

请先阅读 [`repo-workflow.md`](./repo-workflow.md)，并理解 **golden 回归样本**（例如 `skills/design-to-spec/examples/`）与**动手 samples**（例如 `samples/design-to-spec/search-panel/`）的区别。本指南只讨论后者。

---

## 1. 判断是否真的需要新 sample

在添加 `samples/<skill-name>/<sample-name>/` 之前，先回答：

- **形状是否与现有 samples 不同？** 现有：`search-panel`（输入 + 提交 + 结果列表）。若新 sample 要演练现有 sample 未覆盖的能力，才值得新增，例如：
  - 不同的绑定方向侧重（仅 props、偏重 ui_to_event、偏重 ui_to_api）
  - 不同的 API 形状（多 endpoint 依赖、分页、轮询）
  - 不同的 UI 模式（表单、表格、向导、仪表盘）
- **能否教会新东西？** 若读者从现有 sample 就能学到同样一课，不要新增；改现有 sample 的 `walkthrough.md` 即可。
- **你是否会长期维护？** 每个 sample 都是会随依赖升级而漂移的小项目。不要提交你无意保持绿色的 sample。

不应提交 sample 的理由：

- 「想演示场景 X」，但 X 只是换了内容的 `search-panel`
- 「想展示框架 Y」却没有具体教学目标
- 为「未来」场景写的投机 sample

---

## 2. 目录契约

每个 sample 必须恰好是以下结构：

```
samples/<skill-name>/<sample-name>/
├── README.md           # 一页纸：目标、教什么、如何运行
├── package.json        # Workspace 成员；声明依赖与 build/lint 脚本
├── inputs/             # 原始材料（提交后视为不可变）
│   ├── design.svg      # 或 design.png —— 视觉稿
│   ├── api.md          # 或 api.yaml / api.ts —— 接口描述
│   └── interaction-notes.md  # 自然语言交互说明
├── design-spec/<unit>/ # 由 design-to-spec skill 生成
│   ├── contracts/
│   │   ├── ui-schema.yaml
│   │   ├── api-schema.yaml
│   │   └── mapping-logic.yaml
│   ├── notes.md
│   ├── data-fetching.md
│   └── specs/<cap>/spec.md
├── src/                # 实现只消费 design-spec/，不直接读 inputs/
│   ├── index.html
│   ├── main.js (或 main.ts)
│   └── style.css
└── walkthrough.md      # 过程叙事，≤ 200 行
```

**规则**：

- `inputs/` 在 sample 落地后不可变。若要演进，请 fork sample（例如 `search-panel-v2`）。
- `design-spec/` 是 skill 的输出。契约变更时重新生成并提交结果。
- `src/` 只消费 `design-spec/`，不直接读 `inputs/`。这体现 skill 的价值主张：_spec 即契约_。
- `walkthrough.md` 记录 sample 创建过程，供后续读者学习。

---

## 3. 编写顺序

```
1. 选定名称（kebab-case，不要数字前缀）
2. 编写 inputs/（大部分思考发生在这里）
3. 对 inputs/ 运行 design-to-spec skill
4. 将输出保存到 design-spec/<unit>/
5. 校验：运行 validate-contracts.js + validate-output.js --strict
6. 根据 design-spec/ 实现 src/
7. 对照 spec.md 中的 Scenario 手动验证实现
8. 回顾性编写 walkthrough.md
9. 若 sample 暴露了 skill 级不变量，可补回归测试
```

不要跳过第 5 步。不要在 `design-spec/` 定稿前写 `src/`。

---

## 4. 编写 `inputs/`

这里承载大部分读者价值。具体而言：

### `design.svg`（或 `design.png`）

- 在一张图里展示**所有状态**（成功 / 加载 / 空 / 错误 / 部分 / 禁用 —— 视情况而定）。
- 视觉风格与 `skills/design-to-spec/examples/today-windvane/input.svg` 保持一致：
  - 背景 `#F4F5F7`
  - 卡片背景 `#FFFFFF`，描边 `#E5E6EB`，`rx="12"`
  - 主文字 `#1D2129`，次要 `#86909C`
  - 强调 `#F53F3F`，点缀 `#FF7D00`，链接 `#1664FF`
  - 字体：`-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif`
- 在 SVG 头部用注释说明意图：

  ```xml
  <!--
    <SampleName> 示例输入 mockup —— <一句话说明>。
    完全虚构，零版权风险。
  -->
  ```

### `api.md`

- 用 Markdown 描述相关 endpoint。保持精简：只写 `<unit>` 实际消费的接口。
- 每个 endpoint 写清：URL、方法、参数（类型与是否必填）、响应字段（类型、可空性、完整 enum）、错误形态。
- 若无 API（仅 props 的 sample），仍创建 `api.md`，用一段话说明：「这是仅 props 的组件，数据由父组件通过 props 提供……」

### `interaction-notes.md`

- 5–15 句话。自然语言，不必拘泥于 markdown 格式。
- 覆盖：什么触发请求、成功长什么样、空态与错误如何区分、防抖/取消/缓存、跨组件耦合等。
- 可用 bullet。不必过度结构化。

这会粘贴进 skill 的第三阶段。

---

## 5. 运行 skill

`inputs/` 就绪后：

```bash
# 从仓库根目录
cd samples/design-to-spec/<sample-name>

# （用手动方式走完四阶段 skill 流程与 LLM 会话。
#  命令形式见 skills/design-to-spec/ONBOARDING.md §7。）

# LLM 写好 contracts/*.yaml 后，生成 markdown：
node ../../../skills/design-to-spec/scripts/generate-output.js \
  --ui design-spec/<unit>/contracts/ui-schema.yaml \
  --api design-spec/<unit>/contracts/api-schema.yaml \
  --mapping design-spec/<unit>/contracts/mapping-logic.yaml \
  --out-dir design-spec/<unit>

# 校验
node ../../../skills/design-to-spec/scripts/validate-contracts.js \
  --ui design-spec/<unit>/contracts/ui-schema.yaml \
  --api design-spec/<unit>/contracts/api-schema.yaml \
  --mapping design-spec/<unit>/contracts/mapping-logic.yaml

node ../../../skills/design-to-spec/scripts/validate-output.js --strict \
  --ui design-spec/<unit>/contracts/ui-schema.yaml \
  --api design-spec/<unit>/contracts/api-schema.yaml \
  --mapping design-spec/<unit>/contracts/mapping-logic.yaml \
  --notes design-spec/<unit>/notes.md \
  --data-fetching design-spec/<unit>/data-fetching.md \
  --spec design-spec/<unit>/specs/<cap>/spec.md
```

两个校验器都必须以退出码 0 结束才能提交。

---

## 6. 编写 `walkthrough.md`

目标 ≤ 200 行，在 sample **完成之后**撰写。应覆盖：

- **阶段 1（视觉提取）**：哪些组件显而易见、哪些是 `inferred`、哪些是 `needs_human_input`。ASCII 树摘要长什么样。
- **阶段 2（API 提取）**：skill 保留/过滤了哪些字段。enum 意外、`[UNKNOWN]` 标记及原因。
- **阶段 3（逻辑映射）**：捕获了哪些交互。差点漏掉的状态机转移。登记的 `mapping.open_questions`。
- **阶段 4（生成）**：哪些 markdown 段落效果好、哪些需人工润色、哪些 `open_questions` 进入最终摘要。

格式建议：

```markdown
# Walkthrough: <SampleName>

> 本 sample 的 `design-spec/` 如何从 `inputs/` 生成。

## Stage 1 — Visual extraction (WAITING_FOR_UI)

我上传的内容：<对 inputs/design.svg 的描述>

Skill 输出（节选）：

\`\`\`text
<skill 返回的 ASCII 树>
\`\`\`

备注 / 意外：

- ...

## Stage 2 — API extraction (WAITING_FOR_API)

...

## Stage 3 — Logic mapping (WAITING_FOR_MAPPING)

...

## Stage 4 — Generation (GENERATING_SPEC)

...

## 仍开放的问题

- [P0] ...
- [P1] ...
```

若 sample 暴露了真实的 skill 缺口（例如 `price-card` 曾暴露缺少 `props_to_ui` 方向），在 `walkthrough.md` 中突出，并记入 `skills/design-to-spec/references/future-tracking-stage.md` 或开 issue。

---

## 7. 实现 `src/`

规则：

- **只读 `design-spec/`**，不读 `inputs/`。实现者应是与写 spec 不同的人。若信息只在 `inputs/` 里，说明 spec 不完整 —— 回去修契约。
- 严格按 spec 的 `state_machine` 实现。`mapping-logic.yaml` 中的每个转移都应对应代码路径。
- 严格按 `bindings` 实现。`ui_to_api` 变成请求组装；`api_to_ui` 变成渲染绑定；`ui_to_event` 变成事件发射。
- 将 `spec.md` 中的 Scenario 实现为测试用例（sample 可手动验证；容易自动化时更好）。

`src/` 工具选型：

- 默认 **vanilla HTML + JS + CSS**，除非 sample 专门演示某框架特性。vanilla 对读者摩擦最小。
- 需要构建工具时优先 **Vite**（单依赖、默认合理），而非 webpack/rollup。
- 默认不用 TypeScript。只有 sample 要教类型相关模式时才加。

---

## 8. Sample 级测试（可选）

若 sample 暴露了值得钉住的 skill 级不变量，可在 `skills/design-to-spec/scripts/tests/` 下加测试。模式见 `skills/design-to-spec/scripts/tests/price-card.test.js`。

除非 sample 专门讲测试模式，否则不要为 sample 实现本身加 per-sample 测试。

---

## 9. PR 检查清单

为新 sample 开 PR 前：

- [ ] `inputs/` 已提交且自包含（无外链、无专有资产）
- [ ] `design-spec/` 存在且校验通过
- [ ] `src/` 能构建（若有 build）且本地可运行
- [ ] `walkthrough.md` 已写且 ≤ 200 行
- [ ] `samples/<skill-name>/<sample-name>/README.md` 用一段话说明目标
- [ ] 顶层 `npm run check:full` 通过，或说明了跳过的 fixture 检查及原因
- [ ] 已加回归测试，或说明了为何不需要
- [ ] 无专有内容、无版权图片、无真实客户数据

---

## 10. 反模式

- ❌ 跳过 `inputs/` 直接写 `design-spec/`。（绕过 skill，违背 sample 目的。）
- ❌ 生成 `design-spec/` 后再改 `inputs/`。（spec 与 inputs 不再一致。）
- ❌ 在 `src/` 里读 `inputs/`。（绕过 spec 契约。）
- ❌ 新增 5 个形状相同的 sample。（一个就够；应覆盖不同形状。）
- ❌ 目录名用数字前缀（`01-`、`02-`）。（暗示不存在的顺序；中途插入会改名地狱。）
- ❌ 提交生成产物（node_modules、dist）。（用 `.gitignore`。）
- ❌ 嵌套 `.git/` 目录。（若 sample 来自其他仓库，删除其 `.git`。）
