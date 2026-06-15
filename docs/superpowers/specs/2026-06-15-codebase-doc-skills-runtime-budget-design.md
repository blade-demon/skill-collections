# codebase-doc-skills 运行预算优化设计

## 目标

在不引入 Node.js、`jq`、外部 Agent CLI 或持久化状态数据库的前提下，让
`codebase-explorer-docs` 与 `batch-codebase-doc-generator` 能在以下运行预算内
稳定执行：

- 上下文上限约 130k tokens。
- 30 分钟内最多约 200 次大模型请求。
- 同一 assistant turn 内并行调用多个独立工具仍按一次请求计算。

30 分钟和 200 次请求是面向操作者的吞吐预算，不是 Agent 可自行读取的精确计时器
或请求计数器。盘点、clone、fetch 和报告生成脚本允许持续运行超过 30 分钟；
模型侧用“单仓会话（一次 invocation/session）只深挖一个 repo”和上下文检查点
（context checkpoint）将工作限制在可观测边界内。

当预算不足以完成全部分析时，Agent 必须保留证据、标明未分析范围，并支持后续
运行继续处理，不得为了宣称完成而编造结论。

## 设计原则

1. 用确定性 Shell 脚本完成仓库盘点、状态判断和批次选择。
2. 只把紧凑的结构化盘点结果放入模型上下文，再按信号优先级读取源码。
3. 以五份模板文档和 coverage checklist 的完成声明作为续跑完成标志，不解析旧
   报告或新增独立状态文件。
4. `batch-report.md` 是每次运行时重建的完整当前快照，不承担历史账本职责。
5. 同一 Agent 会话无法真正删除已经进入上下文的内容，因此“上下文隔离”通过
   `--max-repos` 分批和跨会话续跑实现；单仓顺序处理只负责减少同时活跃的信息。
6. 源码仓保持只读。所有盘点结果、中间笔记和最终文档均写入文档输出目录。
7. Shell 准备阶段和模型分析阶段使用不同边界：Shell 不设置 30 分钟自超时；
   Agent 每个单仓会话只选择一个 repo 深挖。

## 执行边界（规范）

### Shell 阶段

以下确定性工作可以长时间运行：

- 单仓文件盘点和有界结果汇总。
- 多仓 clone、fetch、checkout 和文档目录准备。
- `batch-report.md` 快照生成。

脚本不得使用固定 30 分钟 timeout 或因模型调用结束而主动退出。长时间运行时应
持续输出当前阶段、当前仓库和完成计数，使调用方可以判断进度。网络 clone/fetch
仍由 Git 自身决定成功或失败；脚本不实现无限重试。

### Agent 阶段

每个单仓会话只能选择一个 repo 进入深度探索。会话内可以多轮读取、并行批量调用
工具、写 `_analysis` 和生成文档，但不得在完成、降级或暂停当前 repo 后继续深挖
第二个 repo。30 分钟仅作为操作者安排下一次调用的吞吐参考。

上下文检查点是最高优先级的停止信号。当平台提示 context 接近上限、发生
上下文压缩，或 Agent 判断继续读取会显著挤压文档生成空间时，立即停止扩大探索
范围，按以下顺序收尾：

1. 更新 `_analysis/coverage-checklist.md`。
2. 把已确认结论和覆盖状态写入已有文档。
3. 保持 `Completion: incomplete`。
4. 结束当前单仓会话。

下一次单仓会话优先续跑同一个 repo，直到五份模板文档通过完成检查；
不得为了提高仓库数量而缩短证据链。部分覆盖和未确认内容可以作为完整交付的一
部分，但必须在覆盖矩阵、自检和 TODO 中明确列出。

Agent 不自行推算墙钟分钟数或累计 API 请求数。减少请求数依靠同一 turn 内并行
执行互不依赖的读取和搜索；是否达到平台硬上限由运行环境或操作者判断。

## 单仓盘点脚本

新增：

```text
skills/codebase-doc-skills/codebase-explorer-docs/scripts/repo-inventory.sh
```

接口：

