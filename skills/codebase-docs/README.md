# codebase-docs

> 本 skill 前身为 `codebase-doc-skills` 下的 `codebase-explorer-docs`（单仓）+
> `batch-codebase-doc-generator`（多仓）双目录，现合并为一个符合
> `skills/<skill-name>/SKILL.md` 约定的独立 skill，单仓/多仓由一个 description +
> mode 分流，脚本同处一个 `scripts/`，无跨 skill 路径依赖。

只读源码、仅在文档输出目录生成 Markdown 的代码库探索文档 skill。支持单仓深度探索
与多仓批量准备/编排，可选 opt-in 通过 PR 发布。

## 能力边界

- 源码只读，只在文档输出目录写 Markdown；不加注释、不改业务逻辑、不引入依赖。
- 先用确定性 Shell 盘点，再由 Agent 深挖 high-signal 文件。
- 一个 Agent invocation/session 只深挖一个 repo；通过 `_analysis/coverage-checklist.md`
  跨会话续跑。
- 默认不做跨仓架构/业务分析。

## 结构

```
codebase-docs/
├── SKILL.md            # 触发 + mode 选择 + 安全边界 + 预算 + 完成契约
├── START_PROMPT.md     # 单仓/多仓启动语
├── references/
│   ├── single-repo.md  # 单仓工作流 + 每份文档写什么 + 契约小节
│   └── batch.md        # 多仓编排 + 状态机 + 续跑 + publish
├── scripts/            # repo-inventory / validate-doc-completion / batch-generate-docs / publish-docs
├── templates/
│   ├── documents/      # 六份文档模板 = 必需集合唯一权威（脚本动态枚举）
│   ├── coverage-checklist.md
│   └── repos.example.txt
└── tests/              # lib.sh + test-*.sh + run.sh
```

## 单仓产物

```text
project-overview.md  module-analysis.md  onboarding-guide.md
api-and-data-flow.md  business-flow-summary.md  architecture.md
_analysis/repo-inventory.md  _analysis/coverage-checklist.md
```

`templates/documents/` 下的全部文档都必须存在并完善。不适用的 API/data flow 或业务流程
也要保留文档并写清判断依据与证据路径。`architecture.md` 还必须含至少 2 张 Mermaid 图
（运行时架构 + 模块调用/依赖），每张带 `%% Evidence:` 证据声明。完成检查由
`scripts/validate-doc-completion.sh` 机械执行（动态枚举 `templates/documents/`，故新增
普通文档无需改脚本；专属语义校验仍需扩展 validator）。

## 多仓与发布

```bash
./scripts/batch-generate-docs.sh --repos repos.txt --docs-root codebase-docs --max-repos 1
./scripts/publish-docs.sh --docs-root codebase-docs        # 本地建分支+commit，打印计划后停下
./scripts/publish-docs.sh --docs-root codebase-docs --yes  # 人工确认后再 push + 开 PR
```

状态只用 `done / cloned / deferred / failed`；`done` 由完成检查推导，不手工改报告。
详见 `references/batch.md`。

## 运行预算

约 130k context / 30 分钟约 200 请求是操作者预算，不是 Agent 自行计时的硬条件。同一
turn 内并行调用独立工具减少请求轮次。出现 context 压力时立即更新 checklist 的「进行中
模块」和「下一批文件」，保持 `Completion: incomplete` 并结束会话，下次从该模块续跑。

## 验证

```bash
bash -n scripts/repo-inventory.sh
bash -n scripts/validate-doc-completion.sh
bash -n scripts/batch-generate-docs.sh
bash -n scripts/publish-docs.sh
bash tests/run.sh
```

最终还要检查每个 Source Path 的 `git status --short`，确认盘点与文档生成没有修改源码。
