# Stage 7 S-PR-1 Component Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Stage 7 definition/invocation contract and make 5C deterministically fold only structurally identical symbol-master instances, while preserving fallback components, traceability, exports, and existing runtime behavior.

**Architecture:** Extend `ComponentPlanBody` with four optional arrays, but S-PR-1 derives only definitions, invocations, invocation edges, and an empty collections array. Keep schema and graph integrity in the existing contract files; put fingerprinting, post-order fold decisions, node maps, callers, and edges in a focused internal `derive-component-reuse.ts` module. `deriveComponentPlan` remains the orchestrator: build current planned components, attach existing interaction bindings, derive reuse, remove non-representative components, rebuild exports/layouts, then parse and validate the complete plan.

**Tech Stack:** TypeScript, Zod, Vitest, stable JSON/SHA-256 helpers, existing D2C semantic/visual contracts.

---

## File Map

- Modify `packages/d2c-core/src/contract/component-plan-schema.ts`: public optional schemas/types for definitions, invocations, callers, edges, and collections.
- Modify `packages/d2c-core/src/contract/component-plan-validate.ts`: ids, references, bindings, node-map, edge, render-domain, caller, cycle, and export integrity.
- Create `packages/d2c-core/src/contract/derive-component-reuse.ts`: pure post-order symbol folding and deterministic reuse artifacts.
- Modify `packages/d2c-core/src/contract/derive-component-plan.ts`: invoke reuse derive, converge components/exports, and pass semantic context to integrity.
- Modify `packages/d2c-core/src/contract/__tests__/component-plan-schema.test.ts`: schema red/green coverage.
- Modify `packages/d2c-core/src/contract/__tests__/component-plan-validate.test.ts`: graph integrity red/green coverage.
- Modify `packages/d2c-core/src/contract/__tests__/fixtures.ts`: nested, foldable, and fallback symbol fixtures.
- Modify `packages/d2c-core/src/contract/__tests__/component-plan-fixtures.ts`: export the new fixture bridges.
- Create `packages/d2c-core/src/contract/__tests__/derive-component-reuse.test.ts`: focused post-order/fingerprint/node-map/caller/export tests.
- Modify `packages/d2c-core/src/contract/__tests__/derive-component-presentational.test.ts`: current behavior plus optional fields.
- Modify `packages/d2c-core/src/contract/__tests__/derive-component-determinism.test.ts`: new id/order determinism.
- Modify `skills/sketch-to-component/scripts/src/__tests__/fixtures/contract-golden/design-spec/component-plan.json`: regenerate affected plan bytes.
- Modify `skills/sketch-to-component/scripts/src/__tests__/fixtures/contract-golden/design-spec/manifest.json`: regenerate the downstream manifest hashes.

### Task 1: Lock the optional schema

**Files:**
- Modify: `packages/d2c-core/src/contract/component-plan-schema.ts`
- Test: `packages/d2c-core/src/contract/__tests__/component-plan-schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Import the new schemas and add tests equivalent to:

```ts
const caller = { kind: 'component', componentId: 'pc_parent' } as const;

expect(
  ComponentDefinitionSchema.safeParse({
    id: 'cd_status',
    source: { kind: 'symbol-master', masterId: 'master-status' },
    componentId: 'pc_status_a',
    propSchema: [{ name: 'title', type: 'text', defaultValue: 'A' }],
  }).success,
).toBe(true);

expect(
  ComponentInvocationSchema.safeParse({
    id: 'ci_status_a',
    definitionId: 'cd_status',
    semanticNodeId: 's_status_a',
    caller,
    order: 0,
    placement: { x: 0, y: 0, width: 320, height: 44 },
    bindings: { title: 'A' },
    nodeMap: { s_status_a: 's_status_a' },
  }).success,
).toBe(true);

const body = emptyBody() as Record<string, unknown>;
body.componentDefinitions = [];
body.componentInvocations = [];
body.invocationEdges = [];
body.collections = [];
expect(ComponentPlanBodySchema.safeParse(body).success).toBe(true);
```

Also reject unknown caller kinds, non-integer/negative order, malformed placements, unsupported binding types, and unknown strict keys.

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/contract/__tests__/component-plan-schema.test.ts
```

Expected: FAIL because the new schemas are not exported and the body fields are unknown.

- [ ] **Step 3: Add the schemas and inferred types**

Add strict schemas:

```ts
export const ComponentDefinitionSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('symbol-master'), masterId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('structural'), fingerprint: z.string().min(1) }).strict(),
]);

export const ComponentCallerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('component'), componentId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('invocation'), invocationId: z.string().min(1) }).strict(),
]);
```

