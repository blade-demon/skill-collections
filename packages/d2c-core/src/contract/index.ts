/**
 * Stage 5B+ Gate 2 contract layer. Stage 5B populates this with the
 * InteractionSpec schema, body sub-schemas, the graph-level integrity
 * validator, and `deriveInteractionSpec` itself. ComponentPlan schema
 * joins the same module in 5C.
 *
 * NOTE: this barrel is NOT yet re-exported from `src/index.ts` — that
 * wiring lands in 5B-PR-3 alongside the deletion of the parallel
 * `ir/views.ts/InteractionSpecSchema`. Until then, the canonical
 * InteractionSpecSchema (5-state status + tight body) lives here, and the
 * older loose-body version in `ir/views.ts` continues to satisfy any
 * import paths that have not yet migrated.
 */
export * from './interaction-schema';
export * from './interaction-validate';
export * from './derive-interaction';
