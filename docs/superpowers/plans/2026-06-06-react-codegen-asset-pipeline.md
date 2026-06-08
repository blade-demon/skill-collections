# React Codegen Asset Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit real image files from `component-plan.assetPlan`, reference them from generated React CSS, and make missing asset sources fail before the existing generated package is modified.

**Architecture:** Keep `CodegenFile.content` text-only. The pure `d2c-core` generator joins `component-plan.assetPlan` with `visualView.body.assets` and returns deterministic text files plus a deterministic `CodegenAssetFile[]` copy plan. The Sketch CLI resolves copy-plan source names inside `--assets`, preflights every referenced source, rewrites the managed `src/` tree, and copies bytes into `src/assets/`.

**Tech Stack:** TypeScript, React, CSS Modules, Node.js filesystem APIs, Vitest, Vite, Playwright.

---

## Scope

This PR contains only the React bitmap asset path:

- extend codegen CLI with `--assets`;
- map planned image assets to stable package paths;
- emit CSS image references;
- copy real image bytes at the CLI boundary;
- update the small committed codegen golden and visual harness to include one reused PNG;
- prove text and binary output determinism.

Out of scope:

- `layoutPlan -> flex/grid` mapping;
- vector and compound-path React output;
- gradient parity beyond existing behavior;
- component naming and reuse inference;
- symbol override, transform, mask, or radius normalization changes;
- the full `resource/d2c.sketch` in CI.

## Locked Decisions

1. `CodegenFile.content` remains `string`.
2. Binary bytes never enter `TargetGenerator`; the CLI owns filesystem reads and writes.
3. `CodegenAssetFile` includes `required`, so `writeCodegenPackage()` is self-contained and does not need to receive `component-plan` again.
4. Source names use `basename(originalPath ?? ref)`. Package names use a stable `assetRef` hash plus the normalized original extension.
5. A missing extension is an error. Do not label unknown bytes as `.png`.
6. Generated media uses CSS `background-image` with `background-size: contain`, matching the current preview renderer.
7. Every asset included in `CodegenFilePlan.assets` is a build dependency. The CLI requires `--assets` whenever this list is non-empty and fails if any source is unreadable.
8. The writer is **preflight-protected**, not fully atomic: known asset-source failures occur before `rm(src)`. General disk failures after rewrite begins remain ordinary filesystem failures.
9. The existing `codegen-golden` becomes the small asset regression fixture. Do not add the 5.3 MB real Sketch file or freeze current component/rule counts in CI.

## File Structure

Create:

- `packages/d2c-core/src/ir/asset-path.ts`
  - Pure provider-neutral source-name parsing.
- `packages/d2c-core/src/codegen/assets.ts`
  - Pure join between planned assets and visual asset entries.
- `packages/d2c-core/src/codegen/__tests__/assets.test.ts`
  - Mapping, deduplication, path, and failure tests.
- `skills/sketch-to-component/scripts/src/assets/load-real-image-assets.ts`
  - Script-side IO helper shared by preview and visual harness.
- `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/assets/launch-panel.png`
  - Small 13 KB PNG copied from the existing React fixture asset.

Modify:

- `packages/d2c-core/src/ir/index.ts`
  - Export source-name helper.
- `packages/d2c-core/src/codegen/index.ts`
  - Export asset-plan types/helpers needed by consumers and tests.
- `packages/d2c-core/src/codegen/target.ts`
  - Add `CodegenAssetFile` and `CodegenFilePlan.assets`.
- `packages/d2c-core/src/codegen/react/generate.ts`
  - Resolve media assets and emit CSS references.
- `packages/d2c-core/src/codegen/__tests__/codegen-fixtures.ts`
  - Add visual asset entries for media tests.
- `packages/d2c-core/src/codegen/__tests__/generate-content.test.ts`
  - Lock React asset references and removal of placeholder styling.
- `packages/d2c-core/src/codegen/__tests__/generate.test.ts`
  - Lock deterministic/sorted copy plans.
- `skills/sketch-to-component/scripts/src/cli.ts`
  - Parse `--assets`, use shared loader, preflight and copy assets.
- `skills/sketch-to-component/scripts/src/__tests__/codegen-cli.test.ts`
  - Test CLI parsing, source failure, no-mutation guarantee, copies, and hashes.
- `skills/sketch-to-component/scripts/src/__tests__/codegen-golden.test.ts`
  - Compare text files and binary assets separately.
- `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/design-ir.json`
- `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/design-spec/*.json`
  - Regenerated approved asset-bearing contract fixture.
- `fixtures/apps/react-vite/src/golden/**`
  - Regenerated package, including `src/assets/<stable-name>.png`.
