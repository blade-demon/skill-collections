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

  it('applies ancestor overrides after nested symbol defaults', () => {
    const visual = makeVisualBlock();
    const parent = visual.root.children[0]!;
    const text = parent.children[0]!;
    parent.symbol = {
      instanceId: 'parent-symbol',
      masterId: 'parent-master',
      overrides: [{ path: 'child-symbol/text-target_stringValue', value: 'Parent override' }],
    };
    parent.children = [
      {
        id: 'node-child-symbol',
        kind: 'frame',
        name: 'ChildSymbol',
        source: {
          nodeId: 'child-symbol',
          name: 'Child Symbol',
          originalType: 'symbolInstance',
          提供方: 'test',
        },
        layout: { x: 0, y: 0, width: 160, height: 40 },
        symbol: {
          instanceId: 'child-symbol',
          masterId: 'child-master',
          overrides: [{ path: 'text-target_stringValue', value: 'Child default' }],
        },
        children: [text],
      },
    ];

    const result = applySymbolOverrides(visual);
    const nestedText = result.visual.root.children[0]?.children[0]?.children[0];

    expect(nestedText?.text?.content).toBe('Parent override');
  });

  it('uses override path segments to disambiguate repeated master text ids', () => {
    const visual = makeVisualBlock();
    const parent = visual.root.children[0]!;
    const firstText = makeRepeatedTextNode('First default');
    const secondText = makeRepeatedTextNode('Second default');
    parent.symbol = {
      instanceId: 'parent-symbol',
      masterId: 'parent-master',
      overrides: [
        { path: 'first-child/repeated-text_stringValue', value: 'First override' },
        { path: 'second-child/repeated-text_stringValue', value: 'Second override' },
      ],
    };
    parent.children = [
      makeChildSymbol('first-child', firstText),
      makeChildSymbol('second-child', secondText),
    ];

    const result = applySymbolOverrides(visual);
    const first = result.visual.root.children[0]?.children[0]?.children[0];
    const second = result.visual.root.children[0]?.children[1]?.children[0];

    expect(first?.text?.content).toBe('First override');
    expect(second?.text?.content).toBe('Second override');
  });
});

function makeRepeatedTextNode(content: string) {
  return {
    id: `node-${content}`,
    kind: 'text' as const,
    name: 'RepeatedText',
    source: {
      nodeId: 'repeated-text',
      name: 'Repeated Text',
      originalType: 'text',
      提供方: 'test',
    },
    layout: { x: 0, y: 0, width: 120, height: 24 },
    text: { content },
    children: [],
  };
}

function makeChildSymbol(nodeId: string, text: ReturnType<typeof makeRepeatedTextNode>) {
  return {
    id: `node-${nodeId}`,
    kind: 'frame' as const,
    name: 'ChildSymbol',
    source: {
      nodeId,
      name: 'Child Symbol',
      originalType: 'symbolInstance',
      提供方: 'test',
    },
    layout: { x: 0, y: 0, width: 160, height: 40 },
    children: [text],
  };
}