```bash
./scripts/repo-inventory.sh \
  --root <source-repository> \
  --out <文档输出目录>/_analysis/repo-inventory.md
```

`--root` 默认当前目录。`--out` 默认值为
`<current-directory>/docs/_analysis/repo-inventory.md`，与单仓 skill 的默认文档
输出目录一致。调用方指定外部文档目录时，必须显式传入该目录下的输出路径。

脚本只读取 `--root`，只写一个 `--out` 文件，并创建其父目录。它不得在源码仓中
创建其他文件，也不得运行安装、构建、测试或会修改检出状态的命令。

盘点脚本允许在超大仓库中长时间运行，不设置内部墙钟超时。每完成一个固定章节
就在 stderr 输出进度。结果先写入 `--out` 同目录下的进程级临时文件，全部章节
成功后再原子替换正式输出；收到 `INT`、`TERM` 或异常退出时清理本进程创建的
临时文件，并保留已有正式盘点结果。

### 盘点内容

输出为带固定章节的紧凑 Markdown：

1. 仓库元信息：根路径、是否为 Git 仓库、当前分支（可获得时）。
2. 技术栈信号：列出检测到的 manifest/build 文件及可安全提取的项目名。
3. 运行命令候选：`package.json` scripts 和 Makefile 目标。
4. 目录概览：Git 仓优先基于 `git ls-files` 聚合一、二级目录；非 Git 仓回退
   `find`。
5. 文件类型规模：按扩展名统计并输出有界 Top-N。
6. 入口、路由和接口候选：匹配常见框架模式，只输出去重后的相对文件路径。
7. 模块候选清单：根据 route/page/controller/service/API/state/domain/feature 等
   high-signal 路径归并出稳定、去重的候选根路径，并输出机器可读计数：

```text
Module-Candidates-Emitted: N
```

8. 配置文件清单。
9. 截断说明：任何达到上限的章节都明确标记结果已截断。

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
`_analysis` 增量笔记机制。五份模板文档都是完整交付的必需产物；预算不足时可以
先产出草稿，但不得因此声明完成。

### 执行顺序

1. 确认文档输出目录和只读源码边界。
2. 运行盘点脚本，将结果写入该输出目录的 `_analysis/repo-inventory.md`。
3. 一次读取盘点结果，建立 high-signal 文件队列。
4. 每轮并行读取最多 5 至 10 个相互独立或紧密相关的文件。
5. 按入口、路由、manifest/配置、API/service、顶层业务模块的顺序分析。
6. 每得到一组稳定证据，立即写入 `_analysis` 笔记和
   `_analysis/coverage-checklist.md`。
7. 根据当前证据覆盖和可观测的上下文压力，决定继续深挖、更新五份文档或触发
   上下文检查点。

“丢弃原文件内容”作为工作习惯描述，不声称模型能从同一会话历史中物理删除
tokens。Agent 应停止重复引用已归档的原文，后续优先读取紧凑的 `_analysis`
笔记。

### 上下文检查点与续跑

进度保存不依赖脚本快照模型状态——Shell 无法保存模型正在进行的推理。续跑能力
完全来自 Agent 把增量结论写入 `_analysis/coverage-checklist.md` 这个单仓续跑
锚点。它至少记录：

- 已分析模块和证据路径。
- 进行中模块：当前正在分析、尚未得出稳定结论的模块，及其已读文件和待确认点。
- 部分覆盖、未确认和未分析模块。
- 下一批建议读取的 high-signal 文件。
- 尚未确认的业务问题。
- 五份模板文档的生成和完整性状态。
- 固定完成声明：未完成时为 `Completion: incomplete`，全部完成检查通过后才改为
  `Completion: complete`。

因为执行顺序要求“每得到一组稳定证据立即写入”，正常进度已持续落盘；上下文
检查点只是在停止前补记“进行中模块”和“下一批文件”。这样下一次单仓会话——
无论隔多久——都能从被卡住的那个模块继续，而不是重头分析该 repo。

