/**
 * Shared codegen test fixtures — produce an APPROVED component-plan + its
 * upstream views, ready for `generateComponentPackage`.
 *
 * `generateComponentPackage` rejects any plan whose status is not 'approved'
 * (the core API enforces Gate 2 itself, not just the CLI), so codegen tests
 * must sign the derived draft off first.
 */
import { deriveComponentPlan } from '../../contract/derive-component-plan';
import { runContract } from '../../contract/run-contract';
import { bridgedFullChat } from '../../contract/__tests__/fixtures';
import { presentationalInput } from '../../contract/__tests__/component-plan-fixtures';
import { approveComponentPlan } from '../sign-off';
import type { CodegenInput } from '../target';

const APPROVAL = {
  reason: 'visual delivery first; interaction deferred',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
} as const;

const SIGN_OFF = {
  approvedBy: 'alice',
  approvedAt: '2026-05-29T00:00:00Z',
  acknowledgedBehaviorStubbed: true,
} as const;

/** Approved presentational input from the full runContract chain (no stub props). */
export function approvedCodegenInput(): CodegenInput {
  const { designIr } = bridgedFullChat();
  const { componentPlan, semanticView, interactionSpec } = runContract({
    designIr,
    mode: 'presentational',
    interactionMode: 'deferred',
    approval: APPROVAL,
  });
  return {
    componentPlan: approveComponentPlan(componentPlan, SIGN_OFF),
    semanticView,
    interactionSpec,
  };
}

/**
 * Approved presentational input that carries presentational-stub props
 * (presentationalInput's deferred interaction-spec injects dataModels).
 */
export function approvedStubPropsInput(): CodegenInput {
  const input = presentationalInput();
  const { componentPlan } = deriveComponentPlan(input);
  return {
    componentPlan: approveComponentPlan(componentPlan, SIGN_OFF),
    semanticView: input.semanticView,
    interactionSpec: input.interactionSpec,
  };
}
