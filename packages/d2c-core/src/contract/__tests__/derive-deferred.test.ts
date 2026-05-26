import { describe, expect, it } from 'vitest';

import { deriveInteractionSpec } from '../derive-interaction';
import { bridgedList } from './fixtures';

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
});