Shell 不会自动唤醒或恢复 Agent。达到平台阈值后，由操作者或运行平台发起下一次
单仓会话；新会话先读取 coverage checklist，再从“进行中模块”继续。

触发“执行边界（规范）”中的上下文检查点时，Agent 停止扩大探索范围，
优先更新 coverage checklist 和已有文档。完整交付必须包含：

```text
project-overview.md
module-analysis.md
onboarding-guide.md
api-and-data-flow.md
business-flow-summary.md
```

覆盖矩阵使用现有状态值标明不足；`覆盖度自检` 和
`TODO: 需要业务确认` 必须列出遗漏。若某仓没有 API、后端、状态管理、持久化
数据流或可识别的业务流程，对应文档仍需生成，并在相关章节明确写明“不适用”、
判断依据和证据路径，不能用缺少文件表示不适用。

## Batch 断点续跑与限流

### 完成检查脚本

新增：

```text
skills/codebase-doc-skills/codebase-explorer-docs/scripts/validate-doc-completion.sh
```

接口：

```bash
./scripts/validate-doc-completion.sh --docs-root <单仓文档输出目录>
```

该脚本读取同 skill 下的五份 `templates/*.md`，验证目标文档是否保留模板中的全部
一级和二级标题，并用有界的 `awk`/`grep` 检查每个标题到下一个同级或更高层级
标题之间存在非空正文。它还单独验证：

- `module-analysis.md` 的业务模块覆盖矩阵存在至少一条非表头数据行。
- 业务模块覆盖矩阵的数据行数不小于
  `_analysis/repo-inventory.md` 中的 `Module-Candidates-Emitted: N`。
- 业务模块覆盖矩阵每一行的“证据来源”单元格非空。
- 覆盖度自检不存在空结果、空说明或模板占位值。
- 覆盖矩阵不存在状态为 `未分析` 的数据行。
- `_analysis/coverage-checklist.md` 包含独占一行的
  `Completion: complete`。

表格校验必须先按 `|` 切分 Markdown 数据行，再对目标单元格去除首尾空白。仅当
单元格完整值等于 `是/部分/否` 或 `未分析` 时拒绝；不得对整行、正文或其他
单元格做子串匹配。合法内容中出现常用汉字“是”或句子中提到“未分析”不应误伤。

验证成功退出 0；失败退出非 0，并逐项输出缺失文件、空章节、空表格或未完成声明。
脚本只读文档，不修改任何文件。它验证的是可机械判断的结构完整性，不宣称判断
业务分析质量。

脚本只有一种模式：验证全部规则，并要求独占一行的 `Completion: complete`。
不提供 `--content-only` 之类的部分校验开关，避免完成判定出现两条路径。

模板结构属于完成检查契约。修改 `templates/*.md` 的一级或二级标题、业务模块
覆盖矩阵和覆盖度自检的小节标题、矩阵/自检列名，或覆盖度自检的检查项文案，
都属于破坏性验证变更，会使旧文档在复检时变为未完成；实施时必须同步更新验证
测试，并在文档中说明旧产物的迁移方式。

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

`done` 表示五份模板文档已经形成可交付结果，不是仅达到最低产物数量。必须同时
满足以下条件：

```text
<docs-root>/<repo-name>/project-overview.md
<docs-root>/<repo-name>/module-analysis.md
<docs-root>/<repo-name>/onboarding-guide.md
<docs-root>/<repo-name>/api-and-data-flow.md
<docs-root>/<repo-name>/business-flow-summary.md
<docs-root>/<repo-name>/_analysis/repo-inventory.md
<docs-root>/<repo-name>/_analysis/coverage-checklist.md
```

完成检查规则：

1. 五份模板文档全部存在、为普通文件且非空。
2. 每份文档的模板必填章节标题仍然存在，并且标题后包含非空正文；正文可以明确
   写“不适用”，但必须同时给出判断依据和证据路径。
3. `module-analysis.md` 的业务模块覆盖矩阵至少包含一条数据行，覆盖度自检中的
   每个检查项都有确定结果和说明，不能保留 `是/部分/否` 等模板占位值。