- `skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts`
  - Render the baseline with real bytes and assert media images load.
- `skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts`
  - Lock media-node discovery and loaded-image failure reporting.
- `fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js`
  - Lock the committed generated asset reference.

## Data Contract

Add to `packages/d2c-core/src/codegen/target.ts`:

```ts
export interface CodegenAssetFile {
  assetRef: string;
  sourceFileName: string;
  outputPath: string;
  required: boolean;
}

export interface CodegenFilePlan {
  /** Sorted by `path`, with unique paths. */
  files: CodegenFile[];
  /** Sorted by `outputPath`, with one entry per unique assetRef. */
  assets: CodegenAssetFile[];
  warnings: string[];
}
```

`required` is merged with OR semantics when several planned nodes reuse the same
`assetRef`.

## Failure Semantics

Core generation:

- required planned asset without `assetRef`: throw;
- required `assetRef` missing from `visualView.body.assets`: throw;
- required asset with an empty source basename or missing extension: throw;
- optional unresolved planned asset: warning and retain the current placeholder styling;
- resolved planned asset: emit CSS URL and add one copy-plan entry.

CLI writing:

- `plan.assets.length > 0` without `--assets`: exit with a clear usage error;
- any copy-plan source missing or unreadable: throw before touching `outDir`;
- after successful preflight: remove `outDir/src`, write text files, copy assets;
- stale `src/assets` files disappear through the existing `rm(outDir/src)` behavior.

## Known Limitations (provider-neutrality, deferred)

`ir/asset-path.ts` and `codegen/assets.ts` are placed as provider-neutral, but
two source-name assumptions only hold for the current Sketch provider (which
emits flat, sha-named `images/<sha>.png` refs). Surfaced in the Task 1–4 review;
deferred because no in-tree provider triggers them. Revisit when adding a second
provider (MasterGo, etc.):

1. **Querystring / fragment in extension** — `codegenAssetOutputPath` derives the
   extension via `posix.extname(sourceFileName)`. A ref like `image.png?v=2`
   yields ext `.png?v=2`: the required-extension guard passes, but the output
   path and CSS `url(...)` carry the query verbatim and the CLI tries to copy a
   file literally named with `?`. Fix: strip `?`/`#` before `extname`.
2. **Basename collision across distinct assetRefs** — `sourceFileName =
   basename(originalPath || ref)`. Two distinct assetRefs with the same basename
   (e.g. `a/icon.png`, `b/icon.png`) get distinct hashed `outputPath`s but the
   same `sourceFileName`, so the CLI copies one on-disk file to both
   destinations. This is a pipeline-wide assumption (extract also mirrors by
   basename, so it would collide on write too); holds for Sketch. Fix when a
   provider with non-flat asset layout lands: namespace the mirrored file name.

## Task 1: Add Pure Asset Path And Copy-Plan Contracts

**Files:**

- Create: `packages/d2c-core/src/ir/asset-path.ts`
- Create: `packages/d2c-core/src/codegen/assets.ts`
- Create: `packages/d2c-core/src/codegen/__tests__/assets.test.ts`
- Modify: `packages/d2c-core/src/ir/index.ts`
- Modify: `packages/d2c-core/src/codegen/index.ts`
- Modify: `packages/d2c-core/src/codegen/target.ts`
- Modify: `packages/d2c-core/src/codegen/react/generate.ts`

- [ ] **Step 1: Write failing resolver tests**

Cover:

```ts
it('uses basename(originalPath ?? ref) for the extract source name', () => {
  expect(
    assetSourceFileName({
      id: 'asset-hero',
      kind: 'image',
      ref: 'fallback.png',
      originalPath: 'images/nested/hero.PNG',
    }),
  ).toBe('hero.PNG');
});

it('deduplicates repeated assetRef values and ORs required', () => {
  const result = resolveCodegenAssets({
    plannedAssets: [
      {
        id: 'pa-1',
        semanticNodeId: 's-1',
        assetRef: 'asset-hero',
        usage: 'image',
        required: false,
      },
      {
        id: 'pa-2',
        semanticNodeId: 's-2',
        assetRef: 'asset-hero',
        usage: 'image',
        required: true,
      },
    ],
    visualAssets: [
      {
        id: 'asset-hero',
        kind: 'image',
        ref: 'images/hero.PNG',
        originalPath: 'images/hero.PNG',
      },
    ],
  });

  expect(result.assets).toEqual([
    {
      assetRef: 'asset-hero',
      sourceFileName: 'hero.PNG',
      outputPath: expect.stringMatching(/^src\/assets\/asset-[0-9a-f]{12}\.png$/),
      required: true,
    },
  ]);
  expect(result.outputPathBySemanticNodeId.get('s-1')).toBe(result.assets[0]!.outputPath);
  expect(result.outputPathBySemanticNodeId.get('s-2')).toBe(result.assets[0]!.outputPath);
});

it('rejects a required asset whose metadata or extension is missing', () => {
  expect(() =>
    resolveCodegenAssets({
      plannedAssets: [
        {
          id: 'pa-1',
          semanticNodeId: 's-1',
          assetRef: 'asset-missing',
          usage: 'image',
          required: true,
        },
      ],
      visualAssets: [],
    }),
  ).toThrow(/required asset.*asset-missing/i);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/assets.test.ts
```

