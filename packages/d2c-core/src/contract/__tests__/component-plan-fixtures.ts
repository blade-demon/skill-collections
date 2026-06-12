/**
 * Stage 5C-PR-2 — inline fixtures for deriveComponentPlan tests.
 *
 * Two entry helpers:
 *
 *   - `presentationalInput()` runs an existing 5A → 5B fixture through
 *     `deriveInteractionSpec` with `mode: 'deferred'` so the interaction-spec
 *     is `status === 'deferred'` and carries non-empty `dataModels` ready to
 *     be consumed as `presentational-stub` props.
 *   - `interactiveInput()` runs an existing 5A → 5B fixture through
 *     `deriveInteractionSpec()` (draft), then promotes it to an approved spec
 *     via `approveForInteractiveFixture()`.
 *
 * The `approve` helper rebuilds the envelope from scratch instead of
 * spreading the draft (plan §8 implementation note): the InteractionSpec
 * schema is a `z.discriminatedUnion('status', ...)` with `.strict()` on each
 * branch, so `{ ...drafted, status: 'approved', ... }` can collide with the
 * draft branch's `.strict()` and fail parse.
 */
import {
  bridgedFullChat,
  bridgedList,
  makeButtonyView,
  makeFoldableBoundSymbolInstancesView,
  makeFoldableSymbolInstancesView,
  makeFoldedChildUnfoldedParentView,
  makeInputComposerView,
  makeMixedTextMediaView,
  makeMismatchedSymbolInstancesView,
  makeNestedFoldableSymbolInstancesView,
  makeUnresolvedChildBoundaryView,
} from './fixtures';
import { deriveInteractionSpec, type DeriveInteractionSpecInput } from '../derive-interaction';
import type { InteractionCoverage, InteractionSpec } from '../interaction-schema';
import type { ComponentPlanMode } from '../component-plan-schema';
import type { DeriveComponentPlanInput } from '../derive-component-plan';
import { stableJson, stableSha256 } from '../../utils/stable-json';

export {
  bridgedFullChat,
  bridgedList,
  makeButtonyView,
  makeFoldableBoundSymbolInstancesView,
  makeFoldableSymbolInstancesView,
  makeFoldedChildUnfoldedParentView,
  makeInputComposerView,
  makeMixedTextMediaView,
  makeMismatchedSymbolInstancesView,
  makeNestedFoldableSymbolInstancesView,
  makeUnresolvedChildBoundaryView,
};

/* ── presentational input bridge ─────────────────────────────────────────── */

const PRESENTATIONAL_APPROVAL = {
  reason: 'visual delivery first; interaction modeling deferred',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
} as const;

const OMITTED_APPROVAL = {
  reason: 'sandbox preview; no behavior in scope',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
} as const;

export function presentationalInput(
  makeInput: () => DeriveInteractionSpecInput = bridgedFullChat,
  options: { interactionMode?: 'omitted' | 'deferred' } = {},
): DeriveComponentPlanInput {
  const interactionMode = options.interactionMode ?? 'deferred';
  const input = makeInput();

  let interactionSpec: InteractionSpec;
  if (interactionMode === 'omitted') {
    /* omitted: empty body, behavior trivially absent. */
    interactionSpec = deriveInteractionSpec({
      ...input,
      mode: 'omitted',
      approval: OMITTED_APPROVAL,
    }).interactionSpec;
  } else {
    /* deferred: keep the drafted body's dataModels so the 5C
     * presentational pipeline has something real to convert into
     * `presentational-stub` props. The plan (§3.2) allows a deferred
     * spec to carry non-empty dataModels — `deriveInteractionSpec` in
     * deferred mode emits an empty body, so we promote a draft spec to
     * `status='deferred'` manually. */
    const drafted = deriveInteractionSpec(input).interactionSpec;
    interactionSpec = deferForPresentationalFixture(drafted);
  }
  return {
    designIr: input.designIr,
    visualView: input.visualView,
    semanticView: input.semanticView,
    interactionSpec,
    mode: 'presentational',
  };
}

/**
 * Rebuild a 5B InteractionSpec envelope as `status === 'deferred'` while
 * keeping the drafted body intact (dataModels, components, coverage). Plan
 * §3.2 explicitly allows a deferred spec to carry non-empty dataModels — the
 * production `deriveInteractionSpec` does not produce that shape on its own
 * (deferred there means "empty body"), so the fixture builds it manually.
 *
 * Coverage is pinned to `deferred` on all four entries so the spec matches
 * what a human reviewer would sign off as "behavior intentionally postponed".
 */
