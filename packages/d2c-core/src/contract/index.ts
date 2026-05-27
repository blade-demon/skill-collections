/**
 * Stage 5B+ Gate 2 contract layer. Stage 5B populates this with the
 * InteractionSpec schema, body sub-schemas, the graph-level integrity
 * validator, and `deriveInteractionSpec` itself. Stage 5C adds the canonical
 * ComponentPlan schema, integrity validator, and `deriveComponentPlan`.
 *
 * The canonical `InteractionSpecSchema` and `ComponentPlanSchema` both live
 * here. `ir/views.ts` re-exports both for legacy direct imports, while the
 * root barrel exports this module as the public Stage 5B/5C contract
 * surface.
 */
export * from './interaction-schema';
export * from './interaction-validate';
export * from './derive-interaction';
export * from './component-plan-schema';
export * from './component-plan-validate';
export * from './derive-component-plan';