Expected: fail because the new types and helpers do not exist.

- [ ] **Step 3: Add the text-only copy-plan type**

Add the `CodegenAssetFile` and `assets` definitions shown in **Data Contract**.
Update the existing React generator return and any manually constructed
`CodegenFilePlan` fixtures to include `assets: []`. Task 1 only establishes the
contract; Task 2 replaces the React generator's empty array with resolved
assets.

- [ ] **Step 4: Implement the pure source-name helper**

`packages/d2c-core/src/ir/asset-path.ts`:

```ts
import { posix } from 'node:path';

import type { AssetEntry } from './visual';

export function assetSourceFileName(asset: AssetEntry): string {
  return posix.basename(asset.originalPath ?? asset.ref);
}
```

Export it from `packages/d2c-core/src/ir/index.ts`.

- [ ] **Step 5: Implement the codegen-specific resolver**

Keep codegen types out of the IR layer:

```ts
import { posix } from 'node:path';

import type { PlannedAsset } from '../contract/component-plan-schema';
import type { AssetEntry } from '../ir/visual';
import { assetSourceFileName } from '../ir/asset-path';
import { stableSha256 } from '../utils/stable-json';
import type { CodegenAssetFile } from './target';

export interface ResolvedCodegenAssets {
  assets: CodegenAssetFile[];
  outputPathBySemanticNodeId: Map<string, string>;
  warnings: string[];
}

export function resolveCodegenAssets(input: {
  plannedAssets: PlannedAsset[];
  visualAssets: AssetEntry[];
}): ResolvedCodegenAssets {
  // Join by assetRef, validate required entries, merge duplicate refs,
  // normalize extension to lowercase, and sort assets by outputPath.
}
```

Use:

```ts
const outputPath =
  `src/assets/asset-${stableSha256(assetRef).slice(0, 12)}` +
  posix.extname(sourceFileName).toLowerCase();
```

Optional unresolved entries append deterministic warnings and do not enter
`outputPathBySemanticNodeId`.

- [ ] **Step 6: Run tests and typecheck**

```bash
npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/assets.test.ts
npm run typecheck:d2c
```

Expected: pass.

- [ ] **Step 7: Commit the contract and resolver**

```bash
git add \
  packages/d2c-core/src/ir/asset-path.ts \
  packages/d2c-core/src/ir/index.ts \
  packages/d2c-core/src/codegen/assets.ts \
  packages/d2c-core/src/codegen/index.ts \
  packages/d2c-core/src/codegen/target.ts \
  packages/d2c-core/src/codegen/react/generate.ts \
  packages/d2c-core/src/codegen/__tests__/assets.test.ts
git commit -m "feat(d2c): plan deterministic codegen assets"
```

## Task 2: Emit React Media References

**Files:**

- Modify: `packages/d2c-core/src/codegen/react/generate.ts`
- Modify: `packages/d2c-core/src/semantic/__tests__/fixtures.ts`
- Modify: `packages/d2c-core/src/contract/__tests__/fixtures.ts`
- Modify: `packages/d2c-core/src/codegen/__tests__/generate-content.test.ts`
- Modify: `packages/d2c-core/src/codegen/__tests__/generate.test.ts`
- Modify: `packages/d2c-core/src/codegen/__tests__/generate-guards.test.ts`

- [ ] **Step 1: Make media fixtures resolvable at the design-IR layer**

The view builders leave `visual.assets` empty while image nodes still carry an
`assetRef`. Two facts force the fix down to the design-IR layer:

1. Mutating `visualView.body.assets` post-hoc is **not viable** — it breaks the
   `semanticView.visualViewHash` chain that `deriveComponentPlan` validates.
2. The gap is **not limited to the mixed fixture**: `makeFullChatView` (via
   `bridgedFullChat`, used by `approvedCodegenInput` / `approvedStubPropsInput`)
   has avatar image nodes (`asset-img`), so every media-bearing fixture would
   otherwise throw on the required-asset check (~17 tests).

