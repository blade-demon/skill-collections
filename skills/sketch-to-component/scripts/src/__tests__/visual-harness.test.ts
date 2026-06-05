import { describe, expect, it } from 'vitest';

import {
  assertComparableMetrics,
  renderReviewHtml,
  type NodeMetrics,
} from '../visual-harness/codegen-golden.js';

const baseline: NodeMetrics[] = [
  {
    nodeId: 'node-root',
    present: true,
    rect: { x: 24, y: 24, width: 390, height: 260 },
    styles: { textAlign: 'left', fontSize: '16px', color: 'rgb(17, 24, 39)' },
  },
  {
    nodeId: 'node-title',
    present: true,
    rect: { x: 52, y: 84, width: 300, height: 42 },
    styles: { textAlign: 'left', fontSize: '32px', color: 'rgb(15, 23, 42)' },
  },
];

const candidate: NodeMetrics[] = [
  {
    nodeId: 'node-root',
    present: true,
    rect: { x: 24, y: 24, width: 390, height: 260 },
    styles: { textAlign: 'left', fontSize: '16px', color: 'rgb(17, 24, 39)' },
  },
  {
    nodeId: 'node-title',
    present: true,
    rect: { x: 52, y: 84, width: 300, height: 42 },
    styles: { textAlign: 'left', fontSize: '32px', color: 'rgb(15, 23, 42)' },
  },
];

function missingMetric(nodeId: string): NodeMetrics {
  return {
    nodeId,
    present: false,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    styles: { textAlign: 'missing', fontSize: 'missing', color: 'missing' },
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
    const failures = assertComparableMetrics(baseline, [
      candidate[0]!,
      {
        ...candidate[1]!,
        styles: { ...candidate[1]!.styles, textAlign: 'center' },
      },
    ]);

    expect(failures).toContain('node-title style textAlign mismatch: expected left, got center');
  });

  it('fails when candidate relative offset drifts from baseline root', () => {
    const failures = assertComparableMetrics(baseline, [
      candidate[0]!,
      {
        ...candidate[1]!,
        rect: { ...candidate[1]!.rect, x: 64, y: 96 },
      },
    ]);

    expect(failures).toContain('node-title rect relativeX mismatch: expected 28, got 40');
    expect(failures).toContain('node-title rect relativeY mismatch: expected 60, got 72');
  });

  it('fails when an expected node is missing from both metric sets', () => {
    const missingTitle = missingMetric('node-title');
    const failures = assertComparableMetrics(
      [baseline[0]!, missingTitle],
      [candidate[0]!, missingTitle],
    );

    expect(failures).toContain('node-title missing from baseline metrics');
    expect(failures).toContain('node-title missing from candidate metrics');
  });
});
