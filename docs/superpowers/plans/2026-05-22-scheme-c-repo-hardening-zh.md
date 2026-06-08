# 方案 C 仓库工程化加固实施计划

> **给 agent 工作者：** 必须使用子技能：推荐 `superpowers:subagent-driven-development`，也可以使用 `superpowers:executing-plans`，逐任务执行本计划。步骤使用 checkbox（`- [ ]`）语法跟踪。

**目标：** 将 `skill-collections` 从一组可运行代码集合，升级为具备统一工具链、贡献者契约、CI 门禁和可维护公共边界的框架型 monorepo。

**架构：** 保持现有 npm workspaces 形态，在其上增加一层仓库级质量治理层。工作按可 review 的批次落地：根级工具链、workspace 编排、CI/本地 hook、面向人类的文档、API 注释、包边界打磨，以及最终验证。

**技术栈：** npm workspaces、Node.js >=20、本机 Node v22.22.2、ESLint flat config、Prettier、TypeScript、Vitest、node:test、GitHub Actions、Lefthook。

---

## Review 范围

本计划刻意比单纯 lint 清理更宽。这里把方案 C 视为一次完整仓库加固：

- 根级 lint、format、typecheck、full-check 命令；
- 对 `d2c-core`、`sketch-to-component`、`image-to-component`、HTML-to-Markdown、samples、fixtures 做真实 workspace 覆盖；
- CI 和本地 hook 模板；
- 贡献者和 agent 指南；
- 公共 API 注释和注释规则；
- package/skill 边界文档；
- 带干净命令和可 review commit 的最终审计。

本计划不改变 D2C 管线、skill workflow 或生成产物的运行时行为。执行中如果发现必须改行为，应该拆成独立 bugfix commit，并附带自己的验证证据。

## 当前基线

- 根 `package.json` 已经为 `packages/*`、`skills/*`、`skills/sketch-to-component/scripts` 和 `samples/*/*` 定义 npm workspaces。
- `skills/image-to-component/scripts` 有自己的 package 和测试，但目前没有纳入根 workspaces。
- `packages/d2c-core` 和 `skills/sketch-to-component/scripts` 已经暴露 `test` 和 `typecheck`。
- sample 的 `lint` 脚本目前只是打印 `(lint not configured)`。
- `fixtures/` 有自己的 ESLint 配置和 package lock，但不是根 workspace 的一部分。
- 根目录目前没有 `.github/`、`.editorconfig`、`.nvmrc`、Prettier 配置、根 ESLint 配置、`CONTRIBUTING.md` 或 `AGENTS.md`。

## 文件结构

创建：

- `.editorconfig` - 与编辑器无关的空白字符和换行规则。
- `.nvmrc` - 给贡献者使用的默认本地 Node 主版本。
- `.prettierrc.json` - 共享格式化策略。
- `.prettierignore` - 排除生成文件、锁文件、fixture 和计划文件。
- `eslint.config.js` - 仓库代码的根 ESLint flat config。
- `tsconfig.base.json` - 内部 package 的共享 TypeScript 基线。
- `.github/workflows/check.yml` - PR 和 push 质量门禁。
- `.github/pull_request_template.md` - review checklist 和验证证据模板。
- `lefthook.yml` - 本地 pre-commit 和 pre-push 命令接线。
- `CONTRIBUTING.md` - 人类贡献者入口。
- `AGENTS.md` - agent 和人类维护者操作规则。
- `docs/commenting-guide.md` - 可维护代码的注释/JSDoc 策略。

修改：

