/**
 * Stage 6 — component-plan sign-off (Gate 2 approval).
 *
 * Pure: promotes a `draft` component-plan to `status='approved'` by attaching a
 * Gate 2 approval record. The plan body is never touched — sign-off only flips
 * status and writes the approval block. Approval lives inside the artifact, so
 * the approved plan hashes differently from the draft; the CLI sign-off step
 * (Stage 6-PR-3) rewrites `manifest.json` accordingly
 * (plan docs/stages/stage-6-codegen-plan.md §3.4, Option A).
 *
 * This is the shared prerequisite for Stage 6 (which only consumes an approved
 * component-plan) and, by the same shape, the interactive interaction-spec path.
 */
import {
  ComponentPlanSchema,
  type ComponentPlan,
  type ComponentPlanApproval,
} from '../contract/component-plan-schema';
import { assertComponentPlanIntegrity } from '../contract/component-plan-validate';

export interface ComponentPlanSignOff {
  approvedBy: string;
  approvedAt: string;
  /**
   * Required `true` to sign off a presentational plan — the literal forces the
   * approver to acknowledge the delivery is behavior-stubbed. Ignored for
   * interactive plans, whose approval carries no such field.
   */
  acknowledgedBehaviorStubbed?: boolean;
}

export function approveComponentPlan(
  plan: ComponentPlan,
  signOff: ComponentPlanSignOff,
): ComponentPlan {
  if (plan.status !== 'draft') {
    throw new Error(
      `approveComponentPlan: only a 'draft' component-plan can be signed off (got '${plan.status}')`,
    );
  }

  let approval: ComponentPlanApproval;
  if (plan.mode === 'presentational') {
    if (signOff.acknowledgedBehaviorStubbed !== true) {
      throw new Error(
        'approveComponentPlan: a presentational plan must acknowledge it is behavior-stubbed (pass acknowledgedBehaviorStubbed: true)',
      );
    }
    approval = {
      gate: 'gate-2',
      level: 'presentational',
      approvedBy: signOff.approvedBy,
      approvedAt: signOff.approvedAt,
      acknowledgedBehaviorStubbed: true,
    };
  } else {
    approval = {
      gate: 'gate-2',
      level: 'interactive',
      approvedBy: signOff.approvedBy,
      approvedAt: signOff.approvedAt,
    };
  }

  // Re-parse to confirm the status × mode × approval shape, then re-run the
  // graph integrity check (body is unchanged, so it must still hold).
  const approved = ComponentPlanSchema.parse({ ...plan, status: 'approved', approval });
  assertComponentPlanIntegrity(approved);
  return approved;
}
