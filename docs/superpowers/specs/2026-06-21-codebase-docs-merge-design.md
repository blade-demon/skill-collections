# codebase-docs 合并重构设计

> 状态：待评审（PENDING）。前置条件 #105 已合入 master（`73dd094`）。
> 本文是动手前的可评审方案，评审通过后按"执行计划"分步实施，单独 PR、TDD 推进。

## 背景与动机

当前 `skills/codebase-doc-skills/` 不是一个符合仓库约定的独立 skill，更像一个
未正式化的 bundle。复盘确认四个**已核实**的问题（非主观判断）：

1. **目录违反仓库契约。** README 要求 `skills/<skill-name>/SKILL.md`
   （`README.md:42`），CONTRIBUTING 要求"每个 skill 自包含、可单独复制"
   （`CONTRIBUTING.md:40`）。当前根目录 `skills/codebase-doc-skills/` 没有
   SKILL.md，两个真 skill 又多嵌一层（`codebase-explorer-docs/SKILL.md`、
   `batch-codebase-doc-generator/SKILL.md`），只扫描 `skills/*/SKILL.md` 的工具会漏掉。

2. **两个 skill 并非真正独立（跨 skill 硬依赖）。** batch 的两个脚本用
   `$SCRIPT_DIR/../..` 硬拼兄弟 skill 的 validator：
   - `batch-codebase-doc-generator/scripts/batch-generate-docs.sh:31-32`
   - `batch-codebase-doc-generator/scripts/publish-docs.sh:26-27`

   这直接违反 CONTRIBUTING「除非通过共享 package，否则避免跨 skill 依赖」。
   batch 无法脱离 explorer 单独复制。

3. **六文档集合散落多处硬编码，已造成回归。** 文档清单在 validator、batch 脚本、
   两个 SKILL.md、README、SUMMARY、prompt 多处各写一份。#105 前两个 prompt 还停在
   五份、漏 `architecture.md`（已在 `6d5a211` 修复）。根因是契约分散，不是个别笔误。

4. **测试集中、publish 无行为覆盖。** `tests/test-runtime-budget.sh` 单文件
   约 549 行，同时测 inventory / validator / batch / 契约；而真正会 git
   branch/commit/push 的 `publish-docs.sh` 全仓只有一处
   `assert_contains "...SKILL.md" "publish-docs.sh"`，零行为测试。

## 目标

1. 让该能力成为**一个**符合仓库约定的独立 skill：`skills/codebase-docs/SKILL.md`。
2. 消除跨 skill 路径依赖，所有脚本同处一个 `scripts/`，不再有 `../..`。
3. 单仓 / 多仓由**一个 description**做 mode 分流，不再互相抢触发。
4. 六文档集合**数据化**：以 `templates/documents/*.md` 为唯一权威，脚本动态读目录，
   消除散落硬编码这一类回归。
5. SKILL.md 正文压到 200–300 行，细节进 `references/`。
6. 补齐 `publish-docs.sh` 的行为测试，测试拆分为聚焦的多个文件 + 一个 runner。
7. 全程不引入 Node.js / `jq` / 外部 Agent CLI，沿用既有 Bash 3.2 兼容约束。

## 非目标

1. 不改变核心运行模型（inventory-first、单仓会话边界、context checkpoint、
   verify→supplement 内循环、opt-in publish 人工关口）。这些在 #103/#104/#105
   已定型，本次只搬家 + 解耦 + 数据化，不重设计行为。
2. 不改六文档的内容契约（H1/H2 小节名、矩阵列名、自检项标签）——它们是已生成
   文档的兼容契约，改动即破坏旧产物。
3. 不做跨仓系统分析（保持默认关闭）。
4. 不跑触发 eval（沿用当前约定；未来 eval 的 near-miss 用例见记忆备忘）。

## 目标结构

```
skills/codebase-docs/
├── SKILL.md                      # 触发 + mode 选择 + 安全边界（200–300 行）
├── README.md                     # 含"前身为 codebase-doc-skills"的迁移说明
├── START_PROMPT.md               # 唯一 prompt：薄，说明 single/batch 两种启动 + 传参
├── templates/
│   ├── documents/                # 六份文档模板 = 唯一权威，脚本动态列目录
│   │   ├── project-overview.md
│   │   ├── module-analysis.md
│   │   ├── onboarding-guide.md
│   │   ├── api-and-data-flow.md
│   │   ├── business-flow-summary.md
│   │   └── architecture.md
│   ├── coverage-checklist.md     # 续跑锚点模板，脚本读取而非内嵌 heredoc
│   └── repos.example.txt         # 多仓输入示例（非 prompt）
├── references/
│   ├── single-repo.md            # 单仓工作流 + document-spec（原 document-spec.md 内容）
│   └── batch.md                  # 多仓编排 + 状态机 + publish 细节
├── scripts/
│   ├── repo-inventory.sh
│   ├── validate-doc-completion.sh
│   ├── batch-generate-docs.sh    # 同目录引用 validator，无 ../..
│   └── publish-docs.sh           # 同目录引用 validator，无 ../..
└── tests/
    ├── lib.sh                    # 共享 helper（assert_*、make_valid_docs 等）
    ├── test-inventory.sh
    ├── test-validator.sh
    ├── test-batch.sh
    ├── test-publish.sh           # 新增：真跑 publish 打 temp git docs-root
    ├── test-contracts.sh
    └── run.sh                    # 顺序跑全部
```

