import { describe, expect, it } from 'vitest';

import { deriveSemanticView } from '../derive';
import { stableJson, stableSha256 } from '../../utils/stable-json';
import { makeFullChatView, makeListView } from './fixtures';

describe('deriveSemanticView — determinism', () => {
  it('produces byte-identical output across 3 repeated runs (full chat fixture)', () => {
    const a = deriveSemanticView(makeFullChatView()).semanticView;
    const b = deriveSemanticView(makeFullChatView()).semanticView;
    const c = deriveSemanticView(makeFullChatView()).semanticView;
    expect(stableJson(a)).toBe(stableJson(b));
    expect(stableJson(b)).toBe(stableJson(c));
  });

  it('produces identical SemanticNode ids when the VisualNode children order is shuffled', () => {
    /* Build a list fixture, then construct a second fixture whose root children
     * are in reverse order. Per the contract in plan §3.5, every node id only
     * hashes on (form, primaryVisualNodeId, kind) — order has no effect. */
    const original = makeListView();
    const reordered = makeListView();
    reordered.designIr.visual.root.children = [
      ...reordered.designIr.visual.root.children,
    ].reverse();
    /* Re-hash the visual-view to match the shuffled IR. */
    reordered.visualView = {
      ...reordered.visualView,
      generatedFrom: {
        ...reordered.visualView.generatedFrom,
        designIrHash: stableSha256(stableJson(reordered.designIr)),
      },
      body: reordered.designIr.visual,
    };

    const before = deriveSemanticView(original)
      .semanticView.body.nodes.map((n) => n.id)
      .slice()
      .sort();
    const after = deriveSemanticView(reordered)
      .semanticView.body.nodes.map((n) => n.id)
      .slice()
      .sort();
    expect(after).toEqual(before);
  });

  it('produces an identical RepeatedPattern id under shuffled item order (item ids are sorted before hashing)', () => {
    const before = deriveSemanticView(makeListView()).semanticView.body.repeatedPatterns[0]!.id;
    const reordered = makeListView();
    reordered.designIr.visual.root.children = [
      ...reordered.designIr.visual.root.children,
    ].reverse();
    reordered.visualView = {
      ...reordered.visualView,
      generatedFrom: {
        ...reordered.visualView.generatedFrom,
        designIrHash: stableSha256(stableJson(reordered.designIr)),
      },
      body: reordered.designIr.visual,
    };
    const after = deriveSemanticView(reordered).semanticView.body.repeatedPatterns[0]!.id;
    expect(after).toBe(before);
  });
});
