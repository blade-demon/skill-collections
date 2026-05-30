import { describe, expect, it } from 'vitest';

import type { VisualView } from '../../ir';
import { generatePreview } from '../generate-preview';

function makeMaskedView(maskedContent: boolean | undefined): VisualView {
  return {
    kind: 'visual-view',
    generatedFrom: {
      schemaVersion: 'd2c.design-ir/v0.2.0',
      sourceRef: { fileName: 'mask.sketch', documentId: 'doc-mask' },
      designIrHash: 'sha256-placeholder',
    },
    body: {
      artboard: { width: 100, height: 100 },
      assets: [],
      root: {
        id: 'node-root',
        kind: 'frame',
        name: 'Root',
        source: {
          nodeId: 'root',
          name: 'Root',
          originalType: 'artboard',
          provider: 'test',
        },
        layout: { x: 0, y: 0, width: 100, height: 100 },
        style: maskedContent === undefined ? undefined : { raw: { maskedContent } },
        children: [],
      },
    },
  } as VisualView;
}

describe('generatePreview clipping-mask flag', () => {
  it('emits overflow: hidden when a parent carries style.raw.maskedContent === true', () => {
    /* Normalize skips Sketch clipping-mask layers (hasClippingMask: true) and
     * sets the parent's style.raw.maskedContent so preview/codegen can
     * approximate the clipping geometry via overflow:hidden. */
    const preview = generatePreview(makeMaskedView(true));
    expect(preview.css).toContain('overflow: hidden;');
  });

  it('does not emit a per-node overflow when the flag is absent', () => {
    /* The .d2c-node base rule already declares overflow:hidden globally — we
     * only assert the node's own selector block does not duplicate it. */
    const preview = generatePreview(makeMaskedView(undefined));
    const block = /\.d2c-node-root \{([^}]*)\}/.exec(preview.css);
    expect(block, 'expected per-node selector block').not.toBeNull();
    expect(block?.[1] ?? '').not.toContain('overflow: hidden;');
  });

  it('does not emit overflow when maskedContent is false', () => {
    const preview = generatePreview(makeMaskedView(false));
    const block = /\.d2c-node-root \{([^}]*)\}/.exec(preview.css);
    expect(block?.[1] ?? '').not.toContain('overflow: hidden;');
  });
});
