# design-to-spec — 使用指南

> 把一张 UI mockup 图片转换成结构化的实现规格，让下一个 AI（或人）能稳定地落地代码。

本文件是 skill 的使用手册，回答「怎么触发、给什么输入、拿到什么、之后怎么办」。skill 的内部工作流程在 `SKILL.md`；不需要阅读 SKILL.md 也能用这份指南正常工作。

**当前版本**：`0.4.0` —— 引入可选的 annotated SVG 输出（把「视觉元素 ↔ spec Requirement/Scenario」锁进一张图）；新增「复合图片资产辨识」反模式（避免把单一 PNG 拆成代码绘制的 rect+text）；examples/today-windvane/ 追加 `input.svg` + `input-annotated.svg` 两份视觉锚点。0.3.0 的状态枚举、埋点锚点、改造既有组件分支保持不变。

---

## 一分钟了解

给一张设计稿截图，skill 会按固定流程跑完：

```
视觉枚举 → 歧义标记 → 状态枚举 → 契约推导 → 组件分解 → 判定新建/改造 → 规格实体化
```

输出两份文件：`notes.md`（设计笔记，含状态、埋点等下游接口）+ `spec.md`（OpenSpec 增量，新建用 ADDED / 改造用 MODIFIED）。

这些产物的目标不是替代你思考，而是把 AI 的假设、推断和盲点摆在桌面上，供你评审和继续下游工作。**它同时是 `design-to-track`、`/plan` 等下游 skill 的输入接口**——`notes.md` 里"埋点锚点"和"状态枚举"两节就是为这个目的设计的。

---

## 何时使用（触发）

**显式触发**

直接说「用 design-to-spec 跑一下这张图」、「把这张 mockup 转成规格」、「帮我基于这个设计稿生成实现文档」——AI 会加载 skill 并要求你附上图片（如果还没附）。

**自动触发关键词**

附上 UI 图片的同时说以下任何一句，skill 会自动激活：

- 「帮我把这张图做成组件」
- 「我想把这个 mockup 实现出来」
- 「基于这个设计稿怎么搭」
- 「from this screenshot, plan the implementation」
- 提到「设计稿」、「mockup」、「wireframe」、「comp」、「UI 图」

**不适用场景**

- 纯 CSS 像素提取（「把这个按钮的样式抄出来」）——直接写 markup 即可
- 美学评审（「这张图好看吗」、「配色合理吗」）
- 没有实现意图的浏览性讨论

---

## 准备输入

| 输入           | 必需?   | 默认值                      | 备注                                              |
| ------------ | ----- | ------------------------ | ----------------------------------------------- |
| mockup 图片    | 必需    | —                        | 作为对话附件提供                                        |
| 组件名称         | 推荐    | 从 mockup 标题或你的措辞推断       | 例如 `today-windvane`、`weekly-insight`            |
| 目标技术栈        | 可选    | agnostic（技术栈无关）          | `miniprogram` / `react` / `vue` / `flutter`     |
| 设计系统         | 可选    | 无                        | `tdesign` / `nutui` / `vant` / `antd` / `shadcn` |
| 能力名称（capability） | 可选  | 同组件名称                   | OpenSpec 的 `capability` 归属                      |
| 现有代码库        | 自动    | 项目根目录                   | skill 会自动 Glob `components/` 发现可复用原子组件          |

**不要因为可选输入缺失而拖延**，skill 会用合理默认值并在置信度地图里标记假设。

---

## 运行流程

skill 会线性跑完 10 步（8 个主步 + 2 个插步），中间**不会**停下来问问题（除非关键输入缺失到无法继续）。典型耗时 2–5 分钟。

1. 视觉枚举通道——逐项列出图片里看得到的东西
2. 技术栈和上下文解析——匹配 `references/stack-hints/<stack>.md`，Glob 现有组件
3. 信息分层——容器 / 区域 / 行 / 原子
4. 交互推断与置信度标志——每个可交互元素分到 identified / inferred / needs_human_input
4.5. **状态枚举**——填写 loading / empty / success / error 等可观察状态（必需 ✅ 状态全部列出，未在 mockup 中体现的标 needs_human_input）
5. 数据契约推导——TypeScript interface，业务语义命名
6. 组件分解——名称 / 目的 / 复用信号
6.5. **判定变更类型**——新建 vs 改造既有组件（决定 spec.md 用哪份模板）
7. 规格实体化——生成 notes.md + spec.md（含埋点锚点）
8. 呈现输出——用 `computer://` 链接给你，附 2–3 句关键摘要

