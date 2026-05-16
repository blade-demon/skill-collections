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
- Component library: inspect `package.json` dependencies and devDependencies for known UI library packages (`antd`, `@mui/material`, `@chakra-ui/react`, `@radix-ui/*`, `tailwindcss`). Also check for the shadcn marker file `components.json` in the project root (shadcn copies components into the project rather than installing a package).

Use `rg`/`rg --files` where available. Keep the scan shallow enough to avoid turning initialization into a full audit.

## Component Library Detection And Confirmation

After Scan Strategy completes, resolve the project's component libraries before writing the rules file. Style Connect (Step 8) needs this list to pick the right Library Adapter for token discovery.

### Standardized Library Names

Map detected signals to the standardized name used in the rules file and adapter table:

| Detection signal | Standardized name |
|---|---|
| `antd` in dependencies | `antd` |
| `@mui/material` in dependencies | `mui` |
| `@chakra-ui/react` in dependencies | `chakra` |
| Any `@radix-ui/*` in dependencies | `radix` |
| `tailwindcss` in devDependencies | `tailwind` |
| `components.json` exists at project root | `shadcn` |
| User-specified "Other" entry | `<lowercased-user-input>` (no adapter) |

### Confirmation Flow

If detection produced at least one match, ask the user to confirm:

```text
Detected component libraries from package.json:
  ✓ antd  (found in dependencies)
  ✓ tailwind  (found in devDependencies)

Detected from project files:
  ✓ shadcn  (components.json marker found)

Confirm libraries for Style Connect token discovery:

A. Confirm detected list: [antd, tailwind, shadcn]
B. Edit the list (add/remove libraries; specify order — first has higher priority)
C. None — use only project-local token sources
```

If detection found nothing, ask from scratch:

```text
No known component library detected in package.json.

Which library does this project use? (Multi-select allowed)

A. None / custom internal — only scan project-local tokens
B. Ant Design (antd)
C. Material-UI (@mui/material)
D. Chakra UI (@chakra-ui/react)
E. shadcn/ui (components copied into project)
F. Radix UI primitives (@radix-ui/*)
G. Tailwind CSS
H. Other — specify package name(s)
```

### Library Priority

The library list order is the **priority order** Style Connect uses to resolve conflicts when the same token name is defined in multiple sources. Project-local tokens always win over any library; among libraries, the **first entry in the list has highest priority**.

When the user picks option B (Edit the list), explicitly state that order matters. Default order from auto-detection: dependencies before devDependencies, then project-file markers (shadcn), preserving package.json declaration order within each group.

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
| Component libraries | `[]` (none — only project-local token sources used) |

Defaults are not guesses about the existing app. Mark them as defaults in the rules file so later generation can distinguish project evidence from fallback policy.

## Conflict Handling

If evidence conflicts with the defaults:

- Prefer explicit user instructions over detected evidence.
- Prefer strong project evidence over defaults.
- If two project conventions conflict, write the conflict under `Open Questions` and ask before generating code that depends on the unresolved choice.
- If icon imports show multiple libraries, do not add another package. Record the allowed source selected by user instruction or project convention; otherwise default to `@iconify/react` and flag the conflict.
- If a `cn` helper exists in a different path, record the discovered path instead of creating the default helper.
- If no base component path is found, record the component name with `path: not discovered`.
- If `package.json` shows a known UI library but the user chooses "None" in the Component Library Confirmation, respect the user's choice and record the discrepancy in `Open Questions` (the user may be migrating off the library).

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

## Component Libraries

- Libraries (in priority order): `[antd, tailwind]`
- Source: project evidence | user confirmation | user instruction
- Detection method: package.json dependencies | components.json marker | user-specified
- Priority rule: project-local tokens always win over library tokens; among libraries, the first entry has highest priority.
- Notes: <e.g., "antd v5 with CSS-in-JS"; "shadcn components in src/components/ui">

### Token Discovery Sources (informational)

When Style Connect runs, it will scan tokens from:
- Project-local: `src/tokens/`, `src/styles/`, `tailwind.config.*`
- Library: <resolved adapter paths, e.g., `node_modules/antd/dist/reset.css`, `tailwind.config.*` resolved theme>

If no library is selected, only project-local sources are scanned.

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
