/**
 * Stage 5C — ComponentPlan schema (canonical).
 *
 * Replaces the loose `z.record(z.unknown())` body that `ir/views.ts`
 * `ComponentPlanSchema` carried through Stages 5A / 5B. The top-level
 * envelope keeps the 3-state `ContractStatusSchema`
 * (`draft | in-review | approved`) and adds a separate `mode` field
 * (`presentational | interactive`) so plan lifecycle status never gets
 * conflated with the codegen mode it locks in for Stage 6.
 *
 * Approval shape is enforced HERE via a top-level `superRefine` — per plan
 * §3.3, validator (`./component-plan-validate.ts`) does NOT re-check
 * status × mode × approval shape. A caller holding a `safeParse` result is
 * free to act on it without running the validator just to confirm approval.
 *
 * 5C-PR-1 stops at schema + integrity validator + tests. `ir/views.ts`
 * still carries the loose `ComponentPlanSchema` until PR-3 wires this
 * canonical version through. `contract/index.ts` is untouched in PR-1 to
 * avoid clashing with the root barrel.
 *
 * Plan refs:
 *   §3.1 — 3-state status, mode separate.
 *   §3.2 — mode × interaction-status combo (validator's job, not here).
 *   §3.3 — superRefine: draft/in-review forbid approval; approved demands
 *          matching approval.level; presentational approval requires
 *          `acknowledgedBehaviorStubbed: true` (carried in the discriminated
 *          union branch via `z.literal(true)`).
 *   §4   — body shape (target enum, planned components / exports / layouts
 *          / assets / interactionCoverage snapshot).
 *   §5   — top-level envelope.
 */
import { z } from 'zod';

import { GeneratedFromSchema } from '../ir/generated-from';
import { ConfidenceSchema, ContractStatusSchema, WarningSchema } from '../ir/schema';

import { InteractionCoverageSchema } from './interaction-schema';

/* ── mode (codegen archetype, independent of status) ─────────────────────── */

export const ComponentPlanModeSchema = z.enum(['presentational', 'interactive']);
export type ComponentPlanMode = z.infer<typeof ComponentPlanModeSchema>;

/* ── approval (discriminated union on level) ─────────────────────────────── */

/**
 * `gate-2` is the only valid gate at this stage. The schema keeps it as a
 * literal so a future `gate-3` / etc. can be added explicitly rather than
 * sneaking in via a string field.
 */
const approvalBaseFields = {
  gate: z.literal('gate-2'),
  approvedBy: z.string().min(1),
  approvedAt: z.string().min(1),
} as const;

export const ComponentPlanApprovalSchema = z.discriminatedUnion('level', [
  z
    .object({
      ...approvalBaseFields,
      level: z.literal('interactive'),
    })
    .strict(),
  z
    .object({
      ...approvalBaseFields,
      level: z.literal('presentational'),
      /**
       * `z.literal(true)` (not `z.boolean()`) is load-bearing: it forces the
       * approver to physically acknowledge the plan is a behavior-stubbed
       * delivery, instead of letting a `false` boolean slide through and
       * pretend the plan is functionally complete.
       */
      acknowledgedBehaviorStubbed: z.literal(true),
    })
    .strict(),
]);
export type ComponentPlanApproval = z.infer<typeof ComponentPlanApprovalSchema>;

/* ── body element schemas (§4) ───────────────────────────────────────────── */

export const PlannedPropSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    source: z.enum(['data-model', 'event-payload', 'presentational-stub']),
    required: z.boolean(),
    /** Reference back to an interaction-spec event / dataModel id. */
    interactionRefId: z.string().min(1).optional(),
  })
  .strict();
export type PlannedProp = z.infer<typeof PlannedPropSchema>;

export const PlannedEventBindingSchema = z
  .object({
    eventId: z.string().min(1),
    sourceSemanticNodeId: z.string().min(1),
    handlerProp: z.string().min(1),
    /** field name → TypeScript-ish type signature (string for 5C). */
    payload: z.record(z.string()),
  })
  .strict();
export type PlannedEventBinding = z.infer<typeof PlannedEventBindingSchema>;

export const PlannedDataBindingSchema = z
  .object({
    dataModelId: z.string().min(1),
    sourceSemanticNodeId: z.string().min(1),
    propName: z.string().min(1),
    type: z.string().min(1),
  })
  .strict();
export type PlannedDataBinding = z.infer<typeof PlannedDataBindingSchema>;