- `package.json` - 增加 workspace 覆盖、质量脚本和根级开发工具。
- `package-lock.json` - package 变更后由 `npm install` 生成。
- `README.md` - 更新常用命令和方案 C 质量门禁。
- `docs/repo-workflow.md` - 替换旧的“无 CI”和“d2c 尚未纳入 check”说明。
- `docs/sample-authoring.md` - 在 PR checklist 中要求真实 sample lint/build 证据。
- `packages/d2c-core/tsconfig.json` - 继承共享 base，同时保留模块设置。
- `skills/sketch-to-component/scripts/tsconfig.json` - 继承共享 base，同时保留模块设置。
- `skills/image-to-component/scripts/tsconfig.json` - 继承共享 base，并保留 `outDir`/`rootDir`。
- `skills/image-to-component/scripts/package.json` - 增加 `typecheck`。
- `samples/design-to-spec/search-panel/package.json` - 替换占位 lint。
- `samples/design-to-spec/feedback-form/package.json` - 替换占位 lint。
- `packages/d2c-core/src/index.ts` - 增加公共 package 入口注释。
- `packages/d2c-core/src/ir/index.ts` - 增加 IR barrel 注释。
- `packages/d2c-core/src/provider/index.ts` - 增加 provider barrel 注释。
- `packages/d2c-core/src/preview/index.ts` - 增加 preview barrel 注释。
- `packages/d2c-core/README.md` - 记录公共导出和 source-only package 状态。
- `skills/sketch-to-component/docs/architecture-design.md` - 让 provider 文档与新门禁对齐。

不要修改：

- `skills/design-to-spec/examples/` 下的 golden outputs。
- `samples/**/design-spec/` 下的生成 sample 输出，除非任务明确改变 sample contract。
- 本次加固不修改运行时 normalize、preview generation 或 design IR schemas。

## Review 门禁

每个批次结束都运行：

```bash
git diff --check
git status --short
```

每个批次的 commit message 应该带 scope：

- `chore: add root quality tooling`
- `chore: wire workspace checks`
- `ci: add repository quality gate`
- `docs: add contributor maintenance guide`
- `docs: document public package boundaries`
- `chore: complete scheme c hardening audit`

---

### Task 1: 根级工具链基线

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: 记录基线环境**

Run:

```bash
git status --short
node -v
npm -v
```

Expected:

```text
git status --short may show unrelated user files only
node -v prints v22.22.2 on this machine
npm -v prints 10.9.7 on this machine
```

- [ ] **Step 2: 更新根 package metadata**

将 `package.json` 中相关的 `workspaces`、`scripts` 和 `devDependencies` section 替换为：

```json
{
  "workspaces": [
    "packages/*",
    "skills/*",
    "skills/image-to-component/scripts",
    "skills/sketch-to-component/scripts",
    "samples/*/*"
  ],
  "scripts": {
    "test:skills": "npm test --workspace skills/design-to-spec --workspace skills/html-article-to-markdown --workspace image-to-component-scripts --workspace @skill-collections/sketch-to-component-scripts",
    "test:samples": "npm test --workspace samples/design-to-spec/search-panel --workspace samples/design-to-spec/feedback-form --if-present",
    "test:skill": "npm run test:skills",
    "test:d2c": "npm test --workspace @skill-collections/d2c-core",
    "test:image": "npm test --workspace image-to-component-scripts",
    "test:sketch": "npm test --workspace @skill-collections/sketch-to-component-scripts",
    "test:all": "npm run test:skills && npm run test:samples && npm run test:d2c",
    "typecheck:d2c": "npm run typecheck --workspace @skill-collections/d2c-core",
    "typecheck:image": "npm run typecheck --workspace image-to-component-scripts",
    "typecheck:sketch": "npm run typecheck --workspace @skill-collections/sketch-to-component-scripts",
    "typecheck:html": "npm run build --workspace html-article-to-markdown",
    "typecheck": "npm run typecheck:d2c && npm run typecheck:image && npm run typecheck:sketch && npm run typecheck:html",
    "build:samples": "npm run build --workspace samples/design-to-spec/search-panel --workspace samples/design-to-spec/feedback-form --if-present",
    "build:fixtures": "npm run build --prefix fixtures",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "lint:samples": "npm run lint --workspace samples/design-to-spec/search-panel --workspace samples/design-to-spec/feedback-form --if-present",
    "lint:fixtures": "npm run lint --prefix fixtures",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check:fixtures": "npm run lint:fixtures && npm run build:fixtures",
    "check": "npm run lint && npm run format:check && npm run typecheck && npm run test:all && npm run build:samples",
    "check:full": "npm run check && npm run check:fixtures"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.2.1",
    "eslint-config-prettier": "^10.1.8",
    "globals": "^17.5.0",
    "lefthook": "^1.13.6",
    "prettier": "^3.6.2",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.58.2"
  }
}
```

