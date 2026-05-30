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
  contract/  Stages 5B / 5C: interaction-spec + component-plan schemas,
             integrity validators, and the deriveInteractionSpec /
             deriveComponentPlan pure functions
  codegen/   Stage 6: Gate 2 sign-off + verify, and the TargetGenerator
             abstraction with a React + TS + BEM implementation
  utils/     cross-cutting helpers (stable JSON / hash)
```

Provider-specific extraction and normalization code stays in
`skills/<provider>-to-component/scripts/`. For example, Sketch-specific parsing
of `.sketch` ZIP JSON lives in `skills/sketch-to-component/scripts/`, then hands
validated IR to this package.

Not yet in scope: screenshot diff automation, and a fully resumable pipeline
runner — the Stage 5D contract runner below chains the derive steps in one pure
pass, but persisting and resuming partial runs is a later slice. Codegen (Stage 6) generates presentational React packages today; interactive generation and
asset emission are later slices.

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

## Interaction Spec (Stage 5B)

`src/contract/` adds the interaction contract that sits between
`SemanticView` and the future `ComponentPlan`. It provides
`InteractionSpecSchema`, `InteractionSpecBodySchema`,
`InteractionStatusSchema`, `assertInteractionSpecIntegrity()`, and
`deriveInteractionSpec()`.

### Status model

`InteractionStatusSchema` has five values: `draft`, `in-review`, `approved`,
`omitted`, and `deferred`. It is intentionally separate from
`ContractStatusSchema`, which remains the three-state lifecycle
(`draft | in-review | approved`) used by `component-plan`. Presentational vs
interactive output is a component-plan `mode` decision in Stage 5C, not an
extra `ContractStatusSchema` state.

### Derive modes

`deriveInteractionSpec()` is a pure function. It validates the upstream hash
chain (`designIrHash`, `visualViewHash`, `semanticViewHash`) and returns the
same artifact for the same inputs. It supports three modes:

- `draft` (default): mirrors semantic component candidates, drafts heuristic
  events and data slots, persists caveats in `body.warnings`, and leaves
  `states` / `stateTransitions` empty.
- `omitted`: requires caller-supplied `{ reason, approvedBy, approvedAt }`,
  writes top-level approval fields, leaves behavior arrays empty, and pins all
  coverage entries to `omitted`.
- `deferred`: same approval requirements and empty behavior arrays as
  `omitted`, but pins coverage entries to `deferred`.

### Draft heuristics

Stage 5B uses conservative name and kind checks only:

- `button`, `btn`, `cta`, `submit`, `send` on region/component nodes draft
  click events.
- `tab`, `tabs`, `tabbar` on region/component nodes draft select events.
- `input`, `field`, `search`, `composer` on region/component nodes draft a
  change event plus a value slot.
- Text nodes draft string data slots.
- Media nodes with `assetRef` draft string URL data slots and emit a warning.

All heuristic candidates have confidence `low` or `medium`; `high` and
`developer-provided` are reserved for explicit annotations or developer
overrides.

### Known limitations

- No state-machine inference: without explicit annotations, `states` and
  `stateTransitions` stay empty.
- Annotation evidence is not consumed yet, even though schema entry points are
  present.
- Payload and data slot types only reach the `'string'` level in 5B.
- Real `.sketch` contract golden fixtures are reserved for 5D, when the CLI
  `contract` command and Gate 2 signal are introduced.

`body.coverage` is the single data source Stage 6 will use to generate
`interaction-coverage.md`. Codegen should not infer coverage by re-reading
events or states directly.

## Component Plan (Stage 5C)

`src/contract/` also owns the Stage 5C component-plan contract that sits
between `InteractionSpec` and Stage 6 codegen. It provides
`ComponentPlanSchema`, `ComponentPlanBodySchema`, `ComponentPlanModeSchema`,
`assertComponentPlanIntegrity()`, and `deriveComponentPlan()`.

### Status, mode, and approval

`component-plan.status` stays on the existing three-state
`ContractStatusSchema` (`draft | in-review | approved`); presentational vs
interactive is a separate axis — `ComponentPlanModeSchema =
z.enum(['presentational', 'interactive'])` — so the plan never confuses
lifecycle with codegen archetype.

`ComponentPlanApprovalSchema` is a `level`-discriminated union: an
`interactive` plan signs off with `{ gate: 'gate-2', level: 'interactive',
approvedBy, approvedAt }`, and a `presentational` plan signs off with the
same fields plus `acknowledgedBehaviorStubbed: true`. The literal-`true`
field forces an approver to physically acknowledge the plan is a behavior
stub, instead of letting a `false` slide through and pretend the plan is
functionally complete.

`status × mode × approval` consistency is owned by
`ComponentPlanSchema.superRefine()` at parse time, not by the integrity
validator. Holding a successful `ComponentPlanSchema.safeParse()` result is
sufficient to know approval shape is consistent.

### Derive

`deriveComponentPlan({ designIr, visualView, semanticView, interactionSpec, mode })`
is a pure function — no IO, no clock, no `Math.random`. It:

- validates the full hash chain across all four upstream artifacts and
  writes `interactionSpecHash` on output;
- rejects illegal `mode × interactionSpec.status` combinations (interactive
  needs an `approved` spec; presentational needs `omitted` or `deferred`;
  `draft` / `in-review` specs never derive a plan);
- builds `rootComponent` from `semanticView.body.screen`, then maps each
  `componentCandidate` to a `PlannedComponent` (kind→role table; primitive
  kinds — text, media, icon, control, decorative — throw rather than coerce
  to `'component'`);
- in presentational mode emits no event handlers; `deferred` upstream
  converts `dataModels` into optional `presentational-stub` props,
  `omitted` ignores them with a warning;
- in interactive mode wires events → handler props and data models →
  required data props, attributing each binding to the deepest planned
  component whose semantic ownership covers the binding's source node;
- generates `layoutPlan` from upstream `layoutCandidates` and fills an
  `absolute` fallback so every planned component has at least one layout
  entry;
- generates `assetPlan` from `media` / `icon` semantic nodes, looking up
  `assetRef` via `primaryVisualNodeId`; missing refs warn, do not throw;
- generates exports — root default plus one named per candidate — and
  throws on PascalCase collisions (with both candidate ids in the error
  message) rather than silently dedup-ing.

Deterministic ids use a `<prefix>` + `stableSha256(stableJson({ form,
...canonical fields })).slice(0, 12)` scheme: `pc_` for
`PlannedComponent`, `pe_` for `PlannedExport`, `pl_` for `PlannedLayout`,
`pa_` for `PlannedAsset`. No `Date.now`, no UUID, no counters.

### Wiring (Stage 5C-PR-3)

The canonical `ComponentPlanSchema` lives in `src/contract/component-plan-schema.ts`.
`src/contract/index.ts` exports the schema, validator, and derive together
as the public Stage 5C surface. `src/ir/views.ts` re-exports the canonical
binding (and `ComponentPlanModeSchema`) for the handful of historical
callers that imported it from `ir/views`. `src/ir/index.ts` deliberately
stops forwarding `ComponentPlanSchema`, so the root barrel exports it
exactly once via `export * from './contract'`.

### Not in scope

5C still does not generate React / TS / BEM (Stage 6), does not provide a
CLI entry (Stage 5D), and does not write artifacts to disk; the
component-plan it returns is held in memory and round-trips through
`ComponentPlanSchema` + `assertComponentPlanIntegrity` before being
returned.

## Contract Runner (Stage 5D)

`src/contract/run-contract.ts` chains the four Stage 5 derive steps into one
pass, and `src/contract/artifact-paths.ts` defines the stable artifact names
plus a manifest builder. Both are **pure** — `d2c-core` performs no file IO.
The disk-writing CLI lives in the Sketch skill
(`skills/sketch-to-component/scripts`), keeping provider/output concerns out
of core.

### `runContract`

```ts
runContract({ designIr, visualView?, semanticView?, interactionSpec?, mode, interactionMode?, approval? })
  => { visualView, semanticView, interactionSpec, componentPlan, warnings }
