# <能力名称> — modify-<组件名称> 的增量规格

<!--
本模板用于「改造既有组件」场景（步骤 6.5 判定为 MODIFIED）。
若是首次新建组件，使用 `templates/spec.md`（仅 ## ADDED Requirements）。

写 Scenario 之前先读 references/scenario-writing-guide.md。
状态覆盖硬规则同样适用：notes.md 状态表里每个 `required: true` 状态都要在本文件中找到对应 Scenario。
-->

> **引用既有 spec**：`<openspec/specs/<capability>/spec.md 或 design-spec/<component>/specs/<capability>/spec.md>`
> **改动原因**：<1-2 句描述变更动机，对应设计稿 diff 的核心>
> **影响面**：<受影响的调用方、需要迁移的页面、用户感知差异>

## MODIFIED Requirements

> **MODIFIED 块的硬规则**：`### Requirement:` 后的标题必须**逐字**与既有 spec 一致，否则验证器会判为新增。SHALL 子句和 Scenario 集合可以变。

### Requirement: <既有需求标题，逐字保留>

The system SHALL <修改后的主干行为>.

> **变更点**：<和原文对比，描述 SHALL 子句新增 / 修改 / 移除了什么；可选，强烈推荐写以便人类审阅>

#### Scenario: <受影响的核心 Scenario — 标题与原文保持一致>

- WHEN <可能更新的触发器>
- THEN <可能更新的可断言产物>

#### Scenario: <新增的边界 Scenario — 标题新写>

- WHEN <非-happy-path 触发器>
- THEN <可断言产物>

## ADDED Requirements

> 仅当本次变更引入**全新行为**（既有 spec 中不存在的能力）时才出现此块。否则删除整段。

### Requirement: <全新需求 — 名词形式>

The system SHALL ...

#### Scenario: <核心>

- WHEN ...
- THEN ...

#### Scenario: <边界 / 异常 — 至少一个>

- WHEN ...
- THEN ...

## REMOVED Requirements

> 仅当本次变更**删除**既有需求时才出现此块。否则删除整段。

### Requirement: <被删除的既有需求标题，逐字保留>

Reason: <为什么删除：能力下线、合并到其他需求、设计变更等>
Migration: <调用方需要做什么；如不需要写「无」>
