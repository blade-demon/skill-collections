import type { SemanticView, VisualNode, VisualView, Warning } from '../ir';
import type { SemanticNode } from '../semantic';
import { stableJson, stableSha256 } from '../utils/stable-json';

import type {
  ComponentCaller,
  ComponentDefinition,
  ComponentDefinitionProp,
  ComponentInvocation,
  InvocationEdge,
  PlannedComponent,
} from './component-plan-schema';

export interface ComponentReuseCandidate {
  candidateId: string;
  plannedComponent: PlannedComponent;
}

export interface DeriveComponentReuseInput {
  semanticView: SemanticView;
  visualView: VisualView;
  rootComponent: PlannedComponent;
  candidates: ComponentReuseCandidate[];
}

export interface DeriveComponentReuseResult {
  componentDefinitions: ComponentDefinition[];
  componentInvocations: ComponentInvocation[];
  invocationEdges: InvocationEdge[];
  foldedComponentIds: string[];
  representativeComponentIds: string[];
  removedComponentIds: string[];
  warnings: Warning[];
}

interface ReuseIndexes {
  semanticNodeById: Map<string, SemanticNode>;
  visualNodeById: Map<string, VisualNode>;
  componentBySemanticId: Map<string, PlannedComponent>;
  preOrderBySemanticId: Map<string, number>;
}

/**
 * Per-node identity facets, each a canonical `stableJson` string. Two
 * snapshots fold together exactly when every entry pair agrees on every
 * facet — splitting the old single fingerprint lets a mismatch report the
 * first differing facet and node instead of a catch-all reason. The
 * `children` facet records each child slot as either a walked node marker
 * or an inline nested-boundary record, so pre-order entry equality still
 * implies full tree equality.
 */
interface SnapshotFacets {
  kind: string;
  symbol: string;
  geometry: string;
  style: string;
  vector: string;
  children: string;
  boundaryGeometry: string;
}

/* Key order is the diagnosis priority when several facets differ at the
 * same node. `children` (slot pattern + boundary identity) outranks
 * `boundaryGeometry` because an identity difference makes the geometry
 * comparison moot. */
const FACET_LABELS: Record<keyof SnapshotFacets, string> = {
  kind: 'node kind',
  symbol: 'symbol identity',
  geometry: 'geometry',
  style: 'style',
  vector: 'vector outline',
  children: 'child structure or nested boundary identity',
  boundaryGeometry: 'nested boundary geometry',
};

interface SnapshotEntry {
  semanticNodeId: string;
  facets: SnapshotFacets;
  bindable?: {
    type: ComponentDefinitionProp['type'];
    value: string;
  };
}

interface ComponentSnapshot {
  entries: SnapshotEntry[];
}

interface FoldedGroup {
  masterId: string;
  definitionId: string;
  representative: PlannedComponent;
  components: PlannedComponent[];
  snapshots: Map<string, ComponentSnapshot>;
  propSchema: ComponentDefinitionProp[];
  propEntryIndexes: number[];
}

/**
 * Derive Stage 7 symbol reuse without mutating the Stage 5C components.
 *
 * Fold decisions are intentionally post-order. A parent fingerprint uses a
 * nested definition id only after the child group has folded; an unresolved
 * child boundary keeps its instance-unique component id and therefore makes
 * otherwise similar parents compare unequal.
 */
