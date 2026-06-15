请使用 codebase-explorer-docs skill，为当前代码库生成代码和业务探索总结文档。

严格要求：

1. 只读源码，不要修改或注释任何源文件。
2. 所有盘点、笔记和最终 Markdown 都写入指定文档输出目录。
3. 先运行 `scripts/repo-inventory.sh`，读取 `_analysis/repo-inventory.md` 后再按 high-signal 优先级深挖。
4. 当前 invocation/session 只深挖这一个 repo；不要在同一会话继续第二个 repo。
5. 同一 turn 内尽量并行读取相互独立的文件，每轮控制在 5 至 10 个相关文件。
6. 每得到一组稳定证据，立即更新 `_analysis/coverage-checklist.md`。
7. context 接近上限或发生压缩时，记录“进行中模块”、已读文件、待确认点和下一批文件，保持 `Completion: incomplete`，然后结束会话。
8. 必须生成并完善五份文档：
   - project-overview.md
   - module-analysis.md
   - onboarding-guide.md
   - api-and-data-flow.md
   - business-flow-summary.md
9. 不适用的内容也要写明判断依据和证据路径，不能通过缺文件表示不适用。
10. 每个模块结论必须带证据路径；不确定业务含义标记 `TODO: 需要业务确认`。
11. 完成自检后再写 `Completion: complete`，并运行 `scripts/validate-doc-completion.sh`；失败则恢复 incomplete 并修订。
12. 最后检查 `git status`，确认盘点和文档生成都没有修改源码。
