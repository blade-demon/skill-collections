# batch-codebase-doc-generator

为多个 Git 仓库准备独立文档任务，并通过完成检查支持分批续跑。

## 职责分离

- Shell：预检、clone/update、限流、状态推导、scaffold、原子报告。
- Agent：一次 invocation/session 只深挖一个 `cloned` 仓库。

脚本不调用任何大模型或 Agent CLI，也不依赖 Node.js / `jq`。Shell 可以运行超过
30 分钟；30 分钟/约 200 请求只约束模型侧吞吐安排。

## 使用

```bash
chmod +x scripts/batch-generate-docs.sh

./scripts/batch-generate-docs.sh \
  --repos repos.txt \
  --docs-root codebase-docs \
  --repos-root _repos \
  --max-repos 1
```

`--max-repos N` 限制本次进入 clone/update 的尝试数，不是成功 clone 数。
`cloned` 和 `failed` 都消耗配额，避免坏 URL 或鉴权失败绕过限额。准备后立即分析
时推荐 `N=1`；仅做长时间 clone 预热时可以增大或省略。

脚本已删除 `--dry-run`。静态预检成功后、任何写盘前，会把解析后的 repo 名、
branch、Source Path 和 Docs Path 输出到 stderr。

## 状态

```text
done      六份文档和完成检查全部通过，不占激活配额
cloned    本次已准备，等待一个单仓 Agent 会话
deferred  超出本次激活配额，再次运行即可继续
failed    clone/checkout/scaffold 失败，下次运行重新尝试
```

不要手工把报告改成 `success` / `partial`。再次运行脚本时会根据当前六份文档、
inventory、coverage matrix、`architecture.md` 图与证据，以及 `Completion: complete`
自动推导 `done`。

## 续跑

`cloned` 仓库会在不存在时获得
`_analysis/coverage-checklist.md`，其中包含“进行中模块”和
`Completion: incomplete`。达到 context 阈值时由 Agent 写入当前进度；后续由
操作者或运行平台发起新会话，读取 checklist 后继续。Shell 不保存模型推理，也不
自动唤醒 Agent。

同一 docs root 不支持并行运行；脚本通过
`.batch-generate-docs.lock` 防止报告竞争。

## 发布（opt-in，第 8 步）

文档生成永远不提交、不推送。发布是独立的 opt-in 步骤，由确定性脚本完成：

```bash
./scripts/publish-docs.sh --docs-root codebase-docs        # 本地建分支+commit，打印计划后停下
./scripts/publish-docs.sh --docs-root codebase-docs --yes  # 人工确认后再 push + 开 PR
```

它只发布已 `done` 的仓库（用 `validate-doc-completion.sh` 重新判定），把每个仓库
的文档 commit 进 **docs-root** 这个 Git 仓库，从不触碰克隆的源码仓。不带 `--yes`
时只做本地 commit 并打印将执行的 `git push` / `gh pr create`，由人工 review 后再
带 `--yes` 重跑——这就是人工确认关口。同样通过 `.publish-docs.lock` 防止并发。
