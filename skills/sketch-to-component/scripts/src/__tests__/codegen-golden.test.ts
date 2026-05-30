import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { planCodegenFiles } from '../cli.js';

/**
 * Stage 6-PR-4 golden. Drives a committed APPROVED, no-asset `design-spec/`
 * (produced by the real `contract` → `approve` CLIs) through `planCodegenFiles`
 * and asserts the generated React package reproduces the committed expected
 * bytes exactly, and is byte-stable across runs.
 *
 * The expected package lives under `fixtures/apps/react-vite/src/golden` (NOT
 * beside this test): it is the single committed copy, also compiled by
 * `build:fixtures` (`tsc -b && vite build`) so the golden is proven
 * tsc/build-clean, not just unit-tested. Keeping one copy means the
 * byte-compare here and the build proof cannot drift apart.
 */
const inputDir = fileURLToPath(new URL('./fixtures/codegen-golden', import.meta.url));
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

describe('codegen golden — approved no-asset design-spec/ → React package', () => {
  it('reproduces every committed package file byte-for-byte', () => {
    const { files } = planCodegenFiles(goldenInput());

    // The generated set and the committed set must match exactly (no stale or
    // missing committed files).
    expect(files.map((f) => f.path).sort()).toEqual(committedPaths(expectedDir));

    for (const file of files) {
      expect(file.content, `content drift in ${file.path}`).toBe(
        readFileSync(`${expectedDir}/${file.path}`, 'utf8'),
      );
    }
  });

  it('is byte-identical across runs and emits no warnings (no-asset)', () => {
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
