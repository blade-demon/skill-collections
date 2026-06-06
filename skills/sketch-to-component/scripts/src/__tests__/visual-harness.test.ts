import { describe, expect, it } from 'vitest';

import {
  assertComparableMetrics,
  deriveHarnessNodesFromSemanticView,
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
  },
];

const harnessNodes = {
  nodeIds: ['node-root', 'node-title', 'node-cta'],
  rootNodeId: 'node-root',
  textNodeIds: new Set(['node-title']),
};

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
        ],
      },
    });

    expect(nodes.nodeIds).toEqual(['node-root', 'node-title', 'node-cta']);
    expect(nodes.rootNodeId).toBe('node-root');
    expect(nodes.textNodeIds).toEqual(new Set(['node-title']));
  });
});