- [ ] **Step 3: 增加编辑器和格式化配置**

创建 `.editorconfig`：

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

创建 `.nvmrc`：

```text
22
```

创建 `.prettierrc.json`：

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

创建 `.prettierignore`：

```gitignore
node_modules/
**/node_modules/
dist/
**/dist/
build/
**/build/
.vite/
**/.vite/
coverage/
**/coverage/
package-lock.json
**/package-lock.json
fixtures/
docs/superpowers/plans/
skills/design-to-spec/examples/
samples/**/design-spec/
skills/sketch-to-component/scripts/src/__tests__/fixtures/*.json
```

- [ ] **Step 4: 安装根工具并更新 lockfile**

Run:

```bash
npm install
```

Expected:

```text
package-lock.json is updated
node_modules contains eslint, prettier, typescript-eslint, and lefthook
```

- [ ] **Step 5: 只验证 metadata**

Run:

```bash
npm pkg get workspaces scripts engines --json
git diff -- package.json package-lock.json .editorconfig .nvmrc .prettierrc.json .prettierignore
git diff --check
```

Expected:

```text
npm pkg get exits 0
git diff shows only the intended tooling baseline files
git diff --check exits 0
```

- [ ] **Step 6: 提交 Task 1**

Run:

```bash
git add package.json package-lock.json .editorconfig .nvmrc .prettierrc.json .prettierignore
git commit -m "chore: add root quality tooling"
```

Expected:

```text
Commit succeeds with the root tooling baseline only
```

---

### Task 2: 根 ESLint 和真实 sample lint

**Files:**

- Create: `eslint.config.js`
- Modify: `samples/design-to-spec/search-panel/package.json`
- Modify: `samples/design-to-spec/feedback-form/package.json`

- [ ] **Step 1: 增加根 ESLint flat config**

创建 `eslint.config.js`：

```js
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const nodeGlobals = {
  ...globals.es2022,
  ...globals.node,
};

const browserGlobals = {
  ...globals.browser,
  ...globals.es2022,
};

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.vite/**',
    '**/coverage/**',
    'fixtures/**',
    'docs/superpowers/plans/**',
    'skills/design-to-spec/examples/**',
    'samples/**/design-spec/**',
    'skills/sketch-to-component/scripts/src/__tests__/fixtures/*.json',
  ]),
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
  {
    files: ['samples/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: browserGlobals,
    },
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: nodeGlobals,
    },
  },
  eslintConfigPrettier,
]);
```

- [ ] **Step 2: 替换 sample 占位 lint 脚本**

在 `samples/design-to-spec/search-panel/package.json` 中设置：

```json
{
  "scripts": {
    "dev": "vite",
    "test": "node --test tests/*.test.js",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint \"src/**/*.js\" \"tests/**/*.js\" --no-error-on-unmatched-pattern"
  }
}
```

在 `samples/design-to-spec/feedback-form/package.json` 中设置：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint \"src/**/*.js\" \"tests/**/*.js\" --no-error-on-unmatched-pattern"
  }
}
```

- [ ] **Step 3: 运行 lint 门禁**

Run:

```bash
npm run lint:samples
npm run lint
```

Expected:

```text
Both commands exit 0
No sample lint command prints "(lint not configured)"
```

- [ ] **Step 4: 提交 Task 2**

Run:

```bash
git add eslint.config.js samples/design-to-spec/search-panel/package.json samples/design-to-spec/feedback-form/package.json
git commit -m "chore: replace placeholder lint gates"
```

Expected:

```text
Commit succeeds with lint config and sample lint scripts only
```

---

### Task 3: TypeScript 基线和 workspace 覆盖

**Files:**

- Create: `tsconfig.base.json`
- Modify: `packages/d2c-core/tsconfig.json`
- Modify: `skills/sketch-to-component/scripts/tsconfig.json`
- Modify: `skills/image-to-component/scripts/tsconfig.json`
- Modify: `skills/image-to-component/scripts/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 增加共享 TypeScript base**

