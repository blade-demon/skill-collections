import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { DesignIR, RunContractInput } from '@skill-collections/d2c-core';

import { planContractFiles } from '../cli.js';

/**
 * Stage 5D-PR-4 golden. Drives a committed `design-ir.json` through the
 * contract pipeline and asserts the four `design-spec/` artifacts + manifest
 * reproduce the committed expected bytes exactly.
 *
 * Why a design-ir.json (not a real .sketch): `*.sketch` is gitignored (binary
 * + absolute paths) and the `contract` CLI accepts only `--file` / `--design-ir`.
 * The `.sketch → design-ir` step is golden-tested by the normalize suite; this
 * golden locks the NEW 5D behavior, `design-ir → design-spec/`.
 *
 * The approval values below must match the ones the committed artifacts were
 * generated with — they are baked into interaction-spec.json (and thus into
 * every downstream hash), so drifting them would change the expected bytes.
 */
const GOLDEN_APPROVAL = {
  reason: 'golden: visual delivery first',
  approvedBy: 'golden-fixture',
  approvedAt: '2026-01-01T00:00:00Z',
} as const;

const goldenDir = fileURLToPath(new URL('./fixtures/contract-golden', import.meta.url));

function readExpected(name: string): string {
  return readFileSync(`${goldenDir}/design-spec/${name}`, 'utf8');
}

function goldenInput(): RunContractInput {
  const designIr = JSON.parse(readFileSync(`${goldenDir}/design-ir.json`, 'utf8')) as DesignIR;
  return {
    designIr,
    mode: 'presentational',
    interactionMode: 'deferred',
    approval: { ...GOLDEN_APPROVAL },
  };
}

const EXPECTED_FILENAMES = [
  'visual-view.json',
  'semantic-view.json',
  'interaction-spec.json',
  'component-plan.json',
  'manifest.json',
] as const;

describe('contract golden — committed design-ir.json → design-spec/', () => {
  it('reproduces every design-spec artifact byte-for-byte', () => {
    const files = planContractFiles(goldenInput());
    expect(files).toHaveLength(EXPECTED_FILENAMES.length);

    for (const file of files) {
      const name = file.relativePath.split(/[\\/]/).pop();
      expect(name).toBeDefined();
      expect(EXPECTED_FILENAMES).toContain(name as (typeof EXPECTED_FILENAMES)[number]);
      expect(file.content).toBe(readExpected(name!));
    }
  });

  it('is byte-identical across repeated runs (reproducibility)', () => {
    const a = planContractFiles(goldenInput());
    const b = planContractFiles(goldenInput());
    expect(a).toEqual(b);
  });

  it('exercises real component-plan breadth (root + candidates + asset + layouts)', () => {
    /* Guards against the golden silently degenerating into a thin plan — if a
     * future change stops promoting the Component/-prefixed frames or the
     * image asset, this catches it. */
    const componentPlan = JSON.parse(readExpected('component-plan.json')) as {
      body: {
        components: { name: string }[];
        exports: { kind: string }[];
        layoutPlan: unknown[];
        assetPlan: { usage: string; assetRef?: string }[];
      };
    };
    expect(componentPlan.body.components.map((c) => c.name)).toEqual([
      'GoldenScreen',
      'ComponentHeader',
      'ComponentCard',
    ]);
    expect(componentPlan.body.exports.filter((e) => e.kind === 'default')).toHaveLength(1);
    expect(componentPlan.body.exports.filter((e) => e.kind === 'named')).toHaveLength(2);
    expect(componentPlan.body.layoutPlan.length).toBeGreaterThanOrEqual(3);
    expect(componentPlan.body.assetPlan).toHaveLength(1);
    expect(componentPlan.body.assetPlan[0]).toMatchObject({
      usage: 'image',
      assetRef: 'asset-hero',
    });
  });

  it('manifest records four derived contract artifacts with sha256 hashes', () => {
    const manifest = JSON.parse(readExpected('manifest.json')) as {
      artifacts: { filename: string; hash: string; origin: string }[];
    };
    expect(manifest.artifacts.map((a) => a.filename)).toEqual([
      'visual-view.json',
      'semantic-view.json',
      'interaction-spec.json',
      'component-plan.json',
    ]);
    for (const entry of manifest.artifacts) {
      expect(entry.origin).toBe('derived');
      expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
