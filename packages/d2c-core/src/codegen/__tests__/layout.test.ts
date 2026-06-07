import { describe, expect, it } from 'vitest';

import { projectStackInlineLayout } from '../react/layout';

const absoluteWarning = (id: string, strategy: 'stack' | 'inline', reason: string) =>
  `react codegen: layout ${id} (${strategy}) ${reason}; kept absolute child positioning`;

describe('projectStackInlineLayout', () => {
  it('projects a uniform stack to a column flex layout', () => {
    expect(
      projectStackInlineLayout({
        containerNodeId: 'stack-root',
        strategy: 'stack',
        children: [
          { x: 8, y: 12, width: 100, height: 20 },
          { x: 8, y: 42, width: 100, height: 20 },
          { x: 8, y: 72, width: 100, height: 20 },
        ],
      }),
    ).toEqual({
      kind: 'flex',
      direction: 'column',
      gapPx: 10,
      paddingTopPx: 12,
      paddingLeftPx: 8,
    });
  });

  it('projects a uniform inline layout to a row flex layout', () => {
    expect(
      projectStackInlineLayout({
        containerNodeId: 'inline-row',
        strategy: 'inline',
        children: [
          { x: 8, y: 6, width: 20, height: 14 },
          { x: 38, y: 6, width: 20, height: 14 },
          { x: 68, y: 6, width: 20, height: 14 },
        ],
      }),
    ).toEqual({
      kind: 'flex',
      direction: 'row',
      gapPx: 10,
      paddingTopPx: 6,
      paddingLeftPx: 8,
    });
  });

  it('falls back when there are fewer than two children', () => {
    expect(
      projectStackInlineLayout({
        containerNodeId: 'too-small',
        strategy: 'stack',
        children: [{ x: 0, y: 0, width: 10, height: 10 }],
      }),
    ).toEqual({
      kind: 'absolute',
      warning: absoluteWarning('too-small', 'stack', 'has fewer than 2 children'),
    });
  });

  it('falls back when a child has no geometry', () => {
    expect(
      projectStackInlineLayout({
        containerNodeId: 'missing-child',
        strategy: 'inline',
        children: [{ x: 0, y: 0, width: 10, height: 10 }, undefined],
      }),
    ).toEqual({
      kind: 'absolute',
      warning: absoluteWarning('missing-child', 'inline', 'has a child without geometry'),
    });
  });

  it('falls back when DOM order differs from main-axis order', () => {
    expect(
      projectStackInlineLayout({
        containerNodeId: 'wrong-order',
        strategy: 'stack',
        children: [
          { x: 0, y: 30, width: 10, height: 10 },
          { x: 0, y: 0, width: 10, height: 10 },
        ],
      }),
    ).toEqual({
      kind: 'absolute',
      warning: absoluteWarning(
        'wrong-order',
        'stack',
        'child DOM order does not match main-axis order',
      ),
    });
  });

  it('falls back when ordered children overlap', () => {
    expect(
      projectStackInlineLayout({
        containerNodeId: 'overlap',
        strategy: 'inline',
        children: [
          { x: 0, y: 0, width: 20, height: 10 },
          { x: 15, y: 0, width: 20, height: 10 },
        ],
      }),
    ).toEqual({
      kind: 'absolute',
      warning: absoluteWarning('overlap', 'inline', 'has overlapping children (negative gap)'),
    });
  });

  it('falls back when the first child has a negative lead offset', () => {
    expect(
      projectStackInlineLayout({
        containerNodeId: 'negative-lead',
        strategy: 'stack',
        children: [
          { x: -2, y: 0, width: 10, height: 10 },
          { x: -2, y: 20, width: 10, height: 10 },
        ],
      }),
    ).toEqual({
      kind: 'absolute',
      warning: absoluteWarning('negative-lead', 'stack', 'has a negative lead offset'),
    });
  });

  it('falls back when mean-gap reconstruction drifts over 0.5px', () => {
    expect(
      projectStackInlineLayout({
        containerNodeId: 'uneven-gap',
        strategy: 'stack',
        children: [
          { x: 0, y: 0, width: 10, height: 20 },
          { x: 0, y: 30, width: 10, height: 20 },
          { x: 0, y: 80, width: 10, height: 20 },
        ],
      }),
    ).toEqual({
      kind: 'absolute',
      warning: absoluteWarning(
        'uneven-gap',
        'stack',
        'mean-gap layout drifts >0.5px from absolute',
      ),
    });
  });

  it.each([
    {
      id: 'stack-cross-axis',
      strategy: 'stack' as const,
      children: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 0, y: 20, width: 10, height: 10 },
        { x: 8, y: 40, width: 10, height: 10 },
      ],
    },
    {
      id: 'inline-cross-axis',
      strategy: 'inline' as const,
      children: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 0, width: 10, height: 10 },
        { x: 40, y: 8, width: 10, height: 10 },
      ],
    },
  ])('falls back when $strategy cross-axis starts vary', ({ id, strategy, children }) => {
    expect(
      projectStackInlineLayout({
        containerNodeId: id,
        strategy,
        children,
      }),
    ).toEqual({
      kind: 'absolute',
      warning: absoluteWarning(id, strategy, 'cross-axis start varies >0.5px'),
    });
  });
});
