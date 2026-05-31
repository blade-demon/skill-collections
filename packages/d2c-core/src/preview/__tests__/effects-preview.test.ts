import { describe, expect, it } from 'vitest';

import type { Effect, VisualView } from '../../ir';
import { generatePreview } from '../generate-preview';

function makeGlowView(effects: Effect[]): VisualView {
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
              effects,
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
    const preview = generatePreview(
      makeGlowView([{ type: 'layerBlur', blur: 50, raw: { sketchBlurType: 0 } }]),
    );

    expect(glowBlock(preview.css)).toContain('filter: blur(50px);');
    expect(glowBlock(preview.css)).not.toContain('box-shadow:');
  });

  it('renders shadow and layer blur side by side when both are present', () => {
    const preview = generatePreview(
      makeGlowView([
        { type: 'shadow', color: '#00000080', x: 0, y: 2, blur: 8, spread: 0 },
        { type: 'layerBlur', blur: 12, raw: { sketchBlurType: 0 } },
      ]),
    );

    const block = glowBlock(preview.css);
    expect(block).toContain('box-shadow: 0px 2px 8px 0px #00000080;');
    expect(block).toContain('filter: blur(12px);');
  });
});