skill 跑完后会**明确告诉你这是协作草稿，鼓励迭代修订**——不是终稿。

---

## 输出文件解读

```
<workspace>/design-spec/<component-name>/
├── notes.md
├── specs/<capability>/spec.md
└── input-annotated.svg        # 可选，按需生成
```

**`notes.md`** — 一份合并的设计文档，按顺序包含：

| 小节          | 包含什么                                                        |
| ----------- | ----------------------------------------------------------- |
| 为什么        | 1–2 句话：用户价值、解决什么问题                                         |
| 决策          | 3–5 条设计决策，每条一句理由                                           |
| 数据契约        | TypeScript 风格的 Props / Events interface                     |
| **状态枚举**    | loading / empty / success / error 等运行时状态；标 ✅ 的状态在 spec.md 必有 Scenario |
| 组件分解        | 名称 / 目的 / 复用信号三列表                                         |
| 布局陷阱        | 真正会踩的陷阱 + 修复（如 min-width:0、catchtap）                       |
| 置信度地图      | 每个元素/行为标 identified / inferred / needs_human_input            |
| 开放问题        | 阻塞下游工作、需人类回答的问题                                            |
| 计划提示        | snake_case 标签，给 Superpowers plan 使用                        |
| 交叉引用        | 输入 mockup、技术栈、设计系统、规格增量路径                                  |
| 建议的下一步      | 通常指向 `/plan --target <stack>`                               |
| **埋点锚点**    | 供 `design-to-track` 等下游 skill 消费的语义事件清单（不写完整 schema）       |

**`specs/<capability>/spec.md`** — OpenSpec 格式的行为契约。**根据步骤 6.5 的判定结果**用两份模板之一：

- **新建组件** → 用 `templates/spec.md`，仅 `## ADDED Requirements`
- **改造既有组件** → 用 `templates/spec-modified.md`，含 `## MODIFIED` + 可选 `## ADDED` + 可选 `## REMOVED`，且 MODIFIED 块下的 `### Requirement:` 标题必须**逐字**与既有 spec 一致

通用结构：

- `### Requirement:` 每个描述一个可观察的行为
- `#### Scenario:` 每个带 `- WHEN` / `- THEN` 项目符号
- **状态覆盖硬规则**：`notes.md` 状态枚举里每个标 ✅ 的状态都必须在 spec.md 中找到对应 Scenario

这份是可测试的——每条 Scenario 对应一个 fixture 测试。

---

## 下游工作流

拿到产物后的 6 步：

1. **自检与评审**（本地 5–15 分钟）——按以下顺序读：
   - 置信度地图（哪些是看到的、哪些是猜的）
   - 状态枚举（每个 ✅ 必需状态在 spec.md 是否都有 Scenario）
   - 数据契约（字段命名是否业务语义而非视觉命名）
   - 开放问题（是否覆盖了下游会卡住的所有未知数）
2. **解决开放问题**（异步数小时到几天）——批量走设计 / 后端 / 数据团队签收
   - 状态枚举里标 `needs_human_input` 的状态需要设计补视觉
   - 数据契约里标 `?` 或 `needs_human_input` 的字段需要后端确认
3. **接力下游 skill**（按需）——
   - 想生成埋点 schema → 把 `notes.md`「埋点锚点」喂给 `design-to-track`（开发中）
   - 想生成实现任务 → 把 `notes.md` + `spec.md` 喂给 Superpowers `/plan --target <stack>`
4. **执行实现**——按 plan 的任务清单写代码，每个 Requirement 配 fixture 测试
5. **状态实现校验**——实现完成后用 `notes.md` 状态表 × `spec.md` Scenario 做交叉对照，确保 `loading` / `empty` / `error` 三态都真的实现了（不是只在 spec 里"写过"）
6. **归档**（可选）——采用 OpenSpec 时把 spec 搬到 `openspec/specs/`

---

## 常见情况 FAQ

**生成的 notes.md 某段不对怎么办？**

直接改。notes.md 和 spec.md 是协作草稿，不是 AI 的终稿。保持格式（`### Requirement:` / `#### Scenario:` / `- WHEN` / `- THEN` 的层级）就行。改完记得让三份内容（notes.md 的「决策」、spec.md 的 Scenario、下游代码）保持一致。

