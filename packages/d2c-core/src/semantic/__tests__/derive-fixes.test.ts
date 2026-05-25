/**
 * Stage 5A-PR-3 — regression coverage for three findings raised against
 * 5A-PR-2's derive (PR #32):
 *
 *   P1 — design-ir.semantic.candidates lookup mismatched between Stage 3
 *        normalizers (write `nodeId: VisualNode.id`) and derive
 *        (queried `VisualNode.source.nodeId`). Real Sketch input never
 *        connected.
 *
 *   P2 — repeat-pattern shape conformity only compared directChildCount,
 *        so 3 region siblings with text / image / nested-group children
 *        slipped through and were promoted.
 *
 *   P3 — a parent with two promotable repeat sets (region + component)
 *        produced two ComponentCandidates whose ids collided, and the
 *        integrity validator hard-threw on `duplicate ComponentCandidate id`.
 */
import { describe, expect, it } from 'vitest';

import { deriveSemanticView } from '../derive';
import {
  makeDesignIrCandidateOnlyView,
  makeMismatchedShapeListView,
  makeMultiKindRepeatParentView,
} from './fixtures';

describe('P1 — design-ir candidate lookup uses VisualNode.id', () => {
  it('promotes a ComponentCandidate from design-ir.semantic.candidates alone (no symbol, no name prefix)', () => {
    const { semanticView } = deriveSemanticView(makeDesignIrCandidateOnlyView());

    const visualRegionCandidates = semanticView.body.componentCandidates.filter(
      (c) => c.boundary === 'visual-region',
    );
    expect(visualRegionCandidates).toHaveLength(1);
    expect(visualRegionCandidates[0]!.suggestedName).toBe('PromotedFromIrCandidate');
    expect(visualRegionCandidates[0]!.evidence[0]?.kind).toBe('design-ir-candidate');
  });

  it('attaches a design-ir-candidate evidence to the matched SemanticNode', () => {
    const { semanticView } = deriveSemanticView(makeDesignIrCandidateOnlyView());
    const matched = semanticView.body.nodes.find((n) => n.name === 'PlainRegion');
    expect(matched).toBeDefined();
    expect(matched!.evidence.some((e) => e.kind === 'design-ir-candidate')).toBe(true);
  });
});

describe('P2 — repeat-pattern shape conformity uses subtree signature', () => {
  it('rejects 3 same-kind siblings whose subtrees differ (text vs media vs nested group)', () => {
    const { semanticView, warnings } = deriveSemanticView(makeMismatchedShapeListView());

    expect(semanticView.body.repeatedPatterns).toHaveLength(0);
    expect(
      semanticView.body.componentCandidates.filter((c) => c.boundary === 'repeat-pattern'),
    ).toHaveLength(0);

    expect(warnings.some((w) => w.code === 'repeated-pattern-shape-mismatch')).toBe(true);
  });
});

describe('P3 — multiple promotable repeat patterns under same parent', () => {
  it('produces two distinct ComponentCandidates (one per kind set) without id collision', () => {
    const { semanticView } = deriveSemanticView(makeMultiKindRepeatParentView());

    expect(semanticView.body.repeatedPatterns).toHaveLength(2);

    const repeatCandidates = semanticView.body.componentCandidates.filter(
      (c) => c.boundary === 'repeat-pattern',
    );
    expect(repeatCandidates).toHaveLength(2);
    /* Critical: the two candidate ids must differ — that is the P3 fix. */
    expect(new Set(repeatCandidates.map((c) => c.id)).size).toBe(2);

    /* Both should still root at the same parent SemanticNode. */
    const [a, b] = repeatCandidates;
    expect(a!.rootSemanticNodeId).toBe(b!.rootSemanticNodeId);
  });

  it('integrity validator (called inside derive) accepts the multi-pattern body', () => {
    /* If P3 were unfixed, deriveSemanticView would throw before returning.
     * Reaching this assertion at all proves the validator passed. */
    expect(() => deriveSemanticView(makeMultiKindRepeatParentView())).not.toThrow();
  });
});
