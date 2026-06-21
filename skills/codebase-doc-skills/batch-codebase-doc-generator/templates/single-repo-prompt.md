请使用 codebase-explorer-docs skill，续跑或完成当前单仓文档任务。

路径：

- Source Path: <repo-source-path>
- 文档输出目录: <repo-doc-output-dir>

严格要求：

1. 当前 invocation/session 只处理这个 repo，源码只读。
2. 先读取 `_analysis/coverage-checklist.md`；若有“进行中模块”，从该模块继续。
3. 运行 `repo-inventory.sh`，将结果写入文档输出目录的 `_analysis/repo-inventory.md`。
4. 同一 turn 内并行读取独立 high-signal 文件，每轮不超过 5 至 10 个相关文件。
5. 每组稳定证据立即写入 `_analysis` 和已有文档。
6. 必须生成并完善六份文档：
   - project-overview.md
   - module-analysis.md
   - onboarding-guide.md
   - api-and-data-flow.md
   - business-flow-summary.md
   - architecture.md（含至少 2 张 Mermaid 图：运行时架构 + 模块调用/依赖，每张带 `%% Evidence:` 证据声明）
7. 不适用内容写明判断依据和证据路径；不确定内容标记 `TODO: 需要业务确认`。
8. context 压力出现时，保存进行中模块、已读文件、待确认点和下一批文件，保持 `Completion: incomplete`，结束会话。
9. 完成自检后写 `Completion: complete` 并运行 `validate-doc-completion.sh`；失败则恢复 incomplete 并修订。
10. 最后运行 `git -C <repo-source-path> status --short`，确认源码未修改。
