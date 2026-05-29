import { describe, expect, it } from 'vitest';

import { ComponentPlanSchema } from '../../contract/component-plan-schema';
import { deriveComponentPlan } from '../../contract/derive-component-plan';
import {
  interactiveInput,
  presentationalInput,
} from '../../contract/__tests__/component-plan-fixtures';
import { stableJson, stableSha256 } from '../../utils/stable-json';
import { approveComponentPlan } from '../sign-off';

describe('approveComponentPlan', () => {
  it('promotes a draft presentational plan to approved with a presentational approval', () => {
    const { componentPlan: draft } = deriveComponentPlan(presentationalInput());
    expect(draft.status).toBe('draft');

    const approved = approveComponentPlan(draft, {
      approvedBy: 'alice',
      approvedAt: '2026-05-29T00:00:00Z',
      acknowledgedBehaviorStubbed: true,
    });

    expect(approved.status).toBe('approved');
    expect(approved.approval).toEqual({
      gate: 'gate-2',
      level: 'presentational',
      approvedBy: 'alice',
      approvedAt: '2026-05-29T00:00:00Z',
      acknowledgedBehaviorStubbed: true,
    });
    // body is untouched — sign-off only flips status + writes approval
    expect(approved.body).toEqual(draft.body);
    // the result parses (superRefine accepts the status × mode × approval shape)
    expect(() => ComponentPlanSchema.parse(approved)).not.toThrow();
  });

  it('promotes a draft interactive plan to approved with an interactive approval (no behavior-stub ack)', () => {
    const { componentPlan: draft } = deriveComponentPlan(interactiveInput());
    expect(draft.status).toBe('draft');
    expect(draft.mode).toBe('interactive');

    const approved = approveComponentPlan(draft, {
      approvedBy: 'bob',
      approvedAt: '2026-05-29T00:00:00Z',
    });

    expect(approved.status).toBe('approved');
    expect(approved.approval).toEqual({
      gate: 'gate-2',
      level: 'interactive',
      approvedBy: 'bob',
      approvedAt: '2026-05-29T00:00:00Z',
    });
    expect(approved.body).toEqual(draft.body);
    expect(() => ComponentPlanSchema.parse(approved)).not.toThrow();
  });

  it('refuses to sign off a plan that is not in draft status', () => {
    const { componentPlan: draft } = deriveComponentPlan(presentationalInput());
    const approved = approveComponentPlan(draft, {
      approvedBy: 'alice',
      approvedAt: '2026-05-29T00:00:00Z',
      acknowledgedBehaviorStubbed: true,
    });

    // re-signing an already-approved plan must throw
    expect(() =>
      approveComponentPlan(approved, {
        approvedBy: 'alice',
        approvedAt: '2026-05-29T00:00:00Z',
        acknowledgedBehaviorStubbed: true,
      }),
    ).toThrow(/draft/i);
  });

  it('requires acknowledgedBehaviorStubbed=true to sign off a presentational plan', () => {
    const { componentPlan: draft } = deriveComponentPlan(presentationalInput());

    expect(() =>
      approveComponentPlan(draft, { approvedBy: 'alice', approvedAt: '2026-05-29T00:00:00Z' }),
    ).toThrow(/acknowledge/i);

    expect(() =>
      approveComponentPlan(draft, {
        approvedBy: 'alice',
        approvedAt: '2026-05-29T00:00:00Z',
        acknowledgedBehaviorStubbed: false,
      }),
    ).toThrow(/acknowledge/i);
  });

  it('changes the whole-artifact hash (approval lives in the artifact — plan §3.4 Option A)', () => {
    const { componentPlan: draft } = deriveComponentPlan(presentationalInput());
    const draftHash = stableSha256(stableJson(draft));

    const approved = approveComponentPlan(draft, {
      approvedBy: 'alice',
      approvedAt: '2026-05-29T00:00:00Z',
      acknowledgedBehaviorStubbed: true,
    });

    expect(stableSha256(stableJson(approved))).not.toBe(draftHash);
  });
});