/**
 * `role` is the structural classification (root / component / region /
 * repeated-item). `renderAs` is the codegen archetype — schema-level enum
 * keeps `markup` / `slot` reserved for Stage 6, even though 5C derive only
 * emits `'component'` (plan §7.2 step 4). Tightening the enum to a literal
 * would force a schemaVersion bump later; opening it now is intentional.
 */
export const PlannedComponentSchema = z
  .object({
    id: z.string().min(1),
    semanticNodeId: z.string().min(1),
    name: z.string().min(1),
    role: z.enum(['root', 'component', 'region', 'repeated-item']),
    renderAs: z.enum(['component', 'markup', 'slot']),
    childSemanticNodeIds: z.array(z.string().min(1)),
    props: z.array(PlannedPropSchema),
    eventBindings: z.array(PlannedEventBindingSchema),
    dataBindings: z.array(PlannedDataBindingSchema),
    confidence: ConfidenceSchema,
    warnings: z.array(WarningSchema),
  })
  .strict();
export type PlannedComponent = z.infer<typeof PlannedComponentSchema>;

export const PlannedExportSchema = z
  .object({
    id: z.string().min(1),
    /** References `body.components[*].id` or `body.rootComponent.id`. */
    plannedComponentId: z.string().min(1),
    exportName: z.string().min(1),
    kind: z.enum(['default', 'named']),
  })
  .strict();
export type PlannedExport = z.infer<typeof PlannedExportSchema>;

export const PlannedLayoutSchema = z
  .object({
    id: z.string().min(1),
    semanticNodeId: z.string().min(1),
    /** Upstream semantic-view `layoutCandidates[*].id`, when one matched. */
    layoutCandidateId: z.string().min(1).optional(),
    strategy: z.enum(['absolute', 'stack', 'inline', 'grid', 'overlay']),
    confidence: ConfidenceSchema,
    constraints: z.array(z.string()),
    caveats: z.array(z.string()),
  })
  .strict();
export type PlannedLayout = z.infer<typeof PlannedLayoutSchema>;

export const PlannedAssetSchema = z
  .object({
    id: z.string().min(1),
    semanticNodeId: z.string().min(1),
    /** Absent when visual-view lookup missed; derive emits a warning. */
    assetRef: z.string().min(1).optional(),
    usage: z.enum(['image', 'icon', 'background']),
    required: z.boolean(),
  })
  .strict();
export type PlannedAsset = z.infer<typeof PlannedAssetSchema>;

/* ── Stage 7 component reuse schemas ────────────────────────────────────── */

export const ComponentDefinitionSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('symbol-master'),
      masterId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('structural'),
      fingerprint: z.string().min(1),
    })
    .strict(),
]);
export type ComponentDefinitionSource = z.infer<typeof ComponentDefinitionSourceSchema>;

export const ComponentDefinitionPropSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(['text', 'assetRef']),
    defaultValue: z.string(),
  })
  .strict();
export type ComponentDefinitionProp = z.infer<typeof ComponentDefinitionPropSchema>;

export const ComponentDefinitionSchema = z
  .object({
    id: z.string().min(1),
    source: ComponentDefinitionSourceSchema,
    componentId: z.string().min(1),
    propSchema: z.array(ComponentDefinitionPropSchema),
  })
  .strict();
export type ComponentDefinition = z.infer<typeof ComponentDefinitionSchema>;

export const ComponentCallerSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('component'),
      componentId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('invocation'),
      invocationId: z.string().min(1),
    })
    .strict(),
]);
export type ComponentCaller = z.infer<typeof ComponentCallerSchema>;

export const ComponentInvocationPlacementSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict();
export type ComponentInvocationPlacement = z.infer<typeof ComponentInvocationPlacementSchema>;

export const ComponentInvocationSchema = z
  .object({
    id: z.string().min(1),
    definitionId: z.string().min(1),
    semanticNodeId: z.string().min(1),
    caller: ComponentCallerSchema,
    /**
     * Sibling index among the folded invocations sharing this caller, in
     * semantic pre-order. Unfolded sibling components and plain nodes do
     * not participate in the numbering — interleave against them via
     * `placement`, not `order`.
     */
    order: z.number().int().nonnegative(),
    placement: ComponentInvocationPlacementSchema,
    /** Definition propSchema name → instance value. */
    bindings: z.record(z.string().min(1), z.string()),
    /** Template (definition render-domain) semantic id → instance id. */
    nodeMap: z.record(z.string().min(1), z.string().min(1)),
  })
  .strict();
