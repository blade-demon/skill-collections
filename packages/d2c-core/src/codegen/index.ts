/**
 * Stage 6 — codegen public surface.
 *
 * 6-PR-1 landed the Gate 2 entry points: component-plan sign-off
 * (`approveComponentPlan`) and design-spec input validation
 * (`verifyDesignSpec`). 6-PR-2 adds the `TargetGenerator` abstraction and the
 * React + TS + BEM generator behind `generateComponentPackage`
 * (plan docs/stages/stage-6-codegen-plan.md §3.1).
 */
export * from './sign-off';
export * from './verify-design-spec';
export * from './target';
export * from './assets';
export * from './generate';