export function deriveComponentReuse(input: DeriveComponentReuseInput): DeriveComponentReuseResult {
  const indexes = buildIndexes(input);
  const groups = groupCandidatesByMaster(input.candidates, indexes);
  const definitionIdByComponentId = new Map<string, string>();
  const foldedGroups: FoldedGroup[] = [];
  const warnings: Warning[] = [];

  for (const group of groups) {
    const components = [...group.components].sort(compareComponentSemanticId);

    /* Folding removes every non-representative instance from
     * body.components, and S-PR-1 invocations carry only text/assetRef
     * bindings — an event/data binding attached to a removed instance
     * would silently vanish from the plan. Interactive artifacts therefore
     * block folding until S-PR-2 re-homes them onto invocations.
     * `presentational-stub` props do NOT block: their text slots survive as
     * definition propSchema + invocation bindings, traceable via nodeMap. */
    const interactionBound = components.find(
      (component) =>
        component.eventBindings.length > 0 ||
        component.dataBindings.length > 0 ||
        component.props.some((prop) => prop.source !== 'presentational-stub'),
    );
    if (interactionBound !== undefined) {
      warnings.push({
        code: 'component-reuse-fallback',
        message: `symbol master ${group.masterId} was not folded: component ${interactionBound.id} carries interaction bindings that folding would drop`,
        severity: 'warning',
        sourceNodeId: components[0]!.semanticNodeId,
        stage: '5C',
      });
      continue;
    }

    const snapshots = new Map<string, ComponentSnapshot>();
    let snapshotFailure: string | undefined;

    for (const component of components) {
      try {
        snapshots.set(
          component.id,
          buildComponentSnapshot(component, indexes, definitionIdByComponentId),
        );
      } catch (error) {
        snapshotFailure = error instanceof Error ? error.message : String(error);
        break;
      }
    }

    const representative = components[0]!;
    const representativeSnapshot = snapshots.get(representative.id);
    let mismatch = snapshotFailure;
    if (mismatch === undefined) {
      if (representativeSnapshot === undefined) {
        mismatch = 'representative snapshot is missing';
      } else {
        for (const component of components.slice(1)) {
          const snapshot = snapshots.get(component.id);
          mismatch =
            snapshot === undefined
              ? `instance ${component.id} snapshot is missing`
              : diagnoseSnapshotMismatch(representativeSnapshot, snapshot);
          if (mismatch !== undefined) break;
        }
      }
    }

    if (mismatch !== undefined) {
      warnings.push({
        code: 'component-reuse-fallback',
        message: `symbol master ${group.masterId} was not folded: ${mismatch}`,
        severity: 'warning',
        sourceNodeId: representative.semanticNodeId,
        stage: '5C',
      });
      continue;
    }

    const resolvedRepresentativeSnapshot = representativeSnapshot!;
    const definitionId = generateDefinitionId(group.masterId);
    const { propSchema, propEntryIndexes } = derivePropSchema(
      resolvedRepresentativeSnapshot,
      components,
      snapshots,
    );
    for (const component of components) {
      definitionIdByComponentId.set(component.id, definitionId);
    }
    foldedGroups.push({
      masterId: group.masterId,
      definitionId,
      representative,
      components,
      snapshots,
      propSchema,
      propEntryIndexes,
    });
  }

  const invocationIdByComponentId = new Map<string, string>();
  for (const group of foldedGroups) {
    for (const component of group.components) {
      invocationIdByComponentId.set(
        component.id,
        generateInvocationId(group.definitionId, component.semanticNodeId),
      );
    }
  }

  const definitions = foldedGroups
    .map<ComponentDefinition>((group) => ({
      id: group.definitionId,
      source: { kind: 'symbol-master', masterId: group.masterId },
      componentId: group.representative.id,
      propSchema: group.propSchema,
    }))
    .sort((left, right) => compareStrings(left.id, right.id));

  const invocationDrafts: ComponentInvocation[] = [];
  for (const group of foldedGroups) {
    const representativeSnapshot = group.snapshots.get(group.representative.id)!;
    for (const component of group.components) {
      const snapshot = group.snapshots.get(component.id)!;
      const visualNode = getComponentVisualNode(component, indexes);
      const nodeMap: Record<string, string> = {};
      for (let index = 0; index < representativeSnapshot.entries.length; index += 1) {
        nodeMap[representativeSnapshot.entries[index]!.semanticNodeId] =
          snapshot.entries[index]!.semanticNodeId;
      }

      const bindings: Record<string, string> = {};
      for (let index = 0; index < group.propSchema.length; index += 1) {
        const prop = group.propSchema[index]!;
        const entryIndex = group.propEntryIndexes[index]!;
        bindings[prop.name] = snapshot.entries[entryIndex]!.bindable!.value;
      }

      invocationDrafts.push({
        id: invocationIdByComponentId.get(component.id)!,
        definitionId: group.definitionId,
        semanticNodeId: component.semanticNodeId,
        caller: findCaller(
          component,
          indexes,
          definitionIdByComponentId,
          invocationIdByComponentId,
        ),
        order: 0,
        placement: { ...visualNode.layout },
        bindings,
        nodeMap,
      });
    }
  }

  assignInvocationOrder(invocationDrafts, indexes.preOrderBySemanticId);
  invocationDrafts.sort((left, right) => {
    const leftOrder =
      indexes.preOrderBySemanticId.get(left.semanticNodeId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder =
      indexes.preOrderBySemanticId.get(right.semanticNodeId) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || compareStrings(left.id, right.id);
  });

  const invocationEdges: InvocationEdge[] = invocationDrafts.map((invocation) => ({
    caller: invocation.caller,
    boundarySemanticNodeId: invocation.semanticNodeId,
    invocationId: invocation.id,
  }));

  const foldedComponentIds = [...definitionIdByComponentId.keys()].sort();
  const representativeComponentIds = foldedGroups.map((group) => group.representative.id).sort();
  const representativeIdSet = new Set(representativeComponentIds);
  const removedComponentIds = foldedComponentIds
    .filter((componentId) => !representativeIdSet.has(componentId))
    .sort();

  return {
    componentDefinitions: definitions,
    componentInvocations: invocationDrafts,
    invocationEdges,
    foldedComponentIds,
    representativeComponentIds,
    removedComponentIds,
    warnings: warnings.sort((left, right) => compareStrings(left.message, right.message)),
  };
}

function buildIndexes(input: DeriveComponentReuseInput): ReuseIndexes {
  const semanticNodeById = new Map(input.semanticView.body.nodes.map((node) => [node.id, node]));
  const visualNodeById = new Map<string, VisualNode>();
  const walkVisual = (node: VisualNode): void => {
    visualNodeById.set(node.id, node);
    for (const child of node.children) walkVisual(child);
  };
  walkVisual(input.visualView.body.root);

  const componentBySemanticId = new Map<string, PlannedComponent>([
    [input.rootComponent.semanticNodeId, input.rootComponent],
  ]);
  for (const candidate of input.candidates) {
    componentBySemanticId.set(
      candidate.plannedComponent.semanticNodeId,
      candidate.plannedComponent,
    );
  }

  const preOrderBySemanticId = new Map<string, number>();
  let preOrder = 0;
  const walkSemantic = (semanticNodeId: string): void => {
    if (preOrderBySemanticId.has(semanticNodeId)) return;
    preOrderBySemanticId.set(semanticNodeId, preOrder);
    preOrder += 1;
    const node = semanticNodeById.get(semanticNodeId);
    if (node === undefined) return;
    for (const childId of node.childIds) walkSemantic(childId);
  };
  walkSemantic(input.rootComponent.semanticNodeId);

  return {
    semanticNodeById,
    visualNodeById,
    componentBySemanticId,
    preOrderBySemanticId,
  };
}

function groupCandidatesByMaster(
  candidates: ComponentReuseCandidate[],
  indexes: ReuseIndexes,
): Array<{ masterId: string; components: PlannedComponent[]; depth: number }> {
  const componentsByMaster = new Map<string, PlannedComponent[]>();
  for (const candidate of candidates) {
    const component = candidate.plannedComponent;
    const node = indexes.semanticNodeById.get(component.semanticNodeId);
    const visualNode = node && indexes.visualNodeById.get(node.primaryVisualNodeId);
    const masterId = visualNode?.symbol?.masterId;
    if (masterId === undefined) continue;
    const existing = componentsByMaster.get(masterId) ?? [];
    existing.push(component);
    componentsByMaster.set(masterId, existing);
  }

  return (
    [...componentsByMaster.entries()]
      .filter(([, components]) => components.length >= 2)
      .map(([masterId, components]) => ({
        masterId,
        components,
        depth: Math.max(
          ...components.map((component) =>
            semanticDepth(component.semanticNodeId, indexes.semanticNodeById),
          ),
        ),
      }))
      /* masterId is the map key, so it never ties — depth + masterId is
       * already a total order. */
      .sort(
        (left, right) => right.depth - left.depth || compareStrings(left.masterId, right.masterId),
      )
  );
}

function buildComponentSnapshot(
  component: PlannedComponent,
  indexes: ReuseIndexes,
  definitionIdByComponentId: ReadonlyMap<string, string>,
): ComponentSnapshot {
  const entries: SnapshotEntry[] = [];

  const walk = (semanticNodeId: string, isRoot: boolean): void => {
    const semanticNode = indexes.semanticNodeById.get(semanticNodeId);
    if (semanticNode === undefined) {
      throw new Error(`semantic node ${semanticNodeId} is missing`);
    }
    const visualNode = indexes.visualNodeById.get(semanticNode.primaryVisualNodeId);
    if (visualNode === undefined) {
      throw new Error(
        `visual node ${semanticNode.primaryVisualNodeId} for semantic node ${semanticNodeId} is missing`,
      );
    }

    const bindable =
      visualNode.text !== undefined
        ? { type: 'text' as const, value: visualNode.text.content }
        : visualNode.assetRef !== undefined
          ? { type: 'assetRef' as const, value: visualNode.assetRef }
          : undefined;

    type ChildSlot = 'node' | { boundary: { identity: string } };
    const childSlots: ChildSlot[] = [];
    const boundaryGeometries: Array<VisualNode['layout']> = [];
    const walkableChildIds: string[] = [];
    for (const childId of semanticNode.childIds) {
      const childComponent = indexes.componentBySemanticId.get(childId);
      if (childComponent !== undefined && childComponent.id !== component.id) {
        const childVisualNode = getComponentVisualNode(childComponent, indexes);
        childSlots.push({
          boundary: {
            identity: definitionIdByComponentId.get(childComponent.id) ?? childComponent.id,
          },
        });
        boundaryGeometries.push(childVisualNode.layout);
        continue;
      }
      childSlots.push('node');
      walkableChildIds.push(childId);
    }

    entries.push({
      semanticNodeId,
      facets: {
        kind: stableJson({
          semanticKind: semanticNode.kind,
          visualKind: visualNode.kind,
          bindableType: bindable?.type ?? null,
        }),
        symbol: stableJson(isRoot ? null : (visualNode.symbol?.masterId ?? null)),
        geometry: stableJson(
          isRoot
            ? { width: visualNode.layout.width, height: visualNode.layout.height }
            : visualNode.layout,
        ),
        style: stableJson({
          style: canonicalStyle(visualNode.style),
          textStyle: visualNode.text?.style ?? null,
        }),
        vector: stableJson(visualNode.vector ?? null),
        children: stableJson(childSlots),
        /* Geometries align with the boundary slots in `children` by order. */
        boundaryGeometry: stableJson(boundaryGeometries),
      },
      ...(bindable === undefined ? {} : { bindable }),
    });

    for (const childId of walkableChildIds) walk(childId, false);
  };

  walk(component.semanticNodeId, true);
  return { entries };
}

/**
 * Return the first facet difference between two snapshots in deterministic
 * order (pre-order entry, then FACET_LABELS key order), or undefined when
 * the snapshots fold together. A child-count difference always surfaces as
 * a `children` facet mismatch on the nearest common ancestor before the
 * entry sequences can misalign, so the trailing length check is defensive.
 */
function diagnoseSnapshotMismatch(
  representative: ComponentSnapshot,
  instance: ComponentSnapshot,
): string | undefined {
  const shared = Math.min(representative.entries.length, instance.entries.length);
  for (let index = 0; index < shared; index += 1) {
    const representativeEntry = representative.entries[index]!;
    const instanceEntry = instance.entries[index]!;
    for (const facet of Object.keys(FACET_LABELS) as Array<keyof SnapshotFacets>) {
      if (representativeEntry.facets[facet] !== instanceEntry.facets[facet]) {
        return `${FACET_LABELS[facet]} differs at template node ${representativeEntry.semanticNodeId} vs instance node ${instanceEntry.semanticNodeId}`;
      }
    }
  }
  if (representative.entries.length !== instance.entries.length) {
    return `structure differs: template walks ${representative.entries.length} nodes, instance walks ${instance.entries.length}`;
  }
  return undefined;
}

function canonicalStyle(style: VisualNode['style']): unknown {
  if (style === undefined) return null;
  return {
    fills: style.fills ?? null,
    borders: style.borders ?? null,
    effects: style.effects ?? null,
    opacity: style.opacity ?? null,
    radius: style.radius ?? null,
    raw: canonicalStyleRaw(style.raw),
  };
}

function canonicalStyleRaw(
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (raw === undefined) return null;
  const entries = Object.entries(raw).filter(([key]) => key !== 'sketchStyleId');
  return entries.length === 0 ? null : Object.fromEntries(entries);
}

function derivePropSchema(
  representativeSnapshot: ComponentSnapshot,
  components: PlannedComponent[],
  snapshots: ReadonlyMap<string, ComponentSnapshot>,
): { propSchema: ComponentDefinitionProp[]; propEntryIndexes: number[] } {
  const propSchema: ComponentDefinitionProp[] = [];
  const propEntryIndexes: number[] = [];
  const counts: Record<ComponentDefinitionProp['type'], number> = { text: 0, assetRef: 0 };

  for (let entryIndex = 0; entryIndex < representativeSnapshot.entries.length; entryIndex += 1) {
    const representativeEntry = representativeSnapshot.entries[entryIndex]!;
    if (representativeEntry.bindable === undefined) continue;
    const values = components.map(
      (component) => snapshots.get(component.id)!.entries[entryIndex]!.bindable!.value,
    );
    if (values.every((value) => value === values[0])) continue;

    const type = representativeEntry.bindable.type;
    counts[type] += 1;
    propSchema.push({
      name: `${type}${counts[type]}`,
      type,
      defaultValue: representativeEntry.bindable.value,
    });
    propEntryIndexes.push(entryIndex);
  }

  return { propSchema, propEntryIndexes };
}

function findCaller(
  component: PlannedComponent,
  indexes: ReuseIndexes,
  definitionIdByComponentId: ReadonlyMap<string, string>,
  invocationIdByComponentId: ReadonlyMap<string, string>,
): ComponentCaller {
  let cursor = indexes.semanticNodeById.get(component.semanticNodeId)?.parentId;
  const visited = new Set<string>();
  while (cursor !== undefined) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const parentComponent = indexes.componentBySemanticId.get(cursor);
    if (parentComponent !== undefined) {
      if (definitionIdByComponentId.has(parentComponent.id)) {
        const invocationId = invocationIdByComponentId.get(parentComponent.id);
        if (invocationId === undefined) {
          throw new Error(`folded parent component ${parentComponent.id} has no invocation id`);
        }
        return { kind: 'invocation', invocationId };
      }
      return { kind: 'component', componentId: parentComponent.id };
    }
    cursor = indexes.semanticNodeById.get(cursor)?.parentId;
  }
  /* The root component is always planned, so a candidate inside a valid
   * semantic tree must find an ancestor. Emitting a self-caller here would
   * only fail later in the render-domain integrity check with a far less
   * actionable message. */
  throw new Error(
    `component ${component.id}: no planned ancestor above semantic node ${component.semanticNodeId} to act as invocation caller`,
  );
}