Instead, make the shared `wrapDesignIR` builders auto-collect one `AssetEntry`
per distinct image-node `assetRef`, so the whole derivation chain stays
consistent and matches a real design-IR (whose asset catalog always covers its
node `assetRef`s):

```ts
function collectImageAssets(root: VisualNode): AssetEntry[] {
  const byId = new Map<string, AssetEntry>();
  const visit = (node: VisualNode): void => {
    if (node.kind === 'image' && node.assetRef !== undefined && !byId.has(node.assetRef)) {
      byId.set(node.assetRef, {
        id: node.assetRef,
        kind: 'image',
        ref: `${node.assetRef}.png`,
        originalPath: `${node.assetRef}.png`,
      });
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return [...byId.values()];
}
// wrapDesignIR: visual.assets = collectImageAssets(root)
```

Keep the existing media-node `assetRef` values unchanged. `codegen-fixtures.ts`
needs no edit — the consistent chain flows through `presentationalInput` /
`runContract` automatically.

- [ ] **Step 2: Write failing React output tests**

Add assertions:

```ts
it('emits real media references and a deterministic copy plan', () => {
  const input = approvedMixedTextMediaInput();
  const plan = generateComponentPackage(input);
  const css = plan.files
    .filter((file) => file.path.endsWith('.module.css'))
    .map((file) => file.content)
    .join('\n');

  expect(plan.assets).toHaveLength(2);
  expect(css).toMatch(/background-image: url\("\.\.\/assets\/asset-[0-9a-f]{12}\.png"\);/);
  expect(css).toContain('background-size: contain;');
  expect(css).not.toContain('border: 1px dashed rgba(0, 0, 0, 0.2);');
  expect(plan.warnings).not.toContain(
    expect.stringMatching(/planned asset.*not emitted/i),
  );
});
```

Also assert:

- `plan.assets` is sorted by `outputPath`;
- repeated generation returns identical `assets`;
- a required asset without visual metadata throws;
- optional unresolved media retains placeholder CSS and emits a warning.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
npm test --workspace @skill-collections/d2c-core -- \
  src/codegen/__tests__/generate-content.test.ts \
  src/codegen/__tests__/generate.test.ts
```

Expected: fail because React still emits placeholder CSS and no copy plan.

- [ ] **Step 4: Add resolved assets to generator context**

In `generate()`:

```ts
const resolvedAssets = resolveCodegenAssets({
  plannedAssets: componentPlan.body.assetPlan,
  visualAssets: input.visualView.body.assets,
});
```

Extend `ReactCodegenContext` with:

```ts
assetOutputPathBySemanticId: Map<string, string>;
```

Pass `resolvedAssets.outputPathBySemanticNodeId` into `buildContext()`.

- [ ] **Step 5: Emit image CSS while preserving accessible markup**

Keep:

```tsx
<div className={...} role="img" aria-label={...} />
```

For a resolved media semantic node, emit:

```css
display: block;
background-image: url("../assets/asset-<hash>.png");
background-size: contain;
background-position: center;
background-repeat: no-repeat;
```

For an optional unresolved media node, retain the existing gray/dashed
placeholder. Do not retain placeholder styling for resolved media.

- [ ] **Step 6: Return the copy plan and remove the post-v1 warning**

Return:

```ts
return {
  files,
  assets: resolvedAssets.assets,
  warnings: [...resolvedAssets.warnings, ...warnings],
};
```

Delete the blanket `asset generation is post-v1` warning.

- [ ] **Step 7: Run focused and full core verification**

```bash
npm test --workspace @skill-collections/d2c-core -- \
  src/codegen/__tests__/assets.test.ts \
  src/codegen/__tests__/generate-content.test.ts \
  src/codegen/__tests__/generate.test.ts \
  src/codegen/__tests__/generate-guards.test.ts
npm run typecheck:d2c
npm run test:d2c
```

Expected: all pass.

- [ ] **Step 8: Commit the React generator slice**

```bash
git add \
  packages/d2c-core/src/codegen/react/generate.ts \
  packages/d2c-core/src/codegen/__tests__/codegen-fixtures.ts \
  packages/d2c-core/src/codegen/__tests__/generate-content.test.ts \
  packages/d2c-core/src/codegen/__tests__/generate.test.ts
