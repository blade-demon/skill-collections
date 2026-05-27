/**
 * Stage 5C — `deriveComponentPlan`.
 *
 * Pure function:
 *   `{ designIr, visualView, semanticView, interactionSpec, mode }` →
 *   `{ componentPlan, warnings }`.
 *
 * No file IO, no network, no clock, no Math.random. Same input ⇒ byte-
 * identical output (plan §2 determinism contract).
 *
 * Plan refs (docs/stage-5c-component-plan-plan.md):
 *
 *   §3.2 / §7.2 step 2 — mode × interaction-spec.status compatibility.
 *                        Illegal combos throw immediately, before any work.
 *   §3.4 / §7.2 step 1 — hash chain: visualView.designIrHash,
 *                        semanticView.designIrHash, semanticView.visualViewHash,
 *                        interactionSpec.designIrHash / visualViewHash /
 *                        semanticViewHash must all match the inputs.
 *   §3.5             — derive ONLY consumes facts already in semantic /
 *                        interaction; never re-classifies coverage or invents
 *                        events / dataModels.
 *   §7.2 step 3      — rootComponent comes from `semanticView.body.screen`.
 *   §7.2 step 4      — planned components come from componentCandidates with
 *                        kind→role mapping; primitive kinds throw.
 *   §7.2 step 5/6    — mode-specific event / dataModel consumption.
 *   §7.2 step 7      — layoutPlan from semanticView.body.layoutCandidates,
 *                        plus 'absolute' fallback for components without one.
 *   §7.2 step 8      — assetPlan from semantic media/icon nodes, assetRef
 *                        looked up by primaryVisualNodeId (no visualNodeIds
 *                        fallback per §7.2 explicit decision).
 *   §7.2 step 9      — exports: root default + components named; PascalCase
 *                        collisions throw with both candidate ids in message.
 *   §7.3             — deterministic ids: pc_/pe_/pl_/pa_ prefix +
 *                        stableSha256(stableJson({form, ...})).slice(0, 12).
 *   §6.1 / §6.2      — output is parsed through ComponentPlanSchema, then
 *                        assertComponentPlanIntegrity is run with both
 *                        semanticNodeIds and interactionSpec context.
 */
import {
  type DesignIR,
  type SemanticView,
  type VisualNode,
  type VisualView,
  type Warning,
} from '../ir';
import type { SemanticNode } from '../semantic';
import { stableJson, stableSha256 } from '../utils/stable-json';

import {
  type ComponentPlan,
  type ComponentPlanBody,
  type ComponentPlanMode,
  type PlannedAsset,
  type PlannedComponent,
  type PlannedDataBinding,
  type PlannedEventBinding,
  type PlannedExport,
  type PlannedLayout,
  type PlannedProp,
  ComponentPlanSchema,
} from './component-plan-schema';
import { assertComponentPlanIntegrity } from './component-plan-validate';
import type { InteractionDataModel, InteractionEvent, InteractionSpec } from './interaction-schema';
import { pascalCase } from './derive-interaction';

/* ── public types ────────────────────────────────────────────────────────── */

export interface DeriveComponentPlanInput {
  designIr: DesignIR;
  visualView: VisualView;
  semanticView: SemanticView;
  interactionSpec: InteractionSpec;
  mode: ComponentPlanMode;
}

export interface DeriveComponentPlanResult {
  componentPlan: ComponentPlan;
  warnings: Warning[];
}

/* ── entry ───────────────────────────────────────────────────────────────── */

