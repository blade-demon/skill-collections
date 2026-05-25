import { describe, expect, it } from 'vitest';

import { deriveSemanticView } from '../derive';
import { makeSymbolHeavyView } from './fixtures';

describe('deriveSemanticView — symbol instances', () => {
  it('promotes each symbol instance to a ComponentCandidate(boundary=symbol, confidence=high)', () => {
    const { semanticView } = deriveSemanticView(makeSymbolHeavyView());

    const candidates = semanticView.body.componentCandidates;
    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      expect(candidate.boundary).toBe('symbol');
      expect(candidate.confidence).toBe('high');
      expect(candidate.evidence[0]?.kind).toBe('visual-node');
    }
    const names = candidates.map((c) => c.suggestedName).sort();
    expect(names).toEqual(['CtaButton', 'HeroCard']);
  });

  it('marks the corresponding SemanticNode as kind=component with high confidence', () => {
    const { semanticView } = deriveSemanticView(makeSymbolHeavyView());
    const components = semanticView.body.nodes.filter((n) => n.kind === 'component');
    expect(components).toHaveLength(2);
    for (const c of components) {
      expect(c.confidence).toBe('high');
      expect(c.evidence.map((e) => e.kind)).toContain('visual-node');
    }
  });

  it('rootSemanticNodeId of each candidate refers to an existing SemanticNode', () => {
    const { semanticView } = deriveSemanticView(makeSymbolHeavyView());
    const nodeIds = new Set(semanticView.body.nodes.map((n) => n.id));
    for (const candidate of semanticView.body.componentCandidates) {
      expect(nodeIds.has(candidate.rootSemanticNodeId)).toBe(true);
    }
  });
});
