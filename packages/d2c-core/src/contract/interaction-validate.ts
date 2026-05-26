/**
 * Stage 5B — graph-level integrity validator for `InteractionSpec`.
 *
 * `InteractionSpecSchema` (in `./interaction-schema.ts`) covers shape only.
 * This validator picks up the constraints Zod cannot reach.
 *
 * Two layers — per stage-5b plan §5:
 *
 *   §5.1 — intra-spec (no upstream needed):
 *     - id uniqueness within each array AND across all 5 (components / events
 *       / dataModels / states / stateTransitions);
 *     - every InteractionTransition.from / .to resolves to a body.states[*]
 *       .stateName;
 *     - every InteractionTransition.on resolves to a body.events[*].eventName;
 *     - coverage vs status consistency:
 *         omitted    → all 4 coverage entries must be 'omitted'
 *         deferred   → all 4 must be 'deferred'
 *         draft / in-review → no entry may be 'covered'
 *         approved   → at least 1 entry must be 'covered'
 *
 *   §5.2 — artifact-chain (needs upstream semantic-view node id set):
 *     - every InteractionComponent.semanticNodeId resolves in the set;
 *     - every InteractionEvent.source resolves in the set;
 *     - every InteractionDataModel.source resolves in the set.
 *
 * `deriveInteractionSpec` (5B-PR-2) always supplies `semanticNodeIds`, so any
 * dangling-source bug from a derive run is caught there. Standalone fixture
 * review (no upstream available) calls without the second arg and gets only
 * §5.1 coverage.
 */
import type { InteractionSpec } from './interaction-schema';

export class InteractionSpecIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InteractionSpecIntegrityError';
  }
}

type IdKind =
  | 'InteractionComponent'
  | 'InteractionEvent'
  | 'InteractionDataModel'
  | 'InteractionState'
  | 'InteractionTransition';

export function assertInteractionSpecIntegrity(
  spec: InteractionSpec,
  /** Optional upstream context. When provided, enables §5.2 chain checks. */
  semanticNodeIds?: ReadonlySet<string>,
): void {
  /* §5.1.1 — id uniqueness across the body's 5 arrays. */
  const idOwners = new Map<string, IdKind>();
  const register = (id: string, kind: IdKind): void => {
    const existing = idOwners.get(id);
    if (existing === undefined) {
      idOwners.set(id, kind);
      return;
    }
    if (existing === kind) {
      throw new InteractionSpecIntegrityError(`duplicate ${kind} id: ${id}`);
    }
    throw new InteractionSpecIntegrityError(
      `id ${id} is reused across body: appears as both ${existing} and ${kind}`,
    );
  };

  for (const c of spec.body.components) register(c.id, 'InteractionComponent');
  for (const e of spec.body.events) register(e.id, 'InteractionEvent');
  for (const d of spec.body.dataModels) register(d.id, 'InteractionDataModel');
  for (const s of spec.body.states) register(s.id, 'InteractionState');
  for (const t of spec.body.stateTransitions) register(t.id, 'InteractionTransition');

  /* §5.1.2 — transition.from / .to / .on must resolve. */
  const stateNames = new Set(spec.body.states.map((s) => s.stateName));
  const eventNames = new Set(spec.body.events.map((e) => e.eventName));
  for (const t of spec.body.stateTransitions) {
    if (!stateNames.has(t.from)) {
      throw new InteractionSpecIntegrityError(
        `transition ${t.id}: from '${t.from}' does not match any state in body.states`,
      );
    }
    if (!stateNames.has(t.to)) {
      throw new InteractionSpecIntegrityError(
        `transition ${t.id}: to '${t.to}' does not match any state in body.states`,
      );
    }
    if (!eventNames.has(t.on)) {
      throw new InteractionSpecIntegrityError(
        `transition ${t.id}: on '${t.on}' does not match any event in body.events`,
      );
    }
  }

  /* §5.1.3 — coverage vs status consistency. */
  const coverageEntries: ReadonlyArray<
    readonly [string, InteractionSpec['body']['coverage']['states']]
  > = [
    ['states', spec.body.coverage.states],
    ['events', spec.body.coverage.events],
    ['dataBinding', spec.body.coverage.dataBinding],
    ['stateTransitions', spec.body.coverage.stateTransitions],
  ];

  if (spec.status === 'omitted' || spec.status === 'deferred') {
    for (const [name, entry] of coverageEntries) {
      if (entry.status !== spec.status) {
        throw new InteractionSpecIntegrityError(
          `coverage.${name}.status is '${entry.status}' but spec.status is '${spec.status}' — all four coverage entries must align with the spec status`,
        );
      }
    }
  } else if (spec.status === 'draft' || spec.status === 'in-review') {
    for (const [name, entry] of coverageEntries) {
      if (entry.status === 'covered') {
        throw new InteractionSpecIntegrityError(
          `coverage.${name}.status is 'covered' but spec.status is '${spec.status}' — 'covered' requires status === 'approved'`,
        );
      }
    }
  } else {
    /* spec.status === 'approved' */
    const anyCovered = coverageEntries.some(([, entry]) => entry.status === 'covered');
    if (!anyCovered) {
      throw new InteractionSpecIntegrityError(
        `spec.status is 'approved' but no coverage entry has status 'covered' — an approved spec must cover at least one aspect`,
      );
    }
  }

  /* §5.2 — artifact-chain checks (only when caller passed the upstream set). */
  if (semanticNodeIds !== undefined) {
    for (const c of spec.body.components) {
      if (!semanticNodeIds.has(c.semanticNodeId)) {
        throw new InteractionSpecIntegrityError(
          `component ${c.id}: semanticNodeId ${c.semanticNodeId} does not exist in upstream semantic-view`,
        );
      }
    }
    for (const e of spec.body.events) {
      if (!semanticNodeIds.has(e.source)) {
        throw new InteractionSpecIntegrityError(
          `event ${e.id}: source ${e.source} does not exist in upstream semantic-view`,
        );
      }
    }
    for (const d of spec.body.dataModels) {
      if (!semanticNodeIds.has(d.source)) {
        throw new InteractionSpecIntegrityError(
          `dataModel ${d.id}: source ${d.source} does not exist in upstream semantic-view`,
        );
      }
    }
  }
}
