# 仓库工作流

本文说明 `skill-collections` 的组织方式，以及 skill 开发、sample 编写、fixtures 与验证如何衔接。

> **读者**：贡献者 / 维护者。只想使用某个 skill 的终端用户，请从对应 skill 的 README 或 onboarding 指南开始。

---

## 1. 仓库布局

```
skill-collections/
├── README.md                       # 顶层导览
├── CONTRIBUTING.md                  # 贡献者环境与 review 检查清单
├── AGENTS.md                        # 编码 Agent 操作说明
├── package.json                    # npm workspace 声明
├── package-lock.json               # 根 workspace 锁文件
├── .gitignore                      # 共享的本地/构建产物忽略规则
├── eslint.config.mjs                # 仓库 lint 策略
├── lefthook.yml                     # 本地 Git hooks
│
├── packages/                       # 跨 skill 共享代码
│   └── d2c-core/                   # @skill-collections/d2c-core — D2C 管线核心
│
├── skills/                         # 可安装/可复制的 skills
│   ├── design-to-spec/
│   │   ├── SKILL.md
│   │   ├── ONBOARDING.md
│   │   ├── README.md
│   │   ├── CHANGELOG.md
│   │   ├── package.json            # js-yaml + node:test
│   │   ├── agents/
│   │   ├── assets/
│   │   ├── scripts/                # validate-contracts / generate-output / validate-output
│   │   ├── schemas/
│   │   ├── templates/
│   │   ├── references/
│   │   └── examples/               # Golden 回归样本
│   ├── image-to-component/         # 截图 → 组件骨架工作流
│   ├── mastergo-to-component/      # MasterGo 设计源 provider
│   ├── sketch-to-component/        # Sketch 设计源 provider
│   └── html-article-to-markdown/
│       ├── SKILL.md
│       ├── README.md
│       ├── CHANGELOG.md
│       ├── package.json
│       ├── agents/
│       ├── assets/
│       ├── bin/
│       ├── src/
│       ├── tests/
│       └── tools/
│
├── samples/                        # 按 skill 分组的动手工作区
│   └── design-to-spec/
│       ├── search-panel/
│       └── feedback-form/
│
├── fixtures/                       # 各框架的测试/演示 app fixture
└── docs/                           # 顶层横切文档
    ├── repo-workflow.md
    ├── sample-authoring.md
    ├── commenting-guide.md
    ├── design-source-to-component/  # D2C 架构总纲、实施计划与概览（含 architecture-zh 中文版）
    ├── stages/                      # 各 Stage 计划与蓝图
    ├── reports/                     # 调研 spike 与审计报告
    └── superpowers/
```

顶层划分是刻意的：

- `skills/<skill-name>/` 包含可安装、可复制、可测试、可版本化的完整 skill。
- `samples/<skill-name>/<sample-name>/` 包含针对真实输入演示某个 skill 的动手工作区。
- `fixtures/apps/<target>/` 包含用于 CI 回归、浏览器调试与演示的可复用 app fixture，不是 skill 源码。
- `fixtures/shared/` 包含跨 fixture 的资产与设计规格。
- `docs/` 只包含仓库级策略与贡献者指南。

---

## 2. Skill 目录契约

每个 skill 应把人类文档、运行时代码、测试与资产放在一起：

```
skills/<skill-name>/
├── SKILL.md          # 由 agent harness 加载的 skill 定义
├── README.md         # 人类入口
├── CHANGELOG.md      # 版本历史
├── agents/           # Agent/harness 配置
├── assets/           # 图标、预览、截图
├── src/ 或 scripts/  # 核心实现
├── schemas/          # JSON Schema 或等价契约（若适用）
├── templates/        # 输出模板（若适用）
├── references/       # 按需加载的长文档
├── examples/         # Golden 样本 / 回归 fixture（若适用）
└── tests/            # 自动化测试套件（若适用）
```

不是每个 skill 都需要每个目录。只有 skill 确实有该类产物时才添加对应文件夹。

---

## 3. 两类 design-to-spec 示例

仓库刻意区分两个容易混淆的概念：

