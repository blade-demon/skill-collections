/**
 * Stage 5A — SemanticView body schema.
 *
 * Replaces the loose `z.record(z.unknown())` body that `SemanticViewSchema`
 * carried through Stage 4. The shapes here are shape-level only; cross-node
 * graph constraints (unique ids, reciprocal parent/child links, screen
 * pointer integrity) live in `./validate.ts`.
 *
 * `ConfidenceSchema` and `WarningSchema` are imported from `../ir/schema`
 * rather than redefined — they were already stable primitives across the IR.
 * Stage 5A warnings use the existing single `sourceNodeId` field; cross-node
 * situations emit one warning per node.
 */
import { z } from 'zod';

import { ConfidenceSchema, WarningSchema } from '../ir/schema';

/* ── evidence ────────────────────────────────────────────────────────────── */

export const SemanticEvidenceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('visual-node'),
      nodeId: z.string().min(1),
      reason: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('design-ir-candidate'),
      candidateName: z.string().min(1),
      nodeId: z.string().min(1),
      reason: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('annotation'),
      annotationKey: z.string().min(1),
      nodeId: z.string().min(1),
      reason: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('project-rule'),
      ruleName: z.string().min(1),
      reason: z.string().min(1),
    })
    .strict(),
]);
export type SemanticEvidence = z.infer<typeof SemanticEvidenceSchema>;

/* ── geometry and trace primitives (internal to semantic body) ───────────── */

const BoundsSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict();
export type Bounds = z.infer<typeof BoundsSchema>;

const SemanticSourceSchema = z
  .object({
    nodeIds: z.array(z.string().min(1)).min(1),
    提供方: z.string().min(1).optional(),
  })
  .strict();
export type SemanticSource = z.infer<typeof SemanticSourceSchema>;

/* ── SemanticNode (9-kind discriminated union) ───────────────────────────── */

const semanticNodeBaseFields = {
  id: z.string().min(1),
  name: z.string(),
  role: z.string().min(1).optional(),
  primaryVisualNodeId: z.string().min(1),
  visualNodeIds: z.array(z.string().min(1)).min(1),
  parentId: z.string().min(1).optional(),
  childIds: z.array(z.string().min(1)),
  bounds: BoundsSchema,
  confidence: ConfidenceSchema,
  evidence: z.array(SemanticEvidenceSchema).min(1),
  source: SemanticSourceSchema,
} as const;

export const SemanticNodeKindSchema = z.enum([
  'screen',
  'region',
  'component',
  'repeated-item',
  'text',
  'media',
  'icon',
  'control',
  'decorative',
]);
export type SemanticNodeKind = z.infer<typeof SemanticNodeKindSchema>;

export const SemanticNodeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('screen'), ...semanticNodeBaseFields }).strict(),
  z.object({ kind: z.literal('region'), ...semanticNodeBaseFields }).strict(),
  z.object({ kind: z.literal('component'), ...semanticNodeBaseFields }).strict(),
  z.object({ kind: z.literal('repeated-item'), ...semanticNodeBaseFields }).strict(),
  z.object({ kind: z.literal('text'), ...semanticNodeBaseFields }).strict(),
  z.object({ kind: z.literal('media'), ...semanticNodeBaseFields }).strict(),
  z.object({ kind: z.literal('icon'), ...semanticNodeBaseFields }).strict(),
  z.object({ kind: z.literal('control'), ...semanticNodeBaseFields }).strict(),
  z.object({ kind: z.literal('decorative'), ...semanticNodeBaseFields }).strict(),
]);
export type SemanticNode = z.infer<typeof SemanticNodeSchema>;

/* ── candidates and patterns ─────────────────────────────────────────────── */

export const ComponentBoundarySchema = z.enum([
  'symbol',
  'annotation',
  'repeat-pattern',
  'visual-region',
  'developer-provided',
]);
export type ComponentBoundary = z.infer<typeof ComponentBoundarySchema>;

export const ComponentCandidateSchema = z
  .object({
    id: z.string().min(1),
    rootSemanticNodeId: z.string().min(1),
    suggestedName: z.string().min(1),
    boundary: ComponentBoundarySchema,
    confidence: ConfidenceSchema,
    evidence: z.array(SemanticEvidenceSchema).min(1),
  })
  .strict();
export type ComponentCandidate = z.infer<typeof ComponentCandidateSchema>;

export const RepeatedPatternAxisSchema = z.enum(['x', 'y', 'grid', 'unknown']);
export type RepeatedPatternAxis = z.infer<typeof RepeatedPatternAxisSchema>;

export const RepeatedPatternSchema = z
  .object({
    id: z.string().min(1),
    /** Plan §3.4: a repeated pattern needs ≥ 3 items. */
    itemSemanticNodeIds: z.array(z.string().min(1)).min(3),
    axis: RepeatedPatternAxisSchema,
    itemCount: z.number().int().min(3),
    similarity: z.number().min(0).max(1),
    confidence: ConfidenceSchema,
    evidence: z.array(SemanticEvidenceSchema).min(1),
  })
  .strict();
export type RepeatedPattern = z.infer<typeof RepeatedPatternSchema>;

export const LayoutCandidateKindSchema = z.enum(['absolute', 'stack', 'inline', 'grid', 'overlay']);
export type LayoutCandidateKind = z.infer<typeof LayoutCandidateKindSchema>;

export const LayoutCandidateSchema = z
  .object({
    id: z.string().min(1),
    semanticNodeId: z.string().min(1),
    kind: LayoutCandidateKindSchema,
    confidence: ConfidenceSchema,
    constraints: z.array(z.string()),
    caveats: z.array(z.string()),
  })
  .strict();
export type LayoutCandidate = z.infer<typeof LayoutCandidateSchema>;

/* ── screen pointer and body envelope ────────────────────────────────────── */

export const SemanticScreenSchema = z
  .object({
    semanticNodeId: z.string().min(1),
    name: z.string(),
  })
  .strict();
export type SemanticScreen = z.infer<typeof SemanticScreenSchema>;

export const SemanticViewBodySchema = z
  .object({
    screen: SemanticScreenSchema,
    nodes: z.array(SemanticNodeSchema).min(1),
    componentCandidates: z.array(ComponentCandidateSchema),
    repeatedPatterns: z.array(RepeatedPatternSchema),
    layoutCandidates: z.array(LayoutCandidateSchema),
    /**
     * Warnings reuse the existing IR-level WarningSchema. Cross-node warnings
     * (e.g. "spacing irregular across 5 siblings") emit one Warning per
     * affected node, keyed by `sourceNodeId`.
     */
    warnings: z.array(WarningSchema),
  })
  .strict();
export type SemanticViewBody = z.infer<typeof SemanticViewBodySchema>;
