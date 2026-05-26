import { z } from 'zod';

/**
 * Provenance back-reference carried by every derived view and contract, so an
 * artifact can be traced to the upstream artifacts it was generated from.
 */
export const GeneratedFromSchema = z
  .object({
    schemaVersion: z.string().min(1),
    sourceRef: z.record(z.string()).optional(),
    /**
     * Hash of the `design-ir.json` a view was derived from. Optional at
     * Stage 1; populated for real once content hashing lands in Stage 4.
     */
    designIrHash: z.string().optional(),
    /**
     * Hash of the `visual-view.json` a downstream artifact (semantic-view,
     * interaction-spec, component-plan) was derived from. Added in Stage 5A;
     * `deriveSemanticView` writes it. Optional at the schema level so the
     * field can be absent on the upstream `visual-view` itself.
     */
    visualViewHash: z.string().optional(),
    /**
     * Hash of the `semantic-view.json` an interaction-spec or component-plan
     * was derived from. Added in Stage 5B; `deriveInteractionSpec` writes
     * it. Optional at the schema level so the field can be absent on
     * upstream artifacts (visual-view / semantic-view themselves).
     */
    semanticViewHash: z.string().optional(),
  })
  .strict();
export type GeneratedFrom = z.infer<typeof GeneratedFromSchema>;
