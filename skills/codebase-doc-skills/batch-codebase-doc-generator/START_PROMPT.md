请使用 batch-codebase-doc-generator skill，为我提供的多个 Git 仓库分别生成独立的代码/业务探索文档。

输入：

1. Git URL/spec 列表
2. 文档 root 文件夹

严格要求：

1. 默认认为仓库互不相关，不做跨仓架构或业务流推断。
2. 先运行 `scripts/batch-generate-docs.sh`；准备后立即分析时使用 `--max-repos 1`。
3. Shell 可以长时间运行，不设置 30 分钟 timeout，也不调用任何大模型/Agent CLI。
4. 只从 `batch-report.md` 选择一个 `cloned` 仓库进入当前 invocation/session。
5. 当前会话只深挖这个 repo，即使提前完成也不要开始第二个。
6. 单仓处理必须遵循 codebase-explorer-docs：先跑 inventory，按预算批量读取，进度持续写入 coverage checklist。
7. 必须生成并完善六份文档：project-overview.md、module-analysis.md、onboarding-guide.md、api-and-data-flow.md、business-flow-summary.md、architecture.md（含至少 2 张 Mermaid 图：运行时架构 + 模块调用/依赖，每张带 `%% Evidence:` 证据声明）。
8. context 压力出现时，保存“进行中模块”、已读文件、待确认点和下一批文件，保持 `Completion: incomplete`，结束会话。
9. 完成时运行 `validate-doc-completion.sh`；只有通过后，下次 Batch 运行才会推导为 `done`。
10. 不手工把报告状态改成 success/partial；报告只使用 done/cloned/deferred/failed。
11. 不修改任何源码、配置、package、lockfile 或测试文件；最后检查 Source Path 的 `git status --short`。
