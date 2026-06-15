# codebase-doc-skills 运行预算优化设计

## 目标

在不引入 Node.js、`jq`、外部 Agent CLI 或持久化状态数据库的前提下，让
`codebase-explorer-docs` 与 `batch-codebase-doc-generator` 能在以下运行预算内
稳定执行：

- 上下文上限约 130k tokens。
- 30 分钟内最多约 200 次大模型请求。
- 同一 assistant turn 内并行调用多个独立工具仍按一次请求计算。

当预算不足以完成全部分析时，Agent 必须保留证据、标明未分析范围，并支持后续
运行继续处理，不得为了宣称完成而编造结论。

## 设计原则

1. 用确定性 Shell 脚本完成仓库盘点、状态判断和批次选择。
2. 只把紧凑的结构化盘点结果放入模型上下文，再按信号优先级读取源码。
3. 以文件系统中的核心文档作为续跑完成标志，不解析旧报告或新增状态文件。
4. `batch-report.md` 是每次运行时重建的完整当前快照，不承担历史账本职责。
5. 同一 Agent 会话无法真正删除已经进入上下文的内容，因此“上下文隔离”通过
   `--max-repos` 分批和跨会话续跑实现；单仓顺序处理只负责减少同时活跃的信息。
6. 源码仓保持只读。所有盘点结果、中间笔记和最终文档均写入选定文档输出目录。

## 单仓盘点脚本

新增：

```text
skills/codebase-doc-skills/codebase-explorer-docs/scripts/repo-inventory.sh
```

接口：

```bash
./scripts/repo-inventory.sh \
  --root <source-repository> \
  --out <selected-doc-output>/_analysis/repo-inventory.md
```

`--root` 默认当前目录。`--out` 默认值为
`<current-directory>/docs/_analysis/repo-inventory.md`，与单仓 skill 的默认文档
输出目录一致。调用方指定外部文档目录时，必须显式传入该目录下的输出路径。

脚本只读取 `--root`，只写一个 `--out` 文件，并创建其父目录。它不得在源码仓中
创建其他文件，也不得运行安装、构建、测试或会修改检出状态的命令。

### 盘点内容

输出为带固定章节的紧凑 Markdown：

1. 仓库元信息：根路径、是否为 Git 仓库、当前分支（可获得时）。
2. 技术栈信号：列出检测到的 manifest/build 文件及可安全提取的项目名。
3. 运行命令候选：`package.json` scripts 和 Makefile 目标。
4. 目录概览：Git 仓优先基于 `git ls-files` 聚合一、二级目录；非 Git 仓回退
   `find`。
5. 文件类型规模：按扩展名统计并输出有界 Top-N。
6. 入口、路由和接口候选：匹配常见框架模式，只输出去重后的相对文件路径。
7. 配置文件清单。
8. 截断说明：任何达到上限的章节都明确标记结果已截断。

每节采用独立上限，避免大型 monorepo 生成失控输出。实现应兼容 macOS 自带
Bash 3.2，不使用关联数组、`mapfile`、GNU-only `find -printf` 或 GNU-only
`sed` 选项。可用命令包括 `git`、`find`、`grep`、`sed`、`awk`、`sort`、
`uniq`、`head` 和基础 POSIX 工具；任一可选命令或目标文件缺失时输出
“未检测到”并继续。

`package.json` scripts 的提取属于启发式盘点，不承诺实现完整 JSON 解析。若
格式超出脚本可安全识别范围，应列出文件路径并提示 Agent 按需读取 manifest，
不得输出未经确认的命令。

## 单仓预算感知执行

将 `Low Capability Model Mode` 重构为 `Budget-Aware Execution Mode`，并保留
现有三文档默认输出和 `_analysis` 增量笔记机制。

### 执行顺序

1. 确认 selected documentation output directory 和只读源码边界。
2. 运行盘点脚本，将结果写入该输出目录的 `_analysis/repo-inventory.md`。
3. 一次读取盘点结果，建立 high-signal 文件队列。
4. 每轮并行读取最多 5 至 10 个相互独立或紧密相关的文件。
5. 按入口、路由、manifest/配置、API/service、顶层业务模块的顺序分析。
6. 每得到一组稳定证据，立即写入 `_analysis` 笔记和
   `_analysis/coverage-checklist.md`。
