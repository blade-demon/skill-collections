# Agent 说明

本文件面向在本仓库中工作的编码 Agent。人类贡献者请从 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 开始阅读。

## 工作方式

- 在规划修改之前，先查看真实文件。
- 将变更范围限制在所请求的 package、skill、sample 或文档内。
- 保留与用户请求无关的本地修改，以及未跟踪的本地临时目录。
- 优先采用仓库既有模式，而非引入新的抽象。
- 使用 `rg` / `rg --files` 进行文件发现。

## 语言

- 默认使用简体中文与用户沟通，包括中间状态更新、最终总结、代码审查意见和后续步骤。
- 除非用户明确要求英文，Pull Request 标题和描述应使用中文。
- 代码标识符、命令、文件路径、API 名称、错误日志和英文原文引用保持原样。

## 仓库边界

- `packages/d2c-core/` 包含共享的 D2C 契约与 pipeline 辅助工具。将 barrel export 视为公共 API。
- `skills/*` 目录必须保持可理解、可单独复制为独立 skill。
- `samples/*/*` 目录是供读者动手实践的 workspace。不要让 sample 实现依赖原始 `inputs/`；它们应消费 `design-spec/`。
- `fixtures/apps/*` 包含各框架的 fixture 应用，通过各自的安装与构建命令进行校验。
- `docs/superpowers/plans/` 包含规划产物，且已从 formatter 基线中排除。

## 验证矩阵

编辑过程中使用有针对性的检查：

- D2C core：`npm run typecheck:d2c` 与 `npm run test:d2c`
- Sketch provider：`npm run typecheck:sketch` 与 `npm run test:sketch`
- Image skeleton scripts：`npm run typecheck:image` 与 `npm run test:image`
- HTML article skill：`npm run typecheck:html`
- Samples：`npm run test:samples` 与 `npm run build:samples`
- Fixture apps：`npm run check:fixtures`

在声称全仓库工作已完成之前，请运行 `npm run check:full`。

## 注释

在注释能阐明契约、公共导出、provider 边界或非典型校验行为时再添加。不要添加仅重复下一行代码的叙述性注释。参见 [`docs/commenting-guide.md`](./docs/commenting-guide.md)。

## 提交

按关注点拆分便于 review 的 commit：

- 工具与配置
- 机械性格式化
- CI 与 hooks
- 文档
- 运行时或测试行为

除非用户明确要求单一 squashed 结果，否则不要将大范围格式化变更与行为变更混在同一 commit 中。