创建 `tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 2: 在 D2C core 中继承 base**

将 `packages/d2c-core/tsconfig.json` 替换为：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: 在 Sketch scripts 中继承 base**

将 `skills/sketch-to-component/scripts/tsconfig.json` 替换为：

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: 在 image-to-component scripts 中继承 base**

将 `skills/image-to-component/scripts/tsconfig.json` 替换为：

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: 增加 image-to-component typecheck 脚本**

在 `skills/image-to-component/scripts/package.json` 中设置：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "validate-signature": "tsx src/validate-signature.ts",
    "validate-coarse": "tsx src/validate-coarse.ts",
    "coverage-table": "tsx src/generate-coverage-table.ts",
    "generate-skeleton": "tsx src/generate-skeleton.ts"
  }
}
```

- [ ] **Step 6: workspace 覆盖变更后重新安装**

Run:

```bash
npm install
```

Expected:

```text
package-lock.json includes skills/image-to-component/scripts as a workspace package
```

- [ ] **Step 7: 运行 typecheck 门禁**

Run:

```bash
npm run typecheck:d2c
npm run typecheck:image
npm run typecheck:sketch
npm run typecheck:html
npm run typecheck
```

Expected:

```text
All five commands exit 0
```

- [ ] **Step 8: 提交 Task 3**

Run:

```bash
git add tsconfig.base.json packages/d2c-core/tsconfig.json skills/sketch-to-component/scripts/tsconfig.json skills/image-to-component/scripts/tsconfig.json skills/image-to-component/scripts/package.json package.json package-lock.json
git commit -m "chore: wire workspace typechecks"
```

Expected:

```text
Commit succeeds with TypeScript baseline and workspace coverage only
```

---

### Task 4: CI 和本地 hook 门禁

**Files:**

- Create: `.github/workflows/check.yml`
- Create: `.github/pull_request_template.md`
- Create: `lefthook.yml`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 增加 GitHub Actions workflow**

创建 `.github/workflows/check.yml`：

```yaml
name: check

on:
  pull_request:
  push:
    branches:
      - master
      - main

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install root workspace dependencies
        run: npm ci

      - name: Install fixture dependencies
        run: npm ci --prefix fixtures

      - name: Run full repository check
        run: npm run check:full
```

- [ ] **Step 2: 增加 PR 模板**

创建 `.github/pull_request_template.md`：

```markdown
## Summary

- Summarize changed packages, scripts, docs, and verification evidence.

## Verification

- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run typecheck`
- [ ] `npm run test:all`
- [ ] `npm run build:samples`
- [ ] `npm run check:fixtures`
- [ ] `npm run check:full`

## Review Notes

- [ ] Generated golden outputs were not changed unintentionally.
- [ ] Runtime behavior changes are described explicitly.
- [ ] New public APIs include comments or docs.
- [ ] Sample changes include build or lint evidence.
```

- [ ] **Step 3: 增加 Lefthook 配置**

创建 `lefthook.yml`：

```yaml
pre-commit:
  commands:
    format-check:
      run: npm run format:check
    lint:
      run: npm run lint

pre-push:
  commands:
    check-full:
      run: npm run check:full
```

- [ ] **Step 4: 安装 hook metadata**

Run:

```bash
npm install
npx lefthook install
```

Expected:

```text
package-lock.json remains consistent with package.json
lefthook reports that hooks were installed
```

- [ ] **Step 5: 本地运行 CI 等价命令**

Run:

```bash
npm ci
npm ci --prefix fixtures
npm run check:full
```

Expected:

```text
All commands exit 0
```

- [ ] **Step 6: 提交 Task 4**

Run:

```bash
git add .github/workflows/check.yml .github/pull_request_template.md lefthook.yml package.json package-lock.json
git commit -m "ci: add repository quality gate"
```

Expected:

```text
Commit succeeds with CI and local hook files only
```

---

### Task 5: 人类和 agent 维护文档

**Files:**

- Create: `CONTRIBUTING.md`
- Create: `AGENTS.md`
- Create: `docs/commenting-guide.md`
- Modify: `README.md`
- Modify: `docs/repo-workflow.md`
- Modify: `docs/sample-authoring.md`

- [ ] **Step 1: 增加贡献者指南**

创建 `CONTRIBUTING.md`：

````markdown
# Contributing

This repository is a monorepo for installable/copyable skills, shared D2C packages, samples, and fixtures.

## Setup

```bash
nvm use
npm install
npm install --prefix fixtures
```

## Common Checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:all
npm run build:samples
npm run check:fixtures
npm run check:full
```