**想重跑整个 skill 怎么办？**

不推荐全量重跑——如果问题局部（比如只是某条决策错了），改那一处比重跑更快、也保留了你已经累积的评审意见。只有当输入 mockup 本身换了、或者整体技术栈判断错了时才值得重跑。

**多个 mockup 组成一个流程（比如一个完整页面）怎么办？**

一张一张跑，每张产出独立的 `<workspace>/design-spec/<component>/`。各自的 notes.md 里用「交叉引用」小节互链。第 3 步 plan 时一起传入这些目录，它会识别组件间的依赖关系（比如共享原子组件）。

**项目没有 OpenSpec 怎么办？**

照常用。skill 默认输出到 `<workspace>/design-spec/<component>/`，不依赖 OpenSpec 工具链。什么时候想采用 OpenSpec，直接把 `design-spec/` 目录搬到 `openspec/changes/add-<component>/` 即可。

**遇到 AI 明显虚构字段怎么办？**

说明第 1 步视觉枚举没做好。打开 `notes.md` 的数据契约和置信度地图对一遍——如果某个字段在置信度地图里没有对应条目，大概率是虚构的。删掉它，或者把它标为 `needs_human_input`。

**OpenSpec 验证器报错「找不到 Requirement 关键字」？**

已知问题：如果 spec.md 里 `### Requirement:` 被翻译成了 `### 需求：`，严格的 OpenSpec 验证器会找不到。两种方案：(a) 在 spec.md 里保留英文关键字 `### Requirement:` 和 `#### Scenario:`；(b) 给验证器加 locale 扩展。推荐 (a)，改动最小。

**mockup 没画 loading / error 状态怎么办？**

**不要因此跳过状态枚举**。流程是：

1. `notes.md` 状态表里把 `loading` / `error` 仍然标 ✅，备注栏写「mockup 未提供 → needs_human_input：骨架样式（或错误兜底）待签收」
2. 在「开放问题」里加一条对应问题，让设计补这部分视觉
3. `spec.md` 里也写一条占位 Scenario，标 `needs_human_input`，等设计补全后填实

跳过等于把"组件该有几种状态"的决策权丢给实现 AI，结果通常是只有 success 态的劣质实现。

**改造既有组件，不是新建，怎么处理？**

skill 在步骤 6.5 会自动判定，命中以下任一信号即按"改造"处理：

- Glob 找到了同名 / 职责重叠的现有组件
- 仓库里已有对应 spec（`openspec/specs/<capability>/spec.md` 或 `design-spec/<component>/specs/<capability>/spec.md`）
- 你的描述里出现了"改"、"加一个"、"调整"、"v2"、"重做"、"优化"、"迁移" 等词

判定为改造时 spec.md 用 `templates/spec-modified.md`，关键约束：

- 文件头必须引用既有 spec 路径
- `## MODIFIED Requirements` 块下的 `### Requirement:` 标题必须**逐字**与原 spec 一致（改了标题验证器会判为新增 + 旧 Requirement 残留 → 出现两条互相矛盾的需求）
- MODIFIED 块下要列出**变更后该 Requirement 的完整 Scenario 集合**，未变化的 Scenario 也要原样复制过来，否则等于"悄悄删了"未列出的那些

如果 skill 误判成新建（你能看出 spec.md 是 `## ADDED Requirements`），手动改文件头说明"这是改造"，然后让 AI 切到 spec-modified 模板重跑步骤 7。

**埋点锚点应该写多细？**

只列**语义事件 + 触发 Scenario**，不要写完整 schema。完整字段名、属性类型、上报频率、采样率等都是 `design-to-track` skill 的职责。原则：

- spec.md 中所有 `tap-` / `view-` / `enter-` / `submit-` 前缀的事件 → 至少 1 行锚点
- 主转化 / 主曝光路径 → 即使没有显式事件也要列锚点（如「卡片首次进入视口」）
- **明确不埋点的也要显式标 `not-tracked`**，不要漏 —— 否则下游 skill 无法区分"漏了"和"决策不埋"
- 关键参数列**业务语义名**（`fund.code`），而不是埋点 key（`f_code`）

写完后扫一眼 spec.md，把所有事件名跟锚点表对一遍 —— 1:1 对得上才算合格。

