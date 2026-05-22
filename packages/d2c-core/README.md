# @skill-collections/d2c-core

Shared core for the design-source-to-component (D2C) pipeline: the canonical
IR schema, derived-view schemas, validators, and the `Provider` port.

See [`docs/design-source-to-component-architecture.md`](../../docs/design-source-to-component-architecture.md)
for the authoritative architecture and
[`docs/design-source-to-component-implementation-plan.md`](../../docs/design-source-to-component-implementation-plan.md)
for build phases.

## Source-only internal package

This is an **internal workspace package**. It ships TypeScript source only —
there is no `dist/` and no build step. `package.json#exports` points at
`src/index.ts`, so it is consumed by other workspace packages through
`tsx` / `vitest` / TS-aware tooling. It is **not** runnable by plain `node`.

## Scope (current)

`d2c-core` owns provider-neutral contracts and deterministic shared pipeline
helpers:

```
src/
  ir/        canonical Design IR schema, derived-view schemas, validators
  provider/  capability-style Provider port + normalize/validate helper
  preview/   visual view derivation, static HTML preview, review report helpers
```

Provider-specific extraction and normalization code stays in
`skills/<provider>-to-component/scripts/`. For example, Sketch-specific parsing
of `.sketch` ZIP JSON lives in `skills/sketch-to-component/scripts/`, then hands
validated IR to this package.

Not yet in scope: semantic contract drafting, interaction modeling, target
package codegen, screenshot diff automation, and a full resumable pipeline
runner.

## Verification

```bash
npm run typecheck:d2c
npm run test:d2c
```

Repo-wide gates include this package through `npm run typecheck`,
`npm run test:all`, and `npm run check:full`.
