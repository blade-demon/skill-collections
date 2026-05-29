/**
 * Stage 6 — codegen entry point. Dispatches to a target generator by the
 * approved plan's own `body.target.framework`; there is no external target /
 * mode parameter (plan docs/stage-6-codegen-plan.md §3.2).
 */
import { reactGenerator } from './react/generate';
import type { CodegenFilePlan, CodegenInput, TargetGenerator } from './target';

const GENERATORS: readonly TargetGenerator[] = [reactGenerator];

export function generateComponentPackage(input: CodegenInput): CodegenFilePlan {
  const { framework } = input.componentPlan.body.target;
  const generator = GENERATORS.find((g) => g.framework === framework);
  if (generator === undefined) {
    throw new Error(`generateComponentPackage: no target generator for framework '${framework}'`);
  }
  return generator.generate(input);
}
