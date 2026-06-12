/**
 * Stage 5C — graph-level integrity validator for `ComponentPlan`.
 *
 * `ComponentPlanSchema` (in `./component-plan-schema.ts`) owns shape and
 * status × mode × approval consistency via `superRefine`. This validator
 * deliberately does not repeat that approval logic; it only checks references
 * Zod cannot resolve inside the graph or across upstream artifacts.
 */
import type { SemanticView } from '../ir';

import type { ComponentCaller, ComponentPlan, ComponentInvocation } from './component-plan-schema';
import type { InteractionSpec } from './interaction-schema';

export class ComponentPlanIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComponentPlanIntegrityError';
  }
}

export interface ComponentPlanIntegrityContext {
  /** Upstream semantic-view node ids. When provided, enables chain checks. */
  semanticNodeIds?: ReadonlySet<string>;
  /** Full upstream semantic view. Enables render-domain ownership checks. */
  semanticView?: SemanticView;
  /** Upstream interaction-spec artifact. When provided, enables ref checks. */
  interactionSpec?: InteractionSpec;
}

type IdKind =
  | 'PlannedComponent'
  | 'PlannedExport'
  | 'PlannedLayout'
  | 'PlannedAsset'
  | 'ComponentDefinition'
  | 'ComponentInvocation'
  | 'Collection';

