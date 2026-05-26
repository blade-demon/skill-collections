/**
 * Stage 5B — InteractionSpec schema.
 *
 * Replaces the loose `z.record(z.unknown())` body that
 * `ir/views.ts/InteractionSpecSchema` carried through Stage 5A. The top-level
 * envelope is a `z.discriminatedUnion('status', ...)` so the schema itself
 * enforces the approval-field contract:
 *
 *   - `draft` / `in-review` → reason / approvedBy / approvedAt are FORBIDDEN
 *     (caught by `.strict()` as unknown keys); they belong only to artifacts
 *     that have actually been signed off.
 *   - `approved` / `omitted` / `deferred` → approvedBy + approvedAt are
 *     REQUIRED. reason is required for omitted/deferred (you must say why),
 *     optional for approved (no need to justify an approval).
 *
 * The 5-state `InteractionStatusSchema` is kept independent of the existing
 * 3-state `ContractStatusSchema` (`draft | in-review | approved`) that
 * `component-plan` will continue to use — component-plan expresses
 * presentational vs interactive through a separate `mode` field, never
 * through status.
 *
 * PR-3 wires this canonical schema into `ir/views.ts` for legacy direct
 * imports, and into the root barrel as the public Stage 5B contract surface.
 */
import { z } from 'zod';

import { GeneratedFromSchema } from '../ir/generated-from';
import { ConfidenceSchema, WarningSchema } from '../ir/schema';

/* ── status (5 values, independent of ContractStatusSchema) ─────────────── */

export const InteractionStatusSchema = z.enum([
  'draft',
  'in-review',
  'approved',
  'omitted',
  'deferred',
]);
export type InteractionStatus = z.infer<typeof InteractionStatusSchema>;

/* ── body element schemas ────────────────────────────────────────────────── */

export const InteractionComponentSchema = z
  .object({
    id: z.string().min(1),
    semanticNodeId: z.string().min(1),
    name: z.string().min(1),
    confidence: ConfidenceSchema,
  })
  .strict();
export type InteractionComponent = z.infer<typeof InteractionComponentSchema>;

export const InteractionEventSchema = z
  .object({
    id: z.string().min(1),
    eventName: z.string().min(1),
    /** semantic node id this event originates from */
    source: z.string().min(1),
    /** e.g., "onSubmitMessage" */
    handlerProp: z.string().min(1),
    /** field name → TypeScript-ish type signature (string for 5B) */
    payload: z.record(z.string()),
    confidence: ConfidenceSchema,
    evidenceMessage: z.string().min(1),
  })
  .strict();
export type InteractionEvent = z.infer<typeof InteractionEventSchema>;

export const InteractionDataModelSchema = z
  .object({
    id: z.string().min(1),
    slotName: z.string().min(1),
    /** semantic node id this slot binds to */
    source: z.string().min(1),
    /** TypeScript-ish type signature; 5B always emits 'string' */
    type: z.string().min(1),
    confidence: ConfidenceSchema,
    evidenceMessage: z.string().min(1),
  })
  .strict();
export type InteractionDataModel = z.infer<typeof InteractionDataModelSchema>;

export const InteractionStateSchema = z
  .object({
    id: z.string().min(1),
    stateName: z.string().min(1),
    confidence: ConfidenceSchema,
    evidenceMessage: z.string().min(1),
  })
  .strict();
export type InteractionState = z.infer<typeof InteractionStateSchema>;

export const InteractionTransitionSchema = z
  .object({
    id: z.string().min(1),
    /** must match a stateName in body.states */
    from: z.string().min(1),
    /** must match an eventName in body.events */
    on: z.string().min(1),
    /** must match a stateName in body.states */
    to: z.string().min(1),
    confidence: ConfidenceSchema,
  })
  .strict();
export type InteractionTransition = z.infer<typeof InteractionTransitionSchema>;

/* ── coverage ────────────────────────────────────────────────────────────── */

export const InteractionCoverageStatusSchema = z.enum(['covered', 'draft', 'omitted', 'deferred']);
export type InteractionCoverageStatus = z.infer<typeof InteractionCoverageStatusSchema>;

const coverageEntrySchema = z
  .object({
    status: InteractionCoverageStatusSchema,
    notes: z.string(),
  })
  .strict();

export const InteractionCoverageSchema = z
  .object({
    states: coverageEntrySchema,
    events: coverageEntrySchema,
    dataBinding: coverageEntrySchema,
    stateTransitions: coverageEntrySchema,
  })
  .strict();
export type InteractionCoverage = z.infer<typeof InteractionCoverageSchema>;

/* ── body envelope ───────────────────────────────────────────────────────── */

export const InteractionSpecBodySchema = z
  .object({
    components: z.array(InteractionComponentSchema),
    states: z.array(InteractionStateSchema),
    events: z.array(InteractionEventSchema),
    dataModels: z.array(InteractionDataModelSchema),
    stateTransitions: z.array(InteractionTransitionSchema),
    coverage: InteractionCoverageSchema,
    warnings: z.array(WarningSchema),
  })
  .strict();
export type InteractionSpecBody = z.infer<typeof InteractionSpecBodySchema>;

/* ── top-level envelope (discriminated union on status) ──────────────────── */

const envelopeBaseFields = {
  kind: z.literal('interaction-spec'),
  generatedFrom: GeneratedFromSchema,
  body: InteractionSpecBodySchema,
} as const;

/**
 * Strict `.strict()` on every branch is load-bearing: it converts "extra key
 * on the wrong status" into a parse error. A caller who builds an object with
 * status='draft' but also sets approvedBy gets rejected, instead of silently
 * shipping a draft that pretends to be signed off.
 */
export const InteractionSpecSchema = z.discriminatedUnion('status', [
  z.object({ ...envelopeBaseFields, status: z.literal('draft') }).strict(),
  z.object({ ...envelopeBaseFields, status: z.literal('in-review') }).strict(),
  z
    .object({
      ...envelopeBaseFields,
      status: z.literal('approved'),
      reason: z.string().min(1).optional(),
      approvedBy: z.string().min(1),
      approvedAt: z.string().min(1),
    })
    .strict(),
  z
    .object({
      ...envelopeBaseFields,
      status: z.literal('omitted'),
      reason: z.string().min(1),
      approvedBy: z.string().min(1),
      approvedAt: z.string().min(1),
    })
    .strict(),
  z
    .object({
      ...envelopeBaseFields,
      status: z.literal('deferred'),
      reason: z.string().min(1),
      approvedBy: z.string().min(1),
      approvedAt: z.string().min(1),
    })
    .strict(),
]);
export type InteractionSpec = z.infer<typeof InteractionSpecSchema>;
