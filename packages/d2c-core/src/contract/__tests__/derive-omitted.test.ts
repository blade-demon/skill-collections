import { describe, expect, it } from 'vitest';

import { deriveInteractionSpec } from '../derive-interaction';
import { bridgedFullChat } from './fixtures';

const approval = {
  reason: 'sandbox-only delivery',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
};

describe('deriveInteractionSpec — mode=omitted', () => {
  it('produces an empty behavior body with coverage pinned to omitted', () => {
    const input = bridgedFullChat();
    const { interactionSpec } = deriveInteractionSpec({
      ...input,
      mode: 'omitted',
      approval,
    });

    expect(interactionSpec.status).toBe('omitted');
    expect(interactionSpec.body.events).toHaveLength(0);
    expect(interactionSpec.body.states).toHaveLength(0);
    expect(interactionSpec.body.dataModels).toHaveLength(0);
    expect(interactionSpec.body.stateTransitions).toHaveLength(0);

    for (const aspect of ['states', 'events', 'dataBinding', 'stateTransitions'] as const) {
      expect(interactionSpec.body.coverage[aspect].status).toBe('omitted');
      expect(interactionSpec.body.coverage[aspect].notes).toBe(approval.reason);
    }
  });

  it('still populates body.components from semantic candidates', () => {
    /* makeFullChatView has a symbol header + a Component/-prefixed composer →
     * 5A produces 2 ComponentCandidates → 5B should mirror them. */
    const input = bridgedFullChat();
    const { interactionSpec } = deriveInteractionSpec({
      ...input,
      mode: 'omitted',
      approval,
    });

    expect(interactionSpec.body.components.length).toBeGreaterThanOrEqual(2);
    for (const c of interactionSpec.body.components) {
      expect(c.id).toMatch(/^ic_/);
    }
  });

  it('writes approval fields at the top level (not inside body)', () => {
    const input = bridgedFullChat();
    const { interactionSpec } = deriveInteractionSpec({
      ...input,
      mode: 'omitted',
      approval,
    });

    if (interactionSpec.status !== 'omitted') throw new Error('expected omitted');
    expect(interactionSpec.reason).toBe(approval.reason);
    expect(interactionSpec.approvedBy).toBe(approval.approvedBy);
    expect(interactionSpec.approvedAt).toBe(approval.approvedAt);
  });

  it('throws when mode=omitted is called without an approval object', () => {
    const input = bridgedFullChat();
    expect(() => deriveInteractionSpec({ ...input, mode: 'omitted' })).toThrowError(
      /mode='omitted' requires an approval object/,
    );
  });

  it('throws when mode=draft is called with an approval object', () => {
    const input = bridgedFullChat();
    expect(() => deriveInteractionSpec({ ...input, mode: 'draft', approval })).toThrowError(
      /mode='draft' must not carry an approval object/,
    );
  });
});
