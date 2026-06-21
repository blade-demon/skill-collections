# 启动 codebase-docs

请使用 codebase-docs skill 生成代码/业务探索文档。**Agent 不修改源码内容、不提交进
源码仓**，只在文档输出目录写 Markdown。（batch 脚本可在 repos-root 执行
clone/fetch/checkout；publish 仅修改 docs-root Git 仓库。）

## 单仓（single mode）

给出：

- Source Path（仓库路径或单个 Git URL）
- 文档输出目录

skill 会：先跑 `scripts/repo-inventory.sh`，按预算批量读取 high-signal 文件，进度写入
`_analysis/coverage-checklist.md`，生成 `templates/documents/` 定义的全部文档（含
`architecture.md` 的 Mermaid + `%% Evidence:`），完成后跑
`scripts/validate-doc-completion.sh`。续跑时先读 checklist 的「进行中模块」。

## 多仓（batch mode）

给出：

- 多个 Git URL/spec（或 `--repos <file>`）
- 文档 root 文件夹

skill 会：先跑 `scripts/batch-generate-docs.sh`（准备后立即分析用 `--max-repos 1`），
从 `batch-report.md` 选**一个** `cloned` 仓库，按单仓流程处理；当前会话只深挖这一个
repo。默认不做跨仓架构/业务推断。

发布（opt-in，第 8 步）：文档通过校验后，可用 `scripts/publish-docs.sh --docs-root <root>`
本地建分支 + commit 并打印计划；人工 review 后再带 `--yes` 推送并开 PR。从不触碰源码仓。

每份文档要写什么、各 mode 的完整流程见 `references/single-repo.md` 与 `references/batch.md`。
