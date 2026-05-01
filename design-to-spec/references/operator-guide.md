# design-to-spec 操作手册（零基础版）

> 面向已经决定要用这个工具、准备拿真实设计稿动手的同事。读完这篇可以独立完成一个 UI 单元（组件 / 页面 / 模块）从设计稿到规格的完整流转，并知道在多视觉稿、context 紧张等真实场景下该怎么取舍。
>
> **还没决定要不要用？** 先读 [ONBOARDING.md](../ONBOARDING.md)（3 分钟）。
> **想了解工作原理？** 读 [SKILL.md](../SKILL.md)（参考手册，不必先读）。

本手册按"任务"组织，遇到细节时再回头查 SKILL.md 或 contracts.md。

---

## 0. 你需要准备什么

- **一张或多张视觉稿**：截图、Figma 导出图、SVG 都可以；手绘草图也行，但越清晰越省力。
- **接口文档（推荐有）**：OpenAPI / Swagger / Markdown / TypeScript 类型 / Postman Collection 任选其一。没有也能跑，但产出会有较多 `needs_human_input`。
- **交互说明**：用一两句话能说清"用户点了什么会发生什么"即可。
- **组件名**：英文短名，比如 `SearchPanel`、`OrderList`。决定输出目录名 `design-spec/<component-name>/`。

---

## 1. 五分钟跑通一个最小例子

适用：**单个组件 + 单张设计稿 + 有接口文档**。这是最简单的场景，先把流程跑通。

### 第 1 步：启动会话，给出最小指令

在已启用 `design-to-spec` skill 的会话里，发送：

```
帮我把这张设计稿做成规格。组件名 SearchPanel，目标技术栈 web。
[附上 1 张设计稿截图]
```

skill 会进入**阶段一（视觉提纯）**，对图做内部分析，然后给你一段 ASCII 图表 + 组件清单 + 待确认项，最后问你"是否无误并继续第二步？"。

### 第 2 步：确认 UI 信息

- 检查 ASCII 图表里的层级和文本是否和设计稿一致（**特别注意**：省略号、数字、单位、占位符文案都不能错字）。
- 看 `?` 标记的"待确认"项，逐个回复你期望的处理方式。例如："error 态用 Toast 显示 errorMessage 字段"。
- 没问题就回复"确认，继续"。skill 会把 `contracts/ui-schema.yaml` 写盘，进入阶段二。

### 第 3 步：粘贴接口文档

skill 会问"请粘贴接口文档"。你可以：

- 直接粘贴整段 OpenAPI / Swagger（> 2000 字时 skill 会自动截断，不用担心）
- 粘贴 TypeScript 类型定义
- 或者粘贴你们内部 Markdown 接口文档

粘贴后 skill 输出**阶段二（接口提纯）**摘要：URL、入参、出参、错误码。检查无误后回复"确认"。

### 第 4 步：描述交互逻辑

skill 会问"这些组件和接口是怎么交互的？"。用自然语言写，越具体越好。例：

```
点击 submitBtn 时调用 GET /api/v1/search，把 searchInput 的值作为 keyword 传入。
返回 results 列表，空数组时显示空状态，请求失败时显示 error 态。
失败要重试 1 次；用户连续点击 submit 时取消上一次请求。
```

skill 输出**阶段三（逻辑映射）**：状态机转换表 + 字段绑定表。确认。

### 第 5 步：自动生成规格

skill 会运行两个脚本（不需要你手动跑，但你会看到命令在跑）：

```bash
node design-to-spec/scripts/validate-contracts.js ...
node design-to-spec/scripts/generate-output.js ...
```

跑完你会得到：

```
design-spec/SearchPanel/
├── contracts/         三份 YAML 事实契约
├── notes.md           设计决策 + 数据契约 + 开放问题
├── data-fetching.md   请求链路 + 错误处理 + 状态机
└── specs/.../spec.md  OpenSpec 行为规格（可测试 Scenario）
```

**完成。** 把整个 `design-spec/SearchPanel/` 目录交给 `/plan` 或开发同事。

---

## 2. 多视觉稿场景：先做"关系判断"再选策略

实际项目里你拿到的不一定是一张图。先按下表对号入座：

| 你的多张图属于…… | 例子 | 操作策略 | 是否同会话 |
|---|---|---|---|
| 同组件的不同状态 | loading / empty / error 各一张 | 一次性传入，合并到一份 ui-schema 的 `states[]` | **同一次会话** |
| 同组件的不同断点 | mobile / tablet / desktop | 选主断点为基线，差异点写进 `layout.responsive` 或 open_questions | **同一次会话** |
| 同页面的不同区域 | header + list + footer 拆图 | 作为一个 Container 的 children，统一 ui-schema | **同一次会话** |
| 多个独立组件 | 首页、详情页、设置页 | 每个组件跑一遍完整四阶段，输出到不同目录 | **拆多次会话** |
| 流程的多个步骤 | 向导 step1 → step2 → step3 | 每步当作一个组件，mapping 阶段引用前后 step 事件 | **拆多次会话** |

