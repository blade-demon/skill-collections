import { describe, expect, it } from 'vitest';

import type { Style, VectorPath, VisualView } from '../../ir';
import { generatePreview } from '../generate-preview';

function makeVectorView(vector: VectorPath, style?: Style): VisualView {
  return {
    kind: 'visual-view',
    generatedFrom: {
      schemaVersion: 'd2c.design-ir/v0.2.0',
      sourceRef: { fileName: 'vec.sketch', documentId: 'doc-vec' },
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
            id: 'node-vec',
            kind: 'shape',
            name: 'Icon',
            source: { nodeId: 'vec', name: 'Icon', originalType: 'shapePath', provider: 'test' },
            layout: { x: 0, y: 0, width: 10, height: 10 },
            ...(style ? { style } : {}),
            vector,
            children: [],
          },
        ],
      },
    },
  } as VisualView;
}

function vecBlock(css: string): string {
  return /\.d2c-node-vec \{([^}]*)\}/.exec(css)?.[1] ?? '';
}

describe('generatePreview vector SVG rendering', () => {
  it('emits an inline SVG path scaled to the node box for a closed straight outline', () => {
    const triangle: VectorPath = {
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.5, y: 1 },
      ],
    };
    const preview = generatePreview(makeVectorView(triangle, { fills: [{ color: '#FF0000FF' }] }));

    expect(preview.html).toContain('<svg class="d2c-vector" viewBox="0 0 10 10"');
    // normalized anchors scaled by the 10x10 node; closed path wraps + Z
    expect(preview.html).toContain('d="M 0 0 L 10 0 L 5 10 L 0 0 Z"');
    expect(preview.html).toContain('fill="#FF0000FF"');
  });

  it('emits a cubic bezier segment when an endpoint carries a control point', () => {
    const curved: VectorPath = {
      closed: false,
      points: [
        { x: 0, y: 0, curveFrom: { x: 0.5, y: 0 } },
        { x: 1, y: 1, curveTo: { x: 1, y: 0.5 } },
      ],
    };
    const preview = generatePreview(makeVectorView(curved, { fills: [{ color: '#00FF00FF' }] }));

    // C c1(0.5,0)*10  c2(1,0.5)*10  end(1,1)*10
    expect(preview.html).toContain('C 5 0, 10 5, 10 10');
    expect(preview.html).not.toContain(' Z'); // open path
  });

  it('strokes the path from the border and emits no CSS box border', () => {
    const line: VectorPath = {
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    const preview = generatePreview(
      makeVectorView(line, { borders: [{ color: '#123456FF', thickness: 2 }] }),
    );

    expect(preview.html).toContain('stroke="#123456FF" stroke-width="2"');
    // the box-model border is suppressed for vector nodes
    expect(vecBlock(preview.css)).not.toContain('border:');
  });
});