---

## 与其他 skill 的协作

`design-to-spec` 在更大的 skill 群里扮演**单一事实源**角色 —— 所有"从设计稿衍生的工程产物"都应该消费它产出的 `notes.md` / `spec.md`，而不是各自重新去看 mockup。

```
                  mockup
                    │
                    ▼
            design-to-spec  (本 skill)
                    │
       ┌────────────┼────────────────────┐
       ▼            ▼                    ▼
   notes.md      spec.md              （未来）
  ┌────────┐  ┌────────┐
  │状态枚举 │  │行为契约 │
  │埋点锚点 │  │WHEN/THEN│
  │数据契约 │  │         │
  └───┬────┘  └────┬────┘
      │            │
      ▼            ▼
 design-to-track  Superpowers /plan ─► tasks.md ─► 实现
 (开发中)              │
                       ▼
                   实现 + 测试
```

**为什么必须串行**：每个下游 skill 都需要"已经被消化过的设计意图"，而不是原始 mockup。

- `design-to-track` 需要的是「哪些事件、什么语义、对应哪个 Scenario」 —— 这就是「埋点锚点」+「状态枚举」+「数据契约」三节
- `/plan` 需要的是「数据契约 + 决策 + 状态枚举 + 开放问题」 —— 这是 `notes.md` 的核心
- 实现 AI 需要的是「可断言的 WHEN/THEN」 —— 这是 `spec.md`

如果跳过 `design-to-spec` 直接让 `design-to-track` 看 mockup，它会重复一次视觉枚举（浪费 token），且会与 `/plan` 阶段的推断**互相矛盾**（一个认为某区域是导航、另一个认为是装饰）。

**未来计划的 skill 群成员**：

| skill                 | 消费什么                                    | 产出                                          |
| --------------------- | --------------------------------------- | ------------------------------------------- |
| `design-to-track`     | notes.md 的「埋点锚点」+「状态枚举」+「数据契约」          | `tracking/<component>.json`（埋点 schema）      |
| `design-to-test`      | spec.md 的所有 Scenario                    | `__tests__/<component>.test.ts`（fixture 测试） |
| `design-to-a11y`      | notes.md 的「数据契约」+ mockup（用于对比度检查）        | `a11y-audit/<component>.md`（无障碍审计报告）         |
| `design-to-storybook` | notes.md 的「状态枚举」+「数据契约」                 | `<component>.stories.tsx`（每状态一个 story）      |

所有 skill 都遵守同一约定：**绝不重新阅读原始 mockup**，只消费 `design-spec/<component>/` 目录下的 `notes.md` + `spec.md`。这是 skill 群"单一事实源"原则的工程落地。

### 与 OpenSpec 的集成

`design-to-spec` 直接产出 OpenSpec 兼容的 `spec.md`，可无缝接入 `openspec` CLI + 仓库内 `/opsx-*` 命令组成的完整变更工作流。

**输出位置的两种选择**：

| 模式 | 输出路径 | 何时选 |
|---|---|---|
| **独立模式（默认）** | `design-spec/<component>/specs/<capability>/spec.md` | 还在评审阶段、不想立即进入 OpenSpec 流程；或项目还没启用 OpenSpec |
| **OpenSpec 直入模式** | `openspec/changes/<change-name>/specs/<capability>/spec.md` | 设计已签收、准备走完整 OpenSpec 工作流（propose → apply → verify → archive → sync）|

切换很简单：让 skill 知道 `<change-name>`（如 `add-today-windvane` / `modify-today-windvane`），它会直接输出到 `openspec/changes/<change-name>/` 下，省去后续手动搬运。**对应 `notes.md` 也建议放在同目录**，作为该 change 的设计上下文（虽然 OpenSpec 不强制要求）。

**完整工作流**（独立模式 → OpenSpec 直入模式 → 归档）：