export function assertComponentPlanIntegrity(
  plan: ComponentPlan,
  context: ComponentPlanIntegrityContext = {},
): void {
  const { body } = plan;

  /* §6.1.1 — id uniqueness across component-plan body arrays. */
  const idOwners = new Map<string, IdKind>();
  const register = (id: string, kind: IdKind): void => {
    const existing = idOwners.get(id);
    if (existing === undefined) {
      idOwners.set(id, kind);
      return;
    }
    if (existing === kind) {
      throw new ComponentPlanIntegrityError(`duplicate ${kind} id: ${id}`);
    }
    throw new ComponentPlanIntegrityError(
      `id ${id} is reused across component-plan body: appears as both ${existing} and ${kind}`,
    );
  };

  for (const component of body.components) register(component.id, 'PlannedComponent');
  for (const plannedExport of body.exports) register(plannedExport.id, 'PlannedExport');
  for (const layout of body.layoutPlan) register(layout.id, 'PlannedLayout');
  for (const asset of body.assetPlan) register(asset.id, 'PlannedAsset');
  for (const definition of body.componentDefinitions ?? []) {
    register(definition.id, 'ComponentDefinition');
  }
  for (const invocation of body.componentInvocations ?? []) {
    register(invocation.id, 'ComponentInvocation');
  }
  for (const collection of body.collections ?? []) register(collection.id, 'Collection');

  /* §6.1.2 — root component must be represented as a root planned component. */
  const componentById = new Map(body.components.map((component) => [component.id, component]));
  const rootFromComponents = componentById.get(body.rootComponent.id);
  if (rootFromComponents === undefined) {
    throw new ComponentPlanIntegrityError(
      `rootComponent.id ${body.rootComponent.id} must appear in body.components`,
    );
  }
  if (body.rootComponent.role !== 'root') {
    throw new ComponentPlanIntegrityError(
      `rootComponent ${body.rootComponent.id} must have role 'root'`,
    );
  }
  if (rootFromComponents.role !== 'root') {
    throw new ComponentPlanIntegrityError(
      `body.components entry ${rootFromComponents.id} matching rootComponent.id must have role 'root'`,
    );
  }

  /* §6.1.3 — exports resolve to planned components. */
  for (const plannedExport of body.exports) {
    if (!componentById.has(plannedExport.plannedComponentId)) {
      throw new ComponentPlanIntegrityError(
        `export ${plannedExport.id}: plannedComponentId ${plannedExport.plannedComponentId} does not match any body.components id`,
      );
    }
  }

  validateComponentReuseGraph(plan, componentById, context.semanticView);

  /* §6.1.4 — components cannot list themselves as semantic children. */
  for (const component of body.components) {
    if (component.childSemanticNodeIds.includes(component.semanticNodeId)) {
      throw new ComponentPlanIntegrityError(
        `component ${component.id}: childSemanticNodeIds must not include its own semanticNodeId ${component.semanticNodeId}`,
      );
    }
  }

  /* §6.1.5 — layout semantic ids must be used by a component or root child. */
  const layoutSemanticNodeIds = new Set(
    body.components.map((component) => component.semanticNodeId),
  );
  for (const childSemanticNodeId of body.rootComponent.childSemanticNodeIds) {
    layoutSemanticNodeIds.add(childSemanticNodeId);
  }
  for (const layout of body.layoutPlan) {
    if (!layoutSemanticNodeIds.has(layout.semanticNodeId)) {
      throw new ComponentPlanIntegrityError(
        `layout ${layout.id}: semanticNodeId ${layout.semanticNodeId} is not used by a planned component or root child`,
      );
    }
  }

  /* §6.1.6 — presentational stubs must be justified by deferred dataBinding. */
  if (plan.mode === 'presentational') {
    for (const component of body.components) {
      for (const prop of component.props) {
        if (
          prop.source === 'presentational-stub' &&
          body.interactionCoverage.dataBinding.status !== 'deferred'
        ) {
          throw new ComponentPlanIntegrityError(
            `presentational-stub prop ${component.id}.${prop.name} requires interactionCoverage.dataBinding.status='deferred'`,
          );
        }
      }
    }
  }

  /* §6.2 — artifact-chain checks (only when caller passed context). */
  if (context.semanticNodeIds !== undefined) {
    const { semanticNodeIds } = context;
    for (const component of body.components) {
      if (!semanticNodeIds.has(component.semanticNodeId)) {
        throw new ComponentPlanIntegrityError(
          `component ${component.id}: semanticNodeId ${component.semanticNodeId} does not exist in upstream semantic-view`,
        );
      }
      for (const childSemanticNodeId of component.childSemanticNodeIds) {
        if (!semanticNodeIds.has(childSemanticNodeId)) {
          throw new ComponentPlanIntegrityError(
            `component ${component.id}: childSemanticNodeId ${childSemanticNodeId} does not exist in upstream semantic-view`,
          );
        }
      }
    }
    for (const layout of body.layoutPlan) {
      if (!semanticNodeIds.has(layout.semanticNodeId)) {
        throw new ComponentPlanIntegrityError(
          `layout ${layout.id}: semanticNodeId ${layout.semanticNodeId} does not exist in upstream semantic-view`,
        );
      }
    }
    for (const asset of body.assetPlan) {
      if (!semanticNodeIds.has(asset.semanticNodeId)) {
        throw new ComponentPlanIntegrityError(
          `asset ${asset.id}: semanticNodeId ${asset.semanticNodeId} does not exist in upstream semantic-view`,
        );
      }
    }
  }

  if (context.interactionSpec !== undefined) {
    const { interactionSpec } = context;

    if (plan.mode === 'interactive' && interactionSpec.status !== 'approved') {
      throw new ComponentPlanIntegrityError(
        `plan.mode is 'interactive' but interactionSpec.status is '${interactionSpec.status}' — interactive mode requires an approved interaction spec`,
      );
    }
    if (
      plan.mode === 'presentational' &&
      interactionSpec.status !== 'omitted' &&
      interactionSpec.status !== 'deferred'
    ) {
      throw new ComponentPlanIntegrityError(
        `plan.mode is 'presentational' but interactionSpec.status is '${interactionSpec.status}' — presentational mode requires omitted or deferred interaction spec`,
      );
    }

    const eventIds = new Set(interactionSpec.body.events.map((event) => event.id));
    const dataModelIds = new Set(interactionSpec.body.dataModels.map((dataModel) => dataModel.id));
    for (const component of body.components) {
      for (const binding of component.eventBindings) {
        if (!eventIds.has(binding.eventId)) {
          throw new ComponentPlanIntegrityError(
            `component ${component.id}: eventBinding ${binding.eventId} does not match any interactionSpec.body.events id`,
          );
        }
      }
      for (const binding of component.dataBindings) {
        if (!dataModelIds.has(binding.dataModelId)) {
          throw new ComponentPlanIntegrityError(
            `component ${component.id}: dataBinding ${binding.dataModelId} does not match any interactionSpec.body.dataModels id`,
          );
        }
      }
    }
  }
}

