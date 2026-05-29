/**
 * Stage 6 — codegen public surface.
 *
 * 6-PR-1 lands the Gate 2 entry points: component-plan sign-off
 * (`approveComponentPlan`) and design-spec input validation
 * (`verifyDesignSpec`). Later PRs add the `TargetGenerator` abstraction and the
 * React + TS + BEM generator (plan docs/stage-6-codegen-plan.md §3.1).
 */
export * from './sign-off';
export * from './verify-design-spec';