export function deriveComponentPlan(input: DeriveComponentPlanInput): DeriveComponentPlanResult {
  const { designIr, visualView, semanticView, interactionSpec, mode } = input;

  /* §3.4 / §7.2 step 1 — hash chain. */
  const designIrHash = stableSha256(stableJson(designIr));
  if (visualView.generatedFrom.designIrHash !== designIrHash) {
    throw new Error(
      `deriveComponentPlan: visual-view designIrHash mismatch — expected ${designIrHash}, got ${visualView.generatedFrom.designIrHash ?? '(absent)'}`,
    );
  }
  if (semanticView.generatedFrom.designIrHash !== designIrHash) {
    throw new Error(
      `deriveComponentPlan: semantic-view designIrHash mismatch — expected ${designIrHash}, got ${semanticView.generatedFrom.designIrHash ?? '(absent)'}`,
    );
  }
  const visualViewHash = stableSha256(stableJson(visualView));
  if (semanticView.generatedFrom.visualViewHash !== visualViewHash) {
    throw new Error(
      `deriveComponentPlan: semantic-view visualViewHash mismatch — expected ${visualViewHash}, got ${semanticView.generatedFrom.visualViewHash ?? '(absent)'}`,
    );
  }
  if (interactionSpec.generatedFrom.designIrHash !== designIrHash) {
    throw new Error(
      `deriveComponentPlan: interaction-spec designIrHash mismatch — expected ${designIrHash}, got ${interactionSpec.generatedFrom.designIrHash ?? '(absent)'}`,
    );
  }
  if (interactionSpec.generatedFrom.visualViewHash !== visualViewHash) {
    throw new Error(
      `deriveComponentPlan: interaction-spec visualViewHash mismatch — expected ${visualViewHash}, got ${interactionSpec.generatedFrom.visualViewHash ?? '(absent)'}`,
    );
  }
  const semanticViewHash = stableSha256(stableJson(semanticView));
  if (interactionSpec.generatedFrom.semanticViewHash !== semanticViewHash) {
    throw new Error(
      `deriveComponentPlan: interaction-spec semanticViewHash mismatch — expected ${semanticViewHash}, got ${interactionSpec.generatedFrom.semanticViewHash ?? '(absent)'}`,
    );
  }
  const interactionSpecHash = stableSha256(stableJson(interactionSpec));

  /* §3.2 / §7.2 step 2 — mode × interaction.status. */
  validateModeAndInteractionStatus(mode, interactionSpec.status);

  const semanticNodeById = new Map<string, SemanticNode>(
    semanticView.body.nodes.map((n) => [n.id, n]),
  );
  const visualNodeById = buildVisualNodeIndex(visualView.body.root);

  const warnings: Warning[] = [];

  /* §7.2 step 3 — screen → rootComponent. */
  const screenSemanticNodeId = semanticView.body.screen.semanticNodeId;
  const screenNode = semanticNodeById.get(screenSemanticNodeId);
  if (screenNode === undefined) {
    throw new Error(
      `deriveComponentPlan: semantic-view.body.screen.semanticNodeId ${screenSemanticNodeId} does not exist in body.nodes`,
    );
  }
  if (screenNode.kind !== 'screen') {
    throw new Error(
      `deriveComponentPlan: semantic node ${screenSemanticNodeId} pointed to by screen has kind '${screenNode.kind}' — expected 'screen'`,
    );
  }
  const rootComponent = buildPlannedComponent({
    semanticNode: screenNode,
    role: 'root',
    name: deriveComponentName(screenNode.name, 'Screen'),
  });

  /* §7.2 step 4 — componentCandidates → planned components. */
  interface DerivedCandidate {
    candidateId: string;
    suggestedName: string;
    plannedComponent: PlannedComponent;
  }
  const candidateComponents: PlannedComponent[] = [];
  const derivedCandidates: DerivedCandidate[] = [];
  const seenCandidateSemanticIds = new Set<string>([screenSemanticNodeId]);
  for (const candidate of semanticView.body.componentCandidates) {
    const candidateNode = semanticNodeById.get(candidate.rootSemanticNodeId);
    if (candidateNode === undefined) {
      throw new Error(
        `deriveComponentPlan: componentCandidate ${candidate.id} rootSemanticNodeId ${candidate.rootSemanticNodeId} does not exist in semantic-view body.nodes`,
      );
    }
    /* §7.2 step 4 — screen candidates are handled by rootComponent in step
     * 3; skip them silently. 5A's visual-region pass legitimately matches
     * the screen node itself when its name starts with a component-naming
     * prefix, so this is not a bug — just a no-op for 5C. */
    if (candidateNode.kind === 'screen') continue;
    /* Two candidates with the same semantic root would build identical
     * PlannedComponents (id, role, semanticNodeId all match). Drop the
     * duplicate; the upstream 5A model can legitimately produce two
     * candidates for the same node via different boundaries (e.g. symbol
     * + visual-region). The first wins. */
    if (seenCandidateSemanticIds.has(candidate.rootSemanticNodeId)) continue;
    seenCandidateSemanticIds.add(candidate.rootSemanticNodeId);

    const role = mapCandidateKindToRole(candidateNode.kind, candidate.id);
    const plannedComponent = buildPlannedComponent({
      semanticNode: candidateNode,
      role,
      name: deriveComponentName(candidate.suggestedName, 'Component'),
      confidence: candidate.confidence,
    });
    candidateComponents.push(plannedComponent);
    derivedCandidates.push({
      candidateId: candidate.id,
      suggestedName: candidate.suggestedName,
      plannedComponent,
    });
  }

  /* The validator requires `body.rootComponent.id` to appear in
   * `body.components`. Keep rootComponent at the head so the components
   * array reads top-down. */
  const components: PlannedComponent[] = [rootComponent, ...candidateComponents];

  /* §7.2 step 5/6 — mode-specific bindings. */
  attachBindings({
    components,
    rootComponent,
    mode,
    interactionSpec,
    semanticNodeById,
    warnings,
  });

  /* §7.2 step 9 — exports. */
  const exports = buildExports({
    rootComponent,
    rootSemanticName: screenNode.name,
    derivedCandidates,
  });

  /* §7.2 step 7 — layouts. */
  const layoutPlan = buildLayouts({ components, semanticView });

  /* §7.2 step 8 — assets. */
  const assetPlan = buildAssets({ semanticView, visualNodeById, warnings });

  const body: ComponentPlanBody = {
    target: { framework: 'react', language: 'ts', styling: 'bem-css' },
    rootComponent,
    components,
    exports,
    layoutPlan,
    assetPlan,
    /* §3.5 — coverage is a snapshot, never re-computed. */
    interactionCoverage: interactionSpec.body.coverage,
    warnings,
  };

  /* §3.3 — derive emits 'draft' and never writes approval. */
  const planCandidate: Record<string, unknown> = {
    kind: 'component-plan',
    generatedFrom: {
      schemaVersion: designIr.schemaVersion,
      designIrHash,
      visualViewHash,
      semanticViewHash,
      interactionSpecHash,
      ...(visualView.generatedFrom.sourceRef !== undefined
        ? { sourceRef: visualView.generatedFrom.sourceRef }
        : {}),
    },
    status: 'draft',
    mode,
    body,
  };

  /* §6.1 — schema parse is the first gate. */
  const parsed = ComponentPlanSchema.safeParse(planCandidate);
  if (!parsed.success) {
    throw new Error(
      `deriveComponentPlan produced a ComponentPlan that fails ComponentPlanSchema: ${parsed.error.message}`,
    );
  }
  const componentPlan = parsed.data;

  /* §6.2 — artifact-chain self-check. */
  const semanticNodeIds = new Set(semanticView.body.nodes.map((n) => n.id));
  assertComponentPlanIntegrity(componentPlan, { semanticNodeIds, interactionSpec });

  return { componentPlan, warnings };
}

