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

## Scope (Stage 1)

Contract layer only: IR schema, schema-version compatibility,
`validateDesignIR()`, and the provider port. No pipeline runner, preview,
codegen, or provider implementations — those land in later stages.

```
src/
  ir/        canonical Design IR schema, derived-view schemas, validators
  provider/  capability-style Provider port + normalize/validate helper
```
