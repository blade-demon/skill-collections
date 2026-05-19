> **Code generation is script-driven.** Build a `SkeletonConfig` JSON object from the component tree and prop definitions from Step 9, plus `stylePlan` from Step 8 when style hints were enabled, then run:
>
> ```bash
> echo '<SkeletonConfig JSON>' | npm run generate-skeleton
> ```
>
> The output is a `[{path, content}]` JSON array. Use this array as the file list for Step 11. Do **not** read `templates/` — those files have been removed.
>
> **SkeletonConfig shape:**
> ```json
> {
>   "framework": "react|vue3|vue2",
>   "lang": "ts|js",
>   "style": "css-modules|bem",
>   "rootComponent": {
>     "name": "ComponentName",
>     "element": "article",
>     "discriminator": { "propName": "status", "type": "Status", "variants": ["a","b"] },
>     "props": [{ "name": "title", "type": "string", "required": true }],
>     "children": [{ "name": "Header", "element": "header", "props": [], "children": [] }]
>   },
>   "stylePlan": {
>     "rules": [
>       {
>         "component": "ComponentName",
>         "declarations": [
>           { "property": "display", "value": "grid", "source": "inferred" },
>           { "property": "gap", "value": "var(--space-md)", "source": "token-ledger" }
>         ]
>       }
>     ]
>   }
> }
> ```

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

## Token Usage (From Style Connect)

If Style Connect (Step 8) was run and produced a token-ledger:

- **Provided tokens** (status: `provided` or `reused`) — Reference them directly in generated code.
  - CSS: `color: var(--token-name);`
  - SCSS: `color: $token-name;`
  - Tailwind: Use the token class if the project exposes tokens as classes.
- **Create tokens** (status: `create`) — Add a TODO comment and inline the value, or create placeholder CSS variables.
  - `color: var(--new-token-name); /* TODO: define this token in design system */`
- **Hardcoded tokens** (status: `hardcoded`) — Use TODO comments to mark for future extraction.
  - `color: #ff6b6b; /* TODO: extract to token --color-warning */`
- **Skipped tokens** (status: `skip`) — Omit the style entirely; rely on browser defaults or inherited styles.

When a token status is not yet fully resolved at code generation time, check the token-ledger row and follow its `User action` column guidance.

## Style Plan Usage

If `workflows/style-plan.md` produced `SkeletonConfig.stylePlan`, include it in the JSON passed to `generate-skeleton`.

React generation consumes `stylePlan` now:

- CSS Modules: writes declarations into root and child `.module.css` files.
- BEM: generates and imports root and child `.css` files only for components with style rules.

Vue generation may ignore `stylePlan` until Vue style support is implemented. Do not claim Vue style generation unless tests cover it.

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