### 判断口诀

> **能写进同一份 `ui-schema.yaml` 的 → 同会话；要写到不同 `<component-name>/` 目录的 → 拆会话。**

### 多图同会话怎么发指令

如果你判断属于"同会话"类型，第一条消息里把图一起传，并明确告诉 skill 每张图代表什么：

```
组件名 OrderList，目标技术栈 web。下面 4 张图分别是：
- 图 1：success 态（有 3 条订单）
- 图 2：empty 态
- 图 3：loading 态
- 图 4：error 态（顶部红色 banner）
请在 ui-schema 的 states[] 中合并这 4 个状态。
```

这样 skill 在阶段一不会把 4 张图当作 4 个独立组件去枚举。

### 多组件拆会话的工作模板

```
会话 1：组件 A（核心组件，先做）
  - 跑完整四阶段
  - 完成后让 skill 输出一份「接口文档摘要」（保留为独立 markdown 文件）
  - 完成后让 skill 输出一份「设计 token 摘要」（颜色、间距、字号）

会话 2：组件 B
  - 第一条消息附上：B 的设计稿 + 上面两份摘要
  - skill 阶段二能直接复用，不需要再粘贴整份 OpenAPI

会话 3：组件 C
  同上

最后：把整个 design-spec/ 目录传给 /plan 做实现规划
```

为什么要拆会话：避免组件间的视觉信息和接口字段在 context 里互相污染，也避免阶段一推理时把 A 的 button 当成 B 的 button。

---

## 3. context 不够用了？这样救

视觉稿大、接口文档长、组件复杂时很容易碰到 context 压力。按"症状"对应处理：

### 症状 A：阶段一传图后模型反应变慢、回答不完整

**原因**：图片太大，吃了几千 token。

**做法**：

1. 上传前在本地把图缩到长边 ≤ 1600px（PNG 也可以转 WebP）。视觉信息保留充分，token 能砍 30–50%。
2. 一次最多塞 3–4 张图，再多就拆批次。
3. 阶段一确认完成后，**主动告诉 skill 进入下一阶段**："图片信息已确认，请基于 ui-schema.yaml 进入阶段二，不再回看图片。"

### 症状 B：阶段二接口文档太长，模型只抓到了一部分字段

**原因**：粘贴了整份 OpenAPI，但本组件只用其中几个 endpoint。

**做法**：

- 粘贴前手动筛选：只保留你这个组件实际调用的 endpoint 段落。
- 或者只粘贴 TypeScript 类型定义（通常比 YAML/JSON 紧凑得多）。
- skill 内置截断逻辑（≤ 4000 token），但**事前筛选** > 事后截断。

### 症状 C：进入阶段四时模型卡住不出文件

**原因**：context 已被前三阶段累积内容占满。skill 内置门控（< 10K 时强制停止）。

**做法**：

1. **优先信任脚本**：让 skill 直接调用 `scripts/generate-output.js`，脚本是确定性的、不消耗推理 token。
2. 脚本跑完拿到基线文件后，再让 LLM 做局部润色（比如改 `notes.md` 的开放问题措辞）。
3. 如果连脚本都跑不动了：**开新会话**。把三份 `contracts/*.yaml` 路径告诉新会话，跳过阶段一二三，直接执行阶段四。

### 通用经验：尽早落盘

skill 在每个阶段确认后会立刻把 YAML 写盘。**不要等到全部跑完才存**。万一 context 爆了，已落盘的 contracts/ 可以让新会话从中间接续，不用从头开始。

---

## 4. 没有接口文档怎么办？

两种处理：

### 情况 1：纯展示组件（数据由父组件传入）

阶段二第一句话告诉 skill：

```
这是一个纯展示组件，所有数据由父组件以 props 传入，没有接口。
```

skill 会用 `API_Schema = {endpoints: []}` 通过阶段二，进入阶段三时把 binding 全部写为 `prop` 来源。

### 情况 2：接口还没设计，但组件要先出规格

把你**预期的字段**用伪 TypeScript 写出来，例如：

```
预期接口（待后端确认）：
GET /api/v1/orders
Response: {
  results: { id: string; title: string; status: 'pending' | 'paid' | 'cancelled' }[];
  total: number;
}
```

skill 会照常生成 YAML，并把字段加入 `api.open_questions`，标注"待后端确认"。后端文档出来后，你修改 `contracts/api-schema.yaml` 重跑生成脚本即可。

---

## 5. 跨组件复用：少做重复劳动

多组件项目里有两类工作要做：**沉淀复用资源**（避免重复劳动）和**保持跨组件一致性**（避免字段漂移和耦合丢失）。

