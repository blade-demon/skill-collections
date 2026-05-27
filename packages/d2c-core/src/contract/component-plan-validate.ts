/**
 * Stage 5C — graph-level integrity validator for `ComponentPlan`.
 *
 * `ComponentPlanSchema` (in `./component-plan-schema.ts`) owns shape and
 * status × mode × approval consistency via `superRefine`. This validator
 * deliberately does not repeat that approval logic; it only checks references
 * Zod cannot resolve inside the graph or across upstream artifacts.
 */
import type { ComponentPlan } from './component-plan-schema';
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
  /** Upstream interaction-spec artifact. When provided, enables ref checks. */
  interactionSpec?: InteractionSpec;
}

type IdKind = 'PlannedComponent' | 'PlannedExport' | 'PlannedLayout' | 'PlannedAsset';

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