4. 所有盘点发现的业务模块都在覆盖矩阵中有状态和证据路径，且不得残留
   `未分析`。`部分覆盖` 或 `未确认` 只有在说明证据边界、缺失信息和后续确认项时
   才能进入完整交付；`疑似非业务模块` 必须给出判断依据。
5. `_analysis/coverage-checklist.md` 存在且包含独占一行的固定声明：

```text
Completion: complete
```

生成过程中该值必须保持：

```text
Completion: incomplete
```

`validate-doc-completion.sh` 负责规则 1、2、3、5，并将 inventory 模块候选数、
矩阵数据行数、证据来源非空和 `未分析` 精确单元格匹配作为规则 4 的结构性代理。
证据是否真实以及“不适用”理由是否可信仍由 Agent 负责；Shell 不尝试用关键词
数量判断语义质量。任何一项机械检查失败都属于未完成仓库，可在本次预算允许时
重新激活。Batch 脚本通过调用完成检查脚本获得 `done` 结论，不依赖旧
`batch-report.md`，也不新增独立状态文件。

Agent 的完成流程：

1. 完成五份文档和 coverage checklist 自检后，将完成声明改为 `Completion: complete`。
2. 运行 `validate-doc-completion.sh`。
3. 任一规则失败则恢复 `Completion: incomplete`，按报错修订后重试。

短暂写入 `complete` 又结构不达标的情况由这一步验证兜住：失败即回退，Batch
判定 `done` 时也会再跑同一验证。`Completion: complete` 是 Agent 的语义责任
声明，不是唯一闸门；只有声明和全部结构性代理指标同时通过，Batch 才能判定
`done`。

### 状态选择顺序

对输入列表中的每个去重后仓库，按以下顺序确定状态：

1. 五份文档及 coverage checklist 通过完成检查：`done`，跳过 clone、fetch、
   checkout 和 scaffold。
2. 未完成且本次激活数已达到 `--max-repos`：`deferred`，不 clone、不更新，
   不创建该仓文档目录。
3. 未完成且仍有配额：执行 clone/update；成功为 `cloned`，失败为 `failed`。

`--max-repos` 只统计进入 clone/update 流程的未完成仓库。一次 clone/update
尝试无论最终成为 `cloned` 还是 `failed`，都消耗一个激活配额；该参数限制的是
Git 准备尝试数，不承诺成功准备 N 个仓库。这样坏 URL 或鉴权失败不会绕过限额，
导致一次运行发起无界的网络尝试。`done`、`deferred` 和无效输入不消耗配额。

`failed` 不是持久状态。下一次运行仍按当前文档和源码目录重新判断；没有通过完成
检查的历史 failed 仓库会再次消耗激活配额并重新 clone/update。

`--max-repos` 控制的是 Shell 本次准备多少仓库，不代表 Agent 可以在同一单仓
会话深挖多少仓库。为长时间预热 clone，可以省略该参数或指定较大的值；当脚本
执行后立即进入文档生成时，推荐使用 `--max-repos 1`，使当前单仓会话只出现一个
新的深挖候选。

### Scaffold 责任

仓库 clone/update 成功并成为 `cloned` 后，Batch 脚本负责创建：

```text
<docs-root>/<repo-name>/_analysis/coverage-checklist.md
```

仅当该文件不存在时写入初始骨架：

```text
# Coverage Checklist

Completion: incomplete

## 已分析模块

## 进行中模块

## 部分覆盖、未确认和未分析模块

## 下一批 high-signal 文件

## 待业务确认

## 五份文档状态
```

已有 coverage checklist 必须保留，不得由 scaffold 覆盖。这样“尚未开始”和
“已经开始但未完成”都具有明确的文件状态，Agent 只更新该续跑锚点。

### 并发边界

同一文档输出根目录不支持并行运行多个 Batch 进程。静态预检通过并创建文档输出
根目录后，脚本必须用原子 `mkdir` 获取：

```text
<docs-root>/.batch-generate-docs.lock
```