function assignInvocationOrder(
  invocations: ComponentInvocation[],
  preOrderBySemanticId: ReadonlyMap<string, number>,
): void {
  const byCaller = new Map<string, ComponentInvocation[]>();
  for (const invocation of invocations) {
    const key = callerKey(invocation.caller);
    const existing = byCaller.get(key) ?? [];
    existing.push(invocation);
    byCaller.set(key, existing);
  }
  for (const siblings of byCaller.values()) {
    siblings.sort((left, right) => {
      const leftOrder = preOrderBySemanticId.get(left.semanticNodeId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = preOrderBySemanticId.get(right.semanticNodeId) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || compareStrings(left.id, right.id);
    });
    siblings.forEach((invocation, index) => {
      invocation.order = index;
    });
  }
}

function getComponentVisualNode(component: PlannedComponent, indexes: ReuseIndexes): VisualNode {
  const semanticNode = indexes.semanticNodeById.get(component.semanticNodeId);
  if (semanticNode === undefined) {
    throw new Error(
      `component ${component.id} semantic node ${component.semanticNodeId} is missing`,
    );
  }
  const visualNode = indexes.visualNodeById.get(semanticNode.primaryVisualNodeId);
  if (visualNode === undefined) {
    throw new Error(
      `component ${component.id} visual node ${semanticNode.primaryVisualNodeId} is missing`,
    );
  }
  return visualNode;
}

function semanticDepth(
  semanticNodeId: string,
  semanticNodeById: ReadonlyMap<string, SemanticNode>,
): number {
  let depth = 0;
  let cursor = semanticNodeById.get(semanticNodeId)?.parentId;
  const visited = new Set<string>();
  while (cursor !== undefined && !visited.has(cursor)) {
    visited.add(cursor);
    depth += 1;
    cursor = semanticNodeById.get(cursor)?.parentId;
  }
  return depth;
}

function compareComponentSemanticId(left: PlannedComponent, right: PlannedComponent): number {
  return compareStrings(left.semanticNodeId, right.semanticNodeId);
}

/* `localeCompare` consults runtime locale / ICU data, which the §2
 * byte-identical determinism contract cannot depend on. Compare code units,
 * matching the `Object.keys().sort()` ordering used by stable-json. */
function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function callerKey(caller: ComponentCaller): string {
  return caller.kind === 'component'
    ? `component:${caller.componentId}`
    : `invocation:${caller.invocationId}`;
}

function generateDefinitionId(masterId: string): string {
  return `cd_${hashRecord({ form: 'component-definition', sourceKind: 'symbol-master', masterId })}`;
}

function generateInvocationId(definitionId: string, semanticNodeId: string): string {
  return `ci_${hashRecord({ form: 'component-invocation', definitionId, semanticNodeId })}`;
}

function hashRecord(input: Record<string, unknown>): string {
  return stableSha256(stableJson(input)).slice(0, 12);
}
