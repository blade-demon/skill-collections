# skill-collections

Monorepo containing **AI skills** and **hands-on samples** that exercise them.

```
skill-collections/
├── skills/
│   ├── design-to-spec/          # UI 设计稿 → 实现规格包
│   └── html-article-to-markdown/ # HTML 文章 → 清洁 Markdown
├── samples/                     # 按 skill 分组的实战工作区
│   └── design-to-spec/
│       ├── search-panel/
│       └── feedback-form/
├── fixtures/                    # 测试夹具 App（React + Vite）
└── docs/                        # 仓库级工作流和 skill 编写指南
```

## Quick map

| 目标 | 文档 |
|---|---|
| 了解 `design-to-spec` 能做什么 | [`skills/design-to-spec/ONBOARDING.md`](./skills/design-to-spec/ONBOARDING.md) |
| 在真实设计稿上运行 design-to-spec | [`skills/design-to-spec/references/operator-guide.md`](./skills/design-to-spec/references/operator-guide.md) |
| 了解 HTML → Markdown 转换 skill | [`skills/html-article-to-markdown/README.md`](./skills/html-article-to-markdown/README.md) |
| 完整的 inputs → spec → 实现全流程 | [`samples/design-to-spec/search-panel/`](./samples/design-to-spec/search-panel/) |
| 了解 monorepo 组织方式 | [`docs/repo-workflow.md`](./docs/repo-workflow.md) |
| 编写新 sample | [`docs/sample-authoring.md`](./docs/sample-authoring.md) |
| 迭代路线图 | [`skills/design-to-spec/references/roadmap.md`](./skills/design-to-spec/references/roadmap.md) |

## Skill 目录约定

每个 skill 遵循统一结构：

```
skills/<skill-name>/
├── SKILL.md          # Claude Code skill 定义
├── README.md         # 人类阅读入口
├── CHANGELOG.md      # 版本历史
├── agents/           # 多 agent 配置
├── assets/           # 视觉资产（icon、preview、截图）
├── src/ 或 scripts/  # 核心实现
├── schemas/          # JSON Schema（若适用）
├── templates/        # 输出模板
├── references/       # 参考文档（长文档按需加载）
├── examples/         # Golden samples / 回归测试素材
└── tests/            # 测试套件
```

## Workspace conventions

- **Node ≥ 20.** 根 workspace 以 `html-article-to-markdown` 的运行要求为准；`design-to-spec` 单独复制使用时仍只要求 Node ≥ 18。
- **npm workspaces.** 根 `package.json` 声明 `skills/*` + `samples/*/*`。从根目录运行 `npm run check` 执行 skill 测试和 sample 构建。
- **Skill examples（golden）vs samples（实战）** 刻意分离：
  - `skills/design-to-spec/examples/` 存放**黄金回归样本**（today-windvane、price-card），测试断言字节级等价，**不要编辑**。
  - `samples/<skill>/<name>/` 存放**实战工作区**，包含 `inputs/`、`design-spec/`、`src/` 和 `walkthrough.md`，演示完整作者流程，可阅读、复制和扩展。

## Common commands

```bash
# 测试所有 skill（回归套件）
npm run test:skills

# 构建所有 samples
npm run build:samples

# 完整合并前检查
npm run check
```

## Status

- `design-to-spec` 处于 v0.10.x（Node.js 运行时，四阶段状态机，golden samples，38 个回归测试）。详见 [`skills/design-to-spec/CHANGELOG.md`](./skills/design-to-spec/CHANGELOG.md)。
- `html-article-to-markdown` 处于早期阶段（TypeScript CLI，WeChat HTML 转 Markdown）。详见 [`skills/html-article-to-markdown/README.md`](./skills/html-article-to-markdown/README.md)。
- 实战样本：`search-panel`（进行中，V0.11）。路线图见 [`skills/design-to-spec/references/roadmap.md`](./skills/design-to-spec/references/roadmap.md)。