git commit -m "feat(d2c): emit React image references"
```

## Task 3: Add Codegen `--assets` And Preflight-Protected Copying

**Files:**

- Create: `skills/sketch-to-component/scripts/src/assets/load-real-image-assets.ts`
- Modify: `skills/sketch-to-component/scripts/src/cli.ts`
- Modify: `skills/sketch-to-component/scripts/src/__tests__/codegen-cli.test.ts`
- Modify: `skills/sketch-to-component/scripts/src/__tests__/preview.test.ts`

- [ ] **Step 1: Write the CLI argument test**

Extend the existing parse test:

```ts
expect(
  parseCodegenArgs(
    codegenArgv([
      '--spec',
      '/tmp/out/design-spec',
      '--design-ir',
      '/tmp/out/ir/design-ir.json',
      '--assets',
      '/tmp/out/ir/assets',
      '--out',
      '/tmp/pkg',
    ]),
  ),
).toEqual({
  command: 'codegen',
  specDir: '/tmp/out/design-spec',
  designIrPath: '/tmp/out/ir/design-ir.json',
  assetsDir: '/tmp/out/ir/assets',
  outDir: '/tmp/pkg',
});
```

- [ ] **Step 2: Write failing writer tests**

Add tests that:

1. create a temp source asset;
2. write a plan with one `CodegenAssetFile`;
3. assert the exact bytes appear under `outDir/src/assets`;
4. run twice and compare SHA-256 hashes;
5. create an existing sentinel under `outDir/src`;
6. omit the source asset;
7. assert `writeCodegenPackage()` rejects and the sentinel remains unchanged;
8. assert stale assets from a prior successful run disappear on the next run.

Use `stableSha256(new Uint8Array(bytes))` only if the helper accepts bytes;
otherwise compare `Buffer.equals()` and hash through Node `createHash('sha256')`.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
npm test --workspace @skill-collections/sketch-to-component-scripts -- \
  src/__tests__/codegen-cli.test.ts
```

Expected: fail because codegen does not parse or copy assets.

- [ ] **Step 4: Extract the shared script-side loader**

Move the existing `loadRealImageAssets()` IO implementation out of `cli.ts`:

```ts
export async function loadRealImageAssets(
  designIr: DesignIR,
  assetsDir: string,
): Promise<Map<string, RealImageAsset>> {
  const result = new Map<string, RealImageAsset>();
  for (const asset of designIr.visual.assets) {
    if (asset.kind !== 'image') continue;
    const fileName = assetSourceFileName(asset);
    if (!fileName) continue;
    try {
      result.set(asset.id, {
        fileName,
        bytes: await readFile(join(assetsDir, fileName)),
      });
    } catch {
      // Preview keeps its existing placeholder fallback.
    }
  }
  return result;
}
```

Import this helper from preview CLI and later from the visual harness. This
keeps path parsing shared while IO remains in the scripts package.

- [ ] **Step 5: Parse and document codegen `--assets`**

Add `assetsDir?: string` to `CodegenCliArgs`, parse it in `parseCodegenArgs()`,
and update usage to:

```text
npm run codegen -- --spec <design-spec dir> --design-ir <path> [--assets <dir>] --out <pkg dir>
```

- [ ] **Step 6: Implement writer preflight**

Change the signature:

```ts
export async function writeCodegenPackage(
  outDir: string,
  plan: CodegenFilePlan,
  options: { assetsDir?: string } = {},
): Promise<void>
```

Before `rm(outDir/src)`:

```ts
if (plan.assets.length > 0 && options.assetsDir === undefined) {
  throw new Error('codegen: --assets <dir> is required for generated asset references');
}

const sources = [];
for (const asset of plan.assets) {
  const source = join(options.assetsDir!, asset.sourceFileName);
  await access(source, constants.R_OK);
  const stat = await lstat(source);
  if (!stat.isFile()) throw new Error(`codegen: asset source is not a file: ${source}`);
  sources.push({ asset, source });
}
```

Only after every source passes:

```ts
await rm(join(outDir, 'src'), { recursive: true, force: true });
// Existing UTF-8 file writes.
for (const { asset, source } of sources) {
  const dest = join(outDir, asset.outputPath);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(source, dest);
}
```

Wrap access/stat errors with `assetRef`, source name, and expected assets dir.

- [ ] **Step 7: Pass `assetsDir` from the command**

```ts
await writeCodegenPackage(args.outDir, plan, { assetsDir: args.assetsDir });
```

The command does not need to reread `component-plan` for requiredness; the pure
plan is self-contained.

- [ ] **Step 8: Run script tests and typecheck**

```bash
npm test --workspace @skill-collections/sketch-to-component-scripts -- \
  src/__tests__/codegen-cli.test.ts \
  src/__tests__/preview.test.ts
npm run typecheck:sketch
npm run test:sketch
```

