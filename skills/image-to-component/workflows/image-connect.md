# Image Connect Workflow

Image Connect runs after structural comparison (Step 6) and before prop definition (Step 9). It decides whether generated regions should reuse, extend, or create components by comparing structured signatures against `.image-to-component.rules.md` and existing source files.

## Inputs

Required inputs:

- Validated structured signatures from Step 5.
- Structural decision and diff from Step 6.
- Top-level roles derived from each signature slot (`T`, `M`, `B`, `O`, `F`) and container roles (`card`, `list`, `form`, `nav`).
- `.image-to-component.rules.md`.
- User's Step 1 choices and Step 2 intent declaration, if any.

If `.image-to-component.rules.md` is missing, run `workflows/init-project-rules.md` first and resume Image Connect after the file exists.

## Candidate Discovery

Build a candidate set before defining props:

1. Read `.image-to-component.rules.md`.
2. Add listed base components (`Button`, `Card`, `Modal`, `ListItem`) when their paths are discovered.
3. Search the configured component directory for components whose names match top-level roles or likely semantic regions from the structural comparison.
4. Include components imported by the discovered candidates when they look like wrappers or primitives used for composition.
5. Exclude unrelated pages, route shells, story files, tests, generated build output, and package dependencies.

Role hints:

| Signature role     | Candidate names                                      |
| ------------------ | ---------------------------------------------------- |
| `action`           | `Button`, `IconButton`, `LinkButton`, `ActionButton` |
| `card`             | `Card`, `Panel`, `Tile`, domain object cards         |
| `list(card)`       | `ListItem`, `ItemCard`, repeated row/card components |
| `O` slot / overlay | `Modal`, `Drawer`, `Toast`, `Sheet`                  |
| `nav`              | `Tabs`, `Breadcrumb`, `NavBar`, `SegmentedControl`   |
| `form`             | `Input`, `Select`, `Switch`, field wrappers          |
| `media`            | `Image`, `Avatar`, `Icon`, media/asset wrappers      |

Do not invent a reuse candidate from a name alone. Candidate files must exist and be readable.

## Props Extraction

Read each candidate source file and extract its public interface when possible:

- TypeScript React: `interface XProps`, `type XProps`, exported prop types, generic `ComponentProps` aliases.
- JavaScript React: JSDoc `@typedef`, `propTypes`, destructured function parameters, default props.
- Vue: `defineProps`, Options API `props`, exported prop interfaces, and emitted events when relevant.
- Barrel files: follow local exports to the actual component source.

Record:

- Component name and path.
- Required props.
- Optional props.
- Callback/event props.
- Children/slot support.
- Class name/style extension points.
- Accessibility props such as `aria-label`, `aria-labelledby`, or `title`.
- Import path the generated component should use.

If extraction is partial, mark it as partial and explain what could not be inferred. Do not treat partial extraction as a blocker by itself.

## Role-To-Component Matching

For each top-level role or generated subcomponent region, classify one decision:

- `reuse`: existing component covers the role without source changes.
- `extend`: existing component is close but needs small additive props or variants.
- `create`: no suitable component exists, or reuse would contort the generated skeleton.

Use these checks:

1. Role fit: Does the candidate's purpose match the signature role/container?
2. Prop fit: Can the candidate render the needed state using public props/children/slots?
3. Composition fit: Can it sit in the generated split plan without reverse dependencies?
4. Style fit: Does it follow the rules file's style stack and class helper policy?
5. Accessibility fit: Can it satisfy the rules file's accessibility requirements?
6. Package fit: Does it obey icon-source and dependency rules?

Prefer reuse of primitives (`Button`, `Card`, `Modal`, `ListItem`) when coverage is high. Prefer create for domain-specific regions when existing components are semantically unrelated even if their structure looks similar.

## Coverage Rubric

Estimate practical coverage as a percentage. This is a judgment aid, not a mathematical proof:

| Coverage | Meaning                                                                     | Default decision |
| -------- | --------------------------------------------------------------------------- | ---------------- |
| 85-100%  | Candidate can render the role with existing public API and rules compliance | `reuse`          |
| 60-84%   | Candidate is close but needs small additive API or variant changes          | `extend`         |
| 0-59%    | Candidate misses major structure, state, styling, or accessibility needs    | `create`         |

Coverage factors:

- 30% role and semantic match.
- 25% required structure/children/slots support.
- 20% props and state API fit.
- 15% style and class composition compatibility.
- 10% accessibility and dependency compliance.

Lower coverage when required props cannot be inferred, the component forces unrelated semantics, or reuse would require changing behavior outside the generated component's scope.

## Candidate Table Format

Before Step 9, output a table and wait for confirmation:

```markdown
Image Connect candidates:

| Region / role  | Signature source     | Candidate | Path                               | Extracted API                                   | Coverage | Decision | Notes                         |
| -------------- | -------------------- | --------- | ---------------------------------- | ----------------------------------------------- | -------: | -------- | ----------------------------- |
| Action buttons | `B: action + action` | `Button`  | `src/components/Button/Button.tsx` | `variant?`, `disabled?`, `onClick?`, `children` |      92% | reuse    | Add `aria-label` at call site |
| Main card      | `M: card(...)`       | `Card`    | `src/components/Card/Card.tsx`     | `children`, `className?`                        |      88% | reuse    | Use existing wrapper          |
| Status stamp   | `M.card.status`      | none      | -                                  | -                                               |       0% | create   | Domain-specific state marker  |
```

When no candidate exists, use `none`, `-`, and `0%`.

After the table, ask:

```text
Please confirm Image Connect decisions:
A. Accept these reuse/extend/create decisions and continue to prop definition.
B. Change one or more decisions. Tell me which rows should be reuse, extend, or create.
C. Skip Image Connect for this run and create all generated regions from scratch.
```

Do not proceed to prop definition or code generation until the user confirms A, B, or C.

## Confirmation Gate

User choice handling:

| Choice | Action                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| A      | Record the decisions and continue to Step 9.                                                                                |
| B      | Apply the user's row-level changes, update the decision table, and ask for confirmation again if any decision is ambiguous. |
| C      | Record that Image Connect was skipped; mark every generated region as `create`; continue to Step 9.                         |

If a decision is `extend`, ask for confirmation before editing the existing component unless the user already asked for direct file changes and the change is within the assigned output scope. If extension would modify files outside the allowed scope, stop and report the blocker.

## Feeding Step 9 And Step 10

Image Connect decisions constrain later steps:

- Step 9 prop definition must include only props needed by created/extended generated components and must adapt to reused components' existing public APIs.
- Reused components are imported, not regenerated.
- Extended components keep their existing API compatible; only additive optional props or variants are allowed unless the user explicitly approves a breaking change.
- Created components follow `.image-to-component.rules.md` for directory, style stack, `cn` helper, icon source, accessibility, and test command.
- Step 10 split planning must show reused, extended, and created files separately.
- Step 10 code generation must preserve existing component ownership boundaries and avoid reverse dependencies from shared/base components into generated domain components.

If Image Connect changes the intended directory tree from Step 11, update the tree before writing or outputting files so it matches the confirmed decisions.
