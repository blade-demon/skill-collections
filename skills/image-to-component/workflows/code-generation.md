# Code Generation Workflow

Use this after prop modeling.

## Split Rules

- Root component owns `status`, shared data props, and composition.
- Split by structural region: `T` header/status hero, `M` main content/card/media, `B` footer/action area, `O` overlay, `F` floating action.
- Split a region when it is status-varying, repeated, resource-heavy, structurally non-trivial, or a distinct semantic region.
- Static business-object regions should still be separate components when they are visually distinct.
- Pass only the props a child needs. Do not pass the entire parent props object.

## Class Composition

- Follow `.image-to-component.rules.md` for the `cn` helper path.
- React: use existing `cn`, `clsx`, or `classnames`; if rules authorize a missing helper, add it once at the configured path.
- Vue: use native array/object bindings unless the project already uses a helper.
- Do not hand-build long conditional class strings.

## Template Selection

Read exactly one template based on Step 1 choices:

| Framework | Language | Style stack | Template |
|---|---|---|---|
| React | TypeScript | CSS Modules | `templates/react-tsx-css-modules.md` |
| React | TypeScript | plain CSS + BEM | `templates/react-tsx-bem.md` |
| React | JavaScript | CSS Modules | `templates/react-jsx-css-modules.md` |
| React | JavaScript | plain CSS + BEM | `templates/react-jsx-bem.md` |
| Vue 3 | TypeScript or JavaScript | CSS Modules | `templates/vue3-sfc-css-modules.md` |
| Vue 3 | TypeScript or JavaScript | plain CSS + BEM | `templates/vue3-sfc-bem.md` |
| Vue 2 | TypeScript or JavaScript | CSS Modules | `templates/vue2-sfc-css-modules.md` |
| Vue 2 | TypeScript or JavaScript | plain CSS + BEM | `templates/vue2-sfc-bem.md` |

Never mix TypeScript and JavaScript syntax. If the user selected an unsupported framework, run `degraded-mode.md` and output only structural guidance.

## Directory Tree Rules

- The code skeleton must match the planned tree exactly.
- React CSS Modules list a root `.module.css` and each child component `.module.css`.
- Vue CSS Modules use `<style module>` inside each SFC by default.
- React + JavaScript uses `types.js` with JSDoc typedefs, not `types.ts`.

## Exit

Exit with a complete directory tree and skeleton content or file write plan ready for `output-and-writing.md`.