Expected: pass.

- [ ] **Step 9: Commit the CLI writer slice**

```bash
git add \
  skills/sketch-to-component/scripts/src/assets/load-real-image-assets.ts \
  skills/sketch-to-component/scripts/src/cli.ts \
  skills/sketch-to-component/scripts/src/__tests__/codegen-cli.test.ts \
  skills/sketch-to-component/scripts/src/__tests__/preview.test.ts
git commit -m "feat(sketch): copy codegen image assets"
```

## Task 4: Convert The Existing Golden Into A Small Asset Fixture

**Files:**

- Create: `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/assets/launch-panel.png`
- Modify: `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/design-ir.json`
- Regenerate: `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/design-spec/*.json`
- Regenerate: `fixtures/apps/react-vite/src/golden/**`
- Modify: `skills/sketch-to-component/scripts/src/__tests__/codegen-golden.test.ts`
- Modify: `fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js`

- [ ] **Step 1: Add a small binary source fixture**

Copy the existing 13 KB PNG:

```bash
mkdir -p skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/assets
cp fixtures/apps/react-vite/src/assets/hero.png \
  skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/assets/launch-panel.png
```

This is an intentional fixture copy, not generated source code.

- [ ] **Step 2: Add two image nodes that reuse one asset**

Update the golden `design-ir.json` with:

- one `AssetEntry`:

```json
{
  "id": "asset-launch-panel",
  "ref": "images/launch-panel.png",
  "kind": "image",
  "originalPath": "images/launch-panel.png"
}
```

- two image nodes under `LaunchPanel`, both using
  `"assetRef": "asset-launch-panel"`.

Keep the artboard small and adjust positions without introducing layout-plan
work. The two nodes prove deduplication: two media references, one copied file.

- [ ] **Step 3: Regenerate contract artifacts in a temp directory**

```bash
REGEN_DIR="$(mktemp -d /private/tmp/codegen-asset-golden.XXXXXX)"
npm run contract --workspace @skill-collections/sketch-to-component-scripts -- \
  --design-ir skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/design-ir.json \
  --out "$REGEN_DIR" \
  --mode presentational \
  --interaction-mode deferred \
  --approval-reason "visual delivery review" \
  --approved-by codex \
  --approved-at 2026-06-06T12:01:00.000Z
npm run approve --workspace @skill-collections/sketch-to-component-scripts -- \
  --spec "$REGEN_DIR/design-spec" \
  --approved-by codex \
  --approved-at 2026-06-06T12:01:00.000Z \
  --acknowledge-behavior-stubbed
```

Replace the committed `design-spec/*.json` with the regenerated files. Review
the diff to ensure only the intended image nodes, asset plan, hashes, and
derived semantics changed.

- [ ] **Step 4: Regenerate the committed React package**

```bash
npm run codegen --workspace @skill-collections/sketch-to-component-scripts -- \
  --spec "$REGEN_DIR/design-spec" \
  --design-ir skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/design-ir.json \
  --assets skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/assets \
  --out fixtures/apps/react-vite/src/golden
```

Expected:

- two media CSS rules reference the same `src/assets/asset-<hash>.png`;
- one PNG exists in the generated package;
- no `planned asset(s) are not emitted yet` warning.

- [ ] **Step 5: Extend golden byte comparison for binary files**

Split committed paths into text and binary:

```ts
const isBinaryPath = (path: string): boolean => path.startsWith('src/assets/');
```

For text files, compare UTF-8 strings. For binary files, compare
`readFileSync()` buffers. Also assert:

```ts
expect(plan.assets).toHaveLength(1);
expect(plan.assets[0]?.required).toBe(true);
```

The golden test should materialize the copy plan into a temp package through
`writeCodegenPackage()` before comparing committed binary output.

- [ ] **Step 6: Lock fixture integration**

In `golden-visual-harness-page.test.js`, assert the generated CSS contains
`background-image: url("../assets/asset-` and the committed generated asset
directory contains exactly one PNG.

- [ ] **Step 7: Run golden and fixture verification**

```bash
npm test --workspace @skill-collections/sketch-to-component-scripts -- \
  src/__tests__/codegen-golden.test.ts
npm run check:fixtures
```

Expected: pass, including Vite resolving the generated CSS asset URL.

- [ ] **Step 8: Commit fixture and regenerated output**

```bash
git add \
  skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden \
  skills/sketch-to-component/scripts/src/__tests__/codegen-golden.test.ts \
  fixtures/apps/react-vite/src/golden \
  fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js
git commit -m "test(codegen): cover generated image assets"
```

