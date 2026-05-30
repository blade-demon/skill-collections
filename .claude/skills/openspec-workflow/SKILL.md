---
name: openspec-workflow
description: Scaffold an OpenSpec change folder (proposal, specs, design, tasks) pre-filled with team SDD conventions for design-to-code features
---

## When to Use

Use when starting a new component or feature that follows the team's SDD+TDD enterprise SOP:
- User says "start a new component", "new feature spec", "scaffold a change"
- Before any implementation work begins
- When a Figma/MasterGo design is ready and needs to move to code

## When NOT to Use

- For bug fixes or small patches (use OpenSpec directly: `/opsx:propose`)
- When no design exists yet (do design first)
- For backend-only changes with no UI component

## Instructions

Scaffold an OpenSpec change folder at `openspec/changes/<name>/` with the following files pre-filled using team conventions:

### 1. Gather context (ask if not provided)
- Component name (kebab-case)
- Design tool link (Figma / MasterGo URL)
- Brief description of what the component does

### 2. Create folder structure

```
openspec/changes/<component-name>/
  proposal.md
  specs/
    requirements.md
    scenarios.md
  design.md
  tasks.md
```

### 3. proposal.md template

```markdown
# <ComponentName>

## Why
[What problem does this component solve? Link to PRD/ticket if available.]

## What's Changing
[What new component or behavior is being introduced?]

## Out of Scope
[Explicitly list what this change does NOT include.]

## Design Reference
[Figma/MasterGo link]

## Success Criteria
- [ ] All scenarios in specs/scenarios.md pass visual review with designer
- [ ] All unit tests green
- [ ] Storybook stories cover all variants × states
- [ ] axe accessibility audit passes
```

### 4. specs/requirements.md template

```markdown
# Requirements: <ComponentName>

## Component API
```typescript
// Fill in TypeScript interface here
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
[List which tokens from the design system this component uses]
```

### 5. specs/scenarios.md template

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

### 6. design.md template

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
[How does data flow into and out of this component?]

## CSS Strategy
[CSS Modules / Tailwind / styled-components — and why]

## Dependencies
[List any new npm packages needed]

## Open Questions
- [ ] [Any unresolved technical decisions]
```

### 7. tasks.md template

```markdown
# Tasks: <ComponentName>

## Phase 1: Spec & Interface
- [ ] 1.1 Define TypeScript interface in specs/requirements.md
- [ ] 1.2 Create Storybook stories skeleton (all variants × states)
- [ ] 1.3 Interface review with Tech Lead

## Phase 2: Tests (TDD — write before implementing)
- [ ] 2.1 Write behavior unit tests (all failing)
- [ ] 2.2 Write visual snapshot baseline
- [ ] 2.3 Write integration test for primary user flow
- [ ] 2.4 Test review

## Phase 3: Implementation
- [ ] 3.1 Generate component skeleton from design tool
- [ ] 3.2 Implement component logic (tests → green)
- [ ] 3.3 Implement CSS / styles
- [ ] 3.4 Wire up to real API / data

## Phase 4: Review & Ship
- [ ] 4.1 Code review
- [ ] 4.2 Visual review with designer (Chromatic)
- [ ] 4.3 Accessibility audit
- [ ] 4.4 Product acceptance
- [ ] 4.5 /opsx:archive
```

### 8. Confirm output

After creating files, print:
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