7. 根据剩余预算决定继续深挖、生成核心文档或停止并记录未覆盖项。

“丢弃原文件内容”作为工作习惯描述，不声称模型能从同一会话历史中物理删除
tokens。Agent 应停止重复引用已归档的原文，后续优先读取紧凑的 `_analysis`
笔记。

### 预算耗尽与续跑

`_analysis/coverage-checklist.md` 是单仓续跑锚点，至少记录：

- 已分析模块和证据路径。
- 部分覆盖、未确认和未分析模块。
- 下一批建议读取的 high-signal 文件。
- 尚未确认的业务问题。
- 核心三文档的生成或更新状态。

临近上下文或请求上限时，Agent 停止扩大探索范围，优先完成或更新：

```text
project-overview.md
module-analysis.md
onboarding-guide.md
```

覆盖矩阵使用现有状态值标明不足；`覆盖度自检` 和
`TODO: 需要业务确认` 必须列出遗漏。可选文档只有在核心三文档和覆盖检查稳定后
才生成。

## Batch 断点续跑与限流

修改：

```text
skills/codebase-doc-skills/batch-codebase-doc-generator/scripts/batch-generate-docs.sh
```

新增：

```text
--max-repos N
```

`N` 必须是大于零的十进制整数。缺失值、零、负数或非数字均以用法错误退出。
未指定时不限制本次激活数量。

### 完成判定

仅当以下三个文件全部存在且为普通文件时，仓库状态才是 `done`：

```text
<docs-root>/<repo-name>/project-overview.md
<docs-root>/<repo-name>/module-analysis.md
<docs-root>/<repo-name>/onboarding-guide.md
```

只存在一个或两个核心文档属于未完成仓库，可在本次预算允许时重新激活。脚本不
解析 Markdown 内容，也不依赖旧 `batch-report.md`。

### 状态选择顺序

对输入列表中的每个去重后仓库，按以下顺序确定状态：

1. 三个核心文档齐全：`done`，跳过 clone、fetch、checkout 和 scaffold。
2. 未完成且本次激活数已达到 `--max-repos`：`deferred`，不 clone、不更新，
   不创建该仓文档目录。
3. 未完成且仍有配额：执行 clone/update；成功为 `cloned`，失败为 `failed`。

`--max-repos` 只统计进入 clone/update 流程的未完成仓库。`done`、`deferred`
和无效输入不消耗激活配额。

### 报告语义

每次非 dry-run 执行都覆盖重建 `<docs-root>/batch-report.md`，表格包含本次输入
的全部仓库，并使用：

```text
done
cloned
deferred
failed
```

报告中的“待办清单”只列 `cloned` 仓库。`done` 与 `deferred` 分别列在独立摘要
中，`deferred` 说明再次运行脚本即可继续。

Summary 包含：

```text
Total
Done
Cloned (ready for docs)
Deferred
Failed
```

Agent 完成某仓文档后不再要求手工把报告行改成 `success` 或 `partial`。源码
干净校验结果写入该仓文档或最终响应；下一次运行由三个核心文档重新推导
`done`。这避免脚本覆盖报告时丢失人工状态，并使续跑只依赖文件系统事实。

### Dry-run

现有实现会在解析参数后创建目录并写报告，和帮助文本中的“不写文件”冲突。
本次修改将 `--dry-run` 定义为零写入：

- 不创建 `--repos-root`。
- 不创建 `--docs-root`。
- 不创建每仓目录。
- 不写或覆盖 `batch-report.md`。
- 不 clone、fetch 或 checkout。
- 在标准输出打印与正式报告等价的计划摘要，包括 `done`、`cloned`
  （planned）、`deferred` 和可预先判断的错误。

如果 `--docs-root` 不存在，dry-run 无法发现其中的完成文档，因此所有未被现有
文件证明为 `done` 的仓库按未完成处理。

## Batch 预算与上下文控制

Batch skill 要求：

1. 先运行编排脚本，只处理报告中的 `cloned` 仓库。
2. 一次只深入一个仓库，并对该仓遵循单仓 Budget-Aware Execution Mode。
3. 每仓完成后写完文档、`_analysis` 和源码 `git status` 结果，再进入下一仓。
4. 根据总预算和仓库规模选择 `--max-repos`。未知规模时默认采用保守小批次，
   而不是把全部仓库装入一个会话。
