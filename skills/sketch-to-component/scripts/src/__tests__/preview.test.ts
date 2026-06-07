import { describe, expect, it } from 'vitest';
import { runPreview } from '@skill-collections/d2c-core';

import { normalizeSketchRaw } from '../normalize.js';
import rawFixture from './fixtures/sketch-raw.min.json';

describe('preview chain', () => {
  it('runs Stage 3 fixture through the shared Gate 1 preview pipeline', async () => {
    const designIr = await normalizeSketchRaw(rawFixture);
    const result = runPreview(designIr);

    expect(result.requiresApproval).toBe('gate-1');
    expect(result.visualView.generatedFrom?.schemaVersion).toBe('d2c.design-ir/v0.3.0');
    expect(result.visualViewJson).toContain('"kind": "visual-view"');
    expect(result.html).toContain('<link rel="stylesheet" href="./preview.css">');
    expect(result.css).toContain('background-image: url("./assets/');
    expect(result.report).toContain('Visual Review Report');
    expect(result.stats.placeholderAssets).toBeGreaterThan(0);
    expect(result.stats.overrideApplied + result.stats.overrideUnmapped).toBeGreaterThan(0);
  });
});