function validateComponentReuseGraph(
  plan: ComponentPlan,
  componentById: ReadonlyMap<string, ComponentPlan['body']['components'][number]>,
  semanticView: SemanticView | undefined,
): void {
  const definitions = plan.body.componentDefinitions ?? [];
  const invocations = plan.body.componentInvocations ?? [];
  const edges = plan.body.invocationEdges ?? [];
  const collections = plan.body.collections ?? [];
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
  const invocationById = new Map(invocations.map((invocation) => [invocation.id, invocation]));

  const definitionSourceOwners = new Set<string>();
  for (const definition of definitions) {
    if (!componentById.has(definition.componentId)) {
      throw new ComponentPlanIntegrityError(
        `definition ${definition.id}: componentId ${definition.componentId} does not match any body.components id`,
      );
    }
    const sourceKey =
      definition.source.kind === 'symbol-master'
        ? `symbol-master:${definition.source.masterId}`
        : `structural:${definition.source.fingerprint}`;
    if (definitionSourceOwners.has(sourceKey)) {
      throw new ComponentPlanIntegrityError(`duplicate component definition source: ${sourceKey}`);
    }
    definitionSourceOwners.add(sourceKey);
    assertUniqueStrings(
      definition.propSchema.map((prop) => prop.name),
      `definition ${definition.id}: propSchema names must be unique`,
    );
  }

  const invocationSemanticOwners = new Set<string>();
  for (const invocation of invocations) {
    const definition = definitionById.get(invocation.definitionId);
    if (definition === undefined) {
      throw new ComponentPlanIntegrityError(
        `invocation ${invocation.id}: definitionId ${invocation.definitionId} does not resolve`,
      );
    }
    if (invocationSemanticOwners.has(invocation.semanticNodeId)) {
      throw new ComponentPlanIntegrityError(
        `duplicate component invocation semanticNodeId: ${invocation.semanticNodeId}`,
      );
    }
    invocationSemanticOwners.add(invocation.semanticNodeId);
    assertCallerResolves(invocation, componentById, invocationById);

    const declaredProps = new Set(definition.propSchema.map((prop) => prop.name));
    for (const bindingName of Object.keys(invocation.bindings)) {
      if (!declaredProps.has(bindingName)) {
        throw new ComponentPlanIntegrityError(
          `invocation ${invocation.id}: binding ${bindingName} is not declared by definition ${definition.id}`,
        );
      }
    }
    assertUniqueStrings(
      Object.values(invocation.nodeMap),
      `invocation ${invocation.id}: nodeMap values must be unique`,
    );
  }

  const edgeBoundaryOwners = new Set<string>();
  const edgeCountByInvocation = new Map<string, number>();
  for (const edge of edges) {
    const invocation = invocationById.get(edge.invocationId);
    if (invocation === undefined) {
      throw new ComponentPlanIntegrityError(
        `invocation edge: invocationId ${edge.invocationId} does not resolve`,
      );
    }
    if (!callersEqual(edge.caller, invocation.caller)) {
      throw new ComponentPlanIntegrityError(
        `edge for invocation ${invocation.id}: caller does not match invocation caller`,
      );
    }
    if (edge.boundarySemanticNodeId !== invocation.semanticNodeId) {
      throw new ComponentPlanIntegrityError(
        `edge for invocation ${invocation.id}: boundarySemanticNodeId ${edge.boundarySemanticNodeId} must equal invocation semanticNodeId ${invocation.semanticNodeId}`,
      );
    }
    const boundaryKey = `${callerKey(edge.caller)}:${edge.boundarySemanticNodeId}`;
    if (edgeBoundaryOwners.has(boundaryKey)) {
      throw new ComponentPlanIntegrityError(`duplicate invocation edge boundary: ${boundaryKey}`);
    }
    edgeBoundaryOwners.add(boundaryKey);
    edgeCountByInvocation.set(invocation.id, (edgeCountByInvocation.get(invocation.id) ?? 0) + 1);
  }
  for (const invocation of invocations) {
    const edgeCount = edgeCountByInvocation.get(invocation.id) ?? 0;
    if (edgeCount !== 1) {
      throw new ComponentPlanIntegrityError(
        `invocation ${invocation.id}: expected exactly one invocation edge, got ${edgeCount}`,
      );
    }
  }

  assertInvocationGraphAcyclic(invocations, invocationById);

  for (const collection of collections) {
    const definition = definitionById.get(collection.definitionId);
    if (definition === undefined) {
      throw new ComponentPlanIntegrityError(
        `collection ${collection.id}: definitionId ${collection.definitionId} does not resolve`,
      );
    }
    assertUniqueStrings(
      collection.invocationIds,
      `collection ${collection.id}: invocationIds must be unique`,
    );
    for (const invocationId of collection.invocationIds) {
      const invocation = invocationById.get(invocationId);
      if (invocation === undefined) {
        throw new ComponentPlanIntegrityError(
          `collection ${collection.id}: invocationId ${invocationId} does not resolve`,
        );
      }
      if (invocation.definitionId !== definition.id) {
        throw new ComponentPlanIntegrityError(
          `collection ${collection.id}: invocation ${invocation.id} uses definition ${invocation.definitionId}, expected ${definition.id}`,
        );
      }
      if (!callersEqual(invocation.caller, collection.caller)) {
        throw new ComponentPlanIntegrityError(
          `collection ${collection.id}: invocation ${invocation.id} caller does not match collection caller`,
        );
      }
    }
  }

  if (semanticView !== undefined) {
    validateInvocationRenderDomains({
      semanticView,
      definitions,
      invocations,
      componentById,
    });
  }
}