### 5.1 沉淀复用资源

这几样东西**第一次产出后保留为独立文件**，后续会话直接粘贴或附加：

| 沉淀物 | 来源 | 何时复用 |
|---|---|---|
| 接口文档摘要 | 第一个组件阶段二的 endpoint 列表 | 第二个组件起,省去重新读原始 OpenAPI |
| 设计 token 表 | 颜色、字号、间距、圆角 | 阶段一让模型直接引用,避免每次重新枚举 |
| 错误码字典 | NETWORK_ERROR / FORBIDDEN 等枚举 | 阶段二、阶段三复用,避免不一致 |
| 状态命名约定 | loading / empty / success / error 的具体语义 | 跨组件保持一致 |

skill 当前没有自动复用机制,靠你手动维护。建议在项目里建一个 `design-spec/_shared/` 目录存这些。

### 5.2 全局接口摸底（多组件项目的前置步骤）

**适用场景**：你拿到的是一份覆盖整个项目所有组件的大接口文档（OpenAPI / Swagger / 内部 wiki），并且要做的组件 ≥ 3 个。

**为什么需要**：直接逐组件投喂接口文档会有四类耦合丢失风险：

1. 共享 endpoint（多个组件调用同一个接口）的拉取归属和缓存策略不一致
2. 共享字段（如 `order.status`）的枚举值在不同组件里漂移
3. 跨组件状态联动（List 选中→Detail 刷新）在单组件视角下不可见
4. 错误码处理策略各组件各写各的，最后不统一

**操作步骤**：在跑任何具体组件之前，先开一个独立会话做"摸底"：

```
我有一份完整的接口文档（覆盖整个项目）。请帮我提取一份"全局接口目录"，
输出到 design-spec/_shared/api-catalog.md，包含：

1. 所有 endpoint：URL + method + 一句话简介 + 调用方组件（如已知）
2. 共享字段字典：被 ≥ 2 个 endpoint 返回的字段（如 user.id, order.status）
   每个字段标注：类型 / 完整枚举值 / 哪些组件消费
3. 全局枚举字典：status / role / errorCode 等所有枚举的完整取值
4. 全局错误码字典 + 每个错误码的推荐处理策略（跳登录 / Toast / 静默重试）
5. 共享缓存策略建议：哪些 endpoint 应当全局缓存，谁负责拉取

[粘贴完整接口文档]
```

产出 `design-spec/_shared/api-catalog.md` 后，**这是后续所有组件会话的全局事实源**。

### 5.3 各组件会话怎么用 catalog

跑每个组件时，第一条消息附上 catalog（或与本组件相关的段落）：

```
组件名 OrderList。请基于以下两份输入工作：
1. [设计稿]
2. [api-catalog.md 全文，或粘贴 OrderList 相关 endpoint 段]

硬性要求：
- 本组件用到的字段名、类型、枚举值必须与 api-catalog 完全一致
- 如果设计稿暗示需要 catalog 里没有的字段，写进 api.open_questions
- 如果本组件依赖其他组件的状态（如选中行），写进 mapping.open_questions
```

这样能保证：字段定义不漂移、跨组件依赖被显式登记。

### 5.4 跨组件联动的显式登记

skill 的 `Mapping_Logic` 是单组件本位的，不直接表达跨组件关系。把耦合关系**显式登记**在两个地方：

**位置 A：`mapping_logic.yaml` 的 `data_fetching.requests[].trigger`**

```yaml
requests:
  - id: fetchOrderDetail
    endpoint: GET /api/orders/:id
    trigger:
      type: prop_change
      source: props.selectedOrderId      # 显式声明依赖外部 prop
      depends_on_component: OrderList    # 标注上游组件名
```

**位置 B：`mapping.open_questions` 中登记跨组件契约**

```yaml
open_questions:
  - id: cross-component-selection-sync
    priority: P0
    text: "OrderList 选中行后通过什么方式通知 OrderDetail 刷新？
           候选：URL 参数 / 全局 store / 父组件 prop。
           需在实现规划阶段统一决定。"
```

这两处锚点都会被 `/plan` 阶段读到，跨组件协作不会被静默吞掉。

### 5.5 跨组件 lint：所有组件完成后的人工 review

所有组件跑完后，做一次跨组件一致性检查。当前 skill 没有内建脚本，按下面三条规则人工抽查：

| 检查项 | 怎么查 | 出问题怎么办 |
|---|---|---|
| 同 endpoint id 在不同组件的字段定义一致 | 对比所有 `api-schema.yaml` 中相同 `endpoints[].id` 的 `response_fields` | 以 catalog 为准，更新各组件契约后重跑 generate-output |
| 同枚举（如 status）取值一致 | 对比所有 `api-schema.yaml` 中相同字段的 `enums` | 以 catalog 为准，对齐后重跑 |
| 共享 endpoint 的 cache_policy 不冲突 | 对比所有 `mapping-logic.yaml` 中相同 endpoint 的 cache_policy | 决定唯一负责方，其他组件改为消费缓存而非重复拉取 |