Define the definition, invocation, edge, and collection shapes exactly as §3.3 of `docs/stages/stage-7-engineering-semantics-plan.md`, using a strict placement object and `z.record(z.string())` for bindings/node maps. Add the four arrays to `ComponentPlanBodySchema` with `.optional()` so old artifacts remain valid.

- [ ] **Step 4: Run schema tests and typecheck GREEN**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/contract/__tests__/component-plan-schema.test.ts
npm run typecheck:d2c
```

Expected: PASS.

- [ ] **Step 5: Commit the schema slice**

```bash
git add packages/d2c-core/src/contract/component-plan-schema.ts \
  packages/d2c-core/src/contract/__tests__/component-plan-schema.test.ts
git commit -m "feat(d2c): define component reuse plan schema"
```

### Task 2: Enforce reuse graph integrity

**Files:**
- Modify: `packages/d2c-core/src/contract/component-plan-validate.ts`
- Test: `packages/d2c-core/src/contract/__tests__/component-plan-validate.test.ts`

- [ ] **Step 1: Add failing integrity tests**

Build a valid minimal definition with two invocations, then add one test per violation:

```ts
expect(() => assertComponentPlanIntegrity(validReusePlan())).not.toThrow();
expect(() => assertComponentPlanIntegrity(planWithMissingDefinition())).toThrow(
  /definitionId cd_missing/,
);
expect(() => assertComponentPlanIntegrity(planWithDanglingCaller())).toThrow(
  /caller componentId pc_missing/,
);
expect(() => assertComponentPlanIntegrity(planWithUnknownBinding())).toThrow(
  /binding unknown is not declared/,
);
expect(() => assertComponentPlanIntegrity(planWithNonBijectiveNodeMap())).toThrow(
  /nodeMap values must be unique/,
);
expect(() => assertComponentPlanIntegrity(planWithWrongReverseCaller())).toThrow(
  /caller does not match edge caller/,
);
expect(() => assertComponentPlanIntegrity(planWithEdgeCycle())).toThrow(/invocation graph cycle/);
expect(() => assertComponentPlanIntegrity(planWithRemovedExport())).toThrow(
  /does not match any body.components id/,
);
```

With `semanticView` context, also reject a node-map key set that differs from the representative render domain and reject overlapping parent/child render domains.

- [ ] **Step 2: Run validator tests and verify RED**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/contract/__tests__/component-plan-validate.test.ts
```

Expected: FAIL because reuse ids/references are not validated.

- [ ] **Step 3: Extend integrity context and id registration**

Add:

```ts
export interface ComponentPlanIntegrityContext {
  semanticNodeIds?: ReadonlySet<string>;
  semanticView?: SemanticView;
  interactionSpec?: InteractionSpec;
}
```

Register `ComponentDefinition`, `ComponentInvocation`, `InvocationEdge`, and `Collection` ids in the existing global id owner map. Treat absent optional arrays as empty.

- [ ] **Step 4: Implement reference and local-shape integrity**

Validate:

- every definition points to a surviving representative `body.components` entry;
- every invocation points to a definition and an upstream semantic id;
- caller component/invocation references resolve;
- invocation binding keys are a subset of definition `propSchema`;
- node-map keys and values are unique and non-empty;
- every edge points to one invocation, matches its reverse caller, and is unique by `caller + boundarySemanticNodeId`;
- invocation caller graph is acyclic;
- collections are empty in S-PR-1 derive, while schema-valid future collections still receive id/reference checks.

- [ ] **Step 5: Implement semantic render-domain integrity**

When `context.semanticView` is present, derive each definition representative's render domain by walking the semantic tree and stopping before nested planned-component roots. Require every invocation node-map key set to equal that representative domain. For each edge, require the boundary root to be excluded from its parent domain and owned by the child invocation. Reject missing or overlapping ownership.

- [ ] **Step 6: Run validator tests and typecheck GREEN**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/contract/__tests__/component-plan-validate.test.ts
npm run typecheck:d2c
```

Expected: PASS.

- [ ] **Step 7: Commit the integrity slice**

```bash
git add packages/d2c-core/src/contract/component-plan-validate.ts \
  packages/d2c-core/src/contract/__tests__/component-plan-validate.test.ts
