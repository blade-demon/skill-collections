# 贡献指南

本仓库是 AI skills、sample 工作区与共享 D2C package 的 monorepo。请保持变更小而可验证，便于其他维护者 review。

## 环境

- 使用 Node.js 20 或更高版本。本地固定版本见 `.nvmrc`。
- 用 `npm ci` 安装根 workspace 依赖。
- 若改动 fixture 代码或要跑完整门禁，还需执行
  `npm ci --prefix fixtures/apps/react-vite` 安装 React fixture app 依赖。
- 用 `npx lefthook install` 安装本地 Git hooks。

## 开始改代码前

1. 阅读你改动区域最近的 README、架构说明或工作流文档。
2. 判断变更属于 `packages/`、`skills/`、`samples/`、`fixtures/` 还是 `docs/`。
3. 在改行为之前，先查看现有测试与 golden 输出。

## 质量门禁

开发过程中跑最窄但有用的命令，开 PR 前跑完整门禁。

| 用途                 | 命令                     |
| -------------------- | ------------------------ |
| Lint 仓库代码        | `npm run lint`           |
| 自动修复 lint 问题   | `npm run lint:fix`       |
| 格式化仓库           | `npm run format`         |
| 检查格式化           | `npm run format:check`   |
| 类型检查各 workspace | `npm run typecheck`      |
| 运行全部测试         | `npm run test:all`       |
| 构建动手 samples     | `npm run build:samples`  |
| 检查 fixture app     | `npm run check:fixtures` |
| 完整仓库门禁         | `npm run check:full`     |

`npm run check:full` 是本地与 CI 等价的预期检查。

## 变更边界

- `packages/*` 是共享代码。把导出的类型与函数视为公共契约，并为新的公共入口补充文档。
- `skills/*` 是可单独复制的 skill 源码。保持每个 skill 自包含；除非通过共享 package，否则避免跨 skill 依赖。
- `samples/*/*` 是面向读者的演示代码。sample 应能构建，并说明它要教什么。
- `fixtures/apps/*` 是可复用的 app fixture，不是 skill 源码所在地。
  `fixtures/shared/*` 只放跨 fixture 的资产与设计规格。
- `docs/` 只放仓库级指南与架构上下文。

## 生成物与 golden 产物

- 不要随意编辑 golden 输出。若输出变了，请说明行为变更并运行所属测试。
- sample 落地后保持 `inputs/` 稳定。若要演进，请新增 sample，或有意地重新生成对应的 `design-spec/`。
- 不要提交 `node_modules/`、构建输出、嵌套的 `.git/` 或本地 agent 临时目录。

## 注释与文档

在后续维护者必须理解的边界处写简洁注释：
公共导出、parser→IR 过渡、校验规则，以及非典型的测试 fixture。
避免重复代码含义的注释。参见 [`docs/commenting-guide.md`](./docs/commenting-guide.md)。

## Pull Request 检查清单

- [ ] 改动区域有对应的 README、架构说明或必要的行内注释更新。
- [ ] 新的公共 API 带有注释或文档。
- [ ] 生成输出与 golden fixture 经过有意 review。
- [ ] 本地 `npm run check:full` 通过，或 PR 中说明了跳过的部分及原因。
- [ ] PR 描述包含验证证据。
