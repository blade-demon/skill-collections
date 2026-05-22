import { z } from 'zod';

import { ContractStatusSchema } from './schema';
import { VisualBlockSchema } from './visual';

/**
 * Provenance back-reference carried by every derived view and contract, so an
 * artifact can be traced to the Design IR it was generated from.
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
  })
  .strict();
export type GeneratedFrom = z.infer<typeof GeneratedFromSchema>;

/* `visual-view` firms up in Stage 4 because preview rendering needs a real
 * VisualBlock. Later views remain envelope-only until their stages land. */

export const VisualViewSchema = z
  .object({
    kind: z.literal('visual-view'),
    generatedFrom: GeneratedFromSchema,
    body: VisualBlockSchema,
  })
  .strict();
export type VisualView = z.infer<typeof VisualViewSchema>;

export const SemanticViewSchema = z
  .object({
    kind: z.literal('semantic-view'),
    generatedFrom: GeneratedFromSchema,
    body: z.record(z.unknown()),
  })
  .strict();
export type SemanticView = z.infer<typeof SemanticViewSchema>;

/* `interaction-spec` and `component-plan` are both Gate 2 contract artifacts,
 * so they share one lifecycle enum (`ContractStatusSchema`) — including the
 * `in-review` state for "submitted to the gate, awaiting decision". */

export const InteractionSpecSchema = z
  .object({
    kind: z.literal('interaction-spec'),
    generatedFrom: GeneratedFromSchema,
    status: ContractStatusSchema,
    body: z.record(z.unknown()),
  })
  .strict();
export type InteractionSpec = z.infer<typeof InteractionSpecSchema>;

export const ComponentPlanSchema = z
  .object({
    kind: z.literal('component-plan'),
    generatedFrom: GeneratedFromSchema,
    status: ContractStatusSchema,
    body: z.record(z.unknown()),
  })
  .strict();
export type ComponentPlan = z.infer<typeof ComponentPlanSchema>;