git commit -m "feat(d2c): validate component reuse graph"
```

### Task 3: Derive post-order symbol reuse

**Files:**
- Create: `packages/d2c-core/src/contract/derive-component-reuse.ts`
- Create: `packages/d2c-core/src/contract/__tests__/derive-component-reuse.test.ts`
- Modify: `packages/d2c-core/src/contract/__tests__/fixtures.ts`
- Modify: `packages/d2c-core/src/contract/__tests__/component-plan-fixtures.ts`

- [ ] **Step 1: Add synthetic symbol fixtures**

Add fixture makers for:

1. two identical symbol instances with different root x/y and different text values;
2. two same-master instances with different root width;
3. two same-master instances whose nested planned components remain distinct;
4. two parent instances whose identical nested symbol children fold first, allowing the parents to fold.

Use real `VisualNode.symbol.masterId`, unique instance-scoped node ids, and candidate names that make 5A promote every planned boundary.

- [ ] **Step 2: Write failing focused derive tests**

Test the pure module through its exported internal entry:

```ts
const reuse = deriveComponentReuse(input);
expect(reuse.componentDefinitions).toHaveLength(1);
expect(reuse.componentInvocations).toHaveLength(2);
expect(reuse.componentInvocations.map((i) => i.placement.x)).toEqual([0, 400]);
expect(reuse.componentInvocations[1]?.bindings).toEqual({ text1: 'Second' });
expect(Object.keys(reuse.componentInvocations[1]!.nodeMap)).toHaveLength(2);
```

Also assert:

- root x/y differences do not block folding;
- width/style/descendant geometry differences do block folding and emit a semantic warning;
- post-order nested children share a `definitionId` before the parent fingerprint is evaluated;
- different unresolved child `componentId` tokens block parent folding;
- caller uses `{kind:'component'}` for an unfolded parent and `{kind:'invocation'}` for a folded parent;
- representative and all generated ids are stable under candidate input order reversal.

- [ ] **Step 3: Run the new test and verify RED**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/contract/__tests__/derive-component-reuse.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement canonical post-order fingerprints**

In `derive-component-reuse.ts`:

- index semantic and visual trees plus planned-component roots;
- group candidate components by `semanticNode.primaryVisualNodeId -> visualNode.symbol.masterId`;
- process candidate groups by descending semantic depth, then `semanticNodeId`;
- walk corresponding render domains synchronously;
- exclude instance-root x/y, text content, and asset refs from the identity fingerprint;
- include root width/height, descendant local geometry, visual/semantic kind, fills, borders, effects, radius, opacity, font style, and nested boundary identity;
- use nested `definitionId` when a child group already folded, otherwise the instance-unique child `componentId`;
- produce a deterministic mismatch reason and `component-reuse-fallback` warning instead of guessing.

- [ ] **Step 5: Derive props, node maps, callers, and edges**

For successful groups:

- choose the representative by lexical `semanticNodeId`;
- generate `cd_`, `ci_`, and `ce_` ids from stable records;
- derive text/asset prop slots only where instance values differ;
- include one invocation per original instance;
- build a bijective template-to-instance node map for the definition render domain;
- stop node maps before child planned-component boundaries;
- find the nearest planned ancestor and emit a component or invocation caller;
- sort caller children by semantic child order and assign stable `order`;
- emit one edge per folded boundary.

- [ ] **Step 6: Run focused tests GREEN**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/contract/__tests__/derive-component-reuse.test.ts
npm run typecheck:d2c
```

Expected: PASS.

- [ ] **Step 7: Commit the reuse engine**

```bash
git add packages/d2c-core/src/contract/derive-component-reuse.ts \
  packages/d2c-core/src/contract/__tests__/derive-component-reuse.test.ts \
  packages/d2c-core/src/contract/__tests__/fixtures.ts \
  packages/d2c-core/src/contract/__tests__/component-plan-fixtures.ts
git commit -m "feat(d2c): derive symbol definitions and invocations"
```

### Task 4: Integrate reuse into component-plan derive

**Files:**
- Modify: `packages/d2c-core/src/contract/derive-component-plan.ts`
- Modify: `packages/d2c-core/src/contract/__tests__/derive-component-presentational.test.ts`
- Modify: `packages/d2c-core/src/contract/__tests__/derive-component-determinism.test.ts`

- [ ] **Step 1: Write integration tests RED**

Assert that ordinary fixtures still produce the existing components/exports and the new arrays default to empty. For foldable fixtures, assert:

```ts
expect(body.componentDefinitions).toHaveLength(1);
expect(body.componentInvocations).toHaveLength(2);
expect(body.invocationEdges).toHaveLength(2);
expect(body.collections).toEqual([]);
expect(body.components.filter((c) => c.name.startsWith('StatusBar'))).toHaveLength(1);
expect(body.exports.filter((e) => e.exportName.startsWith('StatusBar'))).toHaveLength(1);
```

Assert fallback groups retain every component/export and add warnings. Add stable-json equality and stable prefix checks for `cd_`, `ci_`, and `ce_`.

- [ ] **Step 2: Run integration tests and verify RED**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- \
  src/contract/__tests__/derive-component-presentational.test.ts \
  src/contract/__tests__/derive-component-determinism.test.ts
