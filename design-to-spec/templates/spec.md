# <能力名称> — add-<组件名称> 的增量规格

<!--
写 Scenario 之前先读 references/scenario-writing-guide.md。
每个 Requirement 配 2–4 个 Scenario，其中至少一个覆盖非-happy-path（零值、极值、缺字段、异常输入）。
WHEN 用具体触发器（用户动作、数据形状），THEN 用可断言的产物（事件 detail、DOM 节点、textContent、属性值）。
不要写「正确渲染」「优雅显示」这类形容词，不要把 CSS 属性（text-overflow: ellipsis）当 Scenario。
-->

## ADDED Requirements

### Requirement: <第一个需求 — 名词形式>

The system SHALL <一句话描述主干行为，happy path 直接隐含在这里>.

#### Scenario: <核心行为 — 名词形式>

- WHEN <具体触发器：用户动作 / 数据形状 / 生命周期事件>
- THEN <可断言的产物：事件 detail、DOM 节点、textContent、属性值>

#### Scenario: <边界 / 异常 — 至少一个>

- WHEN <零值 / 极值 / 缺字段 / 异常输入>
- THEN <可断言的产物>

### Requirement: <下一个需求>

The system SHALL ...

#### Scenario: ...

- WHEN ...
- THEN ...
