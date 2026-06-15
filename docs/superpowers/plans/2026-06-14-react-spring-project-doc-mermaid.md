# React + Spring 项目文档 Mermaid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `react-spring-project-doc` 在 P7 生成代码证据驱动的 Mermaid 运行时全景图与核心链路图，并让 P8 校验图结构和证据，不再执行构建、测试、lint、typecheck 命令。

**Architecture:** 扩展现有零依赖 `validate-docs.js`，把 Mermaid fence、图数量和 Evidence 声明作为确定性结构契约；业务节点与连线真实性继续由 P8 对照 P4/P5/evidence ledger 校验。P7 仍只装配中间产物，不重新扫描源码。

**Tech Stack:** CommonJS、Node.js `assert` 冒烟测试、Markdown、Mermaid `flowchart LR`。

---

## 文件职责

- `scripts/validate-docs.js`：抽取并校验 Mermaid 结构、图数量、Evidence ID，同时保留路径和符号检查。
- `scripts/tests/validate-docs.test.js`：覆盖 Mermaid 合法/非法结构和 skill 文档契约。
- `SKILL.md` / `README.md`：声明 P7 Mermaid 交付和 P8 静态校验边界。
- `templates/07-doc-generation.md`：规定全景图、链路图和 Evidence 注释的生成格式。
- `templates/08-validation.md` / `schemas/validation-record.md`：删除命令执行校验，加入 Mermaid 节点、连线和完整性校验。
- `references/phase-resume-guide.md` / `CHANGELOG.md`：同步阶段取材策略与升级说明。
- `demo-react-spring/docs/architecture.md`：真实运行时全景图。
- `demo-react-spring/docs/business-flows.md`：F-1/F-2/F-3 三张链路图。
- `demo-react-spring/docs/validation-report.md` 和 `.analysis/08-validation-report-draft.md`：记录新 P8 校验结果，不保留命令执行章节。

### Task 1: 建立 Mermaid 校验 RED 测试

**Files:**

- Modify: `skills/react-spring-project-doc/scripts/tests/validate-docs.test.js`

- [x] **Step 1: 添加结构契约测试**

测试创建最小 `architecture.md`、`business-flows.md` 和 `evidence-ledger.md`，断言：

```js
assert.strictEqual(valid.mermaidErrors.length, 0);
assert.strictEqual(valid.checkedMermaidBlocks, 2);
assert.deepStrictEqual(valid.evidenceMiss, []);
```

再创建以下失败输入：

````markdown
```mermaid
sequenceDiagram
```
````

以及 architecture 图数量错误、business flow 图数量错误、缺失 Evidence ID，分别断言进入
`mermaidErrors` 或 `evidenceMiss`。

- [x] **Step 2: 添加 skill 文档契约测试**

读取 `SKILL.md`、P7/P8 模板，断言包含：

```js
assert.match(skill, /Mermaid/);
assert.match(p7, /flowchart LR/);
assert.doesNotMatch(p8, /实际运行.*构建|命令可执行性/);
```

- [x] **Step 3: 运行测试并确认 RED**

Run:

```bash
node skills/react-spring-project-doc/scripts/tests/validate-docs.test.js
```

Expected: FAIL，因为 `validate()` 尚未返回 Mermaid 校验字段，skill 文档也仍要求 ASCII 图和命令执行。

### Task 2: 实现 Mermaid 确定性校验

**Files:**

- Modify: `skills/react-spring-project-doc/scripts/validate-docs.js`
- Test: `skills/react-spring-project-doc/scripts/tests/validate-docs.test.js`

- [x] **Step 1: 增加 Mermaid 抽取函数**

新增：

```js
function extractMermaidBlocks(text) {
  // 返回完整 fence 内容；未闭合 fence 记录结构错误。
}

function extractEvidenceIds(text) {
  return new Set(text.match(/\bE-\d{3}\b/g) || []);
}
```

- [x] **Step 2: 增加文档结构校验**

规则：

```js
architecture.md: Mermaid block count === 1
business-flows.md: Mermaid block count === /^## F-\d+/gm count
each Mermaid block: first non-comment statement startsWith('flowchart ')
each Mermaid block: has %% Evidence: E-xxx
```

返回：

```js
{
  mermaidErrors,
  evidenceMiss,
  checkedMermaidBlocks,
  checkedEvidenceRefs,
}
```

- [x] **Step 3: 将结构错误纳入 hard failure**

CLI 输出增加 Mermaid/Evidence 汇总；`mermaidErrors` 和 `evidenceMiss` 均导致退出码 1，
不依赖 `--strict`。