function deferForPresentationalFixture(drafted: InteractionSpec): InteractionSpec {
  const body = drafted.body;
  const deferredCoverage: InteractionCoverage = {
    states: { status: 'deferred', notes: PRESENTATIONAL_APPROVAL.reason },
    events: { status: 'deferred', notes: PRESENTATIONAL_APPROVAL.reason },
    dataBinding: { status: 'deferred', notes: PRESENTATIONAL_APPROVAL.reason },
    stateTransitions: { status: 'deferred', notes: PRESENTATIONAL_APPROVAL.reason },
  };
  return {
    kind: drafted.kind,
    generatedFrom: drafted.generatedFrom,
    body: {
      components: body.components,
      states: body.states,
      events: body.events,
      dataModels: body.dataModels,
      stateTransitions: body.stateTransitions,
      coverage: deferredCoverage,
      warnings: body.warnings,
    },
    status: 'deferred',
    reason: PRESENTATIONAL_APPROVAL.reason,
    approvedBy: PRESENTATIONAL_APPROVAL.approvedBy,
    approvedAt: PRESENTATIONAL_APPROVAL.approvedAt,
  };
}

/* ── interactive input bridge ────────────────────────────────────────────── */

const INTERACTIVE_APPROVAL = {
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
} as const;

/**
 * Rebuild a 5B InteractionSpec envelope as `status === 'approved'` and bump
 * at least one coverage entry to `covered` (plan §8). Never used in
 * production derive — fixtures only.
 */
export function approveForInteractiveFixture(drafted: InteractionSpec): InteractionSpec {
  const body = drafted.body;
  const coverage: InteractionCoverage = {
    states: body.coverage.states,
    events: body.coverage.events,
    dataBinding: body.coverage.dataBinding,
    stateTransitions: body.coverage.stateTransitions,
  };
  if (body.events.length > 0) {
    coverage.events = { status: 'covered', notes: 'manually approved for fixture' };
  } else if (body.dataModels.length > 0) {
    coverage.dataBinding = { status: 'covered', notes: 'manually approved for fixture' };
  } else {
    coverage.states = { status: 'covered', notes: 'manually approved for fixture' };
  }
  return {
    kind: drafted.kind,
    generatedFrom: drafted.generatedFrom,
    body: {
      components: body.components,
      states: body.states,
      events: body.events,
      dataModels: body.dataModels,
      stateTransitions: body.stateTransitions,
      coverage,
      warnings: body.warnings,
    },
    status: 'approved',
    approvedBy: INTERACTIVE_APPROVAL.approvedBy,
    approvedAt: INTERACTIVE_APPROVAL.approvedAt,
  };
}

export function interactiveInput(
  makeInput: () => DeriveInteractionSpecInput = makeButtonyView,
): DeriveComponentPlanInput {
  const input = makeInput();
  const drafted = deriveInteractionSpec(input).interactionSpec;
  const interactionSpec = approveForInteractiveFixture(drafted);
  return {
    designIr: input.designIr,
    visualView: input.visualView,
    semanticView: input.semanticView,
    interactionSpec,
    mode: 'interactive',
  };
}

/* ── mode override (for illegal-combo tests) ─────────────────────────────── */

export function withMode(
  base: DeriveComponentPlanInput,
  mode: ComponentPlanMode,
): DeriveComponentPlanInput {
  return { ...base, mode };
}

/**
 * Recompute downstream hashes (`visualView.designIrHash`,
 * `semanticView.designIrHash`, `semanticView.visualViewHash`,
 * `interactionSpec.designIrHash` / `visualViewHash` / `semanticViewHash`)
 * to match the current `input.{designIr, visualView, semanticView}` values.
 *
 * Tests that tamper a semantic-view body to exercise a derive guard need to
 * leave the upstream hash chain consistent — otherwise the chain check
 * fires first and the test never reaches the guard under test.
 */
export function rechainHashes(input: DeriveComponentPlanInput): DeriveComponentPlanInput {
  const designIrHash = stableSha256(stableJson(input.designIr));
  const visualView = {
    ...input.visualView,
    generatedFrom: { ...input.visualView.generatedFrom, designIrHash },
  };
  const visualViewHash = stableSha256(stableJson(visualView));
  const semanticView = {
    ...input.semanticView,
    generatedFrom: { ...input.semanticView.generatedFrom, designIrHash, visualViewHash },
  };
  const semanticViewHash = stableSha256(stableJson(semanticView));
  const interactionSpec: InteractionSpec = {
    ...input.interactionSpec,
    generatedFrom: {
      ...input.interactionSpec.generatedFrom,
      designIrHash,
      visualViewHash,
      semanticViewHash,
    },
  };
  return { ...input, visualView, semanticView, interactionSpec };
}