## Change Boundaries

- `packages/` contains shared code used by multiple skills.
- `skills/<skill-name>/` contains a coherent skill package.
- `samples/<skill>/<sample>/` contains hands-on examples and implementation walkthroughs.
- `fixtures/` contains reusable demo apps and remains dependency-isolated through `npm --prefix fixtures`.
- `docs/` contains repository-level workflow and architecture material.

## Golden Outputs

Do not edit `skills/design-to-spec/examples/` outputs unless the skill behavior intentionally changes and the tests are updated in the same commit.

## Pull Request Expectations

Every PR should include verification evidence. For small documentation-only changes, run at least `npm run format:check`. For code, config, package, or sample changes, run `npm run check:full`.
````

- [ ] **Step 2: 增加 agent 操作指南**

创建 `AGENTS.md`：

````markdown
# Agent Guide

## Repository Intent

`skill-collections` is a framework-like monorepo for skills, design-to-code experiments, samples, and shared D2C pipeline code.

## Default Commands

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:all
npm run build:samples
npm run check:full
```

## Editing Rules

- Keep changes scoped to the requested package, skill, sample, or doc.
- Preserve generated golden outputs unless the requested behavior change requires regenerating them.
- Treat `design-ir.json` as the downstream contract for design-source flows.
- Keep provider-specific parsing inside provider or normalizer layers.
- Add comments for exported APIs, pipeline contracts, and non-obvious lossiness decisions.
- Avoid comments that restate the code.

## Review Rules

- Show exact commands run and whether they passed.
- Separate behavior changes from tooling changes.
- Keep fixture dependency work under `fixtures/` unless the root workspace intentionally absorbs it.
````

- [ ] **Step 3: 增加注释指南**

创建 `docs/commenting-guide.md`：

````markdown
# Commenting Guide

The repository uses comments to make contracts maintainable, not to narrate simple code.

## Comment These

- Exported types, schemas, and package entrypoints.
- Pipeline boundaries such as raw design artifact, Design IR, preview output, and generated component package.
- Determinism, traceability, lossy transforms, and provider-specific decisions.
- Public CLI arguments and output files.

## Do Not Comment These

- Straight-line assignments.
- Function names that already describe the behavior.
- Test setup that is clear from the assertion.
- Formatting or lint-only choices that belong in config files.

## Example

```ts
/**
 * Provider-specific raw extraction result persisted as `ir/raw-dsl.json`.
 * The payload is intentionally provider-owned and only becomes shared after
 * normalize produces canonical Design IR.
 */
export const RawArtifactSchema = z.object({});
```
````

- [ ] **Step 4: 更新根 README 命令**

在 `README.md` 中将 common commands section 替换为：

````markdown
## Common commands

```bash
# Lint repository code
npm run lint

# Check formatting without rewriting files
npm run format:check

# Type-check TypeScript workspaces
npm run typecheck

# Run all workspace test suites
npm run test:all

# Build hands-on samples
npm run build:samples

# Run fixture checks after installing fixture deps
npm run check:fixtures

# Full pre-merge gate
npm run check:full
```
````

- [ ] **Step 5: 更新 repo workflow**

在 `docs/repo-workflow.md` 中更新 pre-merge 和 CI sections 为：

````markdown
### Pre-merge full check

```bash
npm run check:full
```

This runs root lint, format check, TypeScript checks, skill tests, sample tests, sample builds, and fixture lint/build.

### CI

GitHub Actions runs `npm ci`, installs fixture dependencies with `npm ci --prefix fixtures`, and executes `npm run check:full` on pull requests and pushes to the default branch.
```
````

- [ ] **Step 6: 更新 sample authoring checklist**

在 `docs/sample-authoring.md` 中确保 PR checklist 包含：

