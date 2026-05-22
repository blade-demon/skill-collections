import { describe, expect, it } from 'vitest';
import type { VisualNode, Warning } from '@skill-collections/d2c-core';

import { buildSymbolIndex } from '../normalize/symbols.js';
import { buildVisualBlock } from '../normalize/visual.js';
import { selectArtboard } from '../normalize/select-artboard.js';
import type { SketchNode } from '../normalize/sketch-nodes.js';
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

  it('extracts line height and font weight, stripping the weight suffix to a base family', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    // 2E8552AF — PingFangSC-Semibold, fixed line height 14.
    const semibold = findBySourceNodeId(visual.root, '2E8552AF-6957-440D-B210-6DB461A5A230');
    expect(semibold?.text?.style).toMatchObject({
      fontFamily: 'PingFangSC',
      fontWeight: 600,
      lineHeight: 14,
    });
    // D166FABF — PingFangSC-Regular, line height 24.
    const regular = findBySourceNodeId(visual.root, 'D166FABF-63C5-4808-A96A-093647174CAB');
    expect(regular?.text?.style).toMatchObject({
      fontFamily: 'PingFangSC',
      fontWeight: 400,
      lineHeight: 24,
    });
  });

  it('leaves an unrecognised font name untouched and assigns no weight', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    // 4292B85E — plain "Helvetica", no known weight suffix.
    const helvetica = findBySourceNodeId(visual.root, '4292B85E-1BAD-4D6A-AFDB-267DCDE4F7C8');
    expect(helvetica?.text?.style?.fontFamily).toBe('Helvetica');
    expect(helvetica?.text?.style?.fontWeight).toBeUndefined();
  });

  it('preserves every gradient fill’s raw stops per-fill', () => {
    const warnings: Warning[] = [];
    const gradient = (gradientType: number) => ({
      _class: 'gradient',
      gradientType,
      from: '{0, 0}',
      to: '{1, 1}',
      stops: [
        { position: 0, color: { _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 } },
        { position: 1, color: { _class: 'color', red: 0, green: 0, blue: 1, alpha: 1 } },
      ],
    });
    const artboard = {
      _class: 'artboard',
      do_objectID: 'synthetic-artboard',
      name: 'Synthetic',
      frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 100 },
      layers: [
        {
          _class: 'rectangle',
          do_objectID: 'multi-gradient-rect',
          name: 'MultiGradient',
          frame: { _class: 'rect', x: 0, y: 0, width: 50, height: 50 },
          style: {
            fills: [
              {
                isEnabled: true,
                fillType: 1,
                color: { _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 },
                gradient: gradient(0),
              },
              {
                isEnabled: true,
                fillType: 1,
                color: { _class: 'color', red: 0, green: 0, blue: 1, alpha: 1 },
                gradient: gradient(1),
              },
            ],
          },
          layers: [],
        },
      ],
    } as unknown as SketchNode;

    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const fills = visual.root.children[0]?.style?.fills ?? [];

    expect(fills).toHaveLength(2);
    expect(fills.every((fill) => fill.type === 'gradient')).toBe(true);
    expect((fills[0]?.raw?.gradient as Record<string, unknown> | undefined)?.gradientType).toBe(0);
    expect((fills[1]?.raw?.gradient as Record<string, unknown> | undefined)?.gradientType).toBe(1);
    // each fill carries its own raw object — not a shared reference
    expect(fills[0]?.raw).not.toBe(fills[1]?.raw);
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
