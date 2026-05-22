import { describe, expect, it } from 'vitest';
import type { VisualNode, Warning } from '@skill-collections/d2c-core';

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

  it('captures a text layer fill as text colour, never as a box background', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    // 3D03EB9F… is a text layer that carries a layer-level style.fills in the
    // fixture — that fill is the text colour and must not survive as style.fills,
    // or preview/codegen would paint the text node as a solid block.
    const textNode = findBySourceNodeId(visual.root, '3D03EB9F-F0E4-4685-AE5B-88630BBF4E1A');

    expect(textNode?.kind).toBe('text');
    expect(textNode?.style?.fills).toBeUndefined();
    expect(textNode?.text?.style?.color).toBeDefined();
  });
});

function findBySourceNodeId(node: VisualNode, nodeId: string): VisualNode | undefined {
  if (node.source.nodeId === nodeId) return node;
  for (const child of node.children) {
    const found = findBySourceNodeId(child, nodeId);
    if (found) return found;
  }
  return undefined;
}
