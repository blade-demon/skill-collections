# skill-collections

包含 **AI skills** 与**动手 samples** 的 monorepo。

```
skill-collections/
├── packages/
│   └── d2c-core/                # 设计源→组件共享内核（IR 契约 + 预览管线）
├── skills/
│   ├── design-to-spec/          # UI 设计稿 → 实现规格包
│   ├── image-to-component/      # 截图/图片 → 结构优先组件骨架
│   ├── mastergo-to-component/   # MasterGo 设计源 provider（实现暂缓）
│   ├── sketch-to-component/     # Sketch 设计源 provider（管线至预览门禁）
│   └── html-article-to-markdown/ # HTML 文章 → 清洁 Markdown
├── samples/                     # 按 skill 分组的实战工作区
│   └── design-to-spec/
│       ├── search-panel/
│       └── feedback-form/
├── fixtures/                    # 多框架测试夹具 App（CI 回归 + 手动演示）
└── docs/                        # 仓库级工作流和 skill 编写指南
```

## 快速导航

| 目标                                          | 文档                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 了解 `design-to-spec` 能做什么                | [`skills/design-to-spec/ONBOARDING.md`](./skills/design-to-spec/ONBOARDING.md)                                                   |
| 在真实设计稿上运行 design-to-spec             | [`skills/design-to-spec/references/operator-guide.md`](./skills/design-to-spec/references/operator-guide.md)                     |
| 了解 HTML → Markdown 转换 skill               | [`skills/html-article-to-markdown/README.md`](./skills/html-article-to-markdown/README.md)                                       |
| 了解截图流和设计源流的边界                    | [`docs/design-source-to-component-architecture.md`](./docs/design-source-to-component-architecture.md)                           |
| 查看设计源到组件的实施计划与进度              | [`docs/design-source-to-component-implementation-plan.md`](./docs/design-source-to-component-implementation-plan.md)             |
| 查看 Sketch provider 适配器架构               | [`skills/sketch-to-component/docs/architecture-design.md`](./skills/sketch-to-component/docs/architecture-design.md)             |
| 查看 IR 保真审计与修复批次（A1–A6）           | [`skills/sketch-to-component/docs/stage-3-ir-fidelity-audit.md`](./skills/sketch-to-component/docs/stage-3-ir-fidelity-audit.md) |
| 查看 MasterGo provider 适配器架构（实现暂停） | [`skills/mastergo-to-component/docs/architecture-design.md`](./skills/mastergo-to-component/docs/architecture-design.md)         |
| 完整的 inputs → spec → 实现全流程             | [`samples/design-to-spec/search-panel/`](./samples/design-to-spec/search-panel/)                                                 |
| 了解 monorepo 组织方式                        | [`docs/repo-workflow.md`](./docs/repo-workflow.md)                                                                               |
| 了解贡献与本地质量门禁                        | [`CONTRIBUTING.md`](./CONTRIBUTING.md)                                                                                           |
| 了解公共 API 与复杂逻辑的注释约定             | [`docs/commenting-guide.md`](./docs/commenting-guide.md)                                                                         |
| 编写新 sample                                 | [`docs/sample-authoring.md`](./docs/sample-authoring.md)                                                                         |
| 迭代路线图                                    | [`skills/design-to-spec/references/roadmap.md`](./skills/design-to-spec/references/roadmap.md)                                   |

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

## 工作区约定

- **Node ≥ 20。** 根 workspace 以 `html-article-to-markdown` 的运行要求为准；`design-to-spec` 单独复制使用时仍只要求 Node ≥ 18。
- **npm workspaces。** 根 `package.json` 声明 `packages/*` + `skills/*` + `samples/*/*`。从根目录运行 `npm run check` 执行 skill 测试和 sample 构建。
- **Skill examples（golden）vs samples（实战）** 刻意分离：
  - `skills/design-to-spec/examples/` 存放**黄金回归样本**（today-windvane、price-card），测试断言字节级等价，**不要编辑**。
  - `samples/<skill>/<name>/` 存放**实战工作区**，包含 `inputs/`、`design-spec/`、`src/` 和 `walkthrough.md`，演示完整作者流程，可阅读、复制和扩展。

## 常用命令

```bash
# 安装根 workspace 依赖
npm ci

# 安装 React fixture app 依赖（运行完整门禁前需要）
npm ci --prefix fixtures/apps/react-vite

# 安装本地 Git hooks
npx lefthook install

# lint / format
npm run lint
npm run format:check
npm run format

# 类型检查
npm run typecheck

# 测试所有 skill、samples、D2C 内核
npm run test:all

# 构建所有 samples
npm run build:samples

# 完整合并前检查（本地等价 CI）
npm run check:full

# 手动打开 React fixture app 调试/演示
npm run dev:fixture:react
```

## 状态

- `design-to-spec` 处于 v0.10.x（Node.js 运行时，四阶段状态机，golden samples，38 个回归测试）。详见 [`skills/design-to-spec/CHANGELOG.md`](./skills/design-to-spec/CHANGELOG.md)。
- `image-to-component` 定位为截图/图片输入的结构优先 skeleton workflow，不承诺设计源级样式保真。
- 设计源到组件管线:共享内核 `@skill-collections/d2c-core` 已建,Stage 0–4 完成 —— 可把 `.sketch` 跑通 `extract → normalize → design-ir.json → HTML 预览(门禁 1)`,全程确定性、零大模型依赖。实施计划见 [`docs/design-source-to-component-implementation-plan.md`](./docs/design-source-to-component-implementation-plan.md)。
- `sketch-to-component` 是当前活跃的 D2C 垂直切片:Stage 2–4 已完成。Stage 4 后做了一轮 IR 保真审计,查出 A1–A6 缺陷分 4 批次修复;Batch 1(行高 / 字重 / 渐变)已完成,下一步 Batch 2(symbol 缩放),再进 Stage 5。详见 [`skills/sketch-to-component/docs/stage-3-ir-fidelity-audit.md`](./skills/sketch-to-component/docs/stage-3-ir-fidelity-audit.md)。
- `mastergo-to-component` 实现暂缓:其 DSL 转换在服务端、raw 结构不可见，待服务端契约可稳定取得后再做。
- `html-article-to-markdown` 处于早期阶段（TypeScript CLI，WeChat HTML 转 Markdown）。详见 [`skills/html-article-to-markdown/README.md`](./skills/html-article-to-markdown/README.md)。
- 实战样本：`search-panel`（进行中，V0.11）。路线图见 [`skills/design-to-spec/references/roadmap.md`](./skills/design-to-spec/references/roadmap.md)。
