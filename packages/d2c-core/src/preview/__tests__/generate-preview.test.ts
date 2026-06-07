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

  it('does not render text fills as background colors', () => {
    const designIr = makeDesignIR();
    const textNode = designIr.visual.root.children[0]?.children[0];
    if (!textNode?.text) throw new Error('Fixture text node missing');
    textNode.style = {
      ...textNode.style,
      fills: [{ type: 'color', color: '#000000FF' }],
    };
    textNode.text = {
      ...textNode.text,
      style: {
        ...textNode.text.style,
        color: '#000000FF',
      },
    };

    const { visualView } = deriveVisualView(designIr);
    const preview = generatePreview(visualView);
    const textRule = cssRule(preview.css, '.d2c-node-text-target');

    expect(textRule).toContain('color: #000000FF;');
    expect(textRule).not.toContain('background-color: #000000FF;');
  });

  it('does not render unsupported vector paths as filled bounding boxes', () => {
    const designIr = makeDesignIR();
    designIr.visual.root.children.push({
      id: 'node-vector-group',
      kind: 'shape',
      name: 'VectorGroup',
      source: {
        nodeId: 'vector-group',
        name: 'Vector Group',
        originalType: 'shapeGroup',
        提供方: 'test',
      },
      layout: { x: 160, y: 140, width: 40, height: 24 },
      style: {
        fills: [{ type: 'color', color: '#000000FF' }],
      },
      children: [
        {
          id: 'node-vector-path',
          kind: 'shape',
          name: 'VectorPath',
          source: {
            nodeId: 'vector-path',
            name: 'Vector Path',
            originalType: 'shapePath',
            提供方: 'test',
          },
          layout: { x: 0, y: 0, width: 40, height: 24 },
          style: {
            fills: [{ type: 'color', color: '#000000FF' }],
          },
          children: [],
        },
      ],
    });

    const { visualView } = deriveVisualView(designIr);
    const preview = generatePreview(visualView);

    expect(cssRule(preview.css, '.d2c-node-shape')).toContain('background-color: #EEEEEEFF;');
    expect(cssRule(preview.css, '.d2c-node-vector-group')).not.toContain(
      'background-color: #000000FF;',
    );
    expect(cssRule(preview.css, '.d2c-node-vector-path')).not.toContain(
      'background-color: #000000FF;',
    );
  });

  it('renders Sketch auto-width text as a single intrinsic line', () => {
    const designIr = makeDesignIR();
    const textNode = designIr.visual.root.children[0]?.children[0];
    if (!textNode?.text) throw new Error('Fixture text node missing');
    textNode.id = 'node-auto-text';
    textNode.layout = { x: 0, y: 0, width: 36, height: 17 };
    textNode.style = {
      raw: { sketchTextBehaviour: 0 },
    };
    textNode.text = {
      content: '一般公务用车',
      style: { fontSize: 12 },
    };

    const { visualView } = deriveVisualView(designIr);
    const preview = generatePreview(visualView);
    const textRule = cssRule(preview.css, '.d2c-node-auto-text');

    expect(textRule).toContain('white-space: nowrap;');
    expect(textRule).toContain('width: max-content;');
    expect(textRule).not.toContain('white-space: pre-wrap;');
  });
});

function cssRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector} \\{[\\s\\S]*?\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS rule for ${selector}`);
  return match[0];
}