## Task 5: Make The Visual Harness Prove Images Load

**Files:**

- Modify: `skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts`
- Modify: `skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts`

- [ ] **Step 1: Extend harness node metadata**

Add:

```ts
export interface HarnessNodes {
  nodeIds: string[];
  rootNodeId: string;
  textNodeIds: Set<string>;
  mediaNodeIds: Set<string>;
}
```

Populate `mediaNodeIds` when semantic node kind is `media`.

- [ ] **Step 2: Add an image-load metric**

Extend `NodeMetrics`:

```ts
backgroundImage: string;
backgroundImageLoaded: boolean;
```

For each captured node:

1. read `getComputedStyle(node).backgroundImage`;
2. extract the first URL;
3. resolve it against `document.baseURI`;
4. load it with an `Image`;
5. set `backgroundImageLoaded = image.complete && image.naturalWidth > 0`.

Use `Promise.all()` inside `page.evaluate()` so metric capture waits for every
media check.

- [ ] **Step 3: Write failing harness tests**

Test that:

- media nodes are discovered;
- baseline loaded + candidate loaded produces no failure;
- candidate `backgroundImageLoaded: false` produces
  `"<node-id> generated image failed to load"`;
- non-media nodes ignore this metric.

- [ ] **Step 4: Run the focused test and verify RED**

```bash
npm test --workspace @skill-collections/sketch-to-component-scripts -- \
  src/__tests__/visual-harness.test.ts
```

Expected: fail because the harness does not inspect media.

- [ ] **Step 5: Render baseline with real bytes**

Load the fixture bytes through the extracted script helper:

```ts
const realAssets = await loadRealImageAssets(
  designIr,
  join(fixtureDir, 'assets'),
);
const preview = runPreview(designIr, { realAssets });
```

Because `baselinePage.setContent()` has no asset server, replace each
`url("./assets/<file>")` in the baseline CSS with a deterministic data URL
constructed from `preview.assets` before calling `setContent()`.

Do not use the data URL in generated React; it is only for the in-memory
baseline page.

- [ ] **Step 6: Add media assertions**

In `assertComparableMetrics()`, require every media node to have:

```ts
baseline.backgroundImageLoaded === true
candidate.backgroundImageLoaded === true
```

Do not compare the literal `backgroundImage` URL because baseline uses an
in-memory data URL while candidate uses a Vite-resolved file URL.

- [ ] **Step 7: Run the real harness locally**

Terminal A:

```bash
npm run dev --prefix fixtures/apps/react-vite -- \
  --host 127.0.0.1 --port 5179 --strictPort
```

Terminal B:

```bash
npm run visual-harness:codegen \
  --workspace @skill-collections/sketch-to-component-scripts -- \
  --candidate-url http://127.0.0.1:5179/visual-harness.html \
  --out /private/tmp/skill-collections-codegen-assets
```

Expected:

- exit `0`;
- `review.html` says `No metric failures`;
- baseline and candidate screenshots both show the PNG;
- deleting the committed generated PNG makes the harness fail with
  `generated image failed to load`.

Restore the deleted fixture file by rerunning codegen, not by hand-editing it.

- [ ] **Step 8: Commit the visual gate**

```bash
git add \
  skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts \
  skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts
git commit -m "test(codegen): gate generated image loading"
```

## Task 6: Document And Run The Full Gate

**Files:**

- Modify: `docs/stages/stage-6-codegen-plan.md`
- Modify: `docs/reports/codegen-react-bottleneck-audit-2026-06-06.md`
- Modify: `packages/d2c-core/README.md`

- [ ] **Step 1: Update Stage 6 asset status**

Replace statements that asset emission is post-v1 with:

- React bitmap assets use reference + CLI copy;
- core returns text files plus copy-plan metadata;
- CLI requires `--assets` for emitted references;
- vector assets remain out of scope.

- [ ] **Step 2: Update CLI examples**

Add:

```bash
npm run codegen --workspace @skill-collections/sketch-to-component-scripts -- \
  --spec <out>/design-spec \
  --design-ir <out>/ir/design-ir.json \
  --assets <out>/ir/assets \
  --out <package-dir>
```

- [ ] **Step 3: Run formatting and focused gates**

