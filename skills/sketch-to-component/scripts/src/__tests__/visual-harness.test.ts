import type { PreviewAsset } from '@skill-collections/d2c-core';
import { describe, expect, it } from 'vitest';

import * as harnessModule from '../visual-harness/codegen-golden.js';
import {
  assertComparableMetrics,
  deriveHarnessNodesFromSemanticView,
  inlineBaselineAssetUrls,
  renderReviewHtml,
  type NodeMetrics,
} from '../visual-harness/codegen-golden.js';

const baseline: NodeMetrics[] = [
  {
    nodeId: 'node-root',
    present: true,
    rect: { x: 24, y: 24, width: 390, height: 260 },
    styles: {
      textAlign: 'left',
      fontSize: '16px',
      color: 'rgb(17, 24, 39)',
      backgroundColor: 'rgb(248, 250, 252)',
      borderColor: 'rgb(203, 213, 225)',
      borderWidth: '1px',
      borderRadius: '24px',
      boxShadow: 'rgba(15, 23, 42, 0.2) 0px 18px 40px -18px',
    },
    backgroundImage: 'none',
    backgroundImageLoaded: false,
  },
  {
    nodeId: 'node-title',
    present: true,
    rect: { x: 52, y: 84, width: 300, height: 42 },
    styles: {
      textAlign: 'left',
      fontSize: '32px',
      color: 'rgb(15, 23, 42)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderColor: 'rgb(15, 23, 42)',
      borderWidth: '0px',
      borderRadius: '0px',
      boxShadow: 'none',
    },
    backgroundImage: 'none',
    backgroundImageLoaded: false,
  },
  {
    nodeId: 'node-cta',
    present: true,
    rect: { x: 52, y: 208, width: 132, height: 44 },
    styles: {
      textAlign: 'left',
      fontSize: '16px',
      color: 'rgb(17, 24, 39)',
      backgroundColor: 'rgb(37, 99, 235)',
      borderColor: 'rgb(17, 24, 39)',
      borderWidth: '0px',
      borderRadius: '22px',
      boxShadow: 'none',
    },
    backgroundImage: 'none',
    backgroundImageLoaded: false,
  },
  {
    nodeId: 'node-logo',
    present: true,
    rect: { x: 274, y: 84, width: 110, height: 60 },
    styles: {
      textAlign: 'left',
      fontSize: '16px',
      color: 'rgb(17, 24, 39)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderColor: 'rgb(17, 24, 39)',
      borderWidth: '0px',
      borderRadius: '0px',
      boxShadow: 'none',
    },
    backgroundImage: 'url("data:image/png;base64,AAAA")',
    backgroundImageLoaded: true,
  },
];

const candidate: NodeMetrics[] = [
  {
    nodeId: 'node-root',
    present: true,
    rect: { x: 24, y: 24, width: 390, height: 260 },
    styles: {
      textAlign: 'left',
      fontSize: '16px',
      color: 'rgb(17, 24, 39)',
      backgroundColor: 'rgb(248, 250, 252)',
      borderColor: 'rgb(203, 213, 225)',
      borderWidth: '1px',
      borderRadius: '24px',
      boxShadow: 'rgba(15, 23, 42, 0.2) 0px 18px 40px -18px',
    },
    backgroundImage: 'none',
    backgroundImageLoaded: false,
  },
  {
    nodeId: 'node-title',
    present: true,
    rect: { x: 52, y: 84, width: 300, height: 42 },
    styles: {
      textAlign: 'left',
      fontSize: '32px',
      color: 'rgb(15, 23, 42)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderColor: 'rgb(15, 23, 42)',
      borderWidth: '0px',
      borderRadius: '0px',
      boxShadow: 'none',
    },
    backgroundImage: 'none',
    backgroundImageLoaded: false,
  },
  {
    nodeId: 'node-cta',
    present: true,
    rect: { x: 52, y: 208, width: 132, height: 44 },
    styles: {
      textAlign: 'left',
      fontSize: '16px',
      color: 'rgb(17, 24, 39)',
      backgroundColor: 'rgb(37, 99, 235)',
      borderColor: 'rgb(17, 24, 39)',
      borderWidth: '0px',
      borderRadius: '22px',
      boxShadow: 'none',
    },
    backgroundImage: 'none',
    backgroundImageLoaded: false,
  },
  {
    nodeId: 'node-logo',
    present: true,
    rect: { x: 274, y: 84, width: 110, height: 60 },
    styles: {
      textAlign: 'left',
      fontSize: '16px',
      color: 'rgb(17, 24, 39)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderColor: 'rgb(17, 24, 39)',
      borderWidth: '0px',
      borderRadius: '0px',
      boxShadow: 'none',
    },
    backgroundImage: 'url("http://127.0.0.1:5179/assets/asset-d5a83ea0345e.png")',
    backgroundImageLoaded: true,
  },
];

