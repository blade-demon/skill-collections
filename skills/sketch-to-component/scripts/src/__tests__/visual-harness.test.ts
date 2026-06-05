import { describe, expect, it } from 'vitest';

import {
  assertComparableMetrics,
  renderReviewHtml,
  type NodeMetrics,
} from '../visual-harness/codegen-golden.js';

const baseline: NodeMetrics[] = [
  {
    nodeId: 'node-root',
    rect: { x: 24, y: 24, width: 390, height: 260 },
    styles: { textAlign: 'left', fontSize: '16px', color: 'rgb(17, 24, 39)' },
  },
  {
    nodeId: 'node-title',
    rect: { x: 52, y: 84, width: 300, height: 42 },
    styles: { textAlign: 'left', fontSize: '32px', color: 'rgb(15, 23, 42)' },
  },
];

const candidate: NodeMetrics[] = [
  {
    nodeId: 'node-root',
    rect: { x: 24, y: 24, width: 390, height: 260 },
    styles: { textAlign: 'left', fontSize: '16px', color: 'rgb(17, 24, 39)' },
  },
  {
    nodeId: 'node-title',
    rect: { x: 52, y: 84, width: 300, height: 42 },
    styles: { textAlign: 'left', fontSize: '32px', color: 'rgb(15, 23, 42)' },
  },
];

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
    const failures = assertComparableMetrics(baseline, [
      candidate[0]!,
      {
        ...candidate[1]!,
        styles: { ...candidate[1]!.styles, textAlign: 'center' },
      },
    ]);

    expect(failures).toContain('node-title style textAlign mismatch: expected left, got center');
  });
});
