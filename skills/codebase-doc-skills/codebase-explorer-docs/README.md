# codebase-explorer-docs

单仓代码/业务探索文档生成 Skill。

## 能力边界

- 源码只读，只在文档输出目录写 Markdown。
- 不加源码注释、不改业务逻辑、不引入依赖。
- 先用确定性 Shell 盘点，再由 Agent 深挖 high-signal 文件。
- 一个 Agent invocation/session 只深挖一个 repo。
- 通过 `_analysis/coverage-checklist.md` 保存可跨会话续跑的进度。

## 固定输出

```text
<文档输出目录>/
├── project-overview.md
├── module-analysis.md
├── onboarding-guide.md
├── api-and-data-flow.md
├── business-flow-summary.md
└── _analysis/
    ├── repo-inventory.md
    └── coverage-checklist.md
```

五份模板文档都是完整交付的必需产物。不适用的 API/data flow 或业务流程也要
保留文档，并写清判断依据和证据路径。

## 盘点与完成检查

```bash
./scripts/repo-inventory.sh \
  --root <source-repository> \
  --out <文档输出目录>/_analysis/repo-inventory.md

./scripts/validate-doc-completion.sh \
  --docs-root <文档输出目录>
```

盘点脚本不依赖 Node.js 或 `jq`，允许长时间运行；完成检查要求五份文档、模板
章节、覆盖矩阵、证据列、自检和 `Completion: complete` 同时通过。

## 预算感知

约 130k context / 30 分钟约 200 请求是操作者预算，不是 Agent 自行计时的硬
条件。同一 assistant turn 内并行调用多个独立工具可以减少请求轮次。出现 context
压力时，立即更新 checklist 的“进行中模块”和“下一批文件”，保持
`Completion: incomplete` 并结束当前会话；下次会话从该模块继续。

单仓启动 Prompt 见 `START_PROMPT.md`。
