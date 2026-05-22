import { describe, expect, it } from 'vitest';

import {
  AssetEntrySchema,
  DESIGN_IR_SCHEMA_VERSION,
  DesignIRSchema,
  SemanticBlockSchema,
  VisualBlockSchema,
  VisualNodeSchema,
} from '../index';
import minimalDesignIR from './fixtures/minimal-design-ir.json';

describe('Design IR v0.2 visual and semantic schemas', () => {
  it('uses the v0.2.0 schema version', () => {
    expect(DESIGN_IR_SCHEMA_VERSION).toBe('d2c.design-ir/v0.2.0');
  });

  it('requires a real visual block instead of a loose object', () => {
    const ir = { ...minimalDesignIR, visual: {} };

    expect(DesignIRSchema.safeParse(ir).success).toBe(false);
  });

  it('requires a semantic candidate envelope', () => {
    const semantic = {
      candidates: [{ nodeId: 'node-1', candidateName: 'StatusBar', confidence: 'low' }],
    };

    expect(SemanticBlockSchema.safeParse(semantic).success).toBe(false);
  });

  it('parses a visual node with style, text, asset, and symbol trace', () => {
    const node = {
      id: 'node-image',
      kind: 'image',
      name: 'HeroImage',
      source: {
        nodeId: 'sketch-node-1',
        name: 'Hero',
        originalType: 'bitmap',
        provider: 'sketch',
      },
      layout: { x: 12, y: 20, width: 100, height: 80 },
      style: {
        fills: [{ type: 'color', color: '#FFFFFFFF' }],
        borders: [{ color: '#000000FF', thickness: 1 }],
        effects: [{ type: 'shadow', color: '#00000033', x: 0, y: 2, blur: 8 }],
        opacity: 0.8,
        radius: { topLeft: 4, topRight: 4, bottomRight: 8, bottomLeft: 8 },
        raw: { blendMode: 0 },
      },
      text: {
        content: 'Example',
        style: {
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 20,
          color: '#111111FF',
          textAlign: 'center',
        },
      },
      assetRef: 'asset-1',
      symbol: {
        instanceId: 'instance-1',
        masterId: 'master-1',
        overrides: [{ path: 'text/title', value: 'Example' }],
      },
      children: [],
    };

    expect(VisualNodeSchema.safeParse(node).success).toBe(true);
  });

  it('parses a visual block with an asset index', () => {
    const block = {
      artboard: { width: 375, height: 812 },
      assets: [{ id: 'asset-1', ref: 'images/example.png', kind: 'image' }],
      root: minimalDesignIR.visual.root,
    };

    expect(VisualBlockSchema.safeParse(block).success).toBe(true);
    expect(AssetEntrySchema.safeParse(block.assets[0]).success).toBe(true);
  });
});
