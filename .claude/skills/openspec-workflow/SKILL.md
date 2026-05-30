---
name: openspec-workflow
description: 按团队 SDD 约定预填 OpenSpec 变更目录（proposal、specs、design、tasks），用于设计到代码的功能
---

## 何时使用

在启动遵循团队 SDD+TDD 企业 SOP 的新组件或功能时使用：
- 用户说「新建组件」「新功能 spec」「搭建变更」
- 任何实现工作开始之前
- 设计稿（Figma/MasterGo）已就绪、需要进入编码阶段时

## 何时不使用

- 缺陷修复或小补丁（直接使用 OpenSpec：`/opsx:propose`）
- 尚无设计稿时（先做设计）
- 无 UI 组件的后端专属变更

## 指令

在 `openspec/changes/<name>/` 搭建 OpenSpec 变更目录，并按团队约定预填以下文件：

### 1. 收集上下文（未提供则询问）
- 组件名（kebab-case）
- 设计工具链接（Figma / MasterGo URL）
- 组件功能的简要说明

### 2. 创建目录结构

```
openspec/changes/<component-name>/
  proposal.md
  specs/
    requirements.md
    scenarios.md
  design.md
  tasks.md
```

### 3. proposal.md 模板

```markdown
# <ComponentName>

## Why
[该组件解决什么问题？如有 PRD/工单请附链接。]

## What's Changing
[引入哪些新组件或行为？]

## Out of Scope
[明确列出本变更不包含的内容。]

## Design Reference
[Figma/MasterGo 链接]

## Success Criteria
- [ ] specs/scenarios.md 中全部场景通过设计师视觉评审
- [ ] 全部单元测试通过
- [ ] Storybook stories 覆盖全部 variant × state
- [ ] axe 无障碍审计通过
```

### 4. specs/requirements.md 模板

```markdown
# Requirements: <ComponentName>

## Component API
```typescript
// 在此填写 TypeScript interface
export interface <ComponentName>Props {
  // variants, states, callbacks
}
```

## Variants
| Variant | Description |
|---------|-------------|
| default | ... |

## States
| State | Trigger | Visual |
|-------|---------|--------|
| default | - | ... |
| loading | onClick called | spinner visible, click disabled |
| disabled | disabled prop | reduced opacity, no interaction |
| error | API error | error message visible |

## Design Tokens
[列出本组件使用的设计系统 token]
```

### 5. specs/scenarios.md 模板

```markdown
# Scenarios: <ComponentName>

## Happy Path
- [ ] Renders in default state
- [ ] [primary interaction] works as expected
- [ ] Displays success state after [action]

## Error Cases
- [ ] Shows error state when API fails
- [ ] [edge case 1]

## Accessibility
- [ ] Keyboard navigable
- [ ] Screen reader announces state changes
- [ ] Focus management correct after [interaction]
```

### 6. design.md 模板

```markdown
# Technical Design: <ComponentName>

## Component Architecture
[Hooks-based functional component / Class component]

## State Machine
```
IDLE → [action] → LOADING → SUCCESS
                          ↘ ERROR → IDLE
```

## Data Flow
[数据如何流入、流出该组件？]

## CSS Strategy
[CSS Modules / Tailwind / styled-components — 及选型理由]

## Dependencies
[列出需要新增的 npm 包]

## Open Questions
- [ ] [未决的技术决策]
```

### 7. tasks.md 模板

```markdown
# Tasks: <ComponentName>

## Phase 1: Spec & Interface
- [ ] 1.1 在 specs/requirements.md 中定义 TypeScript interface
- [ ] 1.2 创建 Storybook stories 骨架（全部 variant × state）
- [ ] 1.3 与技术负责人进行 interface 评审

## Phase 2: Tests (TDD — 先写测试再实现)
- [ ] 2.1 编写行为单元测试（全部失败）
- [ ] 2.2 编写视觉快照基线
- [ ] 2.3 编写主用户流的集成测试
- [ ] 2.4 测试评审

## Phase 3: Implementation
- [ ] 3.1 从设计工具生成组件骨架
- [ ] 3.2 实现组件逻辑（测试变绿）
- [ ] 3.3 实现 CSS / 样式
- [ ] 3.4 对接真实 API / 数据

## Phase 4: Review & Ship
- [ ] 4.1 Code review
- [ ] 4.2 与设计师进行视觉评审（Chromatic）
- [ ] 4.3 无障碍审计
- [ ] 4.4 产品验收
- [ ] 4.5 /opsx:archive
```

### 8. 确认输出

创建文件后打印：

```
✅ Scaffolded: openspec/changes/<name>/
   ├── proposal.md
   ├── specs/requirements.md
   ├── specs/scenarios.md
   ├── design.md
   └── tasks.md

Next step: fill in the TypeScript interface in specs/requirements.md,
then run /opsx:apply to start implementation.
```
