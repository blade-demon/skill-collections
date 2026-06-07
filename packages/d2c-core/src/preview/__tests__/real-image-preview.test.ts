import { describe, expect, it } from 'vitest';

import type { VisualView } from '../../ir';
import { generatePreview, type RealImageAsset } from '../generate-preview';

function makeImageView(assetRef: string): VisualView {
  return {
    kind: 'visual-view',
    generatedFrom: {
      schemaVersion: 'd2c.design-ir/v0.3.0',
      sourceRef: { fileName: 'img.sketch', documentId: 'doc-img' },
      designIrHash: 'sha256-placeholder',
    },
    body: {
      artboard: { width: 100, height: 100 },
      assets: [],
      root: {
        id: 'node-root',
        kind: 'frame',
        name: 'Root',
        source: { nodeId: 'root', name: 'Root', originalType: 'artboard', 提供方: 'test' },
        layout: { x: 0, y: 0, width: 100, height: 100 },
        children: [
          {
            id: 'node-img',
            kind: 'image',
            name: 'Photo',
            source: { nodeId: 'img', name: 'Photo', originalType: 'bitmap', 提供方: 'test' },
            layout: { x: 0, y: 0, width: 80, height: 60 },
            assetRef,
            children: [],
          },
        ],
      },
    },
  } as VisualView;
}

describe('generatePreview real image assets', () => {
  it('renders the real bitmap and emits its bytes when the asset is provided', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const realAssets = new Map<string, RealImageAsset>([
      ['asset-photo', { fileName: 'photo.png', bytes }],
    ]);

    const preview = generatePreview(makeImageView('asset-photo'), { realAssets });

    // real image referenced via background-image, not a placeholder SVG
    expect(preview.css).toContain('background-image: url("./assets/photo.png");');
    expect(preview.css).toContain('background-size: contain;');
    expect(preview.css).not.toContain('.svg');
    // no placeholder label in the HTML for a resolved real image
    expect(preview.html).not.toContain('Image placeholder');
    // bytes are emitted as a real asset, none as placeholder
    expect(preview.stats).toEqual({ placeholderAssets: 0, realAssets: 1 });
    const emitted = preview.assets.find((a) => a.path === 'assets/photo.png');
    expect(emitted?.content).toBe(bytes);
  });

  it('falls back to the placeholder SVG when no real asset is provided', () => {
    const preview = generatePreview(makeImageView('asset-photo'));

    expect(preview.css).toContain('background-image: url("./assets/asset-photo.svg");');
    expect(preview.html).toContain('Image placeholder: asset-photo');
    expect(preview.stats).toEqual({ placeholderAssets: 1, realAssets: 0 });
    expect(preview.assets[0]?.path).toBe('assets/asset-photo.svg');
    expect(typeof preview.assets[0]?.content).toBe('string');
  });

  it('falls back to the placeholder when the asset map lacks this assetRef', () => {
    const realAssets = new Map<string, RealImageAsset>([
      ['asset-other', { fileName: 'other.png', bytes: new Uint8Array([1]) }],
    ]);

    const preview = generatePreview(makeImageView('asset-photo'), { realAssets });

    expect(preview.css).toContain('background-image: url("./assets/asset-photo.svg");');
    expect(preview.stats).toEqual({ placeholderAssets: 1, realAssets: 0 });
  });
});
