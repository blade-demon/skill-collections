import { describe, expect, it } from 'vitest';
import type { Warning } from '@skill-collections/d2c-core';

import { buildSymbolIndex } from '../normalize/symbols.js';
import { buildVisualBlock } from '../normalize/visual.js';
import { selectArtboard } from '../normalize/select-artboard.js';
import type { SketchRawModel } from '../sketch-raw-model.js';
import rawFixture from './fixtures/sketch-raw.min.json';

const model = rawFixture.payload as SketchRawModel;

describe('buildVisualBlock', () => {
  it('normalizes the selected artboard into a v0.2 visual block', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });

    expect(visual.artboard).toEqual({ width: 375, height: 1173 });
    expect(visual.root.layout).toEqual({ x: 0, y: 0, width: 375, height: 1173 });
    expect(visual.root.source.originalType).toBe('artboard');
    expect(visual.root.children[0]?.source.nodeId).toBe('7969B30E-865F-4FFF-A96B-84A5CD6B9B44');
    expect(visual.assets.some((asset) => asset.kind === 'image')).toBe(true);
  });

  it('expands symbol instances and preserves symbol trace', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const statusBar = visual.root.children.find(
      (node) => node.source.nodeId === 'EE90FF21-9364-43AA-ABE9-86C546BA8629',
    );

    expect(statusBar?.symbol).toMatchObject({
      instanceId: 'EE90FF21-9364-43AA-ABE9-86C546BA8629',
      masterId: 'ED66BEC9-2CC6-4510-A066-27F44B3B070E',
    });
    expect(statusBar?.children.length).toBeGreaterThan(0);
  });
});
