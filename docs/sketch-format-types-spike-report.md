# Sketch File-Format Types Spike — Report

> Companion to [`sketch-format-types-spike-plan.md`](./sketch-format-types-spike-plan.md).
> Branch: `worktree-sketch-format-types-spike`. PR title (proposed):
> `Introduce Sketch file-format types and centralize unsafe Sketch casts (spike)`.

## TL;DR

Spike landed cleanly:

- `@sketch-hq/sketch-file-format-ts@6.5.0` installed as **devDependency**;
  all imports use `import type` (zero runtime cost).
- `sketch-raw-model.ts` now layers zod (shallow runtime guard) and TS
  (deep `FileFormat.*` types) at one explicit boundary (`asSketchRawModel`).
- New `normalize/sketch-types.ts` centralises `unknown → FileFormat.*`
  casts with stable corruption sentinels.
- `normalize/sketch-nodes.ts` migrated as a seam — same downstream contract,
  internals route through the new helpers.
- Typecheck: clean. Tests: **128/128** (112 pre-existing + 16 new for
  `sketch-types`). Each of the 4 functional commits is independently green.

No behavioural change is intended in this PR. The friction encountered
during migration was contained to test-fixture casts (boundary-style
double casts) and an internal type rename in `acquire-from-file.ts`
(making "pre-validation shape" explicit). Both were expected by the plan.

**Recommendation: continue with the planned `select-artboard.ts → symbols.ts
→ visual.ts` migration in follow-up PRs**, with the understanding that
visual.ts will likely produce the largest friction surface (see §3 below).

## 1. Friction matrix

Columns:

- **Location** — file:line that surfaced friction during this spike
- **Symptom** — what TS complained about / what old code was doing
- **Category** — `type-only` / `guard-required` / `behavior-risk`
- **Handling** — what we did this PR
- **Notes** — pointers for follow-up work

### Category legend

