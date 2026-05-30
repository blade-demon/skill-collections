import { describe, expect, it } from 'vitest';

import { deriveInteractionSpec } from '../derive-interaction';
import { bridgedList, bridgedMultiKindRepeatParent } from './fixtures';

const approval = {
  reason: 'deferred to 5C; visual coverage only for sprint',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
};

describe('deriveInteractionSpec — mode=deferred', () => {
  it('produces status=deferred with coverage pinned to deferred on all 4 entries', () => {
    const input = bridgedList();
    const { interactionSpec } = deriveInteractionSpec({
      ...input,
      mode: 'deferred',
      approval,
    });

    expect(interactionSpec.status).toBe('deferred');
    for (const aspect of ['states', 'events', 'dataBinding', 'stateTransitions'] as const) {
      expect(interactionSpec.body.coverage[aspect].status).toBe('deferred');
    }
  });

  it('still produces components from semantic candidates and leaves behavior arrays empty', () => {
    const input = bridgedList();
    const { interactionSpec } = deriveInteractionSpec({
      ...input,
      mode: 'deferred',
      approval,
    });

    /* makeListView has 1 repeat-pattern ComponentCandidate. */
    expect(interactionSpec.body.components.length).toBeGreaterThanOrEqual(1);
    expect(interactionSpec.body.events).toHaveLength(0);
    expect(interactionSpec.body.dataModels).toHaveLength(0);
  });

  it('throws when mode=deferred is called without an approval object', () => {
    const input = bridgedList();
    expect(() => deriveInteractionSpec({ ...input, mode: 'deferred' })).toThrowError(
      /mode='deferred' requires an approval object/,
    );
  });

  it('emits distinct InteractionComponent ids when two candidates share one rootSemanticNodeId', () => {
    /* 5A allows the same parent to be both a visual-region/symbol candidate
     * AND host promotable repeat-pattern candidates (different boundary
     * discriminator → different cc_ ids). The legacy 5B id recipe hashed
     * only `semanticNodeId`, so those candidates collided as
     * `duplicate InteractionComponent id`. This guards the multiplicity-aware
     * recipe that falls back to candidate.id when a root is shared. */
    const input = bridgedMultiKindRepeatParent();
    const countsByRoot = new Map<string, number>();
    for (const c of input.semanticView.body.componentCandidates) {
      countsByRoot.set(c.rootSemanticNodeId, (countsByRoot.get(c.rootSemanticNodeId) ?? 0) + 1);
    }
    const sharedCount = [...countsByRoot.values()].reduce((max, n) => (n > max ? n : max), 0);
    expect(sharedCount).toBeGreaterThanOrEqual(2);

    const { interactionSpec } = deriveInteractionSpec({
      ...input,
      mode: 'deferred',
      approval,
    });
    const ids = interactionSpec.body.components.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
