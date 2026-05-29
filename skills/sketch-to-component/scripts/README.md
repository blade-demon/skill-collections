# sketch-to-component scripts (CLI)

Provider-specific CLI for the Sketch leg of the D2C pipeline. Acquires and
normalizes `.sketch` files into the shared `design-ir.json`, renders the
Stage 4 preview, and runs the Stage 5 contract chain. All shared schema /
derive logic lives in `@skill-collections/d2c-core`; this package owns
provider parsing and the **only** disk IO (core stays pure).

Run via `tsx` (no build step):

```bash
npm run extract   -- --file <app.sketch> --out <dir>
npm run normalize -- --raw <dir>/ir/raw-dsl.json --out <dir> [--artboard <id|name>]
npm run preview   -- --design-ir <dir>/ir/design-ir.json --out <dir>
npm run contract  -- (--file <app.sketch> [--artboard <id|name>] | --design-ir <path>) \
                     --out <dir> --mode presentational \
                     --interaction-mode <omitted|deferred> \
                     --approval-reason <str> --approved-by <str> --approved-at <iso>
```

## `contract` (Stage 5D)

Runs `runContract` (chains visual-view → semantic-view → interaction-spec →
component-plan) and writes the result under `<out>/`.

Input is exactly one of:

- `--file <app.sketch>` — extract + normalize, then run the full chain. Also
  persists the normalized `ir/design-ir.json` so the output dir is a
  self-contained, re-runnable record.
- `--design-ir <path>` — start from an existing `design-ir.json`.

Output layout:

```
<out>/
  ir/
    design-ir.json        # only written for --file
  design-spec/
    visual-view.json
    semantic-view.json
    interaction-spec.json
    component-plan.json
    manifest.json         # { artifacts: [{ filename, hash, origin, generatedFrom }] }
```

Artifacts are serialized as sorted-key, pretty JSON with a trailing newline,
so the same input produces byte-identical output across runs (locked by the
`contract-golden` test).

### Flags

- `--mode presentational | interactive` — component-plan codegen archetype.
  **`interactive` is rejected** by this CLI: it derives the interaction spec,
  which is never `approved`, and interactive mode requires an approved spec.
  Feeding a pre-approved spec (the reuse-input flow) is a planned follow-up;
  for now use `--mode presentational`.
- `--interaction-mode draft | omitted | deferred` — how the interaction spec
  is derived. `omitted` / `deferred` require the three approval flags below;
  `draft` must not carry them. (Note: presentational mode needs `omitted` or
  `deferred`.)
- `--approval-reason` / `--approved-by` / `--approved-at` — all three or none.
- `--artboard <id|name>` — artboard selector, only meaningful with `--file`.

### Boundary

`d2c-core` does no file IO. `runContract` and `buildContractManifest` return
in-memory values; `planContractFiles` (in `src/cli.ts`) serializes them to
strings; only `runContractCommand` calls `mkdir` / `writeFile`.

## Tests

```bash
npm run typecheck
npm test
```

`.sketch` inputs are gitignored, so the contract golden uses a committed
`design-ir.json` fixture (`src/__tests__/fixtures/contract-golden/`) and
asserts byte-identical `design-spec/` output. The `.sketch → design-ir` step
is covered separately by the normalize tests.
