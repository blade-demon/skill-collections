import { describe, expect, it } from 'vitest';

import { deriveSemanticView } from '../derive';
import { makeListView } from './fixtures';

describe('deriveSemanticView — repeated list', () => {
  it('produces exactly one RepeatedPattern for the 5 equally-spaced siblings', () => {
    const { semanticView } = deriveSemanticView(makeListView());
    const patterns = semanticView.body.repeatedPatterns;
    expect(patterns).toHaveLength(1);
    const [pattern] = patterns;
    expect(pattern!.axis).toBe('y');
    expect(pattern!.itemCount).toBe(5);
    expect(pattern!.itemSemanticNodeIds).toHaveLength(5);
    expect(pattern!.similarity).toBeGreaterThan(0.95);
  });

  it('upgrades the parent LayoutCandidate to stack(axis=y), confidence=medium', () => {
    const { semanticView } = deriveSemanticView(makeListView());
    const root = semanticView.body.nodes.find((n) => n.kind === 'screen')!;
    const layouts = semanticView.body.layoutCandidates.filter((l) => l.semanticNodeId === root.id);
    expect(layouts).toHaveLength(1);
    expect(layouts[0]!.kind).toBe('stack');
    expect(layouts[0]!.confidence).toBe('medium');
    expect(layouts[0]!.caveats[0]).toMatch(/spacing similarity/);
  });

  it('promotes a ComponentCandidate with boundary=repeat-pattern (region kind items pass the white-list)', () => {
    const { semanticView } = deriveSemanticView(makeListView());
    const repeatCandidates = semanticView.body.componentCandidates.filter(
      (c) => c.boundary === 'repeat-pattern',
    );
    expect(repeatCandidates).toHaveLength(1);
    expect(repeatCandidates[0]!.confidence).toBe('medium');
  });

  it('still emits a default absolute LayoutCandidate for non-list region nodes', () => {
    const { semanticView } = deriveSemanticView(makeListView());
    /* Each list item is a region node with one text child (no repeat) — so each
     * item gets its own default absolute layout. */
    const itemLayouts = semanticView.body.layoutCandidates.filter((l) => l.kind === 'absolute');
    expect(itemLayouts.length).toBeGreaterThan(0);
  });
});
