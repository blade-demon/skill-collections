import { z } from 'zod';
import { TraceRefSchema } from '../ir/schema';
import type { DesignIR, Warning } from '../ir/schema';

/**
 * Provider-specific raw extraction result, persisted by the pipeline as
 * `ir/raw-dsl.json`. The `payload` shape is intentionally unconstrained — it
 * is whatever the provider's DSL endpoint returns.
 */
export const RawArtifactSchema = z
  .object({
    provider: z.string().min(1),
    /** Tracing anchor — same shape as `DesignIR.source.ref`, non-empty. */
    ref: TraceRefSchema,
    /** Provider-specific raw DSL. Any value is allowed, but the key must be
     * present — a missing / `undefined` payload is rejected (see refine below). */
    payload: z.unknown(),
    /** ISO 8601 timestamp of when the raw DSL was captured. */
    capturedAt: z.string().datetime(),
  })
  .strict()
  .refine((data) => data.payload !== undefined, {
    message: 'payload is required',
    path: ['payload'],
  });
export type RawArtifact = z.infer<typeof RawArtifactSchema>;

export interface AssetExportResult {
  assets: Array<{ id: string; path: string }>;
  warnings: Warning[];
}

export interface ReferenceFrameResult {
  /** Path to the exported reference image, or `null` when unavailable. */
  imagePath: string | null;
  skipped: boolean;
  reason?: string;
}

/**
 * Capability-style provider port. A provider is the only layer that knows
 * provider-specific details (MasterGo / Figma / Sketch).
 *
 * - Required: `extractRaw`, `normalize`.
 * - Optional: `exportAssets`, `exportReferenceFrame` — presence signals the
 *   capability; absence is handled by the pipeline's documented fallbacks
 *   (e.g. screenshot diff is skipped with a warning when no reference frame
 *   can be exported).
 *
 * Contract: `normalize` MUST be deterministic, and its output MUST pass
 * `validateDesignIR()`. Use `normalizeAndValidate()` to enforce this.
 */
export interface Provider<TInput = unknown> {
  readonly id: string;
  extractRaw(input: TInput): Promise<RawArtifact>;
  normalize(raw: RawArtifact): Promise<DesignIR>;
  exportAssets?(raw: RawArtifact): Promise<AssetExportResult>;
  exportReferenceFrame?(raw: RawArtifact): Promise<ReferenceFrameResult>;
}