## 关键设计决策

### D1. 合并为单 skill，而非 plugin bundle 或平铺

batch 是 single 的**超集**：它是编排（clone / 状态 / 报告 / 循环）包住单仓那段
body。两者不是平级竞争能力，而是一个套着另一个——这是"一个 skill + mode 分流"
的标准场景。共享物（validator、模板、checklist 模板）逻辑上只能有一份权威副本；
拆成两个 skill 必然产生第二个家 + 固定兄弟路径，正是回归成因。

合规出口"通过共享 package"不适用：共享依赖是 Bash 脚本 + Markdown 模板，包成
package 很别扭。因此 **co-location（合一）优于抽 package，优于 plugin bundle，
优于平铺**。

### D2. 单 description 做 mode 分流

合并后 SKILL.md 用一个 description 同时覆盖单仓与多仓触发，正文用一小节
"Mode 选择"判定：

- 输入是单个仓库 / 当前工作目录 → **single mode**：直接进 `references/single-repo.md`
  的工作流，跑 `repo-inventory.sh` → 生成六文档 → 校验。
- 输入是多个 repo URL / repos 文件 + docs-root → **batch mode**：先跑
  `batch-generate-docs.sh`，按 `batch-report.md` 选一个 `cloned` 仓库，再以 single
  mode 处理它；后续会话续跑。

消除了原来两个 description 互相抢触发的问题。

### D3. 六文档集合数据化（消除散落硬编码）

`templates/documents/` 的文件列表是**唯一权威**：

- `validate-doc-completion.sh` 不再用硬编码的文档名清单，而是列
  `templates/documents/*.md` 推导"必需文档集合 + 各自模板"。
- batch 的 `done` 判定继续**委托 validator**（不自己列文档名），保持单一真相源。
- SKILL.md / README / prompt 不再逐个列文档名，改为引用"`templates/documents/`
  下的全部文档"，必要处仅给一句话概览表。

收益（**有边界**）：加一份**普通 H1/H2 结构**的新文档 = 往 `templates/documents/`
丢一个模板文件，零处改脚本——数据化覆盖的是"文档是否存在 + H1/H2 小节是否齐全且
非空"这类通用校验。但若新文档需要**专属语义校验**（如 `architecture.md` 的
≥2 Mermaid + ≥2 `%% Evidence:`、`module-analysis.md` 的矩阵列名/自检项标签），这些
仍是 validator 里按文档名硬编码的专项规则，**仍需扩展 validator**。数据化降低的是
"文档集合"的维护成本，不消除专项语义规则。

batch 的 `done` 判定纯委托 validator，无独立文档名硬编码（已确认）；A1 仅需把脚本/
报告里"六文档 / six-document"等含数量的提示文本改为通用表述。

### D4. coverage-checklist 由模板生成

当前 batch 脚本用 heredoc 内嵌 checklist 结构。改为读取
`templates/coverage-checklist.md`，scaffold 时复制（仅当目标不存在时，绝不覆盖
已有 checklist——它是续跑锚点）。脚本与模板各一份，不再双写。

### D5. validator 同目录引用，删除 `../..`

`batch-generate-docs.sh` 与 `publish-docs.sh` 改为
`VALIDATOR="$SCRIPT_DIR/validate-doc-completion.sh"`，跨 skill 依赖归零。

### D6. 契约保持策略（最重要的安全前提）

`validate-doc-completion.sh` 的契约来自 `templates/` 目录 + 脚本内硬编码的 awk
小节名/列名，**与 SKILL.md 无关**。因此：

- 搬动 SKILL.md / references 正文**不影响**校验。
- 六文档的 H1/H2、矩阵列名（模块/路径/入口文件/主要职责/相关 API/Service/
  关键数据流/Gotcha/覆盖状态/证据来源）、自检项标签、`Completion: complete`
  声明、`architecture.md` 的 ≥2 Mermaid + ≥2 `%% Evidence:` ——全部**逐字保留**。
