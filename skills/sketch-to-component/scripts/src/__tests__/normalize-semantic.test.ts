import { describe, expect, it } from 'vitest';
import type { Warning } from '@skill-collections/d2c-core';

import { deriveSemanticBlock } from '../normalize/semantic.js';
import { buildSymbolIndex } from '../normalize/symbols.js';
import { buildVisualBlock } from '../normalize/visual.js';
import { selectArtboard } from '../normalize/select-artboard.js';
import type { SketchRawModel } from '../sketch-raw-model.js';
import rawFixture from './fixtures/sketch-raw.min.json';

const model = rawFixture.payload as SketchRawModel;

describe('deriveSemanticBlock', () => {
  it('creates very thin candidates from symbol and naming heuristics', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const semantic = deriveSemanticBlock(visual.root, warnings);

    expect(semantic.candidates.length).toBeGreaterThan(0);
    expect(semantic.candidates.some((candidate) => candidate.symbolMasterId)).toBe(true);
    expect(semantic.candidates.every((candidate) => candidate.reason.length > 0)).toBe(true);
    expect(warnings.some((warning) => warning.code === 'low-confidence-semantic-candidate')).toBe(true);
  });
});
