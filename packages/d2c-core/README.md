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
  semantic/  Stage 5A: semantic-view body schema, evidence, integrity
             validator, and deriveSemanticView
  utils/     cross-cutting helpers (stable JSON / hash)
```

Provider-specific extraction and normalization code stays in
`skills/<provider>-to-component/scripts/`. For example, Sketch-specific parsing
of `.sketch` ZIP JSON lives in `skills/sketch-to-component/scripts/`, then hands
validated IR to this package.

Not yet in scope: interaction modeling, component planning, target package
codegen, screenshot diff automation, and a full resumable pipeline runner.

## Semantic View (Stage 5A)

`src/semantic/` is the first half of Gate 2: it turns the visual-view
produced by Stage 4 into a typed `SemanticView` that downstream
interaction-spec and component-plan work will consume.

### Public surface

- `SemanticViewBodySchema` / `SemanticNodeSchema` /
  `ComponentCandidateSchema` / `RepeatedPatternSchema` /
  `LayoutCandidateSchema` — Zod definitions. **Shape only**: every field
  exists, types match, discriminated unions pick correctly.
- `evidenceFromVisualNode` / `evidenceFromDesignIrCandidate` /
  `evidenceFromAnnotation` / `evidenceFromProjectRule` — the only place
  evidence values are constructed. Greppable origin for every cited
  source. Annotation and project-rule are reserved entry points and are
  not produced by 5A derive.
- `assertSemanticViewIntegrity(body)` — graph-level invariants Zod
  cannot reach: unique node ids, reciprocal parent/child links, screen
  pointer kind, `primaryVisualNodeId` membership, all candidate /
  pattern / layout cross-references resolve, ids globally unique across
  all four arrays. Throws `SemanticViewIntegrityError` with the
  offending id and field in the message.
- `deriveSemanticView({ designIr, visualView })` — pure function; same
  input ⇒ byte-identical output. Validates the input hash chain
  (`visualView.generatedFrom.designIrHash` must equal
  `stableSha256(stableJson(designIr))`), walks the visual tree depth-first
  pre-order, applies the §6.4–§6.7 heuristics, and self-calls the
  integrity validator before returning.

### Determinism

All ids are `<prefix>` + `stableSha256(stableJson({ form, ...canonical fields })).slice(0, 12)`.
The prefix is `s_` for SemanticNode, `cc_` for ComponentCandidate, `rp_`
for RepeatedPattern, `lc_` for LayoutCandidate. RepeatedPattern item ids
are sorted before hashing so shuffled-input runs still produce the same
pattern id. No `Date.now`, no UUID, no counters.

### Known limitations carried by 5A

- Grid layout (mixed x+y equal-spacing) is not detected — emits
  `repeated-pattern-grid-skipped` warning instead.
- Annotation extraction is reserved as a schema entry point but not
  consumed; 5B+ wires in `@component` / `@slot` / `@event` / etc.
- Project-rule evidence is reserved similarly.
- `repeated-item` kind exists in the union but is not produced by derive.
- Real `.sketch` fixtures land in 5D when the CLI + Gate 2 signal arrive;
  5A tests use inline TS makers under `src/semantic/__tests__/fixtures.ts`.

### Hash chain

`GeneratedFromSchema` now carries `designIrHash` _and_ `visualViewHash`
(both optional at the schema level, but `deriveSemanticView` always
writes both). Downstream `interaction-spec` and `component-plan` will
pin to `semantic-view`'s body hash in 5B / 5C.

## Verification

```bash
npm run typecheck:d2c
npm run test:d2c
```

Repo-wide gates include this package through `npm run typecheck`,
`npm run test:all`, and `npm run check:full`.