function assertCallerResolves(
  invocation: ComponentInvocation,
  componentById: ReadonlyMap<string, ComponentPlan['body']['components'][number]>,
  invocationById: ReadonlyMap<string, ComponentInvocation>,
): void {
  if (invocation.caller.kind === 'component') {
    if (!componentById.has(invocation.caller.componentId)) {
      throw new ComponentPlanIntegrityError(
        `invocation ${invocation.id}: caller componentId ${invocation.caller.componentId} does not resolve`,
      );
    }
    return;
  }
  if (!invocationById.has(invocation.caller.invocationId)) {
    throw new ComponentPlanIntegrityError(
      `invocation ${invocation.id}: caller invocationId ${invocation.caller.invocationId} does not resolve`,
    );
  }
}

function assertInvocationGraphAcyclic(
  invocations: readonly ComponentInvocation[],
  invocationById: ReadonlyMap<string, ComponentInvocation>,
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (invocation: ComponentInvocation): void => {
    if (visited.has(invocation.id)) return;
    if (visiting.has(invocation.id)) {
      throw new ComponentPlanIntegrityError(`invocation graph cycle detected at ${invocation.id}`);
    }
    visiting.add(invocation.id);
    if (invocation.caller.kind === 'invocation') {
      const parent = invocationById.get(invocation.caller.invocationId);
      if (parent !== undefined) visit(parent);
    }
    visiting.delete(invocation.id);
    visited.add(invocation.id);
  };
  for (const invocation of invocations) visit(invocation);
}

function validateInvocationRenderDomains(args: {
  semanticView: SemanticView;
  definitions: NonNullable<ComponentPlan['body']['componentDefinitions']>;
  invocations: NonNullable<ComponentPlan['body']['componentInvocations']>;
  componentById: ReadonlyMap<string, ComponentPlan['body']['components'][number]>;
}): void {
  const { semanticView, definitions, invocations, componentById } = args;
  const semanticNodeById = new Map(semanticView.body.nodes.map((node) => [node.id, node]));
  const boundarySemanticNodeIds = new Set([
    ...[...componentById.values()].map((component) => component.semanticNodeId),
    ...invocations.map((invocation) => invocation.semanticNodeId),
  ]);
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
  const globallyOwnedInstanceNodes = new Map<string, string>();

  for (const invocation of invocations) {
    const definition = definitionById.get(invocation.definitionId);
    if (definition === undefined) continue;
    const representative = componentById.get(definition.componentId);
    if (representative === undefined) continue;
    const templateDomain = collectRenderDomain(
      representative.semanticNodeId,
      semanticNodeById,
      boundarySemanticNodeIds,
    );
    const instanceDomain = collectRenderDomain(
      invocation.semanticNodeId,
      semanticNodeById,
      boundarySemanticNodeIds,
    );
    const nodeMapKeys = new Set(Object.keys(invocation.nodeMap));
    const nodeMapValues = new Set(Object.values(invocation.nodeMap));
    if (!setsEqual(nodeMapKeys, templateDomain)) {
      throw new ComponentPlanIntegrityError(
        `invocation ${invocation.id}: nodeMap keys must equal definition render domain`,
      );
    }
    if (!setsEqual(nodeMapValues, instanceDomain)) {
      throw new ComponentPlanIntegrityError(
        `invocation ${invocation.id}: nodeMap values must equal instance render domain`,
      );
    }
    for (const semanticNodeId of nodeMapValues) {
      const existingOwner = globallyOwnedInstanceNodes.get(semanticNodeId);
      if (existingOwner !== undefined && existingOwner !== invocation.id) {
        throw new ComponentPlanIntegrityError(
          `semantic node ${semanticNodeId} is owned by both invocations ${existingOwner} and ${invocation.id}`,
        );
      }
      globallyOwnedInstanceNodes.set(semanticNodeId, invocation.id);
    }
  }
}

function collectRenderDomain(
  rootSemanticNodeId: string,
  semanticNodeById: ReadonlyMap<string, SemanticView['body']['nodes'][number]>,
  boundarySemanticNodeIds: ReadonlySet<string>,
): Set<string> {
  const domain = new Set<string>();
  const walk = (semanticNodeId: string, isRoot: boolean): void => {
    if (!isRoot && boundarySemanticNodeIds.has(semanticNodeId)) return;
    const node = semanticNodeById.get(semanticNodeId);
    if (node === undefined) {
      throw new ComponentPlanIntegrityError(
        `render-domain semanticNodeId ${semanticNodeId} does not exist in upstream semantic-view`,
      );
    }
    domain.add(semanticNodeId);
    for (const childId of node.childIds) walk(childId, false);
  };
  walk(rootSemanticNodeId, true);
  return domain;
}

function assertUniqueStrings(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new ComponentPlanIntegrityError(message);
  }
}

function callersEqual(left: ComponentCaller, right: ComponentCaller): boolean {
  return callerKey(left) === callerKey(right);
}

function callerKey(caller: ComponentCaller): string {
  return caller.kind === 'component'
    ? `component:${caller.componentId}`
    : `invocation:${caller.invocationId}`;
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}
