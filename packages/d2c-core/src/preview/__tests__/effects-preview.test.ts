import { describe, expect, it } from 'vitest';

import type { VisualView } from '../../ir';
import { generatePreview } from '../generate-preview';

function makeLayerBlurView(): VisualView {
  return {
    kind: 'visual-view',
    generatedFrom: {
      schemaVersion: 'd2c.design-ir/v0.2.0',
      sourceRef: { fileName: 'blur.sketch', documentId: 'doc-blur' },
      designIrHash: 'sha256-placeholder',
    },
    body: {
      artboard: { width: 100, height: 100 },
      assets: [],
      root: {
        id: 'node-root',
        kind: 'frame',
        name: 'Root',
        source: { nodeId: 'root', name: 'Root', originalType: 'artboard', provider: 'test' },
        layout: { x: 0, y: 0, width: 100, height: 100 },
        children: [
          {
            id: 'node-glow',
            kind: 'shape',
            name: 'Glow',
            source: {
              nodeId: 'glow',
              name: 'Glow',
              originalType: 'rectangle',
              provider: 'test',
            },
            layout: { x: 10, y: -20, width: 80, height: 120 },
            style: {
              fills: [{ type: 'color', color: '#FFFDFCFF' }],
              effects: [{ type: 'layerBlur', blur: 50, raw: { sketchBlurType: 0 } }],
            },
            children: [],
          },
        ],
      },
    },
  } as VisualView;
}

function glowBlock(css: string): string {
  return /\.d2c-node-glow \{([^}]*)\}/.exec(css)?.[1] ?? '';
}

describe('generatePreview effects', () => {
  it('renders Sketch layer blur as a CSS blur filter', () => {
    const preview = generatePreview(makeLayerBlurView());

    expect(glowBlock(preview.css)).toContain('filter: blur(50px);');
    expect(glowBlock(preview.css)).not.toContain('box-shadow:');
  });
});