锁目录内记录当前 PID 和启动命令。获取失败时立即退出，不进行 clone、报告写入或
scaffold。正常退出以及 `INT`/`TERM` 时只清理本进程持有的锁。若进程被
`SIGKILL` 或主机异常终止导致锁残留，脚本拒绝自动删除，并提示操作者确认没有
运行中的同目录任务后手动移除。实现不依赖 macOS 默认缺失的 `flock`。

### 长时间运行与中断恢复

Batch 脚本允许顺序处理大量仓库并运行超过 30 分钟，不设置总运行时限。每开始或
结束一个仓库时输出：

- 当前序号和总数。
- repo 名称与当前动作。
- 当前 Done/Cloned/Deferred/Failed 计数。

首次 clone 使用 `source_path` 同级的进程级临时目录，clone 完成后再重命名为
正式目录，避免中断留下“路径存在但不是有效 Git 仓库”的阻塞状态。脚本只能
清理本进程创建的临时目录，不得删除已有仓库目录或用户文件。

报告在长运行过程中写入同目录的进程级临时文件；全部输入处理完成后再原子替换
正式 `batch-report.md`。实时状态通过 stderr 进度日志提供，正式报告始终保持
上一份完整快照或本次完整快照。收到 `INT` 或 `TERM` 时，脚本应：

1. 清理本进程创建的临时 clone 目录和临时报告文件。
2. 保留已经完成的正式 clone、已有文档和最后一次完整报告。
3. 以非零状态退出并输出“再次运行同一命令可继续”的提示。

重新运行时仍按五份文档和 coverage checklist 完成检查判断 `done`。已有有效
clone 可以继续 fetch/update，未完成仓库重新进入 `cloned` 或 `deferred` 判定，
无需额外状态文件。

`--max-repos` 控制的是 Shell 本次准备多少仓库，不代表 Agent 可以在同一模型
窗口深挖多少仓库。为长时间预热 clone，可以省略该参数或指定较大的值；当脚本
执行后立即进入文档生成时，推荐使用 `--max-repos 1`，使本窗口只出现一个新的
深挖候选。

### 长时间运行与中断恢复

Batch 脚本允许顺序处理大量仓库并运行超过 30 分钟，不设置总运行时限。每开始或
结束一个仓库时输出：

- 当前序号和总数。
- repo 名称与当前动作。
- 当前 Done/Cloned/Deferred/Failed 计数。

首次 clone 使用 `source_path` 同级的进程级临时目录，clone 完成后再重命名为
正式目录，避免中断留下“路径存在但不是有效 Git 仓库”的阻塞状态。脚本只能
清理本进程创建的临时目录，不得删除已有仓库目录或用户文件。

报告在长运行过程中写入同目录的进程级临时文件；全部输入处理完成后再原子替换
正式 `batch-report.md`。实时状态通过 stderr 进度日志提供，正式报告始终保持
上一份完整快照或本次完整快照。收到 `INT` 或 `TERM` 时，脚本应：

1. 清理本进程创建的临时 clone 目录和临时报告文件。
2. 保留已经完成的正式 clone、已有文档和最后一次完整报告。
3. 以非零状态退出并输出“再次运行同一命令可继续”的提示。

重新运行时仍按三个核心文档判断 `done`。已有有效 clone 可以继续 fetch/update，
未完成仓库重新进入 `cloned` 或 `deferred` 判定，无需额外状态文件。

### 报告语义

每次执行都覆盖重建 `<docs-root>/batch-report.md`，表格包含本次输入的全部仓库，
并使用：

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
干净校验结果写入该仓文档或最终响应；下一次运行由五份文档和完成声明重新推导
`done`。这避免脚本覆盖报告时丢失人工状态，并使续跑只依赖当前文档事实。

### 执行前预检

删除现有 `--dry-run` 选项。它无法验证 Git 鉴权、网络、分支存在性、磁盘空间或
clone/fetch 成功与否，而长运行脚本已经通过临时 clone、原子报告和可重跑语义
控制失败风险，继续维护预演分支只会扩大实现和测试状态空间。

脚本在任何目录创建、报告写入或 Git 操作前，必须先完成全部静态预检：

