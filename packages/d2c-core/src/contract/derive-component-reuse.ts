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

interface SnapshotEntry {
  semanticNodeId: string;
  bindable?: {
    type: ComponentDefinitionProp['type'];
    value: string;
  };
}

interface ComponentSnapshot {
  fingerprint: string;
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
    const mismatch =
      snapshotFailure ??
      (representativeSnapshot === undefined
        ? 'representative snapshot is missing'
        : components
              .slice(1)
              .map((component) => snapshots.get(component.id))
              .some(
                (snapshot) =>
                  snapshot === undefined ||
                  snapshot.fingerprint !== representativeSnapshot.fingerprint,
              )
          ? 'geometry, style, structure, or nested boundary identity differs'
          : undefined);

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
    .sort((left, right) => left.id.localeCompare(right.id));

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
    return leftOrder - rightOrder || left.id.localeCompare(right.id);
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
    warnings: warnings.sort((left, right) => left.message.localeCompare(right.message)),
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

  return [...componentsByMaster.entries()]
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
    .sort(
      (left, right) =>
        right.depth - left.depth ||
        left.masterId.localeCompare(right.masterId) ||
        compareComponentSemanticId(left.components[0]!, right.components[0]!),
    );
}

function buildComponentSnapshot(
  component: PlannedComponent,
  indexes: ReuseIndexes,
  definitionIdByComponentId: ReadonlyMap<string, string>,
): ComponentSnapshot {
  const entries: SnapshotEntry[] = [];

  const walk = (semanticNodeId: string, isRoot: boolean): unknown => {
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
    entries.push({
      semanticNodeId,
      ...(bindable === undefined ? {} : { bindable }),
    });

    const children = semanticNode.childIds.map((childId) => {
      const childComponent = indexes.componentBySemanticId.get(childId);
      if (childComponent !== undefined && childComponent.id !== component.id) {
        const childVisualNode = getComponentVisualNode(childComponent, indexes);
        return {
          boundary: {
            identity: definitionIdByComponentId.get(childComponent.id) ?? childComponent.id,
            geometry: childVisualNode.layout,
          },
        };
      }
      return walk(childId, false);
    });

    return {
      semanticKind: semanticNode.kind,
      visualKind: visualNode.kind,
      geometry: isRoot
        ? { width: visualNode.layout.width, height: visualNode.layout.height }
        : visualNode.layout,
      style: visualNode.style ?? null,
      textStyle: visualNode.text?.style ?? null,
      bindableType: bindable?.type ?? null,
      symbolMasterId: isRoot ? null : (visualNode.symbol?.masterId ?? null),
      vector: visualNode.vector ?? null,
      children,
    };
  };

  return {
    fingerprint: stableJson(walk(component.semanticNodeId, true)),
    entries,
  };
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
  return { kind: 'component', componentId: component.id };
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
      return leftOrder - rightOrder || left.id.localeCompare(right.id);
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
  return left.semanticNodeId.localeCompare(right.semanticNodeId);
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