/* ── §3.2 mode × interaction status ──────────────────────────────────────── */

function validateModeAndInteractionStatus(
  mode: ComponentPlanMode,
  interactionStatus: InteractionSpec['status'],
): void {
  if (interactionStatus === 'draft' || interactionStatus === 'in-review') {
    throw new Error(
      `deriveComponentPlan: interaction-spec status '${interactionStatus}' is not eligible for component-plan derivation — sign off as approved, omitted, or deferred first`,
    );
  }
  if (mode === 'interactive' && interactionStatus !== 'approved') {
    throw new Error(
      `deriveComponentPlan: mode='interactive' requires interaction-spec status='approved' (got '${interactionStatus}')`,
    );
  }
  if (mode === 'presentational' && interactionStatus === 'approved') {
    throw new Error(
      `deriveComponentPlan: mode='presentational' is not compatible with an 'approved' interaction-spec — either switch to mode='interactive' or move the interaction-spec back to 'deferred' before deriving a presentational plan`,
    );
  }
}

/* ── §7.2 step 3/4 — planned components ──────────────────────────────────── */

function mapCandidateKindToRole(
  kind: SemanticNode['kind'],
  candidateId: string,
): PlannedComponent['role'] {
  switch (kind) {
    case 'component':
      return 'component';
    case 'region':
      return 'region';
    case 'repeated-item':
      return 'repeated-item';
    case 'screen':
      /* Unreachable: the candidates loop skips screen-rooted entries
       * before this mapping runs. Kept to make TS exhaustiveness happy
       * and to flag a derive regression if the skip ever drifts. */
      throw new Error(
        `deriveComponentPlan: internal — mapCandidateKindToRole reached 'screen' for ${candidateId}; the caller should have skipped it`,
      );
    case 'text':
    case 'media':
    case 'icon':
    case 'control':
    case 'decorative':
      throw new Error(
        `deriveComponentPlan: componentCandidate ${candidateId} rootSemanticNodeId points to a '${kind}' node — primitive / asset kinds cannot be promoted to PlannedComponent. Fix the semantic-view candidate instead of letting 5C silently coerce to 'component'.`,
      );
  }
}