```
[mockup]
   │
   ▼
design-to-spec
   │
   ├─→ design-spec/<component>/                  ← 评审阶段
   │   ├── notes.md
   │   └── specs/<capability>/spec.md
   │
   │  （评审通过 + 设计签收后搬到 OpenSpec）
   │
   ▼
openspec/changes/<change-name>/                  ← 进入 OpenSpec
├── proposal.md      ← 由 /opsx-propose 或人工补
├── design.md        ← 由 /opsx-propose 或人工补（notes.md 的「决策」+「数据契约」可直接喂入）
├── tasks.md         ← 由 /opsx-propose 或 Superpowers /plan 生成
└── specs/<capability>/spec.md                   ← design-to-spec 的产物
   │
   ├─► /opsx-verify   ← 验证 spec / tasks / design 一致性
   ├─► /opsx-apply    ← 按 tasks.md 实现代码
   ├─► /opsx-verify   ← 实现后再验一次：实现是否匹配 spec 的 Scenario
   ├─► /opsx-archive  ← 归档到 changes/archive/<date>-<change-name>/
   └─► /opsx-sync     ← 把 delta spec 合并进 openspec/specs/<capability>/spec.md（活动 spec 真相来源）
```

**spec.md 模板与 OpenSpec 块的对应**：

| design-to-spec 模板               | OpenSpec change 类型 | 对应命令链                                  |
| ------------------------------- | ----------------- | -------------------------------------- |
| `templates/spec.md`（仅 ADDED）     | 新增能力 / 新建组件       | `/opsx-new` → `/opsx-apply` → `/opsx-archive` |
| `templates/spec-modified.md`    | 改造既有能力（含 MODIFIED）| `/opsx-explore` → `/opsx-propose` → `/opsx-apply` → `/opsx-verify` |
| 含 `## REMOVED Requirements`    | 下线既有能力             | 同上 + `/opsx-sync` 时会从主 spec 删除对应 Requirement |

**注意事项**：

- `### Requirement:` / `#### Scenario:` **必须保留英文关键字**，OpenSpec 验证器只认英文（参见 FAQ「OpenSpec 验证器报错」）。
- MODIFIED 块下 Requirement 标题要**逐字与原 spec 一致**，否则 `/opsx-verify` 会判为新增 + 旧 Requirement 残留。
- `notes.md` **不在 OpenSpec schema 内**，OpenSpec 不会消费它，但作为 change 目录里的设计上下文非常有用 —— 它解释了 "为什么 spec 是这样" 和 "状态/埋点/数据契约" 这些 OpenSpec 不覆盖的维度。

### 与 Superpowers 的集成