5. 单次未完成全部仓库是正常结果；后续重新运行脚本时，三个核心文档齐全的仓库
   自动成为 `done`，其余继续分批激活。

每仓预算只能作为规划启发式，不写成虚假的精确 token 配额。Agent 应根据盘点
结果中的规模和信号密度动态调整，并优先保证核心三文档和诚实覆盖状态。

## 文档同步

同步修改以下文件，确保术语和状态一致：

```text
skills/codebase-doc-skills/codebase-explorer-docs/SKILL.md
skills/codebase-doc-skills/codebase-explorer-docs/README.md
skills/codebase-doc-skills/codebase-explorer-docs/START_PROMPT.md
skills/codebase-doc-skills/batch-codebase-doc-generator/SKILL.md
skills/codebase-doc-skills/batch-codebase-doc-generator/README.md
skills/codebase-doc-skills/batch-codebase-doc-generator/START_PROMPT.md
skills/codebase-doc-skills/batch-codebase-doc-generator/templates/single-repo-prompt.md
skills/codebase-doc-skills/SUMMARY.md
```

删除或改写以下旧语义：

- `Low Capability Model Mode`
- `success` / `partial` 作为 batch-report 持久状态
- Agent 必须手工更新报告状态
- 脚本阶段的 `skipped`
- “处理完即可真正清空同一会话上下文”的暗示

## 验证设计

### 静态检查

```bash
bash -n skills/codebase-doc-skills/codebase-explorer-docs/scripts/repo-inventory.sh
bash -n skills/codebase-doc-skills/batch-codebase-doc-generator/scripts/batch-generate-docs.sh
```

使用 `rg` 检查旧术语和状态没有残留矛盾引用。

### 盘点脚本

在临时目录中验证：

1. Git 仓输出包含所有固定章节，路径相对 `--root`，总长度受限。
2. 非 Git 空仓不报错，并明确写出未检测到的信号。
3. 不提供 Node.js 或 `jq` 仍可运行。
4. 输出父目录不存在时只创建输出父目录。
5. 运行前后 `git status --short` 一致，源码仓没有新文件或修改。
6. 包含特殊字符和空格的根路径、输出路径可以工作。

### Batch 脚本

使用本地临时 Git 仓库作为 clone 源，避免依赖网络：

1. 参数校验覆盖合法与非法 `--max-repos`。
2. 三个核心文档齐全时状态为 `done`，且不会 clone/update。
3. 只有部分核心文档时仍可成为 `cloned`。
4. `--max-repos 1` 只激活第一个未完成仓库，其余为 `deferred`。
5. `done` 不占用激活配额。
6. 重名仓库的 `done` 判断使用去重后的目录名。
7. 报告包含全部输入仓库，但待办清单只包含 `cloned`。
8. Summary 的 Total/Done/Cloned/Deferred/Failed 与表格一致。
9. 第二次运行能把已经补齐三个核心文档的仓库识别为 `done`。
10. `--dry-run` 前后文件系统快照一致，不创建目录或覆盖已有报告。
11. clone 失败仍按 `--fail-fast` 语义处理，并保留已生成的报告快照。
12. `set -u` 下空数组、空分支和重复仓库名不报未绑定变量。

### 最终回归

只运行与本变更相关的脚本测试和语法检查。若仓库没有现成 Shell 测试框架，
新增一个自包含 Bash 回归脚本，使用临时目录、退出码和文本断言验证上述行为，
不引入测试依赖。最后运行 `git status --short`，确认测试没有修改 fixture 源码
或其他仓库文件。

## 验收标准

1. 单仓探索先通过有界盘点建立地图，再读取 high-signal 文件。
2. 盘点、中间笔记和最终文档均遵守 selected documentation output directory。
3. Budget-Aware Execution Mode 同时约束请求数和上下文，不再鼓励逐文件多轮读取。
4. 预算不足时保留续跑锚点并诚实标注覆盖不足。
5. Batch 可通过 `--max-repos` 控制每次激活数量。
6. 三个核心文档齐全是唯一 `done` 判定。
7. `batch-report.md` 是可由当前文件系统重建的完整运行快照。
8. `--dry-run` 不产生任何文件系统写入。
9. 大批量工作可跨多次运行累计完成，不依赖外部 Agent CLI。
10. 源码仓在盘点、文档生成和验证后保持未修改。
