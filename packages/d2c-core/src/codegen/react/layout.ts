export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FlexProjection =
  | {
      kind: 'flex';
      direction: 'row' | 'column';
      gapPx: number;
      paddingTopPx: number;
      paddingLeftPx: number;
    }
  | { kind: 'absolute'; warning: string };

interface StackInlineLayoutInput {
  containerNodeId: string;
  strategy: 'stack' | 'inline';
  children: (Rect | undefined)[];
}

const FIDELITY_TOLERANCE_PX = 0.5;

function fallback(
  containerNodeId: string,
  strategy: StackInlineLayoutInput['strategy'],
  reason: string,
): FlexProjection {
  return {
    kind: 'absolute',
    warning: `react codegen: layout ${containerNodeId} (${strategy}) ${reason}; kept absolute child positioning`,
  };
}

export function projectStackInlineLayout({
  containerNodeId,
  strategy,
  children,
}: StackInlineLayoutInput): FlexProjection {
  if (children.length < 2) {
    return fallback(containerNodeId, strategy, 'has fewer than 2 children');
  }
  if (children.some((child) => child === undefined)) {
    return fallback(containerNodeId, strategy, 'has a child without geometry');
  }

  const rects = children as Rect[];
  const mainStart = (rect: Rect): number => (strategy === 'stack' ? rect.y : rect.x);
  const mainSize = (rect: Rect): number => (strategy === 'stack' ? rect.height : rect.width);
  const crossStart = (rect: Rect): number => (strategy === 'stack' ? rect.x : rect.y);

  const mainAxisOrder = rects
    .map((rect, index) => ({ index, start: mainStart(rect) }))
    .sort((left, right) => left.start - right.start || left.index - right.index);
  if (mainAxisOrder.some(({ index }, position) => index !== position)) {
    return fallback(containerNodeId, strategy, 'child DOM order does not match main-axis order');
  }

  const gaps = rects.slice(1).map((rect, index) => {
    const previous = rects[index]!;
    return mainStart(rect) - (mainStart(previous) + mainSize(previous));
  });
  if (gaps.some((gap) => gap < 0)) {
    return fallback(containerNodeId, strategy, 'has overlapping children (negative gap)');
  }

  const first = rects[0]!;
  if (first.x < 0 || first.y < 0) {
    return fallback(containerNodeId, strategy, 'has a negative lead offset');
  }

  const gapPx = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  let reconstructedStart = mainStart(first);
  for (let index = 1; index < rects.length; index += 1) {
    const previous = rects[index - 1]!;
    reconstructedStart += mainSize(previous) + gapPx;
    if (Math.abs(reconstructedStart - mainStart(rects[index]!)) > FIDELITY_TOLERANCE_PX) {
      return fallback(containerNodeId, strategy, 'mean-gap layout drifts >0.5px from absolute');
    }
  }

  const firstCrossStart = crossStart(first);
  if (
    rects
      .slice(1)
      .some((rect) => Math.abs(crossStart(rect) - firstCrossStart) > FIDELITY_TOLERANCE_PX)
  ) {
    return fallback(containerNodeId, strategy, 'cross-axis start varies >0.5px');
  }

  return {
    kind: 'flex',
    direction: strategy === 'stack' ? 'column' : 'row',
    gapPx,
    paddingTopPx: first.y,
    paddingLeftPx: first.x,
  };
}
