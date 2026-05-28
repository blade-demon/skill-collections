/**
 * Stable design IR layer. Keep provider-specific acquisition details out of
 * this barrel so Sketch, MasterGo, and future providers normalize into the same
 * schema and validation surface.
 */
export * from './version';
export * from './visual';
export * from './semantic';
export * from './schema';
export * from './generated-from';
export { VisualViewSchema, type VisualView, SemanticViewSchema, type SemanticView } from './views';
/* `ComponentPlanSchema` / `ComponentPlan` deliberately omitted: Stage 5C
 * moves the canonical binding to `../contract/component-plan-schema`. The
 * root barrel exports it exactly once via `export * from './contract'`, so
 * the ir barrel stops forwarding it to avoid a duplicate-export name
 * conflict on the public surface. `./views` still re-exports the canonical
 * binding for the legacy `from '.../ir/views'` direct-import path. */
export * from './validate';