| Category         | Meaning                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type-only`      | TS error caused purely by tightening `unknown` → `FileFormat.*`. Field exists in FileFormat, old code accessed it correctly, no runtime guard needed.                                                                     |
| `guard-required` | FileFormat marks a field optional that old code treated as present; needs `?.` or a runtime guard. May expose latent bugs.                                                                                                |
| `behavior-risk`  | Old code's shape assumption is not satisfiable under FileFormat (missing field, different name, structural mismatch). Local cast retained to preserve behaviour; follow-up PR must decide whether to fix or live with it. |

### Table

| #   | Location                                                                 | Symptom                                                                                                                                                                                                                            | Category               | Handling                                                                                                                                           | Notes                                                                                                                                                       |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `acquire-from-file.ts:27`                                                | Return type `SketchRawModel` no longer satisfiable from raw `JSON.parse` output. `meta` / `document` are `Record<string, unknown>`.                                                                                                | `type-only`            | Introduced `SketchRawModelInput` — explicit pre-validation shape, loose at FileFormat slots. Function returns input type.                          | Clean separation; this is exactly the boundary we wanted to make explicit.                                                                                  |
| 2   | `extract-raw.ts:54-60` (`getDocumentId`)                                 | Param was `Record<string, unknown>`, now `FileFormat.Document`. Direct `document.do_objectID` access compiles but loses runtime guard.                                                                                             | `guard-required`       | Kept the existing `typeof !== 'string'` runtime check via local `unknown` cast on the field read. Comment explains why TS-trusts ≠ runtime-trusts. | Defensive against new Sketch versions dropping the field; same pattern should be repeated wherever zod-shallow + TS-deep meet.                              |
| 3   | `__tests__/normalize-select-artboard.test.ts:8` (and 2 other test files) | Fixture cast `rawFixture.payload as SketchRawModel` — JSON partial doesn't satisfy `FileFormat.Meta` (missing `commit` / `pagesAndArtboards` / `version` / …).                                                                     | `type-only`            | Changed to `as unknown as SketchRawModel` — the boundary-style double cast. Mirrors `asSketchRawModel` convention; no test expectation changed.    | All three fixture imports use the same fixture file. If we ever expand the fixture's meta block, the double cast becomes unnecessary.                       |
| 4   | `__tests__/normalize-select-artboard.test.ts:33-35`                      | Assigning `SketchNode[]` to `page.data.layers` (now `FileFormat.AnyLayer[]`).                                                                                                                                                      | `type-only`            | Local `as unknown as typeof screenPage.data.layers` cast at the assignment site.                                                                   | Future PR migrating `select-artboard.ts` to FileFormat types should remove the `SketchNode` indirection in tests.                                           |
| 5   | `__tests__/normalize-visual.test.ts:82-88` (`foreignModel` mock)         | Mock `foreignSymbols` entries lack `do_objectID` / `libraryID` / `sourceLibraryName` / `symbolPrivate` / `originalMaster`.                                                                                                         | `behavior-risk` (mild) | Local `as unknown as SketchRawModel` cast on the whole mock. Comment explains test does not exercise those fields.                                 | If `symbols.ts` migration in the next PR starts reading `libraryID` etc., this test will need a richer mock — or a real `FileFormat.ForeignSymbol` factory. |
| 6   | `normalize/sketch-nodes.ts:27,31,37` (legacy getters)                    | `getNodeClass` / `getNodeId` need to preserve historical `'unknown'` / `'missing-node-id'` strings, but `sketch-types` returns finer-grained sentinels (`<missing-class>` vs `<invalid-class>`, `<missing-id>` vs `<invalid-id>`). | `type-only`            | Mapped both sentinels back to legacy strings in `sketch-nodes.ts`. Downstream callers see byte-identical strings.                                  | Anyone who wants the finer distinction (e.g. for richer warning codes) can call `getLayerClass` / `getLayerId` directly. Not a regression.                  |

### Counts

- `type-only`: **5** (rows 1, 3, 4, 6, and the migration of `safeParseSketchRawModel` call sites in `normalize.ts` / `extract-raw.ts` which were pure rename)
- `guard-required`: **1** (row 2)
- `behavior-risk`: **1** (row 5 — mild; the mock genuinely never reads the missing fields)
- **Latent bugs surfaced**: **0**. No `behavior-risk` item revealed an actual regression in this scope.

This is well within the threshold the plan set ("≤ 3 behavior-risk to proceed").
**Recommendation: proceed to select-artboard.ts migration in the next PR.**

## 2. Decision: continue spike beyond `sketch-nodes.ts`?

**Yes**, but split per file. Rationale:

- The actual friction (`acquire-from-file` + 3 test files + 1 mock cast) was
  small and predictable. None required behaviour change.
- The mechanism scales: each future migration target consumes `SketchNode`
  via the same loose-typed contract. Replacing call-site by call-site with
  `is*` guards is a localised refactor per file.
- `sketch-nodes.ts` migration completed without exposing any latent bug,
  which is the empirical signal we wanted before going broader.

## 3. Risk forecast for the next migrations

In rough increasing-order of expected friction:

### Next: `normalize/select-artboard.ts`

- Touches `Page.layers` and looks for `_class === 'artboard'`. Already has
  the right shape for `isArtboard(layer)` from `sketch-types.ts`.
- Test file fixture cast (row 4 above) already preserved.
- **Forecast: low friction. ~1-2 hours.**

### After: `normalize/symbols.ts`

- Builds `SymbolMaster` / `SymbolInstance` indexes by `symbolID`. `is*`
  guards exist. Likely needs to read `overrideValues[].overrideName` etc.
  which are FileFormat-typed.
- Foreign symbols indirection (row 5) lives here — the migration may force
  a richer mock or a factory.
- **Forecast: medium friction. Expect 2-3 `guard-required` items around
  optional override fields.**

### Last: `normalize/visual.ts`

- Largest file, most varied `_class` handling. Will likely surface several
  `behavior-risk` items where old code accessed fields not declared by
  FileFormat (or accessed fields in a way FileFormat says is impossible —
  e.g. `Page.frame` access where FileFormat says no).
- **Forecast: highest friction. Plan to land in 2-3 sub-PRs by sub-feature
  (layout / styles / symbols) rather than one big migration.**

## 4. Known gaps in `@sketch-hq/sketch-file-format-ts@6.5.0`

None observed during this spike. The types covered every field we
touched. This does **not** mean the package is gap-free for visual.ts —
gaps tend to surface when reading effects, fills, gradients, and
text styles, none of which sketch-nodes.ts exercises.

Pre-emptive note for future PRs: if ≥ 3 same-kind gaps appear, prefer
module augmentation in a new `sketch-format-augmentations.d.ts` over
scattered local `as` casts. Single-occurrence gaps can stay local.

## 5. Verification

```sh
# From repo root, on branch worktree-sketch-format-types-spike
npm run typecheck -w @skill-collections/sketch-to-component-scripts  # clean
npm test       -w @skill-collections/sketch-to-component-scripts     # 128/128
```

Commit-by-commit verification (each independently green for `git bisect`):

| Commit    | Subject                                                               | typecheck   | test        |
| --------- | --------------------------------------------------------------------- | ----------- | ----------- |
| `3746f4b` | chore(sketch): add @sketch-hq/sketch-file-format-ts as dev dependency | ✓           | 112/112     |
| `18b6388` | docs(sketch): add file-format types spike development plan            | (docs-only) | (docs-only) |
| `1e5c3d6` | refactor(sketch): split zod runtime guard from TS schema in raw model | ✓           | 112/112     |
| `8ad8a00` | feat(sketch): add typed boundary helpers for layer classification     | ✓           | 128/128     |
| `5200596` | refactor(sketch): migrate sketch-nodes.ts to typed boundary helpers   | ✓           | 128/128     |

## 6. Out of scope (acknowledged, not done)

These were excluded by design and remain untouched:

- `normalize/select-artboard.ts` — next PR
- `normalize/symbols.ts` — PR after that
- `normalize/visual.ts` — last (likely multi-PR)
- `@sketch-hq/sketch-file` parser swap — explicitly rejected
- Any "fix while you're in there" of normalize logic — not in this spike's mandate