const harnessNodes = {
  nodeIds: ['node-root', 'node-title', 'node-cta', 'node-logo'],
  rootNodeId: 'node-root',
  textNodeIds: new Set(['node-title']),
  mediaNodeIds: new Set(['node-logo']),
};

function layoutMetric(nodeId: string, rect: NodeMetrics['rect']): NodeMetrics {
  return {
    nodeId,
    present: true,
    rect,
    styles: {
      textAlign: 'left',
      fontSize: '16px',
      color: 'rgb(17, 24, 39)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderColor: 'rgb(17, 24, 39)',
      borderWidth: '0px',
      borderRadius: '0px',
      boxShadow: 'none',
    },
    backgroundImage: 'none',
    backgroundImageLoaded: false,
  };
}

function missingMetric(nodeId: string): NodeMetrics {
  return {
    nodeId,
    present: false,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    styles: {
      textAlign: 'missing',
      fontSize: 'missing',
      color: 'missing',
      backgroundColor: 'missing',
      borderColor: 'missing',
      borderWidth: 'missing',
      borderRadius: 'missing',
      boxShadow: 'missing',
    },
    backgroundImage: 'none',
    backgroundImageLoaded: false,
  };
}

describe('codegen visual harness helpers', () => {
  it('renders a side-by-side review page', () => {
    const html = renderReviewHtml({
      title: 'codegen-golden',
      baselineScreenshot: 'baseline.png',
      candidateScreenshot: 'candidate.png',
      baselineMetrics: baseline,
      candidateMetrics: candidate,
      failures: [],
    });

    expect(html).toContain('codegen-golden');
    expect(html).toContain('baseline.png');
    expect(html).toContain('candidate.png');
    expect(html).toContain('node-title');
  });

  it('fails when candidate text inherits centered alignment', () => {
    const failures = assertComparableMetrics(
      baseline,
      [
        candidate[0]!,
        {
          ...candidate[1]!,
          styles: { ...candidate[1]!.styles, textAlign: 'center' },
        },
        candidate[2]!,
        candidate[3]!,
      ],
      harnessNodes,
    );

    expect(failures).toContain('node-title style textAlign mismatch: expected left, got center');
  });

  it('fails when candidate relative offset drifts from baseline root', () => {
    const failures = assertComparableMetrics(
      baseline,
      [
        candidate[0]!,
        {
          ...candidate[1]!,
          rect: { ...candidate[1]!.rect, x: 64, y: 96 },
        },
        candidate[2]!,
        candidate[3]!,
      ],
      harnessNodes,
    );

    expect(failures).toContain('node-title rect relativeX mismatch: expected 28, got 40');
    expect(failures).toContain('node-title rect relativeY mismatch: expected 60, got 72');
  });

  it('fails when an expected node is missing from both metric sets', () => {
    const missingTitle = missingMetric('node-title');
    const failures = assertComparableMetrics(
      [baseline[0]!, missingTitle],
      [candidate[0]!, missingTitle],
      harnessNodes,
    );

    expect(failures).toContain('node-title missing from baseline metrics');
    expect(failures).toContain('node-title missing from candidate metrics');
  });

  it('fails when stable non-text visual styling drifts', () => {
    const failures = assertComparableMetrics(
      baseline,
      [
        candidate[0]!,
        candidate[1]!,
        {
          ...candidate[2]!,
          styles: { ...candidate[2]!.styles, backgroundColor: 'rgba(0, 0, 0, 0)' },
        },
        candidate[3]!,
      ],
      harnessNodes,
    );

    expect(failures).toContain(
      'node-cta style backgroundColor mismatch: expected rgb(37, 99, 235), got rgba(0, 0, 0, 0)',
    );
  });

  it('derives harness node coverage from semantic-view fixture data', () => {
    const nodes = deriveHarnessNodesFromSemanticView({
      body: {
        nodes: [
          { kind: 'screen', primaryVisualNodeId: 'node-root' },
          { kind: 'text', primaryVisualNodeId: 'node-title' },
          { kind: 'region', primaryVisualNodeId: 'node-cta' },
          { kind: 'media', primaryVisualNodeId: 'node-logo' },
        ],
      },
    });

    expect(nodes.nodeIds).toEqual(['node-root', 'node-title', 'node-cta', 'node-logo']);
    expect(nodes.rootNodeId).toBe('node-root');
    expect(nodes.textNodeIds).toEqual(new Set(['node-title']));
    expect(nodes.mediaNodeIds).toEqual(new Set(['node-logo']));
  });

  it('passes media nodes when baseline and candidate images both load', () => {
    const failures = assertComparableMetrics(baseline, candidate, harnessNodes);

    expect(failures).toEqual([]);
  });

  it('fails a media node when the candidate image does not load', () => {
    const failures = assertComparableMetrics(
      baseline,
      [
        candidate[0]!,
        candidate[1]!,
        candidate[2]!,
        { ...candidate[3]!, backgroundImageLoaded: false },
      ],
      harnessNodes,
    );

    expect(failures).toContain('node-logo generated image failed to load');
  });

  it('ignores the image-load metric for non-media nodes', () => {
    const failures = assertComparableMetrics(
      [baseline[0]!, { ...baseline[1]!, backgroundImageLoaded: false }, baseline[2]!, baseline[3]!],
      [
        candidate[0]!,
        { ...candidate[1]!, backgroundImageLoaded: false },
        candidate[2]!,
        candidate[3]!,
      ],
      harnessNodes,
    );

    expect(failures).not.toContain('node-title generated image failed to load');
    expect(failures.some((failure) => failure.includes('generated image failed to load'))).toBe(
      false,
    );
  });

  it('inlines matching asset URLs as data URLs and leaves other CSS untouched', () => {
    const assets: PreviewAsset[] = [
      {
        path: 'assets/launch-panel.png',
        assetId: 'asset-launch-panel',
        content: new Uint8Array([1, 2, 3, 4]),
      },
    ];
    const css = [
      '.logo {',
      '  background-image: url("./assets/launch-panel.png");',
      '  background-size: contain;',
      '}',
      '.title {',
      '  color: #0f172a;',
      '}',
    ].join('\n');

    const result = inlineBaselineAssetUrls(css, assets);

    expect(result).toContain('background-image: url("data:image/png;base64,AQIDBA==");');
    expect(result).not.toContain('url("./assets/launch-panel.png")');
    expect(result).toContain('background-size: contain;');
    expect(result).toContain('color: #0f172a;');
  });

  it('compares flex containers, flow children and nested descendants within 0.5px', () => {
    const layoutNodes = {
      nodeIds: [
        'node-layout-screen',
        'node-inline-container',
        'node-inline-item-a',
        'node-inline-nested-a',
        'node-inline-item-b',
        'node-inline-nested-b',
      ],
      rootNodeId: 'node-layout-screen',
      textNodeIds: new Set<string>(),
      mediaNodeIds: new Set<string>(),
    };
    const metrics = [
      layoutMetric('node-layout-screen', { x: 24, y: 24, width: 320, height: 260 }),
      layoutMetric('node-inline-container', { x: 44, y: 164, width: 260, height: 80 }),
      layoutMetric('node-inline-item-a', { x: 54, y: 174, width: 60, height: 50 }),
      layoutMetric('node-inline-nested-a', { x: 58, y: 179, width: 20, height: 10 }),
      layoutMetric('node-inline-item-b', { x: 124, y: 174, width: 60, height: 50 }),
      layoutMetric('node-inline-nested-b', { x: 128, y: 179, width: 20, height: 10 }),
    ];

    expect(assertComparableMetrics(metrics, structuredClone(metrics), layoutNodes)).toEqual([]);

    const drifted = structuredClone(metrics);
    drifted[4]!.rect.x += 6;
    drifted[5]!.rect.x += 6;
    const failures = assertComparableMetrics(metrics, drifted, layoutNodes);
    expect(failures).toContain('node-inline-item-b rect relativeX mismatch: expected 100, got 106');
    expect(failures).toContain(
      'node-inline-nested-b rect relativeX mismatch: expected 104, got 110',
    );
  });

  it('parses default and custom visual harness CLI arguments', () => {
    const exports = harnessModule as unknown as Record<string, unknown>;
    expect(typeof exports.parseVisualHarnessArgs).toBe('function');
    if (typeof exports.parseVisualHarnessArgs !== 'function') return;
    const parse = exports.parseVisualHarnessArgs as (
      argv: string[],
    ) => { fixtureDir: string; candidateUrl: string; outDir: string } | undefined;

    const defaults = parse([
      'node',
      'codegen-golden.ts',
      '--candidate-url',
      'http://127.0.0.1:5179/visual-harness.html',
    ]);
    expect(defaults?.candidateUrl).toBe('http://127.0.0.1:5179/visual-harness.html');
    expect(defaults?.fixtureDir).toMatch(/fixtures\/codegen-golden$/);
    expect(defaults?.outDir).toBe('/private/tmp/skill-collections-visual-harness/codegen-golden');

    expect(
      parse([
        'node',
        'codegen-golden.ts',
        '--fixture',
        'skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-layout-golden',
        '--candidate-url',
        'http://127.0.0.1:5179/visual-harness-layout.html',
        '--out',
        '.scratch/layout-harness',
      ]),
    ).toMatchObject({
      fixtureDir: expect.stringMatching(
        /skill-collections\/skills\/sketch-to-component\/scripts\/src\/__tests__\/fixtures\/codegen-layout-golden$/,
      ),
      candidateUrl: 'http://127.0.0.1:5179/visual-harness-layout.html',
      outDir: expect.stringMatching(/skill-collections\/\.scratch\/layout-harness$/),
    });
  });

  it('rejects missing candidate URLs and missing flag values', () => {
    const exports = harnessModule as unknown as Record<string, unknown>;
    expect(typeof exports.parseVisualHarnessArgs).toBe('function');
    if (typeof exports.parseVisualHarnessArgs !== 'function') return;
    const parse = exports.parseVisualHarnessArgs as (argv: string[]) => unknown;

    expect(parse(['node', 'codegen-golden.ts'])).toBeUndefined();
    expect(parse(['node', 'codegen-golden.ts', '--candidate-url'])).toBeUndefined();
    expect(
      parse([
        'node',
        'codegen-golden.ts',
        '--candidate-url',
        'http://127.0.0.1:5179/visual-harness.html',
        '--fixture',
      ]),
    ).toBeUndefined();
    expect(
      parse([
        'node',
        'codegen-golden.ts',
        '--candidate-url',
        'http://127.0.0.1:5179/visual-harness.html',
        '--out',
      ]),
    ).toBeUndefined();
  });
});
