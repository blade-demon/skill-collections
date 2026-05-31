import { describe, expect, it } from 'vitest';

import type { Border, VisualView } from '../../ir';
import { generatePreview } from '../generate-preview';

function makeBorderedShapeView(border: Border): VisualView {
  return {
    kind: 'visual-view',
    generatedFrom: {
      schemaVersion: 'd2c.design-ir/v0.2.0',
      sourceRef: { fileName: 'border.sketch', documentId: 'doc-border' },
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
            id: 'node-rect',
            kind: 'shape',
            name: 'Rect',
            source: { nodeId: 'rect', name: 'Rect', originalType: 'rectangle', provider: 'test' },
            layout: { x: 0, y: 0, width: 80, height: 40 },
            style: { borders: [border] },
            children: [],
          },
        ],
      },
    },
  } as VisualView;
}

function rectBlock(css: string): string {
  return /\.d2c-node-rect \{([^}]*)\}/.exec(css)?.[1] ?? '';
}

describe('generatePreview border seam suppression', () => {
  it('skips a sub-pixel inside white stroke (the chat-bubble seam case)', () => {
    const preview = generatePreview(
      makeBorderedShapeView({ color: '#FFFFFFFF', thickness: 0.5, position: 1 }),
    );
    expect(rectBlock(preview.css)).not.toContain('border:');
  });

  it('still renders a 1px inside border', () => {
    const preview = generatePreview(
      makeBorderedShapeView({ color: '#3366FFFF', thickness: 1, position: 1 }),
    );
    expect(rectBlock(preview.css)).toContain('border: 1px solid #3366FFFF;');
  });

  it('still renders a sub-pixel border when it is not an inside stroke', () => {
    const preview = generatePreview(
      makeBorderedShapeView({ color: '#3366FFFF', thickness: 0.5, position: 2 }),
    );
    expect(rectBlock(preview.css)).toContain('border: 0.5px solid #3366FFFF;');
  });
});