[Superpowers](https://github.com/obra/superpowers) 是 Jesse Vincent 的 AI 工作流插件，提供 `/plan`、`/brainstorm`、`/implement` 等元命令。`design-to-spec` 是它的天然上游 —— `notes.md` 就是为 `/plan` 设计的输入。

**调用契约**：

```
[mockup]
   │
   ▼
design-to-spec ─► notes.md  ─►  /plan --target <stack>  ─► tasks.md  ─► /implement ─► 代码
                spec.md     │
                            └─►  /implement 直接消费 spec.md 的 Scenario 当验收 oracle
```

**各 Superpowers 命令的输入对应**：

| Superpowers 命令         | 主要消费                                      | 用 design-to-spec 的哪部分                  |
| ---------------------- | ----------------------------------------- | -------------------------------------- |
| `/brainstorm`          | （在 design-to-spec 之前）—— 还没决定做什么时探索方向       | **不消费**，design-to-spec 是其下游              |
| `/plan`                | notes.md 的「决策」+「数据契约」+「状态枚举」+「开放问题」+「计划提示」 | 整份 `notes.md` + `spec.md` 路径            |
| `/implement`           | spec.md 的所有 Scenario（当作验收 oracle）         | `spec.md` —— 每个 Requirement 对应 1+ 个测试 |
| `/debug` / `/research` | 失败的 Scenario 标题 + spec.md 上下文              | 出问题时反向查 `spec.md`                       |

**`notes.md`「计划提示」标签的下游用途**：

| 标签前缀                    | 含义                              | `/plan` 怎么处理                                  |
| ----------------------- | ------------------------------- | --------------------------------------------- |
| `needs_perf_check`      | 需要性能基准测试                        | 在 tasks.md 末尾自动加性能测试任务                         |
| `needs_a11y_pass`       | GA 前要做无障碍审计                     | 触发 design-to-a11y skill（未来）或加人工 a11y review 任务 |
| `new_atom:<name>`       | 引入新原子组件                         | tasks.md 里把新原子作为独立任务，并依赖在主组件之前                 |
| `existing:<path>`       | 复用既有组件（来自组件分解）                  | 跳过对应原子的实现任务，直接 import                         |
| `backend_contract_required`  | 等后端约定                          | 加阻塞任务："等后端确认 <字段>"                            |
| `analytics_wiring_required`  | 需要埋点接线                         | 触发 design-to-track skill（未来）                  |
| `<state>_state_required`     | 某状态的兜底待补                       | tasks.md 里给该状态留 TODO 任务                       |
| `cross_platform_test_required` | 多端验证                          | 加多端测试任务                                        |
| `design_signoff_required`     | 等设计签收                          | 标 blocker 不进入实现                                |

写「计划提示」时**用 snake_case 且前缀语义化**，让 `/plan` 可以用正则解析，自动归类到不同任务桶里。

**Superpowers `/plan` 的具体调用**：

```bash
/plan --target miniprogram ./design-spec/today-windvane/
```

参数说明：

- `--target <stack>`：选择技术栈（决定 plan 在生成 tasks 时套用哪些技术栈惯例）
- 路径参数：传**目录**而非单个文件 —— `/plan` 会自动读取该目录下的 `notes.md` + `specs/*/spec.md`

**与 OpenSpec 的协作模式**（同时用两者）：

```
design-to-spec → notes.md + spec.md
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
   Superpowers /plan            OpenSpec /opsx-propose
   (生成 tasks.md)               (生成 proposal/design/tasks)
        │                             │
        └──────────┬──────────────────┘
                   │
                   ▼
              tasks.md（合并/取舍）
                   │
                   ▼
            /implement 或 /opsx-apply
```

**取舍建议**：

- 项目已采用 OpenSpec → 用 `/opsx-propose` + `/opsx-apply` 系列，`design-to-spec` 的输出直接作为 spec.md 喂入。
- 项目还没用 OpenSpec → 用 Superpowers `/plan` + `/implement`，`design-to-spec` 的 spec.md 作为可断言的验收 oracle。
- 两者都用 → 用 OpenSpec 管 spec 的演进与归档（结构化、可验证），用 Superpowers 管 tasks 的执行（流程化、与代码 agent 集成）。`design-to-spec` 不需要任何改动就能同时服务两条流水线 —— 这正是它"单一事实源"定位的价值。

---

## 快速参考

**skill 路径结构**

```
skills/design-to-spec/
├── SKILL.md                           # skill 的主入口（AI 内部使用）
├── README.md                          # 本文件（人类使用）
├── references/
│   ├── visual-analysis-checklist.md   # 步骤 1 的枚举检查清单
│   ├── openspec-format.md             # OpenSpec 格式参考
│   ├── scenario-writing-guide.md      # 步骤 7 的 Scenario 写作纪律
│   └── stack-hints/
│       ├── miniprogram.md             # 微信小程序（glass-easel）
│       └── web.md                     # React / Vue / HTML
├── templates/
│   ├── notes.md                       # 设计笔记模板（含状态枚举、埋点锚点）
│   ├── spec.md                        # OpenSpec 增量模板（新建组件用，仅 ADDED）
│   └── spec-modified.md               # OpenSpec 增量模板（改造既有组件用，MODIFIED + 可选 ADDED/REMOVED）
└── examples/
    └── today-windvane/                # golden sample（含状态枚举 9 行 + 埋点锚点 9 条的完整示范）
        ├── notes.md
        ├── input.svg                  # 干净版示例输入 mockup（零版权、零品牌风险）
        ├── input-annotated.svg        # 标注版：编号圆圈 + Legend 映射到 spec 的 Requirement/Scenario
        └── specs/today-windvane/spec.md
```

**参考样本**

- [today-windvane](./examples/today-windvane/) — 完整的 `notes.md` + `specs/today-windvane/spec.md` 对照。
- 实际使用时，skill 会把输出放到 `<your-project>/design-spec/<component-name>/`。

**添加新技术栈支持**

在 `references/stack-hints/` 下加一个 `<stack-name>.md`，列出该技术栈独有的：常用 rpx/rem 单位、事件模型（bubble vs capture）、路由约定、性能陷阱、常见布局 bug。skill 在步骤 2 会自动发现并阅读。

**调试 skill 行为**

如果 skill 产出的文件风格偏离 golden sample（比如场景过少、数据契约字段用了视觉命名而非业务命名），通常是 `examples/today-windvane/` 需要更新——这是 skill 主要的风格校准源。改那份样本比改 SKILL.md 更快见效。
