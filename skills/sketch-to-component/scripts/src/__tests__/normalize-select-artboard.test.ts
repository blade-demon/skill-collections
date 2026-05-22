import { describe, expect, it } from 'vitest';

import { selectArtboard } from '../normalize/select-artboard.js';
import type { SketchNode } from '../normalize/sketch-nodes.js';
import type { SketchRawModel } from '../sketch-raw-model.js';
import rawFixture from './fixtures/sketch-raw.min.json';

const model = rawFixture.payload as SketchRawModel;

describe('selectArtboard', () => {
  it('selects the only non-symbol-library artboard by default', () => {
    const result = selectArtboard(model);

    expect(result.artboard._class).toBe('artboard');
    expect(result.artboard.do_objectID).toBe('FB78DEF5-E31F-4488-93A0-174A45FDC7BA');
    expect(result.page.data.name).toBe('页面 1');
  });

  it('selects by explicit artboard id', () => {
    const result = selectArtboard(model, {
      artboard: 'FB78DEF5-E31F-4488-93A0-174A45FDC7BA',
    });

    expect(result.artboard.name).toBe('2.0-1备份 21');
  });

  it('rejects ambiguous automatic artboard selection', () => {
    const duplicate = structuredClone(model);
    const screenPage = duplicate.pages.find((page) => page.data.name === '页面 1');
    const layers = screenPage?.data.layers as SketchNode[] | undefined;
    const artboard = layers?.[0];
    if (!screenPage || !artboard) throw new Error('fixture missing screen artboard');
    screenPage.data.layers = [
      artboard,
      { ...structuredClone(artboard), do_objectID: 'other-artboard' },
    ];

    expect(() => selectArtboard(duplicate)).toThrow(/Multiple artboards/);
  });
});
