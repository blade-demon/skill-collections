import { describe, expect, it } from 'vitest';

import { deriveComponentPlan } from '../../contract/derive-component-plan';
import {
  interactiveInput,
  makeMixedTextMediaView,
  presentationalInput,
} from '../../contract/__tests__/component-plan-fixtures';
import { approveComponentPlan } from '../sign-off';
import { generateComponentPackage } from '../generate';
import type { CodegenInput } from '../target';

const SIGN_OFF = {
  approvedBy: 'alice',
  approvedAt: '2026-05-29T00:00:00Z',
  acknowledgedBehaviorStubbed: true,
} as const;

describe('generateComponentPackage — guards', () => {
  it('refuses to generate from a plan that is not approved (Gate 2)', () => {
    const input = presentationalInput();
    const { componentPlan } = deriveComponentPlan(input);
    expect(componentPlan.status).toBe('draft');
    expect(() =>
      generateComponentPackage({
        componentPlan,
        visualView: input.visualView,
        semanticView: input.semanticView,
        interactionSpec: input.interactionSpec,
      }),
    ).toThrow(/approved/i);
  });

  it('refuses to generate an interactive plan (presentational only in v1)', () => {
    const input = interactiveInput();
    const { componentPlan } = deriveComponentPlan(input);
    // interactive plans sign off at the interactive level (no behavior-stub ack)
    const approved = approveComponentPlan(componentPlan, {
      approvedBy: 'bob',
      approvedAt: '2026-05-29T00:00:00Z',
    });
    const codegenInput: CodegenInput = {
      componentPlan: approved,
      visualView: input.visualView,
      semanticView: input.semanticView,
      interactionSpec: input.interactionSpec,
    };
    expect(() => generateComponentPackage(codegenInput)).toThrow(/presentational/i);
  });

  it('returns an asset copy plan (not binary files) and drops the post-v1 warning', () => {
    const input = presentationalInput(makeMixedTextMediaView);
    const { componentPlan } = deriveComponentPlan(input);
    expect(componentPlan.body.assetPlan.length, 'fixture should carry an asset').toBeGreaterThan(0);

    const result = generateComponentPackage({
      componentPlan: approveComponentPlan(componentPlan, SIGN_OFF),
      visualView: input.visualView,
      semanticView: input.semanticView,
      interactionSpec: input.interactionSpec,
    });

    // The pure generator describes the copy plan but never emits the bytes;
    // the CLI copies them at the filesystem boundary.
    expect(result.assets.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.path.includes('/assets/'))).toBe(false);
    // The blanket "asset generation is post-v1" warning is gone.
    expect(result.warnings.some((w) => /not emitted/i.test(w))).toBe(false);
  });
});