- 必填参数和选项值合法。
- `--repos` 文件存在且可读。
- 合并后的仓库列表非空。
- 每个 spec 可推导 URL、可选 branch 和确定性 repo 名称。
- `--max-repos` 未提供或为大于零的十进制整数。
- `git` 命令可用。
- sibling `codebase-explorer-docs/scripts/validate-doc-completion.sh` 存在且可读。

预检成功后、任何文件系统写入或 Git 操作前，脚本必须把解析计划输出到 stderr，
每个仓库一行，至少包含：

```text
Input Spec | Repo Name | Branch | Source Path | Docs Path
```

该输出用于人工核对 URL、重名后缀、分支和目标路径，保留原 dry-run 中真正有价值
的零副作用预览能力。路径在目标根目录尚不存在时允许使用基于当前工作目录的词法
绝对路径，不要求提前创建目录做物理 canonicalize。

静态预检失败时不创建 `--repos-root`、`--docs-root`、每仓目录或报告文件。通过
预检并输出计划后进入正式执行；Git 运行时失败按 `failed` / `--fail-fast` 语义
处理。

## Batch 模型执行规则

Batch skill 必须遵循“执行边界（规范）”，不在本节重复定义单仓会话或上下文
检查点语义。补充规则只有：

1. 先运行编排脚本，从报告中的 `cloned` 仓库选择一个进入当前单仓会话。
2. 根据准备规模选择 `--max-repos`。准备后立即分析时默认使用 `--max-repos 1`；
   仅做长时间 clone 预热时可以使用更大的值或不设上限。
3. 单次未完成全部仓库是正常结果；后续重新运行脚本时，通过五文档完成检查的
   仓库自动成为 `done`，其余继续分批激活。

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
bash -n skills/codebase-doc-skills/codebase-explorer-docs/scripts/validate-doc-completion.sh
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
7. 模拟 `INT`/`TERM` 后不留下临时文件，已有正式 inventory 不被半成品覆盖。
8. 使用足够大的本地 fixture 验证脚本没有固定墙钟 timeout，并能持续输出章节
   进度。
9. 模块候选路径去重稳定，`Module-Candidates-Emitted: N` 与实际输出候选行数一致。

### 完成检查脚本

使用从五份模板生成的临时文档目录验证：

1. 五份文档、全部必填标题、非空正文、有效覆盖矩阵、自检说明和
   `Completion: complete` 均存在时退出 0。
2. 其他规则全部通过但完成声明为 `Completion: incomplete` 时退出非 0，并指出
   是完成声明缺失。
3. 分别删除每个文档、每个必填标题和一个章节正文时退出非 0，并输出具体原因。
4. 只有模板空标题、只有表头或空自检说明时退出非 0。
5. 覆盖状态单元格 trim 后完整等于 `未分析` 时退出非 0；其他单元格或正文中包含
   “未分析”字样时不误伤。
6. 覆盖度自检结果单元格 trim 后完整等于 `是/部分/否` 时退出非 0；合法句子中
   包含常用汉字“是”时不误伤。
7. 矩阵数据行数少于 `Module-Candidates-Emitted` 或任一证据来源单元格为空时退出
   非 0。
8. `未确认`、`部分覆盖` 和 `疑似非业务模块` 有说明时可以通过结构检查。
9. 不适用章节包含“不适用”、判断依据和证据路径时可以通过结构检查。
10. 验证前后文档目录文件系统快照一致，脚本没有写入。
11. 路径包含空格和特殊字符时仍能正确验证。
12. 修改模板标题、矩阵/自检小节名、列名或自检检查项文案后旧文档复检失败，
    并在测试中明确这是验证契约变更。

### Batch 脚本

使用本地临时 Git 仓库作为 clone 源，避免依赖网络：

1. 参数校验覆盖合法与非法 `--max-repos`。
2. 五份文档、必填章节和 `Completion: complete` 均通过时状态为 `done`，且不会
   clone/update。
3. 缺少任一文档、文档为空、章节缺失、表格未填写或完成声明为 incomplete 时仍
   可成为 `cloned`。