function buildPlannedComponent(args: {
  semanticNode: SemanticNode;
  role: PlannedComponent['role'];
  name: string;
  confidence?: PlannedComponent['confidence'];
}): PlannedComponent {
  const { semanticNode, role, name, confidence } = args;
  return {
    id: generatePlannedComponentId(semanticNode.id, role),
    semanticNodeId: semanticNode.id,
    name,
    role,
    renderAs: 'component',
    childSemanticNodeIds: [...semanticNode.childIds],
    props: [],
    eventBindings: [],
    dataBindings: [],
    confidence: confidence ?? semanticNode.confidence,
    warnings: [],
  };
}

/**
 * Empty / non-ASCII identifiers fall back to a hardcoded label so the
 * exportName stays a valid TS identifier. Plan §7.2 step 9: `'Screen'` for
 * root, `'Component'` for candidates.
 */
function deriveComponentName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^\x20-\x7E]/g, ' ').trim();
  if (cleaned.length === 0) return fallback;
  const cased = pascalCase(cleaned);
  if (cased.length === 0 || cased.toLowerCase() === 'unnamed') return fallback;
  return cased;
}

/* ── §7.2 step 5/6 — bindings ────────────────────────────────────────────── */

interface AttachBindingsArgs {
  components: PlannedComponent[];
  rootComponent: PlannedComponent;
  mode: ComponentPlanMode;
  interactionSpec: InteractionSpec;
  semanticNodeById: Map<string, SemanticNode>;
  warnings: Warning[];
}

function attachBindings(args: AttachBindingsArgs): void {
  const { components, rootComponent, mode, interactionSpec, semanticNodeById, warnings } = args;

  if (mode === 'presentational') {
    /* §3.2 / §7.2 step 5 — presentational never generates handlers. */
    if (interactionSpec.status === 'omitted') {
      if (interactionSpec.body.dataModels.length > 0) {
        warnings.push({
          code: 'component-plan-omitted-data-models-ignored',
          message: `interaction-spec status='omitted' carries ${interactionSpec.body.dataModels.length} data model(s); presentational plan does not consume them — kept as visual skeleton only`,
          severity: 'info',
        });
      }
      return;
    }
    /* deferred — consume dataModels as presentational-stub props. */
    for (const dataModel of interactionSpec.body.dataModels) {
      const owner = findOwnerComponent({
        sourceSemanticNodeId: dataModel.source,
        components,
        rootComponent,
        semanticNodeById,
      });
      owner.props.push({
        name: dataModel.slotName,
        type: dataModel.type,
        source: 'presentational-stub',
        required: false,
        interactionRefId: dataModel.id,
      });
    }
    return;
  }

  /* interactive — events + dataModels become real bindings. */
  for (const event of interactionSpec.body.events) {
    const owner = findOwnerComponent({
      sourceSemanticNodeId: event.source,
      components,
      rootComponent,
      semanticNodeById,
    });
    owner.eventBindings.push(buildEventBinding(event));
    owner.props.push(buildHandlerProp(event));
  }
  for (const dataModel of interactionSpec.body.dataModels) {
    const owner = findOwnerComponent({
      sourceSemanticNodeId: dataModel.source,
      components,
      rootComponent,
      semanticNodeById,
    });
    owner.dataBindings.push(buildDataBinding(dataModel));
    owner.props.push(buildDataProp(dataModel));
  }
}

function buildEventBinding(event: InteractionEvent): PlannedEventBinding {
  return {
    eventId: event.id,
    sourceSemanticNodeId: event.source,
    handlerProp: event.handlerProp,
    payload: { ...event.payload },
  };
}

