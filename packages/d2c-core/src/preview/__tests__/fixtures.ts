import type { DesignIR, VisualBlock, VisualNode } from '../../ir';

export function makeTextNode(id: string, content: string): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'text',
    name: `Text${id}`,
    source: {
      nodeId: id,
      name: `Text ${id}`,
      originalType: 'text',
      提供方: 'test',
    },
    layout: { x: 10, y: 12, width: 120, height: 24 },
    text: {
      content,
      style: {
        fontFamily: 'Inter',
        fontSize: 14,
        color: '#111111FF',
        textAlign: 'left',
      },
    },
    children: [],
  };
}

export function makeVisualBlock(): VisualBlock {
  return {
    artboard: { width: 320, height: 240 },
    assets: [{ id: 'asset-hero', ref: 'images/hero.png', kind: 'image' }],
    root: {
      id: 'node-root',
      kind: 'frame',
      name: 'Root',
      source: {
        nodeId: 'root',
        name: 'Root',
        originalType: 'artboard',
        提供方: 'test',
      },
      layout: { x: 0, y: 0, width: 320, height: 240 },
      style: {
        fills: [{ type: 'color', color: '#FFFFFFFF' }],
      },
      children: [
        {
          id: 'node-symbol',
          kind: 'frame',
          name: 'SymbolInstance',
          source: {
            nodeId: 'symbol-instance',
            name: 'Symbol Instance',
            originalType: 'symbolInstance',
            提供方: 'test',
          },
          layout: { x: 20, y: 20, width: 200, height: 100 },
          symbol: {
            instanceId: 'symbol-instance',
            masterId: 'symbol-master',
            overrides: [
              { path: 'nested/text-target_stringValue', value: 'Applied override' },
              { path: 'missing-text_stringValue', value: 'Missing override' },
              { path: 'shape-target_color:fill-0', value: '#FF0000FF' },
            ],
          },
          children: [
            makeTextNode('text-target', 'Default text'),
            {
              id: 'node-shape',
              kind: 'shape',
              name: 'Shape',
              source: {
                nodeId: 'shape-target',
                name: 'Shape',
                originalType: 'rectangle',
                提供方: 'test',
              },
              layout: { x: 0, y: 50, width: 80, height: 30 },
              style: {
                fills: [{ type: 'color', color: '#EEEEEEFF' }],
                radius: 4,
              },
              children: [],
            },
          ],
        },
        {
          id: 'node-image',
          kind: 'image',
          name: 'HeroImage',
          source: {
            nodeId: 'image-node',
            name: 'Hero Image',
            originalType: 'bitmap',
            提供方: 'test',
          },
          layout: { x: 20, y: 140, width: 96, height: 48 },
          assetRef: 'asset-hero',
          children: [],
        },
      ],
    },
  };
}

export function makeDesignIR(): DesignIR {
  return {
    schemaVersion: 'd2c.design-ir/v0.3.0',
    source: {
      提供方: 'test',
      ref: { fileName: 'fixture.sketch', documentId: 'doc-1' },
      rootName: 'Preview Fixture',
    },
    visual: makeVisualBlock(),
    semantic: { candidates: [] },
    interaction: { status: 'draft' },
    warnings: [
      {
        code: 'fixture-warning',
        message: 'Existing normalize warning',
        severity: 'warning',
        stage: 'test',
      },
    ],
  };
}