4. Batch 通过完成检查脚本判定 `done`，并把失败原因写入 Notes。
5. `cloned` 仓库自动 seed 带 `Completion: incomplete` 和“进行中模块”章节的
   coverage checklist，已有 checklist 不被覆盖。
6. 静态预检成功后、写盘前，stderr 输出全部解析后的 repo 名、branch、source path
   和 docs path。
7. `--max-repos 1` 只激活第一个未完成仓库，其余为 `deferred`。
8. `done` 不占用激活配额。
9. 重名仓库的 `done` 判断使用去重后的目录名。
10. 报告包含全部输入仓库，但待办清单只包含 `cloned`。
11. Summary 的 Total/Done/Cloned/Deferred/Failed 与表格一致。
12. 第二次运行能把通过完整五文档检查的仓库识别为 `done`。
13. 静态预检失败时文件系统快照一致，不创建目录或覆盖已有报告。
14. 帮助文本和参数解析均不再接受 `--dry-run`。
15. clone 失败仍按 `--fail-fast` 语义处理，并保留已生成的报告快照。
16. 本次 failed 尝试消耗激活配额；历史 failed 仓库下次运行重新消耗配额并执行
    clone/update。
17. 同一文档输出根目录的第二个并发进程因锁存在而退出，不覆盖报告；正常退出和
    `INT`/`TERM` 会清理本进程锁。
18. `set -u` 下空数组、空分支和重复仓库名不报未绑定变量。
19. 模拟首次 clone 被 `INT`/`TERM` 中断，正式 source path 不出现残缺仓库，
    本进程临时目录被清理。
20. 模拟长列表运行，确认每仓均有进度输出，脚本没有总运行时限，重新运行可继续
    处理。

### 单仓会话边界

通过 skill 文本场景检查确认：

1. 报告中有多个 `cloned` 仓库时，当前单仓会话只选择一个进入深挖。
2. 当前 repo 提前完成时，当前单仓会话仍不开始第二个 repo。
3. 平台提示 context 压力或发生上下文压缩时，Agent 立即按规范执行上下文检查点
   并结束。
4. 下一次单仓会话优先续跑未完成 repo，并依据 coverage checklist 的“进行中
   模块”和“下一批文件”从被卡住处继续，而不是跳到新 repo 或重头分析。
5. Agent 不声称自己精确知道已运行分钟数或累计 API 请求数。
6. Shell 运行超过 30 分钟不会被误判为违反模型请求预算。

### 最终回归

只运行与本变更相关的脚本测试和语法检查。若仓库没有现成 Shell 测试框架，
新增一个自包含 Bash 回归脚本，使用临时目录、退出码和文本断言验证上述行为，
不引入测试依赖。最后运行 `git status --short`，确认测试没有修改 fixture 源码
或其他仓库文件。

## 验收标准

1. 单仓探索先通过有界盘点建立地图，再读取 high-signal 文件。
2. 盘点、中间笔记和最终文档均遵守文档输出目录边界。
3. Budget-Aware Execution Mode 通过同 turn 并行批量减少请求，通过上下文检查点
   控制上下文增长，不再鼓励逐文件多轮读取。
4. 预算不足时保留续跑锚点并诚实标注覆盖不足。
5. Batch 可通过 `--max-repos` 控制每次激活数量。
6. 五份模板文档、必填结构和 `Completion: complete` 全部通过是唯一 `done`
   判定。
7. `batch-report.md` 是可由当前文件系统重建的完整运行快照。
8. `--dry-run` 已删除；静态预检失败时不产生文件系统写入。
9. 大批量工作可跨多次运行累计完成，不依赖外部 Agent CLI。
10. 源码仓在盘点、文档生成和验证后保持未修改。
11. 确定性 Shell 脚本可运行超过 30 分钟，有进度输出，并能从中断后安全重跑。
12. 每个单仓会话只深挖一个 repo，并在上下文检查点保存“进行中模块”和下一批
    文件，使后续会话从被卡住处继续。
