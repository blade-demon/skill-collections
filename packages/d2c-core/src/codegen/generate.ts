/**
 * Stage 6 — codegen entry point. Dispatches to a target generator by the
 * approved plan's own `body.target.framework`; there is no external target /
 * mode parameter (plan docs/stages/stage-6-codegen-plan.md §3.2).
 *
 * Gate 2 is enforced here, not just at the CLI: any plan whose status is not
 * 'approved' is rejected before a target generator runs, so the public core
 * API cannot generate from a draft plan (§3.2 — an unapproved plan is rejected
 * before mode validation).
 */
import { reactGenerator } from './react/generate';
import type { CodegenFilePlan, CodegenInput, TargetGenerator } from './target';

const GENERATORS: readonly TargetGenerator[] = [reactGenerator];

export function generateComponentPackage(input: CodegenInput): CodegenFilePlan {
  if (input.componentPlan.status !== 'approved') {
    throw new Error(
      `generateComponentPackage: component-plan.status must be 'approved' to generate (got '${input.componentPlan.status}')`,
    );
  }
  const { framework } = input.componentPlan.body.target;
  const generator = GENERATORS.find((g) => g.framework === framework);
  if (generator === undefined) {
    throw new Error(`generateComponentPackage: no target generator for framework '${framework}'`);
  }
  return generator.generate(input);
}
