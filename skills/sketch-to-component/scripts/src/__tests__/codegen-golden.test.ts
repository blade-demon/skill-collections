import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { planCodegenFiles, writeCodegenPackage } from '../cli.js';

/**
 * Stage 6-PR-4 golden. Drives a committed APPROVED, asset-bearing `design-spec/`
 * (produced by the real `contract` → `approve` CLIs) through `planCodegenFiles`,
 * materializes the package with `writeCodegenPackage` (which copies real bytes
 * from the committed `--assets` dir), and asserts it reproduces every committed
 * file — text byte-for-byte and binary buffer-for-buffer — and is stable.
 *
 * The expected package lives under `fixtures/apps/react-vite/src/golden` (NOT
 * beside this test): it is the single committed copy, also compiled by
 * `build:fixtures` (`tsc -b && vite build`) so the golden is proven
 * tsc/build-clean, not just unit-tested. The two media nodes reuse one assetRef,
 * so the deduped copy plan emits exactly one PNG under `src/assets/`.
 */
const inputDir = fileURLToPath(new URL('./fixtures/codegen-golden', import.meta.url));
const assetsDir = join(inputDir, 'assets');
const expectedDir = fileURLToPath(
  new URL('../../../../../fixtures/apps/react-vite/src/golden', import.meta.url),
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function goldenInput() {
  return {
    designIr: readJson(`${inputDir}/design-ir.json`),
    visualView: readJson(`${inputDir}/design-spec/visual-view.json`),
    semanticView: readJson(`${inputDir}/design-spec/semantic-view.json`),
    interactionSpec: readJson(`${inputDir}/design-spec/interaction-spec.json`),
    componentPlan: readJson(`${inputDir}/design-spec/component-plan.json`),
    manifest: readJson(`${inputDir}/design-spec/manifest.json`),
  };
}

/** Every committed file under fixtures/apps/react-vite/src/golden, as POSIX-relative paths. */
function committedPaths(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...committedPaths(`${dir}/${entry.name}`, rel));
    else out.push(rel);
  }
  return out.sort();
}

const isBinaryPath = (rel: string): boolean => rel.startsWith('src/assets/');

describe('codegen golden — approved asset-bearing design-spec/ → React package', () => {
  it('materializes a package matching every committed file (text + binary)', async () => {
    const plan = planCodegenFiles(goldenInput());
    // Two media nodes, one shared assetRef → one required copy-plan entry.
    expect(plan.assets).toHaveLength(1);
    expect(plan.assets[0]?.required).toBe(true);

    const tempDir = await mkdtemp(join(tmpdir(), 'codegen-golden-'));
    try {
      await writeCodegenPackage(tempDir, plan, { assetsDir });

      const committed = committedPaths(expectedDir);
      expect(committedPaths(tempDir)).toEqual(committed);

      for (const rel of committed) {
        if (isBinaryPath(rel)) {
          expect(
            readFileSync(join(tempDir, rel)).equals(readFileSync(join(expectedDir, rel))),
            `binary drift in ${rel}`,
          ).toBe(true);
        } else {
          expect(readFileSync(join(tempDir, rel), 'utf8'), `content drift in ${rel}`).toBe(
            readFileSync(join(expectedDir, rel), 'utf8'),
          );
        }
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('is byte-identical across runs and emits no warnings', () => {
    const a = planCodegenFiles(goldenInput());
    const b = planCodegenFiles(goldenInput());
    expect(a).toEqual(b);
    expect(a.warnings).toEqual([]);
  });

  it('records full d2c provenance (mode + Gate 2 level + four source hashes)', () => {
    const { files } = planCodegenFiles(goldenInput());
    const pkg = JSON.parse(files.find((f) => f.path === 'package.json')!.content) as {
      d2c?: { mode?: string; gate2Level?: string; sourceHashes?: Record<string, string> };
    };
    expect(pkg.d2c?.mode).toBe('presentational');
    expect(pkg.d2c?.gate2Level).toBe('presentational');
    expect(Object.keys(pkg.d2c?.sourceHashes ?? {}).sort()).toEqual([
      'componentPlan',
      'interactionSpec',
      'semanticView',
      'visualView',
    ]);
    for (const hash of Object.values(pkg.d2c?.sourceHashes ?? {})) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
