# CI / pre-commit 集成指南

> 让 `design-to-spec` 的契约校验和产物校验在 PR 流程里自动跑，避免 markdown 静默漂移到合并后才发现。

---

## 0. 为什么要做 CI 集成

`design-to-spec` 的核心价值在于「契约是事实源、markdown 是产物」。但只要项目里有人手动改了 `notes.md` / `data-fetching.md` / `spec.md` 而没回头改 `contracts/*.yaml`，事实源就和产物漂移了。

CI 集成做的是**机器把守这道纪律**：

- `validate-contracts.js` 检查三份 YAML 之间的引用一致（component / state / endpoint / request / binding 的 cross-ref）
- `validate-output.js --strict` 检查 markdown 是否仍覆盖 contracts 中的必需状态、请求、事件、trace 锚点

任一失败 → CI 红 / commit 中断 → 人必须回去改 contracts 重跑生成器，而不是绕过校验。

---

## 1. 三种集成形态怎么选

| 形态 | 触发时机 | 强度 | 何时该选 |
|---|---|---|---|
| **GitHub Actions** | PR / push 到 main | 团队级强制 | 多人协作、需要在 review 前阻断合并 |
| **Husky pre-commit** | 本地 `git commit` | 个人级 + 团队级（commit 配置进 repo） | 想在最早时刻反馈，不让坏 commit 进 git 历史 |
| **lefthook** | 同 husky，但配置更简洁、跨语言更友好 | 同 husky | Go/Rust/Python 多技术栈仓库；不想吃 husky 的 `.husky/` 目录 |

**推荐组合**：

- 单一前端仓库 → `husky` + `GitHub Actions` 双保险
- monorepo / 多语言后端 → `lefthook` + `GitHub Actions`
- 仅个人仓库 → 只装 `husky`，CI 暂缓

---

## 2. GitHub Actions

模板在 [`templates/ci/github-actions.yml`](../templates/ci/github-actions.yml)。

```bash
mkdir -p .github/workflows
cp design-to-spec/templates/ci/github-actions.yml .github/workflows/design-spec-check.yml
git add .github/workflows/design-spec-check.yml
```

行为概要：

1. PR 中只要 `design-spec/**` 或 `design-to-spec/**` 改动 → 触发
2. 遍历 `design-spec/*/`，对每个完整有 contracts 的目录跑 validate-contracts
3. 如果同时存在 `notes.md` / `data-fetching.md` / `specs/<cap>/spec.md`，再跑 `validate-output.js --strict`
4. 跑 `npm test --workspace design-to-spec`（如有回归套件）

如果你的项目结构不是 `design-spec/<component>/`，改 workflow 里的 `for dir in design-spec/*/` 那一行即可。

---

## 3. Husky pre-commit

模板在 [`templates/ci/pre-commit.husky`](../templates/ci/pre-commit.husky)。

```bash
npm install -D husky
npx husky init                                                     # 创建 .husky/
cp design-to-spec/templates/ci/pre-commit.husky .husky/pre-commit
chmod +x .husky/pre-commit
```

行为概要：

1. 仅扫描本次 `git commit` staged 的 `design-spec/<component>/` 目录（不全量）
2. contracts 三份俱全 → 跑 validate-contracts
3. 同时有产物 → 加跑 validate-output --strict
4. 失败 → commit 中断；紧急绕过用 `git commit --no-verify`（请克制使用）

---

## 4. lefthook

模板在 [`templates/ci/lefthook.yml`](../templates/ci/lefthook.yml)。

```bash
npm install -D lefthook
npx lefthook install
cp design-to-spec/templates/ci/lefthook.yml lefthook.yml
```

跟 husky 等价，但：

- pre-push 阶段额外跑 `npm run -w design-to-spec smoke`（金样回归 + 产物校验，全程约 1 秒）
- 多个 hook 可并行，`parallel: true` 已设
- 紧急绕过：`LEFTHOOK=0 git commit ...`

---

## 5. 校验失败后做什么

最常见的两类失败 + 标准恢复路径：

### 5.1 contracts 校验失败

例如：

```
ERROR: mapping.bindings[2].source_ui 'searchInpt' not in ui.components
```

→ 这是 contracts 内部 cross-ref 不一致（typo / 改了 ui 没改 mapping）。

**恢复**：直接改 `contracts/*.yaml`，重跑 `node design-to-spec/scripts/generate-output.js ...` 让 markdown 同步。永远不要去改 markdown 绕过校验。

### 5.2 输出 --strict 失败

例如：

```
ERROR: spec.md missing trace anchor 'state:loading'
```

→ markdown 被手动编辑后误删了 trace 锚点（如 `state:<id>`、`component:<id>`、`request:<id>`、`binding:<idx>:<direction>`）。

**恢复**：把锚点加回去，或者直接重跑 generate-output 整段重写。锚点是机器校验用的，不是装饰。

详见 [`troubleshooting.md`](./troubleshooting.md) §trace 锚点丢失。

---

## 6. 一些选型上的取舍

- **为什么 pre-commit 不跑 `npm test`**：测试套件 33+ 项，跑一次约 1 秒，但每次 commit 都跑会让小 commit 变慢。改放 pre-push 或 CI。
- **为什么 CI 不全量重跑 `generate-output.js`**：generator 是确定性的，重跑再 diff 是浪费 CI 时间；改用 validator 直接断言事实即可。
- **为什么不强制 PR template 要求贴校验日志**：日志 review 不掉，CI 状态才 review 得掉；不要做"看上去严谨"的元过程。
- **跨仓库共享 design-to-spec**：若 skill 通过 git submodule 引入，CI 中 checkout 时记得 `submodules: true` 或 `submodules: recursive`。