function buildHandlerProp(event: InteractionEvent): PlannedProp {
  const payloadKeys = Object.keys(event.payload).sort();
  const payloadType =
    payloadKeys.length === 0
      ? '() => void'
      : `(payload: { ${payloadKeys.map((k) => `${k}: ${event.payload[k]}`).join('; ')} }) => void`;
  return {
    name: event.handlerProp,
    type: payloadType,
    source: 'event-payload',
    required: true,
    interactionRefId: event.id,
  };
}

function buildDataBinding(dataModel: InteractionDataModel): PlannedDataBinding {
  return {
    dataModelId: dataModel.id,
    sourceSemanticNodeId: dataModel.source,
    propName: dataModel.slotName,
    type: dataModel.type,
  };
}

function buildDataProp(dataModel: InteractionDataModel): PlannedProp {
  return {
    name: dataModel.slotName,
    type: dataModel.type,
    source: 'data-model',
    required: true,
    interactionRefId: dataModel.id,
  };
}

interface FindOwnerArgs {
  sourceSemanticNodeId: string;
  components: PlannedComponent[];
  rootComponent: PlannedComponent;
  semanticNodeById: Map<string, SemanticNode>;
}

/**
 * Find the deepest planned component that owns `sourceSemanticNodeId`. Walk
 * up the semantic parent chain; the first node whose id matches a planned
 * component's `semanticNodeId` wins. Fall back to rootComponent so every
 * binding lands somewhere (the artifact-chain check rejects the alternative
 * — a dangling binding — anyway).
 */
function findOwnerComponent(args: FindOwnerArgs): PlannedComponent {
  const { sourceSemanticNodeId, components, rootComponent, semanticNodeById } = args;
  const componentBySemanticId = new Map<string, PlannedComponent>();
  for (const component of components) {
    componentBySemanticId.set(component.semanticNodeId, component);
  }

  let cursor: string | undefined = sourceSemanticNodeId;
  const visited = new Set<string>();
  while (cursor !== undefined) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const owner = componentBySemanticId.get(cursor);
    if (owner !== undefined) return owner;
    const node = semanticNodeById.get(cursor);
    cursor = node?.parentId;
  }
  return rootComponent;
}

/* ── §7.2 step 7 — layoutPlan ────────────────────────────────────────────── */

function buildLayouts(args: {
  components: PlannedComponent[];
  semanticView: SemanticView;
}): PlannedLayout[] {
  const { components, semanticView } = args;

  const allowedSemanticIds = new Set<string>();
  for (const component of components) {
    allowedSemanticIds.add(component.semanticNodeId);
    for (const childId of component.childSemanticNodeIds) {
      allowedSemanticIds.add(childId);
    }
  }

  const seen = new Set<string>();
  const out: PlannedLayout[] = [];
  for (const candidate of semanticView.body.layoutCandidates) {
    if (!allowedSemanticIds.has(candidate.semanticNodeId)) continue;
    const layout: PlannedLayout = {
      id: generatePlannedLayoutId(candidate.semanticNodeId, candidate.kind),
      semanticNodeId: candidate.semanticNodeId,
      layoutCandidateId: candidate.id,
      strategy: candidate.kind,
      confidence: candidate.confidence,
      constraints: [...candidate.constraints],
      caveats: [...candidate.caveats],
    };
    out.push(layout);
    seen.add(`${candidate.semanticNodeId}|${candidate.kind}`);
  }

  /* §7.2 step 7 fallback — every planned component gets a layout. */
  for (const component of components) {
    const key = `${component.semanticNodeId}|absolute`;
    if (seen.has(key)) continue;
    const hasAnyForNode = out.some((l) => l.semanticNodeId === component.semanticNodeId);
    if (hasAnyForNode) continue;
    out.push({
      id: generatePlannedLayoutId(component.semanticNodeId, 'absolute'),
      semanticNodeId: component.semanticNodeId,
      strategy: 'absolute',
      confidence: 'low',
      constraints: [],
      caveats: ['no upstream layout candidate; falling back to absolute positioning'],
    });
    seen.add(key);
  }
  return out;
}

/* ── §7.2 step 8 — assetPlan ─────────────────────────────────────────────── */

