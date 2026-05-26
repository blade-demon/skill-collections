/**
 * Stage 5B+ Gate 2 contract layer. Stage 5B populates this with the
 * InteractionSpec schema, body sub-schemas, the graph-level integrity
 * validator, and `deriveInteractionSpec` itself. ComponentPlan schema
 * joins the same module in 5C.
 *
 * `InteractionSpecSchema` is the canonical 5-state, tight-body version.
 * `ir/views.ts` re-exports the same binding for legacy direct imports while
 * the root barrel exports this module as the public Stage 5B surface.
 */
export * from './interaction-schema';
export * from './interaction-validate';
export * from './derive-interaction';