```markdown
- [ ] Sample `npm run lint` passes
- [ ] Sample `npm run build` passes
- [ ] Top-level `npm run check:full` passes
```

- [ ] **Step 7: 提交 Task 5**

Run:

```bash
git add CONTRIBUTING.md AGENTS.md docs/commenting-guide.md README.md docs/repo-workflow.md docs/sample-authoring.md
git commit -m "docs: add contributor maintenance guide"
```

Expected:

```text
Commit succeeds with human-facing maintenance docs only
```

---

### Task 6: 公共 API 注释和边界打磨

**Files:**

- Modify: `packages/d2c-core/src/index.ts`
- Modify: `packages/d2c-core/src/ir/index.ts`
- Modify: `packages/d2c-core/src/provider/index.ts`
- Modify: `packages/d2c-core/src/preview/index.ts`

- [ ] **Step 1: 增加 package 入口注释**

将 `packages/d2c-core/src/index.ts` 替换为：

```ts
/**
 * Public source-only entrypoint for `@skill-collections/d2c-core`.
 *
 * Consumers should import shared Design IR schemas, provider ports, and preview
 * helpers from this barrel instead of reaching into provider-specific skills.
 */
export * from './ir';
export * from './provider';
export * from './preview';
```

- [ ] **Step 2: 增加 IR barrel 注释**

将 `packages/d2c-core/src/ir/index.ts` 替换为：

```ts
/**
 * Canonical Design IR contracts shared by provider normalization, preview,
 * planning, and future component generation.
 */
export * from './version';
export * from './visual';
export * from './semantic';
export * from './schema';
export * from './views';
export * from './validate';
```

- [ ] **Step 3: 增加 provider barrel 注释**

将 `packages/d2c-core/src/provider/index.ts` 替换为：

```ts
/**
 * Provider port contracts for design-source adapters.
 *
 * Provider implementations own raw extraction details. Shared pipeline code
 * consumes only validated raw artifacts and canonical Design IR.
 */
export * from './port';
export * from './normalize-and-validate';
```

- [ ] **Step 4: 增加 preview barrel 注释**

将 `packages/d2c-core/src/preview/index.ts` 替换为：

```ts
/**
 * Preview generation helpers for turning canonical Design IR into reviewable
 * HTML, CSS, visual views, and visual review reports.
 */
export * from './apply-overrides';
export * from './derive-visual-view';
export * from './generate-preview';
export * from './run-preview';
export * from './stable-json';
export * from './visual-review-report';
```

- [ ] **Step 5: 验证注释不改变行为**

Run:

```bash
npm run typecheck:d2c
npm run test:d2c
```

Expected:

```text
Both commands exit 0
```

- [ ] **Step 6: 提交 Task 6**

Run:

```bash
git add packages/d2c-core/src/index.ts packages/d2c-core/src/ir/index.ts packages/d2c-core/src/provider/index.ts packages/d2c-core/src/preview/index.ts
git commit -m "docs: document public d2c-core barrels"
```

Expected:

```text
Commit succeeds with comment-only public API changes
```

---

### Task 7: package 边界文档

**Files:**

- Modify: `packages/d2c-core/README.md`
- Modify: `skills/sketch-to-component/docs/architecture-design.md`
- Modify: `docs/design-source-to-component/implementation-plan.md`

- [ ] **Step 1: 更新 d2c-core README**

在 `packages/d2c-core/README.md` 开头描述后增加这个 section：

````markdown
## Public Surface

`@skill-collections/d2c-core` is a source-only internal workspace package. It exports:

- `ir` contracts: canonical Design IR schemas, versions, visual/semantic blocks, and validators.
- `provider` contracts: raw artifact and provider port shapes.
- `preview` helpers: deterministic HTML/CSS preview generation and visual review reports.

Provider-specific code should live in provider skills such as `skills/sketch-to-component`. Shared consumers should import from `@skill-collections/d2c-core` instead of importing provider internals.

## Verification

```bash
npm run typecheck --workspace @skill-collections/d2c-core
npm test --workspace @skill-collections/d2c-core
```
````

- [ ] **Step 2: 对齐 Sketch architecture docs**