function buildAssets(args: {
  semanticView: SemanticView;
  visualNodeById: Map<string, VisualNode>;
  warnings: Warning[];
}): PlannedAsset[] {
  const { semanticView, visualNodeById, warnings } = args;
  const out: PlannedAsset[] = [];
  for (const node of semanticView.body.nodes) {
    if (node.kind !== 'media' && node.kind !== 'icon') continue;
    const usage: PlannedAsset['usage'] = node.kind === 'media' ? 'image' : 'icon';
    const visualNode = visualNodeById.get(node.primaryVisualNodeId);
    const assetRef = visualNode?.assetRef;
    const asset: PlannedAsset = {
      id: generatePlannedAssetId(node.id, usage),
      semanticNodeId: node.id,
      usage,
      required: true,
    };
    if (assetRef !== undefined) {
      asset.assetRef = assetRef;
    } else {
      warnings.push({
        code: 'component-plan-asset-ref-missing',
        message: `semantic ${node.kind} node ${node.id} (primaryVisualNodeId=${node.primaryVisualNodeId}) has no assetRef in visual-view — planned asset emitted without assetRef`,
        severity: 'warning',
        sourceNodeId: node.id,
      });
    }
    out.push(asset);
  }
  return out;
}

/* ── §7.2 step 9 — exports ───────────────────────────────────────────────── */

interface DerivedCandidateForExport {
  candidateId: string;
  suggestedName: string;
  plannedComponent: PlannedComponent;
}

function buildExports(args: {
  rootComponent: PlannedComponent;
  rootSemanticName: string;
  derivedCandidates: DerivedCandidateForExport[];
}): PlannedExport[] {
  const { rootComponent, rootSemanticName, derivedCandidates } = args;
  const out: PlannedExport[] = [];
  const exportNameOwners = new Map<string, { sourceLabel: string }>();
  const claim = (
    exportName: string,
    plannedComponentId: string,
    sourceLabel: string,
    kind: PlannedExport['kind'],
  ): void => {
    const existing = exportNameOwners.get(exportName);
    if (existing !== undefined) {
      throw new Error(
        `deriveComponentPlan: export name collision — '${exportName}' is requested by both ${existing.sourceLabel} and ${sourceLabel}. Fix the upstream semantic-view candidate names instead of dedup-ing in 5C.`,
      );
    }
    exportNameOwners.set(exportName, { sourceLabel });
    out.push({
      id: generatePlannedExportId(plannedComponentId, exportName),
      plannedComponentId,
      exportName,
      kind,
    });
  };

  claim(
    rootComponent.name,
    rootComponent.id,
    `rootComponent (planned ${rootComponent.id}, screen name '${rootSemanticName}')`,
    'default',
  );
  for (const derived of derivedCandidates) {
    claim(
      derived.plannedComponent.name,
      derived.plannedComponent.id,
      `componentCandidate ${derived.candidateId} (suggestedName='${derived.suggestedName}', planned ${derived.plannedComponent.id})`,
      'named',
    );
  }
  return out;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function buildVisualNodeIndex(root: VisualNode): Map<string, VisualNode> {
  const out = new Map<string, VisualNode>();
  const walk = (n: VisualNode): void => {
    out.set(n.id, n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/* ── §7.3 deterministic ids ──────────────────────────────────────────────── */

function generatePlannedComponentId(
  semanticNodeId: string,
  role: PlannedComponent['role'],
): string {
  return 'pc_' + hashRecord({ form: 'planned-component', semanticNodeId, role });
}

function generatePlannedExportId(plannedComponentId: string, exportName: string): string {
  return 'pe_' + hashRecord({ form: 'planned-export', plannedComponentId, exportName });
}

function generatePlannedLayoutId(
  semanticNodeId: string,
  strategy: PlannedLayout['strategy'],
): string {
  return 'pl_' + hashRecord({ form: 'planned-layout', semanticNodeId, strategy });
}

function generatePlannedAssetId(semanticNodeId: string, usage: PlannedAsset['usage']): string {
  return 'pa_' + hashRecord({ form: 'planned-asset', semanticNodeId, usage });
}

function hashRecord(input: Record<string, unknown>): string {
  return stableSha256(stableJson(input)).slice(0, 12);
}