简易命令（手工 grep 即可）：

```bash
# 找出所有组件都在调用哪些 endpoint
grep -h "endpoint:" design-spec/*/contracts/mapping-logic.yaml | sort | uniq -c | sort -rn

# 找出某个共享字段在不同组件中的定义
grep -A 3 "name: status" design-spec/*/contracts/api-schema.yaml
```

发现不一致后：**改 `_shared/api-catalog.md` 为权威版本，再回到出问题的组件会话同步契约**。不要在某一个组件里偷偷修，否则下次又会漂移。

### 5.6 多组件项目的标准工作流

把上面所有内容串起来：

```
Step 0: 全局接口摸底（一次会话）→ design-spec/_shared/api-catalog.md
Step 1: 列出要做的组件，按依赖顺序排列（被依赖的先做）
Step 2: 逐个组件跑 skill，每次都附带 catalog
        每次跑完追加更新 catalog（如发现新枚举值或新错误码）
Step 3: 所有组件完成后，按 5.5 做跨组件 lint
Step 4: 把整个 design-spec/（含 _shared/）交给 /plan
```

要点：catalog 是**活文档**，组件做多了会发现新东西，及时回填；不要让它在 Step 0 之后就石化。

---

## 6. 常见错误和补救

| 现象 | 原因 | 补救 |
|---|---|---|
| 阶段一漏掉了某个按钮 | 图太小或被遮挡 | 直接回复"还有一个 X 按钮在右上角，请补充"，skill 会更新 ui-schema |
| 阶段二把不相关的字段也提取了 | 接口文档没事前筛选 | 回复"results 接口里只用 id/title/status 三个字段，其他请删除" |
| 阶段三状态机少了一条转换 | 你的描述不够具体 | 直接补一句"还有一种情况：data.results.length > 100 时显示分页提示" |
| 生成的 spec.md 里 Scenario 太空泛 | render_assertion 缺失 | 检查 `ui-schema.yaml` 的 `states[].render_assertion`，补上具体 DOM 断言（如 `renders .empty-state`），重跑生成脚本 |
| validate-output 报错 trace 锚点缺失 | 手动改 markdown 时删掉了 `state:<id>` 之类标记 | 把锚点加回去；它们是机器校验用的，不是装饰 |
| context 爆了，会话无响应 | 累积太多 | 开新会话，把 `contracts/*.yaml` 粘给它，从阶段四接续 |

---

## 7. 完成后的标准动作

跑完一个组件，建议依次做：

1. **看一眼 `notes.md` 的"开放问题"段**：里面是 skill 标记的 `needs_human_input`，需要你或 PM/设计师逐条回答后回填。
2. **跑一次输出校验**（skill 会自动跑，但手动复跑能确认 markdown 没改坏）：
   ```bash
   node design-to-spec/scripts/validate-output.js --strict \
     --ui design-spec/<component>/contracts/ui-schema.yaml \
     --api design-spec/<component>/contracts/api-schema.yaml \
     --mapping design-spec/<component>/contracts/mapping-logic.yaml \
     --notes design-spec/<component>/notes.md \
     --data-fetching design-spec/<component>/data-fetching.md \
     --spec design-spec/<component>/specs/<capability>/spec.md
   ```
3. **把整个目录交给下游**：`/plan --target <stack> ./design-spec/<component>/`，不要只传单个文件。

---

## 8. 速查：这种情况我该……

- **只想做一个小组件？** → 跟着第 1 节五分钟例子走。
- **手里 5 张图，是同一个页面的不同区域？** → 第 2 节"同页面不同区域"行，同会话。
- **手里 5 张图，是 5 个独立页面？** → 第 2 节最后一行，拆 5 次会话，沉淀复用资源。
- **接口文档是覆盖全项目的大文档，要做 ≥ 3 个组件？** → 第 5.2 节先做全局接口摸底，再逐个跑。
- **跑完多个组件，担心字段定义漂移？** → 第 5.5 节跨组件 lint。
- **接口还没出？** → 第 4 节情况 2，写预期字段。
- **传图后模型很慢？** → 第 3 节症状 A，缩图。
- **跑到一半 context 不够？** → 第 3 节症状 C，开新会话从 contracts/ 接续。
- **想知道字段含义？** → 读 [contracts.md](contracts.md)。
- **想看一个完整真实例子？** → 读 `examples/today-windvane/`。

---

更深入的细节（YAML 字段语义、校验规则、反模式清单）查 [SKILL.md](../SKILL.md) 和 [contracts.md](contracts.md)。