|                    | Golden 回归样本                           | 动手 samples                                           |
| ------------------ | ----------------------------------------- | ------------------------------------------------------ |
| **位置**           | `skills/design-to-spec/examples/`         | `samples/design-to-spec/<name>/`                       |
| **目的**           | 证明 skill 可用；用字节级等价输出钉住行为 | 演示 inputs → spec → 实现全流程                        |
| **读者**           | skill 自己的测试                          | skill 用户 / reviewer / 读者                           |
| **维护方**         | `design-to-spec` 维护者                   | sample 作者                                            |
| **可否编辑？**     | 否；测试脚本断言输出完全一致              | 是；sample 会随时间演进                                |
| **包含内容**       | 契约 + 生成的 markdown                    | `inputs/` + `design-spec/` + `src/` + `walkthrough.md` |
| **失败意味着什么** | skill 发生回归                            | sample 与 spec 漂移                                    |

正是为了避免混淆才做了 monorepo 拆分。不要混用这两类目录。

---

## 4. 动手 sample 流程

```
┌──────────────────────────┐
│  inputs/                 │   原始材料，由人编写
│  ├── design.svg          │
│  ├── api.md              │
│  └── interaction-notes.md│
└────────────┬─────────────┘
             │
             ▼
   ╔═══════════════════════╗
   ║  design-to-spec skill ║   四阶段交互式流程
   ╚═══════════╤═══════════╝
               │
               ▼
┌──────────────────────────┐
│  design-spec/<unit>/     │   skill 输出
│  ├── contracts/*.yaml    │
│  ├── notes.md            │
│  ├── data-fetching.md    │
│  └── specs/<cap>/spec.md │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  src/                    │   实现
│  ├── index.html          │   消费 design-spec/
│  ├── main.js             │   不直接读 inputs/
│  └── style.css           │
└──────────────────────────┘
```

`walkthrough.md` 是串联各阶段的叙事层：每步长什么样、做了哪些选择、还有哪些 `open_questions`。

---

## 5. 常用操作

### 运行 skill 测试

```bash
npm run test:skills
```

从仓库根目录运行当前 skill 测试套件。`npm run test:skill` 保留为兼容别名。

### 构建所有 samples

```bash
npm run build:samples
```

构建 `samples/<skill>/<sample>/` 下的工作区。

### 格式化与 lint

```bash
npm run format:check
npm run lint
```

本地修复可用 `npm run format` 与 `npm run lint:fix`。

### 类型检查所有带类型的 workspace

```bash
npm run typecheck
```

覆盖 `d2c-core`、`image-to-component` scripts、`sketch-to-component`
scripts，以及 HTML article 的 TypeScript 构建。

### 合并前完整检查

```bash
npm run check:full
```

按顺序执行：lint → format check → typecheck → 全部测试 → sample 构建
→ fixture app lint/build。这是本地的 CI 等价命令。

若需要稍窄、不含 fixtures 的检查，可运行 `npm run check`。

### 单独开发某个 sample

```bash
cd samples/design-to-spec/search-panel
npm install
npm run dev
```

---

## 6. 运行时与锁文件策略

- 根 workspace 使用 Node.js >= 20，因为 `skills/html-article-to-markdown` 需要 Node 20。
- 各 skill 若可独立运行，可声明更低的兼容引擎，例如 `skills/design-to-spec` 要求 Node >= 18。
- 保留根 `package-lock.json` 供 workspace 开发使用。
- 当 skill 设计为可复制或独立安装时，保留各 skill 的 `package-lock.json`。
- 不要提交 `node_modules/`、`dist/`、`.vite/`、构建输出或嵌套的 `.git/` 目录。

---

## 7. 共享 package 与未来工具

`packages/` 已存在 —— 其中是 `d2c-core`（`@skill-collections/d2c-core`），供各 skill 消费的设计源→组件共享管线核心。只有在重复确实出现之后，才在 `packages/*` 下新增共享 package。

目前仍不存在、但可能在未来出现的目录：

- `tools/` —— 跨多个 skill 或 sample 操作的仓库级脚本，例如 `new-sample.mjs` 生成器。仅在需求真实出现后再创建。

---

## 8. CI

GitHub Actions 运行与本地开发相同的门禁：

```bash
npm ci
npm ci --prefix fixtures/apps/react-vite
npm run check:full
```

本地 `lefthook` 在 commit 时运行 `npm run format:check` 与 `npm run lint`，
在 push 前运行 `npm run check:full`。