在 `skills/sketch-to-component/docs/architecture-design.md` 的命令或 verification section 附近增加这个质量门禁段落：

````markdown
Repository-level hardening now treats the Sketch provider as part of the full quality gate. Provider changes should pass:

```bash
npm run typecheck:sketch
npm run test:sketch
npm run check:full
```

The provider should keep Sketch-specific parsing inside `skills/sketch-to-component/scripts/src/` and pass only canonical Design IR into `@skill-collections/d2c-core` preview helpers.
````

- [ ] **Step 3: 更新 implementation plan 状态**

在 `docs/design-source-to-component/implementation-plan.md` 中，将旧的 Stage 7 “D2C 之后会纳入 `check`”说明替换为：

```markdown
Repository hardening folds `d2c-core` and `sketch-to-component` into the root quality gate through `npm run check:full`. Stage-specific work may still run narrower commands such as `npm run test:d2c` and `npm run test:sketch` during development, but pre-merge verification should use the full gate.
```

- [ ] **Step 4: 验证文档 format clean**

Run:

```bash
npm run format:check
```

Expected:

```text
Command exits 0
```

- [ ] **Step 5: 提交 Task 7**

Run:

```bash
git add packages/d2c-core/README.md skills/sketch-to-component/docs/architecture-design.md docs/design-source-to-component/implementation-plan.md
git commit -m "docs: document package quality boundaries"
```

Expected:

```text
Commit succeeds with package boundary docs only
```

---

### Task 8: 最终验证和审计

**Files:**

- Modify: `README.md`
- Modify: `docs/repo-workflow.md`

- [ ] **Step 1: 运行 clean install 验证**

Run:

```bash
npm ci
npm ci --prefix fixtures
```

Expected:

```text
Both commands exit 0
Root and fixture dependency installs are reproducible from lockfiles
```

- [ ] **Step 2: 运行独立门禁**

Run:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:all
npm run build:samples
npm run check:fixtures
```

Expected:

```text
Every command exits 0
```

- [ ] **Step 3: 运行完整门禁**

Run:

```bash
npm run check:full
```

Expected:

```text
Command exits 0
```

- [ ] **Step 4: 检查 diff 和 working tree**

Run:

```bash
git diff --check
git diff --stat
git status --short
```

Expected:

```text
git diff --check exits 0
git diff --stat shows only Scheme C hardening files
git status --short shows no untracked generated artifacts except intentional files already staged or committed
```

- [ ] **Step 5: 验证后更新命令文档**

在 `README.md` 和 `docs/repo-workflow.md` 中，确保记录的命令与这些 root scripts 完全一致：

```text
npm run lint
npm run format:check
npm run typecheck
npm run test:all
npm run build:samples
npm run check:fixtures
npm run check:full
```

- [ ] **Step 6: 提交 Task 8**

Run:

```bash
git add README.md docs/repo-workflow.md
git commit -m "chore: complete scheme c hardening audit"
```

Expected:

```text
Commit succeeds with final command documentation and audit evidence
```

---

## 最终验收标准

方案 C 加固在以下条件全部满足时完成：

- 根 `npm run check:full` 可以从 clean install 后通过。
- sample lint 脚本运行真实 ESLint 检查。
- `skills/image-to-component/scripts` 已纳入根 workspace 检查。
- `d2c-core` 和 `sketch-to-component` 已被根 typecheck/test 门禁覆盖。
- GitHub Actions 运行与本地相同的完整门禁。
- 贡献者和 agent 文档解释 setup、边界和验证方式。
- 公共 D2C package barrels 具有契约注释。
- 现有 design-source 运行时行为保持不变。
- golden outputs 不变，除非有独立行为 commit 解释变化。

## 自检

- Spec coverage：根工具链、workspace 覆盖、注释、文档、CI、hooks、package 边界和最终审计都映射到具体任务。
- Placeholder scan：通过；每个任务都列出具体文件、命令、片段和预期结果。
- Type consistency：文档中的脚本名与提议的 `package.json` scripts 一致。
- Scope check：通过 `npm --prefix fixtures` 保留 fixture 依赖隔离；生成的 design outputs 仍在范围外。