- [x] **Step 4: 运行测试确认 GREEN**

Run:

```bash
node skills/react-spring-project-doc/scripts/tests/validate-docs.test.js
```

Expected: `✅ validate-docs 冒烟测试通过`。

### Task 3: 更新 skill 流程契约

**Files:**

- Modify: `skills/react-spring-project-doc/SKILL.md`
- Modify: `skills/react-spring-project-doc/README.md`
- Modify: `skills/react-spring-project-doc/CHANGELOG.md`
- Modify: `skills/react-spring-project-doc/templates/07-doc-generation.md`
- Modify: `skills/react-spring-project-doc/templates/08-validation.md`
- Modify: `skills/react-spring-project-doc/schemas/validation-record.md`
- Modify: `skills/react-spring-project-doc/references/phase-resume-guide.md`

- [x] **Step 1: 更新 P7 输出要求**

写明：

```text
architecture.md 恰好一张 flowchart LR 全景图
business-flows.md 每条 ## F-N 链路恰好一张 flowchart LR
每张图含 %% Evidence: E-xxx
不完整链路画“断点：待确认”，禁止推测补线
```

- [x] **Step 2: 更新 P8 checklist**

保留路径、符号、API、链路、证据、一致性、废弃代码和置信度校验；新增 Mermaid 结构、
Evidence 声明、节点真实性、连线证据和不完整链路图示校验；删除所有构建、测试、lint、
typecheck 执行要求及“命令可执行性”报告章节。

- [x] **Step 3: 更新 README、恢复指南和 changelog**

README 描述 Mermaid 输出和静态 P8；恢复指南限制 P8 只点查源码证据；CHANGELOG 在
`[Unreleased]` 中记录 Added/Changed/Removed，明确此次 P8 行为变化。

- [x] **Step 4: 运行文档契约测试**

Run:

```bash
node skills/react-spring-project-doc/scripts/tests/validate-docs.test.js
npx prettier --check skills/react-spring-project-doc
```

Expected: 两者退出码 0。

### Task 4: 更新真实 demo 产物

**Files:**

- Modify: `demo-react-spring/docs/architecture.md`
- Modify: `demo-react-spring/docs/business-flows.md`
- Modify: `demo-react-spring/docs/validation-report.md`
- Modify: `demo-react-spring/docs/.analysis/08-validation-report-draft.md`

- [x] **Step 1: 生成运行时全景图**

`architecture.md` 中用一张 `flowchart LR` 覆盖：

```text
用户 → 页面/路由 → API/axios → HTTP /api
→ AuthInterceptor（受保护接口）→ Controller → AuthService
→ UserRepository → H2/t_user
→ Result/GlobalExceptionHandler → axios response → 页面状态/跳转
```

图开头声明 `E-001` 至 `E-016`、`E-021` 中实际使用的 Evidence。

- [x] **Step 2: 为三条业务链路生成 Mermaid**

每张图只声明对应 Evidence：

```text
F-1: E-014, E-018, E-021, E-022
F-2: E-015, E-019, E-021
F-3: E-003, E-011, E-016, E-020, E-021
```

- [x] **Step 3: 重写 P8 报告**

删除本轮试跑产生的构建、测试和依赖 audit 结果。报告改为静态检查项，并记录 Mermaid
数量、Evidence 声明、节点/连线抽查与待确认项。

- [x] **Step 4: 运行 demo strict 校验**

Run:

```bash
node skills/react-spring-project-doc/scripts/validate-docs.js \
  --project demo-react-spring --symbols --strict
```

Expected: 路径、符号、Mermaid 和 Evidence 校验全部通过，退出码 0。

### Task 5: 收尾验证

**Files:**

- Verify all modified files.

- [x] **Step 1: 运行 targeted verification**

```bash
node skills/react-spring-project-doc/scripts/tests/validate-docs.test.js
npx prettier --check skills/react-spring-project-doc \
  docs/superpowers/plans/2026-06-14-react-spring-project-doc-mermaid.md
node skills/react-spring-project-doc/scripts/validate-docs.js \
  --project demo-react-spring --symbols --strict
```

- [x] **Step 2: 检查残留旧流程**

```bash
rg -n "ASCII|跑构建命令|命令可执行性|构建/测试/lint/typecheck 命令可执行" \
  skills/react-spring-project-doc
```

Expected: 不再出现要求 P8 执行命令或 P7 生成 ASCII 图的有效流程文本。

- [x] **Step 3: 检查 diff 范围**

```bash
git diff --check
git status --short
```

Expected: 仅计划内 skill 文件、计划文档发生 tracked 变更；用户原有未跟踪文件保持不变。
