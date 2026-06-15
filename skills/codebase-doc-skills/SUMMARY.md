# codebase-doc-skills 技能集总结

一组只读源码、仅在指定文档输出目录生成 Markdown 的代码库探索技能。

## 两个 Skill

| Skill                          | 定位               | 核心机制                                                                              |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------------------- |
| `codebase-explorer-docs`       | 单仓深度探索       | inventory-first、Budget-Aware Execution Mode、五文档完成检查、coverage checklist 续跑 |
| `batch-codebase-doc-generator` | 多仓准备与分批编排 | 静态预检、`--max-repos`、done/cloned/deferred/failed、原子报告和锁                    |

Batch 只做确定性准备，不调用大模型或 Agent CLI；实际读代码与写文档由当前 Agent
遵循单仓 skill 完成。默认不做跨仓系统分析。

## 单仓产物

完整交付固定包含：

```text
project-overview.md
module-analysis.md
onboarding-guide.md
api-and-data-flow.md
business-flow-summary.md
_analysis/repo-inventory.md
_analysis/coverage-checklist.md
```

五份模板文档都必须存在并完善。不适用的 API/data flow 或业务流程也要说明理由和
证据路径。`validate-doc-completion.sh` 机械检查模板 H1/H2、矩阵/自检小节名与
列名、自检检查项文案、章节正文、证据来源、inventory 候选数和
`Completion: complete`。

## 运行预算优化

`repo-inventory.sh` 用 Bash 3.2 兼容的确定性扫描把技术栈、命令、目录、文件类型、
入口/路由、模块候选和配置压缩为有界 Markdown。Agent 据此优先读取 high-signal
文件，并在同一 assistant turn 内并行调用独立工具，减少请求轮次。

约 130k context 和 30 分钟约 200 请求是操作者预算。Shell 盘点、clone 和报告
可以长时间运行；Agent 采用“一次 invocation/session 只深挖一个 repo”的可观测
边界。context 压力出现时，立即把稳定证据、进行中模块、已读文件、待确认点和下一
批文件写入 coverage checklist，保持 incomplete 并结束。后续会话从被卡模块继续。

Shell 不保存模型正在进行的推理，也不自动唤醒 Agent；下一次会话由操作者或运行
平台发起。

## Batch 续跑

```bash
./scripts/batch-generate-docs.sh \
  --repos repos.txt \
  --docs-root codebase-docs \
  --max-repos 1
```

状态只使用：

```text
done      五份文档和完成检查通过
cloned    本次激活，等待单仓 Agent 会话
deferred  超出本次激活配额
failed    clone/checkout/scaffold 失败
```

`done` 不占配额；进入 clone/update 的 `cloned` 和 `failed` 都消耗一次配额，
因此 `--max-repos` 限制准备尝试数而非成功数。再次运行时已完成仓库自动跳过，
未完成或历史 failed 仓库重新进入判定。`batch-report.md` 每次原子重建为完整
当前快照，待办只列 `cloned`；Agent 不手工改报告状态。

脚本删除了 `--dry-run`，但在任何写盘前输出解析计划。首次 clone 使用临时同级
目录，报告使用临时文件原子替换；同一 docs root 通过锁目录禁止并发运行。

## 验证

```bash
bash -n codebase-explorer-docs/scripts/repo-inventory.sh
bash -n codebase-explorer-docs/scripts/validate-doc-completion.sh
bash -n batch-codebase-doc-generator/scripts/batch-generate-docs.sh
bash tests/test-runtime-budget.sh
```

最终还要检查每个 Source Path 的 `git status --short`，确认盘点与文档生成没有
修改源码。