```

Expected: FAIL because `deriveComponentPlan` does not consume reuse output.

- [ ] **Step 3: Integrate after existing binding attachment**

Call the reuse module after current components and interaction bindings exist. Replace `components` with root + surviving representatives + non-folded components. Rebuild `derivedCandidates` for export generation from that surviving set. Add all four optional arrays to the body, with `collections: []`.

- [ ] **Step 4: Preserve layouts, assets, warnings, and integrity**

Build layouts from the converged component list, keep assets unchanged, merge fallback warnings into both returned warnings and `body.warnings`, and call:

```ts
assertComponentPlanIntegrity(componentPlan, {
  semanticNodeIds,
  semanticView,
  interactionSpec,
});
```

- [ ] **Step 5: Run integration and all D2C tests GREEN**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- \
  src/contract/__tests__/derive-component-presentational.test.ts \
  src/contract/__tests__/derive-component-determinism.test.ts
npm run test:d2c
npm run typecheck:d2c
```

Expected: PASS.

- [ ] **Step 6: Commit the orchestration slice**

```bash
git add packages/d2c-core/src/contract/derive-component-plan.ts \
  packages/d2c-core/src/contract/__tests__/derive-component-presentational.test.ts \
  packages/d2c-core/src/contract/__tests__/derive-component-determinism.test.ts
git commit -m "feat(d2c): fold reusable symbol components in 5C"
```

### Task 5: Regenerate contract golden and verify real Sketch acceptance

**Files:**
- Modify: `skills/sketch-to-component/scripts/src/__tests__/fixtures/contract-golden/design-spec/component-plan.json`
- Modify: `skills/sketch-to-component/scripts/src/__tests__/fixtures/contract-golden/design-spec/manifest.json`

- [ ] **Step 1: Run the golden test and verify expected RED**

Run:

```bash
npm test --workspace @skill-collections/sketch-to-component-scripts -- \
  src/__tests__/contract-golden.test.ts
```

Expected: FAIL only for `component-plan.json` and dependent manifest hashes.

- [ ] **Step 2: Regenerate the golden through the existing CLI planner**

Use the same approval values declared in `contract-golden.test.ts`. Write only the changed `component-plan.json` and `manifest.json`; confirm visual/semantic/interaction golden files remain byte-identical.

- [ ] **Step 3: Run golden tests GREEN**

Run:

```bash
npm test --workspace @skill-collections/sketch-to-component-scripts -- \
  src/__tests__/contract-golden.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the real ignored Sketch file through normalize and contract**

Use `/Users/blade/IdeaProjects/skill-collections/skills/sketch-to-component/resource/d2c.sketch` as input and a `/private/tmp` output. Verify:

- exactly three symbol-master groups fold: StatusBar x2, Icon x3, ArrowIcon x3;
- exactly three multi-instance groups fall back with readable warnings: SuggestedPrompt x3, scaled Icon x2, hotel card x4;
- every invocation has a bijective node map over its own render domain;
- exports contain one representative per definition and every remaining non-folded component;
- two repeated runs produce byte-identical `component-plan.json`;
- normalize/design-ir golden files are untouched.

- [ ] **Step 5: Commit golden updates**

```bash
git add skills/sketch-to-component/scripts/src/__tests__/fixtures/contract-golden/design-spec/component-plan.json \
  skills/sketch-to-component/scripts/src/__tests__/fixtures/contract-golden/design-spec/manifest.json
git commit -m "test(d2c): refresh component reuse contract golden"
```

### Task 6: Final verification

**Files:**
- Verify all files changed by Tasks 1-5.

- [ ] **Step 1: Run formatting and focused stale-contract scans**

```bash
npm run format:check
npm run lint
rg -n "childInvocations|source\\.symbolId" packages/d2c-core/src/contract
```

Expected: format/lint PASS; stale scan has no matches.

- [ ] **Step 2: Run the full repository gate**

```bash
npm run check:full
```

Expected: PASS with zero failures.

- [ ] **Step 3: Review scope**

```bash
git status --short
git diff --check master...HEAD
git diff --stat master...HEAD
```

Expected: only S-PR-1 schema/derive/tests/golden/plan files; no codegen, collection derive, normalize, IR schema, or user-local report changes.

- [ ] **Step 4: Commit any final formatting-only correction separately**

```bash
git add packages/d2c-core/src/contract \
  packages/d2c-core/src/contract/__tests__ \
  skills/sketch-to-component/scripts/src/__tests__/fixtures/contract-golden/design-spec
git commit -m "style(d2c): format component reuse changes"
```

Skip this commit when no correction is needed.