- 文档模板放在 `templates/documents/*.md` 子目录（Phase A1 即在旧 explorer 内建立
  该子目录并移入六份模板），校验器的文档枚举只针对该子目录，内容不变。
  `coverage-checklist.md`、`repos.example.txt` 等非文档模板**不在** `documents/` 内，
  天然不会被误判为最终文档。

### D7. 只保留一个薄 START_PROMPT.md

原结构有 `START_PROMPT.md` + `templates/single-repo-prompt.md`（+ batch 侧又一份）。
这些 prompt **没有脚本消费者**，是给人/Agent 复制粘贴的启动语。合并 mode 后，单仓
prompt 就是同一 skill 的 single mode，无需独立文件。因此：

- 只保留**一个** `START_PROMPT.md`，薄，说明 single 与 batch 两种启动方式与传参，
  不复制文档清单（清单由 `templates/documents/` 数据化提供）。
- 删除 `single-repo-prompt.md` / `batch-prompt.md`。
- `repos.example.txt` 保留——它是真实的多仓输入示例，不是 prompt。

这同时修掉草案里"结构把 prompt 放 `templates/`、测试却引用 `prompts/`"的不一致。

## 迁移与破坏性变更

- 这是**破坏性重命名**：`skills/codebase-doc-skills/`（双层）→ `skills/codebase-docs/`
  （单层），旧目录删除。此 repo 尚早、该 skill 仅 #100–#105 引入，可接受。
- 旧目录删除后无法在原地留 tombstone；迁移说明放在**新 README 顶部一行**
  （"本 skill 前身为 `codebase-doc-skills` 的 explorer + batch 双目录，已合并"）
  - 写进重构 PR 描述。git 历史保留旧路径。
- **已决定不做兼容垫片**，直接删除旧目录。外部若有旧路径引用，依赖 git 历史 + 新
  README 迁移说明自行更新。

## 测试计划

### 迁移既有覆盖（red→green）

把 `test-runtime-budget.sh` 的现有断言拆进聚焦文件，路径指向新结构。共享 helper
（`assert_contains` / `run_expect_failure` / `make_valid_docs` / `write_valid_*`）
进 `tests/lib.sh`。契约断言更新为新路径：单 SKILL.md、`references/single-repo.md`、
`references/batch.md`、`templates/documents/`、单 `START_PROMPT.md`、单 description
含 single+batch 触发语。

### 新增 test-publish.sh（当前盲区）

在临时目录 `git init` 一个 docs-root，用 `make_valid_docs` 造一个 `done` 仓库的
文档。覆盖两条路径，全程离线、不访问真实 GitHub：

1. **plan-only（不带 `--yes`）**：断言建了 publish 分支、做了本地 commit、打印了将
   执行的 `git push` / `gh pr create` 计划、**没有真正 push**。
2. **`--yes`**：用一个本地 **bare git repo 作 origin remote**（push 可离线成功）+
   PATH 中放一个**假 `gh`**（记录入参、返回成功）。测试内**配置 Git identity**
   （`git config user.name/user.email`，避免 commit 因缺身份失败）。断言：
   - 分支被真实 push 到 bare remote——直接检查 **bare repo 中出现目标 branch ref**
     （`git -C <bare> rev-parse --verify refs/heads/<branch>` 成功）；
   - 假 gh 收到的 `pr create` 参数正确（如 `--fill` / `--base`）。
3. 断言只对通过 validator 的 `done` 仓库发布；未完成仓库被跳过并提示。
4. 断言 `.publish-docs.lock` 行为。

全程离线、不访问真实 GitHub。所有临时 bare remote / 假 gh / docs-root 都在
`mktemp -d` 下，测试退出时清理。

### 数据化回归测试（隔离工作区）

**不修改工作区 tracked 的 `templates/documents/`**（异常退出会留脏文件）。改为：把
`scripts/validate-doc-completion.sh` + `templates/` 复制到 `mktemp -d` 的临时 skill
root，在那里加一份临时第 7 份文档模板，断言 validator 自动把它纳入必需集合（证明
数据化生效）；测试退出清理临时目录，工作区零改动。

### 运行入口

`tests/run.sh` 顺序执行全部，保留单文件可单独运行。`bash -n` 覆盖四个脚本。

## 执行计划（一个重构 PR：Phase A 3 个独立 commit + Phase B 1 个原子 commit）

这是**单独一个** PR（分支 `refactor/codebase-docs-merge`，off 最新 master），内部
含 4 个 commit：Phase A 的 3 个独立 commit + Phase B 的 1 个原子 commit。不是 4 个 PR。

**核心原则：不产生任何"新旧 skill 并存"或"旧 skill 半破"的中间提交。** 所有能在
旧结构内完成的改动先就地做完（旧 skill 全程有效、测试绿）；新结构只在一个原子提交
里出现，且同一提交删除旧目录。