export type ComponentInvocation = z.infer<typeof ComponentInvocationSchema>;

export const InvocationEdgeSchema = z
  .object({
    caller: ComponentCallerSchema,
    boundarySemanticNodeId: z.string().min(1),
    invocationId: z.string().min(1),
  })
  .strict();
export type InvocationEdge = z.infer<typeof InvocationEdgeSchema>;

export const CollectionSchema = z
  .object({
    id: z.string().min(1),
    caller: ComponentCallerSchema,
    definitionId: z.string().min(1),
    invocationIds: z.array(z.string().min(1)).min(3),
    evidence: z
      .object({
        axis: z.enum(['x', 'y']),
        itemSemanticNodeIds: z.array(z.string().min(1)).min(3),
      })
      .strict(),
  })
  .strict();
export type Collection = z.infer<typeof CollectionSchema>;

/* ── body envelope ───────────────────────────────────────────────────────── */

/**
 * `target` keeps each axis as an `enum` rather than `literal` (per plan §4)
 * so Stage 6 can add `vue` / `js` / `tailwind` etc. by appending an enum
 * member, without changing the schema's structural shape.
 */
export const ComponentPlanTargetSchema = z
  .object({
    framework: z.enum(['react']),
    language: z.enum(['ts']),
    styling: z.enum(['bem-css']),
  })
  .strict();
export type ComponentPlanTarget = z.infer<typeof ComponentPlanTargetSchema>;

export const ComponentPlanBodySchema = z
  .object({
    target: ComponentPlanTargetSchema,
    rootComponent: PlannedComponentSchema,
    components: z.array(PlannedComponentSchema),
    exports: z.array(PlannedExportSchema),
    layoutPlan: z.array(PlannedLayoutSchema),
    assetPlan: z.array(PlannedAssetSchema),
    componentDefinitions: z.array(ComponentDefinitionSchema).optional(),
    componentInvocations: z.array(ComponentInvocationSchema).optional(),
    invocationEdges: z.array(InvocationEdgeSchema).optional(),
    collections: z.array(CollectionSchema).optional(),
    /**
     * Snapshot of `interactionSpec.body.coverage` (§3.5). Stage 6's
     * `interaction-coverage.md` reads from here OR from the upstream
     * `interaction-spec.json`, not from a fresh classification.
     */
    interactionCoverage: InteractionCoverageSchema,
    warnings: z.array(WarningSchema),
  })
  .strict();
export type ComponentPlanBody = z.infer<typeof ComponentPlanBodySchema>;

/* ── top-level envelope ──────────────────────────────────────────────────── */

const componentPlanShape = z
  .object({
    kind: z.literal('component-plan'),
    generatedFrom: GeneratedFromSchema,
    status: ContractStatusSchema,
    mode: ComponentPlanModeSchema,
    body: ComponentPlanBodySchema,
    approval: ComponentPlanApprovalSchema.optional(),
  })
  .strict();

/**
 * The canonical envelope. `superRefine` is the sole owner of status × mode
 * × approval shape (plan §3.3); `assertComponentPlanIntegrity` does not
 * re-check approval. Splitting the responsibilities keeps
 * `ComponentPlanSchema.safeParse()` self-sufficient: any caller holding a
 * successful parse result has, by construction, an approval-consistent
 * envelope.
 */
export const ComponentPlanSchema = componentPlanShape.superRefine((plan, ctx) => {
  const { status, mode, approval } = plan;

  if (status === 'draft' || status === 'in-review') {
    if (approval !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approval'],
        message: `component-plan with status='${status}' must not carry approval (only status='approved' may be signed off)`,
      });
    }
    return;
  }

  /* status === 'approved' */
  if (approval === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['approval'],
      message: `component-plan with status='approved' must carry approval`,
    });
    return;
  }

  if (mode === 'interactive' && approval.level !== 'interactive') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['approval', 'level'],
      message: `component-plan with mode='interactive' requires approval.level='interactive' (got '${approval.level}')`,
    });
  }

  if (mode === 'presentational' && approval.level !== 'presentational') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['approval', 'level'],
      message: `component-plan with mode='presentational' requires approval.level='presentational' (got '${approval.level}')`,
    });
  }
  /**
   * The presentational branch in `ComponentPlanApprovalSchema` already
   * forces `acknowledgedBehaviorStubbed: true` via `z.literal(true)`, so we
   * intentionally do not duplicate that check here.
   */
});
export type ComponentPlan = z.infer<typeof ComponentPlanSchema>;
