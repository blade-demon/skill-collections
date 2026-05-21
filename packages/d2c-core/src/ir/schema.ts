import { z } from 'zod';

import { SCHEMA_VERSION_FORMAT } from './version';
import { SemanticBlockSchema } from './semantic';
import { VisualBlockSchema } from './visual';

/* ── Stable extensible primitives ───────────────────────────────────────────
 * Pinned now so the (currently loose) visual / semantic / interaction blocks
 * can adopt them incrementally from Stage 3 onward without a schema break. */

export const SeveritySchema = z.enum(['info', 'warning', 'error']);
export type Severity = z.infer<typeof SeveritySchema>;

export const WarningSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    severity: SeveritySchema.default('warning'),
    sourceNodeId: z.string().optional(),
    stage: z.string().optional(),
  })
  .strict();
export type Warning = z.infer<typeof WarningSchema>;

export const ConfidenceSchema = z.enum(['low', 'medium', 'high', 'developer-provided']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * Designer annotation primitive (`@component` / `@state` / `@event` / `@slot`
 * / `@data`). Exported as a stable primitive for Stage 3+ semantic use; it is
 * intentionally NOT referenced by the top-level DesignIR envelope yet.
 */
export const AnnotationSchema = z
  .object({
    kind: z.string().min(1),
    value: z.string(),
    sourceNodeId: z.string().optional(),
  })
  .strict();
export type Annotation = z.infer<typeof AnnotationSchema>;

/* ── Top-level envelope (strict) ────────────────────────────────────────── */

/**
 * Recommended `source.ref` keys. The schema does not force any specific key,
 * but providers and fixtures should use these semantic names rather than
 * opaque ids like `id1` / `id2`.
 */
export const RECOMMENDED_SOURCE_REF_KEYS = [
  'url',
  'fileId',
  'fileName',
  'documentId',
  'pageId',
  'nodeId',
  'layerId',
] as const;

/**
 * A non-empty bag of provider-specific tracing identifiers. Shared by the
 * Design IR `source` and the raw artifact so both anchor back to a real design
 * file/node. See {@link RECOMMENDED_SOURCE_REF_KEYS} for key names.
 */
export const TraceRefSchema = z
  .record(z.string())
  .refine((r) => Object.keys(r).length > 0, {
    message: 'must contain at least one tracing key (e.g. fileId / nodeId / url)',
  });
export type TraceRef = z.infer<typeof TraceRefSchema>;

export const SourceSchema = z
  .object({
    /** Provider id, e.g. `mastergo`. Not enumerated — core stays provider-neutral. */
    provider: z.string().min(1),
    /** Tracing anchor back to the design file/node. */
    ref: TraceRefSchema,
    rootName: z.string().optional(),
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;

/**
 * Lifecycle status shared by contract-bearing artifacts — the IR `interaction`
 * block, `interaction-spec`, and `component-plan`: `draft` while still being
 * authored, `in-review` once submitted to a gate, `approved` once it passes.
 */
export const ContractStatusSchema = z.enum(['draft', 'in-review', 'approved']);
export type ContractStatus = z.infer<typeof ContractStatusSchema>;

/**
 * Canonical normalized Design IR — the single source of truth after
 * extraction. Top-level keys are strict. From v0.2 onward, `visual` and
 * `semantic` are shared contracts consumed by preview, planning, and codegen.
 */
export const DesignIRSchema = z
  .object({
    /**
     * Format (`<family>/v<major>.<minor>.<patch>`) is checked here, so a direct
     * `DesignIRSchema` consumer cannot get a structurally-"valid" IR with a
     * garbage version. Family / major / minor compatibility is a separate
     * semantic check done by `isCompatible` (see `validateDesignIR`).
     */
    schemaVersion: z.string().regex(SCHEMA_VERSION_FORMAT, {
      message: 'must be "<family>/v<major>.<minor>.<patch>"',
    }),
    source: SourceSchema,
    visual: VisualBlockSchema,
    semantic: SemanticBlockSchema,
    interaction: z.object({ status: ContractStatusSchema }).passthrough(),
    warnings: z.array(WarningSchema),
  })
  .strict();
export type DesignIR = z.infer<typeof DesignIRSchema>;
