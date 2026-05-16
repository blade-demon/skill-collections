# Init Project Rules Workflow

Use this workflow when `.image-to-component.rules.md` is missing in the target project. It runs before Step 1 asks image-to-component generation questions, then returns to Step 1 with the initialized rules as project context.

## Trigger

At the start of an image-to-component run:

1. Resolve the target project root from the user's requested output location or current working directory.
2. Check for `<project-root>/.image-to-component.rules.md`.
3. If the file exists, read it and continue to Step 1.
4. If the file is missing, run this workflow once, create the file, then continue to Step 1.

Do not read images during this workflow. Do not ask the Step 1 framework/output/language/style questions until the rules file exists or the user cancels initialization.

## Scan Strategy

Collect lightweight project evidence before choosing defaults:

- Component directories: inspect common roots such as `src/components`, `components`, `app/components`, `src/app`, `src/ui`, `src/shared/ui`, and existing import aliases.
- Style stack: inspect existing component files and package metadata for CSS Modules (`*.module.css`), plain CSS/BEM (`*.css` with block-style class names), CSS-in-JS, Tailwind, Sass, or UI-library-only styling.
- Class helper: search for `cn`, `clsx`, `classnames`, `classNames`, or local utility exports under `src/utils`, `src/lib`, `utils`, and `lib`.
- Icon source: inspect package metadata and imports for icon libraries. Prefer an existing single icon source when it is consistent.
- Accessibility requirements: inspect existing components and project docs for interactive-element labeling patterns.
- Base components: search for `Button`, `Card`, `Modal`, and `ListItem` components. Record paths only when discovered.
- Test command: inspect `package.json` scripts. Prefer an existing script that runs component/unit tests.

Use `rg`/`rg --files` where available. Keep the scan shallow enough to avoid turning initialization into a full audit.

## Defaults

When project evidence is absent, incomplete, or consistent with the user's spec, encode these defaults:

| Rule | Default |
|---|---|
| Component directory | `src/components/` |
| Style stack | CSS Modules |
| `cn` helper path | `src/utils/cn.ts` |
| Icon source | Only `@iconify/react`; do not introduce new icon packages |
| Accessibility | All interactive elements must have `aria-label` |
| Base components | `Button`, `Card`, `Modal`, `ListItem` with paths when discovered |
| Test command | `vitest` |

Defaults are not guesses about the existing app. Mark them as defaults in the rules file so later generation can distinguish project evidence from fallback policy.

## Conflict Handling

If evidence conflicts with the defaults:

- Prefer explicit user instructions over detected evidence.
- Prefer strong project evidence over defaults.
- If two project conventions conflict, write the conflict under `Open Questions` and ask before generating code that depends on the unresolved choice.
- If icon imports show multiple libraries, do not add another package. Record the allowed source selected by user instruction or project convention; otherwise default to `@iconify/react` and flag the conflict.
- If a `cn` helper exists in a different path, record the discovered path instead of creating the default helper.
- If no base component path is found, record the component name with `path: not discovered`.

When a conflict blocks generation, stop after writing the rules draft and ask the user to choose. When it does not block generation, continue with the recorded decision and include the conflict in `Open Questions`.

## Output Template

Create `.image-to-component.rules.md` with this structure:

```markdown
# Image To Component Project Rules

Generated for image-to-component runs in this project. Update this file when project conventions change.

## Component Directory

- Directory: `src/components/`
- Source: default | project evidence | user instruction

## Style Stack

- Stack: CSS Modules
- Source: default | project evidence | user instruction
- Notes: <module file naming, BEM convention, Tailwind policy, or other relevant constraints>

## Class Name Helper

- Helper: `cn`
- Path: `src/utils/cn.ts`
- Source: default | project evidence | user instruction
- Policy: Reuse this helper for React class composition. Do not redefine it in every component.

## Icons

- Allowed source: `@iconify/react`
- Policy: Do not introduce new icon packages. Use existing project icons only when listed here.
- Existing icon components/imports: <paths or "none discovered">

## Accessibility

- All interactive elements must have `aria-label`.
- Prefer semantic buttons/links for actions.
- Preserve heading hierarchy through configurable heading props when needed.

## Existing Base Components

| Component | Path | Notes |
|---|---|---|
| Button | not discovered | default candidate |
| Card | not discovered | default candidate |
| Modal | not discovered | default candidate |
| ListItem | not discovered | default candidate |

## Test Command

- Command: `vitest`
- Source: default | project evidence | user instruction

## Open Questions

- None.
```

Replace defaults with discovered values when evidence is clear. Keep the table rows for `Button`, `Card`, `Modal`, and `ListItem` even when paths are not discovered.

## Continuation

After writing `.image-to-component.rules.md`:

1. Summarize the chosen rules to the user in one short paragraph.
2. If no blocking conflict remains, return to Step 1 and ask the normal upfront questions.
3. If blocking conflicts remain, ask the user to resolve them before Step 1.

The rest of the workflow treats `.image-to-component.rules.md` as the authoritative project-convention input for Image Connect, prop definition, directory planning, and code generation.