```

Chains `deriveVisualView → deriveSemanticView → deriveInteractionSpec →
deriveComponentPlan`. Same input ⇒ byte-identical output; no clock, no
network, no IO. Input contract (flexible, but constraints are hard):

- `designIr` is required — the root anchor of the hash chain.
- `visualView` / `semanticView` / `interactionSpec` are optional, but a
  provided view MUST pass full hash-chain validation against its upstream;
  a mismatch throws (never trusts a cached object).
- `mode` / `interactionMode` / `approval` are caller-explicit. When the
  interaction spec is derived (not provided), `interactionMode` is
  **required** — `runContract` does not fall back to a default.
- Provided views must form a contiguous prefix from `designIr`; the runner
  derives only past the last provided one and never re-derives a provided
  view. Warnings are the ordered merge of the steps that actually ran.

`runContract` never promotes an interaction spec to `approved`
(`deriveInteractionSpec` only ever yields `draft | omitted | deferred`). So
`mode='interactive'` succeeds only with a caller-provided `approved` spec;
otherwise `deriveComponentPlan` throws (5C §3.2).

### Artifact names + manifest

```ts
ARTIFACT_FILENAMES; // design-ir.json (input root, in ir/) + the four
// runContract outputs (in design-spec/)
MANIFEST_FILENAME; // 'manifest.json'
buildContractManifest(input, result); // pure; one entry per contract artifact:
// { filename, hash, origin: 'provided' | 'derived', generatedFrom }
```

`hash` is always `stableSha256(stableJson(artifact))` of the final adopted
artifact, so a provided view that validated and the same view derived hash
identically — `origin` records provenance only.

### Not in scope (Stage 5D)

No codegen (Stage 6). The CLI's `--file` / `--design-ir` entries derive the
full chain; reuse-input entries (feeding a pre-approved interaction-spec for
interactive mode) are a later slice.

## Codegen (Stage 6)

`src/codegen/` turns an **approved** `design-spec/` into a target component
package. Everything here is **pure** (no IO / clock / randomness); the CLI owns
disk writes.

- `verifyDesignSpec(input)` — Gate 2 input validation: schema-parses the four
  contract artifacts + manifest, reconciles each manifest hash, walks the
  `generatedFrom` chain, and requires `component-plan.status === 'approved'`.
  There is deliberately no `mode` parameter — mode is a property of the plan.
- `approveComponentPlan(plan, signOff)` — sign-off: flips a draft plan to
  `approved` (status + approval block only; the body is untouched).
- `generateComponentPackage(input)` — dispatches on the plan's own
  `body.target.framework`; rejects any non-approved plan. The React target emits
  one `.tsx`/`.module.css`/`index.ts` per component, a package barrel,
  `package.json`, a presentational README banner, and `interaction-coverage.md`
  (formatted from the plan's coverage snapshot — never re-classified).

The generated `package.json` carries a `d2c` provenance block:

```jsonc
"d2c": {
  "mode": "presentational",
  "gate2Level": "presentational",          // from plan.approval.level
  "sourceHashes": {                          // stableSha256(stableJson(artifact))
    "visualView": "…", "semanticView": "…",
    "interactionSpec": "…", "componentPlan": "…"
  }
}
```

### Hash semantics

The contract hash covers the **whole** artifact, including approval fields, so
sign-off changes the `component-plan` hash and rewrites both
`component-plan.json` and its `manifest.json` entry (architecture doc, "Gate 2
artifact chain"). A contract-identity hash that excludes approval metadata is a
noted future optimization.

### Golden

`fixtures/src/golden/` is the committed expected package for an approved,
no-asset `design-spec/`. It is one copy that serves two purposes: the
`codegen-golden` test (in `skills/sketch-to-component/scripts`) compares
generated bytes against it, and `npm run check:fixtures` compiles it via
`tsc -b && vite build` to prove the output is build-clean. Regenerate it with
the Sketch CLI:

```bash
# from skills/sketch-to-component/scripts
npm run contract -- --design-ir <ir> --out <tmp> --mode presentational \
  --interaction-mode deferred --approval-reason … --approved-by … --approved-at …
npm run approve  -- --spec <tmp>/design-spec --approved-by … --approved-at … \
  --acknowledge-behavior-stubbed
npm run codegen  -- --spec <tmp>/design-spec --design-ir <ir> \
  --out <repo>/fixtures/src/golden
```

### Not in scope (Stage 6 v1)

Interactive generation, asset emission, a second target, and the reuse-input CLI
path are later slices.

## Verification

```bash
npm run typecheck:d2c
npm run test:d2c
```

Repo-wide gates include this package through `npm run typecheck`,
`npm run test:all`, and `npm run check:full`.
