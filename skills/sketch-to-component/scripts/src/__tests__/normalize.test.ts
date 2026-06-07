import { describe, expect, it } from 'vitest';
import { normalizeAndValidate } from '@skill-collections/d2c-core';

import { normalizeSketchRaw } from '../normalize.js';
import { SketchProvider } from '../provider.js';
import rawFixture from './fixtures/sketch-raw.min.json';

describe('normalizeSketchRaw', () => {
  it('produces a valid v0.2 design IR from the desensitized fixture', async () => {
    const ir = await normalizeSketchRaw(rawFixture);

    expect(ir.schemaVersion).toBe('d2c.design-ir/v0.3.0');
    expect(ir.source.提供方).toBe('sketch');
    expect(ir.source.rootName).toBe('2.0-1备份 21');
    expect(ir.visual.root.kind).toBe('frame');
    expect(ir.semantic.candidates.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same raw artifact', async () => {
    const first = JSON.stringify(await normalizeSketchRaw(rawFixture), null, 2);
    const second = JSON.stringify(await normalizeSketchRaw(rawFixture), null, 2);

    expect(second).toBe(first);
  });

  it('passes the d2c-core normalizeAndValidate provider handoff', async () => {
    const result = await normalizeAndValidate(SketchProvider, rawFixture);

    expect(result.ok).toBe(true);
  });
});
