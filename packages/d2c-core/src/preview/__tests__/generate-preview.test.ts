import { describe, expect, it } from 'vitest';

import { deriveVisualView } from '../derive-visual-view';
import { generatePreview } from '../generate-preview';
import { makeDesignIR } from './fixtures';

describe('generatePreview', () => {
  it('renders deterministic HTML, CSS, and placeholder SVG assets', () => {
    const { visualView } = deriveVisualView(makeDesignIR());
    const preview = generatePreview(visualView);

    expect(preview.html).toContain('<link rel="stylesheet" href="./preview.css">');
    expect(preview.html).toContain('Applied override');
    expect(preview.html).not.toContain('Default text');
    expect(preview.css).toContain('.d2c-node-root');
    expect(preview.css).toContain('background-color: #FFFFFFFF;');
    expect(preview.css).toContain('background-image: url("./assets/asset-hero.svg");');
    expect(preview.assets).toHaveLength(1);
    expect(preview.assets[0]).toMatchObject({
      path: 'assets/asset-hero.svg',
      assetId: 'asset-hero',
    });
    expect(preview.assets[0]?.content).toContain('asset-hero');
    expect(preview.assets[0]?.content).toContain('96 x 48');
    expect(preview.stats.placeholderAssets).toBe(1);
  });

  it('is byte-stable for the same visual view', () => {
    const { visualView } = deriveVisualView(makeDesignIR());
    const first = generatePreview(visualView);
    const second = generatePreview(visualView);

    expect(second.html).toBe(first.html);
    expect(second.css).toBe(first.css);
    expect(JSON.stringify(second.assets)).toBe(JSON.stringify(first.assets));
  });
});