```bash
./node_modules/.bin/prettier --write \
  packages/d2c-core/src/ir/asset-path.ts \
  packages/d2c-core/src/ir/index.ts \
  packages/d2c-core/src/codegen/assets.ts \
  packages/d2c-core/src/codegen/index.ts \
  packages/d2c-core/src/codegen/target.ts \
  packages/d2c-core/src/codegen/react/generate.ts \
  packages/d2c-core/src/codegen/__tests__/assets.test.ts \
  packages/d2c-core/src/codegen/__tests__/codegen-fixtures.ts \
  packages/d2c-core/src/codegen/__tests__/generate-content.test.ts \
  packages/d2c-core/src/codegen/__tests__/generate.test.ts \
  skills/sketch-to-component/scripts/src/assets/load-real-image-assets.ts \
  skills/sketch-to-component/scripts/src/cli.ts \
  skills/sketch-to-component/scripts/src/__tests__/codegen-cli.test.ts \
  skills/sketch-to-component/scripts/src/__tests__/codegen-golden.test.ts \
  skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts \
  skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts \
  fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js \
  docs/stages/stage-6-codegen-plan.md \
  docs/reports/codegen-react-bottleneck-audit-2026-06-06.md \
  packages/d2c-core/README.md

npm run typecheck:d2c
npm run test:d2c
npm run typecheck:sketch
npm run test:sketch
npm run check:fixtures
```

Expected: all commands exit `0`.

- [ ] **Step 4: Rerun the real Sketch pipeline**

Use a fresh temp directory and include assets in codegen:

```bash
AUDIT_DIR="$(mktemp -d /private/tmp/skill-collections-codegen-assets.XXXXXX)"
npm run extract --workspace @skill-collections/sketch-to-component-scripts -- \
  --file skills/sketch-to-component/resource/d2c.sketch \
  --out "$AUDIT_DIR"
npm run normalize --workspace @skill-collections/sketch-to-component-scripts -- \
  --raw "$AUDIT_DIR/ir/raw-dsl.json" \
  --out "$AUDIT_DIR"
npm run preview --workspace @skill-collections/sketch-to-component-scripts -- \
  --design-ir "$AUDIT_DIR/ir/design-ir.json" \
  --assets "$AUDIT_DIR/ir/assets" \
  --out "$AUDIT_DIR"
```

Generate and approve the presentational contract:

```bash
npm run contract --workspace @skill-collections/sketch-to-component-scripts -- \
  --design-ir "$AUDIT_DIR/ir/design-ir.json" \
  --out "$AUDIT_DIR" \
  --mode presentational \
  --interaction-mode omitted \
  --approval-reason "codegen asset audit" \
  --approved-by codex \
  --approved-at 2026-06-06T12:00:00.000Z
npm run approve --workspace @skill-collections/sketch-to-component-scripts -- \
  --spec "$AUDIT_DIR/design-spec" \
  --approved-by codex \
  --approved-at 2026-06-06T12:01:00.000Z \
  --acknowledge-behavior-stubbed
```

Then generate the React package:

```bash
npm run codegen --workspace @skill-collections/sketch-to-component-scripts -- \
  --spec "$AUDIT_DIR/design-spec" \
  --design-ir "$AUDIT_DIR/ir/design-ir.json" \
  --assets "$AUDIT_DIR/ir/assets" \
  --out "$AUDIT_DIR/generated-react"
```

Assert:

- 4 planned references resolve;
- 3 unique PNGs exist in `generated-react/src/assets`;
- generated CSS contains image URLs and no dashed media placeholder;
- codegen emits no post-v1 asset warning.

- [ ] **Step 5: Run the repository gate**

```bash
npm run check:full
git diff --check
git status --short
```

Expected:

- `check:full` exits `0`;
- no whitespace errors;
- only intended PR-2 files are modified;
- `.superpowers/` remains untouched.

- [ ] **Step 6: Commit documentation**

```bash
git add \
  docs/stages/stage-6-codegen-plan.md \
  docs/reports/codegen-react-bottleneck-audit-2026-06-06.md \
  packages/d2c-core/README.md
git commit -m "docs: describe React codegen asset delivery"
```

## Merge Acceptance Checklist

- [ ] `CodegenFile.content` is still `string`.
- [ ] Pure generation returns sorted text files and sorted copy-plan entries.
- [ ] Two media nodes sharing one `assetRef` produce one copied file.
- [ ] Missing required metadata fails in core.
- [ ] Missing or unreadable source bytes fail before `outDir/src` is removed.
- [ ] Generated React uses real images with preview-equivalent `contain` behavior.
- [ ] Generated asset references compile through `tsc` and Vite.
- [ ] Golden text and binary output are stable across repeated runs.
- [ ] Visual harness fails when the generated image cannot load.
- [ ] Real `d2c.sketch` emits 3 unique image files and no post-v1 asset warning.
- [ ] No `layoutPlan`, coordinate, vector, or upstream normalization behavior changed.
