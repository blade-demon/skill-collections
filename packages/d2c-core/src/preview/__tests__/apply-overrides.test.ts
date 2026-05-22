import { describe, expect, it } from 'vitest';

import { applySymbolOverrides } from '../apply-overrides';
import { makeVisualBlock } from './fixtures';

describe('applySymbolOverrides', () => {
  it('applies text overrides by matching the target source node id', () => {
    const visual = makeVisualBlock();
    const result = applySymbolOverrides(visual);

    const symbol = result.visual.root.children[0]!;
    const text = symbol.children[0]!;
    expect(text.text?.content).toBe('Applied override');
    expect(result.stats).toEqual({
      overrideApplied: 1,
      overrideUnmapped: 1,
      overrideUnsupported: 1,
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'unmapped-symbol-override',
      'unsupported-symbol-override',
    ]);
  });

  it('does not mutate the input visual block', () => {
    const visual = makeVisualBlock();

    applySymbolOverrides(visual);

    expect(visual.root.children[0]?.children[0]?.text?.content).toBe('Default text');
  });
});
