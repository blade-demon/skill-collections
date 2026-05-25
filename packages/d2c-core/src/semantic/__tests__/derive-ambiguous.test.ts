import { describe, expect, it } from 'vitest';

import { deriveSemanticView } from '../derive';
import { makeAmbiguousGroupView } from './fixtures';

describe('deriveSemanticView — ambiguous groups (no promotion)', () => {
  it('produces region SemanticNodes for unmarked frame groups without promoting them to ComponentCandidate', () => {
    const { semanticView } = deriveSemanticView(makeAmbiguousGroupView());

    const regions = semanticView.body.nodes.filter((n) => n.kind === 'region');
    expect(regions.length).toBeGreaterThanOrEqual(2);

    /* No ComponentCandidate should be promoted — neither group has a symbol,
     * a name prefix, nor a matching design-ir candidate. */
    expect(semanticView.body.componentCandidates).toHaveLength(0);
  });

  it('produces no RepeatedPattern (only 2 same-kind siblings, below the 3-item threshold)', () => {
    const { semanticView } = deriveSemanticView(makeAmbiguousGroupView());
    expect(semanticView.body.repeatedPatterns).toHaveLength(0);
  });

  it('still produces default absolute LayoutCandidates for the screen and the regions', () => {
    const { semanticView } = deriveSemanticView(makeAmbiguousGroupView());
    const absoluteLayouts = semanticView.body.layoutCandidates.filter((l) => l.kind === 'absolute');
    /* 1 screen + 2 region groups + 0 component (no promotion) = 3 absolute layouts. */
    expect(absoluteLayouts).toHaveLength(3);
  });
});
