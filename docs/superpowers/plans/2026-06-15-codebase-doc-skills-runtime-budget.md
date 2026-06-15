# codebase-doc-skills 运行预算优化实施计划

> **For Codex:** 使用 `executing-plans` 按任务顺序实施；行为修改遵循 TDD，先观察回归测试失败，再补实现。

**Goal:** 为单仓文档探索和多仓准备流程加入确定性盘点、五文档完成校验、可限流续跑的 Batch 编排，以及单仓会话预算规范。

**Architecture:** Shell 只负责可重复的盘点、clone/update、状态推导和报告；Agent 每个会话只深挖一个仓库，并通过文档输出目录下的 `_analysis/coverage-checklist.md` 保存可恢复进度。Batch 的 `done` 由五份模板文档、inventory、coverage matrix 和 `Completion: complete` 共同决定。

**Tech Stack:** Bash 3.2、Git、POSIX `find`/`grep`/`sed`/`awk`/`sort`/`head`。

---

### Task 1: 建立脚本回归测试

**Files:**
- Create: `skills/codebase-doc-skills/tests/test-runtime-budget.sh`

**Steps:**
1. 用临时 Git 仓库和临时文档目录生成自包含 fixture。
2. 覆盖 inventory 固定章节、模块计数、只读边界和非 Git 空仓。
3. 覆盖 validator 的五文档、模板标题、章节正文、矩阵、精确占位值和完成声明。
4. 覆盖 batch 的 `--max-repos`、`done` 不占配额、`deferred`、scaffold、预检计划、锁和 `--dry-run` 删除。
5. 运行测试，确认当前实现因缺失脚本和旧 batch 行为失败。

### Task 2: 实现仓库盘点脚本

**Files:**
- Create: `skills/codebase-doc-skills/codebase-explorer-docs/scripts/repo-inventory.sh`

**Steps:**
1. 实现 Bash 3.2 兼容参数解析、只读文件清单和输出目录内临时文件。
2. 输出固定、有界的技术栈、命令、目录、扩展名、入口/路由、模块候选和配置章节。
3. 输出 `Module-Candidates-Emitted: N`，并保证候选稳定去重。
4. 加入章节进度、原子替换和 `INT`/`TERM` 清理。
5. 运行语法检查和 inventory 回归。

### Task 3: 实现五文档完成校验

**Files:**
- Create: `skills/codebase-doc-skills/codebase-explorer-docs/scripts/validate-doc-completion.sh`

**Steps:**
1. 从 sibling templates 读取全部 H1/H2 标题并验证目标章节存在且非空。
2. 验证 inventory 机器计数、业务模块覆盖矩阵行数、固定小节/列名、证据来源和精确 `未分析` 状态。
3. 验证覆盖度自检固定列名、模板检查项、结果/说明，精确拒绝模板占位值。
4. 要求独占一行的 `Completion: complete`，逐项输出失败原因且不写文件。
5. 运行语法检查和 validator 回归。

### Task 4: 改造 Batch 编排

**Files:**
- Modify: `skills/codebase-doc-skills/batch-codebase-doc-generator/scripts/batch-generate-docs.sh`

**Steps:**
1. 删除 `--dry-run`，加入正整数 `--max-repos`。
2. 在任何写盘前完成参数、仓库 spec、Git 和 validator 预检，并把解析计划输出到 stderr。
3. 用 validator 推导 `done`；按进入 clone/update 的尝试次数推导配额，成功为 `cloned`、失败为 `failed`，两者都消耗配额。
4. 首次 clone 写入同级临时目录后原子重命名；报告通过临时文件完整生成后原子替换。
5. 加入 docs-root 锁、长运行进度、信号清理和 coverage checklist scaffold。
6. 报告只使用 `done/cloned/deferred/failed`，待办只列 `cloned`。
7. 运行语法检查和 batch 回归。

### Task 5: 同步 Skill 契约

**Files:**
- Modify: `skills/codebase-doc-skills/codebase-explorer-docs/SKILL.md`
- Modify: `skills/codebase-doc-skills/codebase-explorer-docs/README.md`
- Modify: `skills/codebase-doc-skills/codebase-explorer-docs/START_PROMPT.md`
- Modify: `skills/codebase-doc-skills/batch-codebase-doc-generator/SKILL.md`
- Modify: `skills/codebase-doc-skills/batch-codebase-doc-generator/README.md`
- Modify: `skills/codebase-doc-skills/batch-codebase-doc-generator/START_PROMPT.md`
- Modify: `skills/codebase-doc-skills/batch-codebase-doc-generator/templates/single-repo-prompt.md`
- Modify: `skills/codebase-doc-skills/SUMMARY.md`

**Steps:**
1. 将 `Low Capability Model Mode` 统一为 `Budget-Aware Execution Mode`。
2. 写明 Shell 可长时间运行、Agent 一次会话只深挖一个仓库、30 分钟/200 请求仅是操作者预算。
3. 写明 inventory-first、同 turn 并行读取、context checkpoint、进行中模块续跑和 Shell 不自动唤醒 Agent。
4. 将五份文档和 validator 设为唯一完成路径。
5. 同步 Batch 的 `--max-repos`、预检计划、锁、状态和再次运行续跑语义。

### Task 6: 最终验证

**Steps:**
1. 运行三个脚本的 `bash -n`。
2. 运行 `skills/codebase-doc-skills/tests/test-runtime-budget.sh`。
3. 对真实仓库运行 inventory 到临时输出，并确认前后 `git status --short` 一致。
4. 用 `rg` 检查旧模式、旧状态和 `--dry-run` 的矛盾引用。
5. 运行仓库要求的 `npm run check:full`；若失败，区分本变更失败和已存在的无关失败。
6. 检查最终 `git diff` 与 `git status --short`，确保未触碰无关文件。
