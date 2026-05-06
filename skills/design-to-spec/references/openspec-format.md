# OpenSpec 格式参考

生成 OpenSpec 有效 markdown 的紧凑参考。在步骤 7 中阅读。本技能只生成 `spec.md`（变更增量）——proposal / tasks / design 属于 OpenSpec 上游项目的可选附加文档，由人类或下游工具处理，不在本技能范围内。

## 项目布局（OpenSpec 期望的内容）

```
openspec/
├── project.md                         # 项目范围的约定
├── specs/                             # 活动规格（真相来源）
│   └── <capability>/
│       └── spec.md
└── changes/                           # 待处理的提案
    └── <change-name>/                 # 例如 add-today-windvane
        └── specs/
            └── <capability>/
                └── spec.md            # 针对 specs/<capability>/spec.md 的增量 ← 本技能生成此文件
```

当变更被归档时，它移动到 `openspec/changes/archive/<date>-<change-name>/`。

## spec.md（行为契约）

规格文件位于 `openspec/specs/<capability>/spec.md`。它们是系统行为的**真相来源**。使用此确切结构：

```markdown
# <能力名称> 规格

## 目的

1-2 句话描述此能力负责的内容。

## 需求

### Requirement: <需求名称，名词形式>

The system SHALL ... （规则的简短陈述，祈使语气）

#### Scenario: <场景名称>

- WHEN <触发条件>
- THEN <可观察结果>
- AND <额外结果，如果有需要>

#### Scenario: <另一个场景>

- WHEN ...
- THEN ...

### Requirement: <下一个需求>

...
```

**标题级别规则（由 OpenSpec 验证器强制执行）：**

- `## Requirements` — H2
- `### Requirement:` — H3
- `#### Scenario:` — H4

**每个需求至少需要一个场景。**没有场景的需求是不可测试的，因此验证器会拒绝它。

## 变更增量（变更目录内的 spec.md）

增量规格位于 `openspec/changes/<change-name>/specs/<capability>/spec.md`。它描述了位于 `openspec/specs/<capability>/spec.md` 的活动规格将如何更改。

结构：

```markdown
# <能力名称> — <change-name> 的增量

## ADDED Requirements

### Requirement: <新需求>

The system SHALL ...

#### Scenario: <新场景>

- WHEN ...
- THEN ...

## MODIFIED Requirements

### Requirement: <现有需求名称>

The system SHALL ... （需求的新形式）

#### Scenario: <场景>

- WHEN ...
- THEN ...

## REMOVED Requirements

### Requirement: <将被移除的需求>

Reason: ...
```

对于全新能力（没有现有规格），只出现 `## ADDED Requirements`，增量实际上就是完整的初始规格。这是 `design-to-spec` 输出的常见情况，因为 UI 组件通常是新能力。

## 常见错误

- 使用 `#### When` / `#### Then` 而不是项目符号形式 `- WHEN` / `- THEN`。项目符号形式是 OpenSpec 解析的内容。
- 在 `## Requirements` H2 下直接放置场景项目符号而没有 `### Requirement:` 包装器。场景必须属于命名需求。
- 以将来时态编写需求（「将支持」）而不是祈使语气（「SHALL 支持」）。只有祈使语气记录规范性契约。
- 把 `### Requirement:` 翻译成 `### 需求：`。严格的 OpenSpec 验证器认英文关键字，请保留英文。

## 验证提示

如果用户安装了 OpenSpec，可以建议他们在技能完成写入后运行 `openspec validate`。验证器捕获标题级别不匹配、缺失场景和格式错误，否则这些很容易被忽略。

## ADDED / MODIFIED / REMOVED 的判定规则

`design-to-spec` 步骤 6.5 已经做过"新建 vs 改造"分支判定，本节给出**单个 Requirement 块**该归入哪一类的细则。

| 类别       | 判定                                                                | 关键约束                                                                                  |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ADDED    | 既有 spec 中没有同名 Requirement；或本次变更引入全新能力                              | Requirement 标题可自由命名                                                                   |
| MODIFIED | 既有 spec 中存在同名 Requirement，本次变更改动了 SHALL 子句、Scenario 集合或断言细节         | **标题必须逐字与原 spec 一致**；改写标题会被验证器视为新增 + 旧 Requirement 残留 |
| REMOVED  | 本次变更删除某个既有需求                                                       | 必须给出 `Reason:` 和 `Migration:`（无迁移成本时写「无」）                                              |

一次变更可同时含三种块。**在 `spec-modified.md` 中按 `MODIFIED → ADDED → REMOVED` 顺序排列**，便于人类审阅时按"先变更、再新增、最后下线"的认知顺序读完。

**易踩的两个坑**：

1. **改了标题忘了同步既有 spec** —— 视觉上看像 MODIFIED 但验证器判 ADDED + 旧 Requirement 仍存在 → 出现两条互相矛盾的需求。修复：保留原标题，只在 SHALL 子句和 Scenario 中体现变更。
2. **MODIFIED 块漏写状态覆盖** —— 既有 spec 有 4 个 Scenario，本次变更只列了 2 个被改的，验证可能不报错但实际把另外 2 个 Scenario "悄悄删了"。修复：MODIFIED 块下要列出**变更后该 Requirement 的完整 Scenario 集合**，未变化的 Scenario 也要原样复制过来。