### Phase A — 旧结构内就地完成（3 个独立 commit，旧 skill 始终可用）

A1. **文档集合数据化（D3）**：**立即在旧 explorer 内建立
`codebase-explorer-docs/templates/documents/`，把六份文档模板移入**，validator
改为只枚举该子目录推导必需集合（**不**枚举扁平 `templates/*.md`——否则 A2 加入的
checklist 会被误判为最终文档）。先写**隔离的**数据化回归测试（temp skill root，
见测试计划）red，再改 validator green。batch 完成判定**确认纯委托 validator**，判定
逻辑无需改；但脚本/报告里残留的"六文档 / six-document"提示文本要改成**不含数量
的通用表述**（如"全部模板文档 / all template documents"），避免第七份文档加入后
文案过期。

A2. **checklist 模板化（D4）**：把 checklist 模板放在
`batch-codebase-doc-generator/templates/coverage-checklist.md`（Phase A 暂置于 batch
skill 内，Phase B 再随迁移移入新 skill 根的 `templates/`），batch 脚本改为读取它
（仅当目标不存在时复制，绝不覆盖续跑锚点），移除内嵌 heredoc。

A3. **测试结构化**：抽 `tests/lib.sh`（共享 helper），把
`test-runtime-budget.sh` 拆成 `test-{inventory,validator,batch}.sh` + `run.sh`
（仍指向旧路径）；新增 `test-publish.sh`（plan-only + `--yes`，补当前盲区）。
契约断言此时仍引用旧双 SKILL.md 路径。

### Phase B — 一个原子提交完成迁移（D1/D2/D5/D7）

- `git mv` 脚本 / 模板 / references / tests 到 `skills/codebase-docs/`：explorer 的
  `templates/documents/`（A1 已建）整体移入；batch 的
  `templates/coverage-checklist.md` 移入新 skill 根的 `templates/`；
  `repos.example.txt` 一并移入 `templates/`；
- 合并双 SKILL.md → 一个：单 description + "Mode 选择"小节，正文 200–300 行，细节进
  `references/single-repo.md`（并入原 `document-spec.md`）+ `references/batch.md`；
- **D5**：validator 改 `$SCRIPT_DIR/validate-doc-completion.sh`，删除 `../..`；
- **D7**：留一个薄 `START_PROMPT.md`，删 `single-repo-prompt.md` / `batch-prompt.md`；
- 更新全部测试契约断言到新单 skill 路径；数据化测试的临时 skill root 改拷新结构；
- 删旧 `skills/codebase-doc-skills/`，新 `README.md` 顶部加前身迁移说明；
- 全量 `run.sh` + 四脚本 `bash -n` + pre-commit/pre-push 全绿后开 PR。

Phase A 三个 commit 可独立 review；Phase B 是一次性 `git mv` + SKILL 合并，diff 大但
以机械移动为主，配合 spec 易于核对。

## 风险与缓解

| 风险                                                    | 缓解                                                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 逐字契约在搬家中被破坏（H1/H2、列名、自检项）           | 契约只在 `templates/` + validator awk；模板内容整体平移不编辑；迁移后跑全量校验测试                                         |
| 破坏性重命名影响外部引用                                | 已定直接删除、不留垫片；新 README + PR 描述写明迁移；git 历史保留旧路径                                                     |
| 数据化改动误判必需集合（如把 example/checklist 当文档） | 文档集合严格限定 `templates/documents/` 子目录，checklist/repos.example 不在其中                                            |
| Phase B 原子提交 diff 大、难 review                     | Phase A 三 commit 独立可跑测试先行；Phase B 以 `git mv` + SKILL 合并为主，行为改动已在 Phase A 落地并测过，B 主要是位置变更 |
| 中间提交出现新旧并存 / 旧 skill 半破                    | 行为改动全在旧结构内完成；新结构只在 Phase B 单一原子提交出现并同步删旧目录                                                 |
| Bash 3.2 兼容（macOS）回归                              | 沿用现有约束，不引入 `mapfile`/关联数组等；`bash -n` + 测试在 darwin 跑                                                     |

## 决策记录（开放问题已确认）

1. **新 skill 名**：`codebase-docs`。✅ 已定
2. **旧路径兼容**：直接删除旧目录，不做兼容垫片。✅ 已定
3. **SKILL.md 行数目标** 200–300：**软目标**。合并后契约偏大，超出可接受，只要正文
   保持精炼、细节进 references 即可，不为压行损可读性。✅ 已定
4. **SUMMARY.md 去留**：把 `SUMMARY.md` 高层概览并入新 `README.md`，**并入后删除
   `SUMMARY.md`**（单 skill 按仓库约定用 README）。✅ 已定
