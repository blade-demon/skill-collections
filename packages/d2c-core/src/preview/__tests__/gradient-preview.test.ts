import { describe, expect, it } from 'vitest';

import type { VisualView } from '../../ir';
import { generatePreview } from '../generate-preview';

function makeGradientView(overrides: {
  fillType?: number;
  from?: string;
  to?: string;
  stops?: unknown;
  type?: string;
}): VisualView {
  return {
    kind: 'visual-view',
    generatedFrom: {
      schemaVersion: 'd2c.design-ir/v0.2.0',
      sourceRef: { fileName: 'gradient.sketch', documentId: 'doc-gradient' },
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
        style: {
          fills: [
            {
              type: overrides.type ?? 'gradient',
              color: '#FA5900FF',
              raw: {
                fillType: overrides.fillType ?? 1,
                gradient: {
                  _class: 'gradient',
                  gradientType: 0,
                  from: overrides.from ?? '{0, 0}',
                  to: overrides.to ?? '{0, 1}',
                  stops: overrides.stops ?? [
                    {
                      _class: 'gradientStop',
                      position: 0,
                      color: {
                        _class: 'color',
                        alpha: 1,
                        red: 1,
                        green: 0.4,
                        blue: 0,
                      },
                    },
                    {
                      _class: 'gradientStop',
                      position: 1,
                      color: {
                        _class: 'color',
                        alpha: 1,
                        red: 0.8,
                        green: 0.2,
                        blue: 0,
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
        children: [],
      },
    },
  } as VisualView;
}

describe('generatePreview gradient fills', () => {
  it('emits a CSS linear-gradient for a linear gradient fill', () => {
    const preview = generatePreview(makeGradientView({}));

    // top-to-bottom: from (0,0) to (0,1) => angleDeg = atan2(0, -1) = 180
    expect(preview.css).toContain('background-image: linear-gradient(180deg,');
    // both stops, normalized to #RRGGBBAA with percentages
    expect(preview.css).toContain('#FF6600FF 0%');
    expect(preview.css).toContain('#CC3300FF 100%');
    // gradient should suppress the flat background-color fallback
    expect(preview.css).not.toContain('background-color: #FA5900FF;');
  });

  it('computes the correct CSS angle for a left-to-right gradient', () => {
    const preview = generatePreview(makeGradientView({ from: '{0, 0}', to: '{1, 0}' }));
    // from (0,0) to (1,0): atan2(1, 0) = 90 deg
    expect(preview.css).toContain('background-image: linear-gradient(90deg,');
  });

  it('sorts stops by position before emitting them', () => {
    const preview = generatePreview(
      makeGradientView({
        stops: [
          {
            _class: 'gradientStop',
            position: 1,
            color: { _class: 'color', alpha: 1, red: 0, green: 0, blue: 1 },
          },
          {
            _class: 'gradientStop',
            position: 0,
            color: { _class: 'color', alpha: 1, red: 1, green: 0, blue: 0 },
          },
        ],
      }),
    );
    const match = /linear-gradient\([^)]*\)/.exec(preview.css);
    expect(match).not.toBeNull();
    const value = match?.[0] ?? '';
    expect(value.indexOf('#FF0000FF 0%')).toBeGreaterThan(0);
    expect(value.indexOf('#0000FFFF 100%')).toBeGreaterThan(value.indexOf('#FF0000FF 0%'));
  });

  it('falls back to background-color when gradient data is missing', () => {
    const view = makeGradientView({});
    // Strip raw.gradient to simulate malformed/missing data
    const fills = view.body.root.style?.fills;
    if (fills && fills[0]) {
      fills[0] = { type: 'gradient', color: '#FA5900FF' };
    }

    const preview = generatePreview(view);
    expect(preview.css).not.toContain('linear-gradient');
    expect(preview.css).toContain('background-color: #FA5900FF;');
  });

  it('falls back to background-color for radial/angular gradients', () => {
    const view = makeGradientView({});
    const fills = view.body.root.style?.fills;
    if (fills && fills[0] && fills[0].raw && typeof fills[0].raw === 'object') {
      const raw = fills[0].raw as { gradient?: Record<string, unknown> };
      if (raw.gradient) raw.gradient.gradientType = 1;
    }

    const preview = generatePreview(view);
    expect(preview.css).not.toContain('linear-gradient');
    expect(preview.css).toContain('background-color: #FA5900FF;');
  });
});
