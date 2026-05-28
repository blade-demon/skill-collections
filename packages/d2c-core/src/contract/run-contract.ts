/**
 * Stage 5D — `runContract`.
 *
 * Pure orchestrator that chains the four Stage 5 derive steps into one
 * contract pass:
 *
 *   deriveVisualView → deriveSemanticView → deriveInteractionSpec → deriveComponentPlan
 *
 * Returns in-memory artifacts + an ordered merge of the warnings emitted by
 * the steps it actually ran. No file IO, no clock, no network, no
 * Math.random — same input ⇒ byte-identical output. All disk / path / clock
 * concerns live in the CLI layer (5D-PR-3).
 *
 * Input contract (plan docs/stage-5d-contract-runner-plan.md §2.1 — flexible,
 * constraints hard):
 *
 *   1. `designIr` required — the root anchor of the whole hash chain.
 *   2. `visualView` / `semanticView` / `interactionSpec` optional, but a
 *      provided view MUST pass full hash-chain validation against the
 *      upstream it claims to descend from — a mismatch throws. Never trusts a
 *      cached object.
 *   3. `mode` / `interactionMode` / `approval` are caller-explicit; runContract
 *      never guesses a default policy (5C §3.2).
 *   4. Resume from the provided point: provided views must form a CONTIGUOUS
 *      prefix from `designIr` (you cannot supply `semanticView` without
 *      `visualView`, etc.). The runner derives only the views past the last
 *      provided one — it never re-derives a provided view nor the prefix that
 *      validates it.
 *   5. Provenance (provided vs derived) is recorded by the 5D-PR-2 manifest
 *      builder from the same input flags; runContract itself returns just the
 *      four resolved artifacts + warnings.
 *
 * Interactive happy path (plan §2 note): runContract NEVER promotes an
 * interaction spec to `approved`. `deriveInteractionSpec` only ever produces
 * `draft | omitted | deferred`. So `mode='interactive'` succeeds only when the
 * caller PROVIDES an `interactionSpec` with `status === 'approved'`; otherwise
 * the derived spec is non-approved and `deriveComponentPlan` throws (5C §3.2).
 */
import { type DesignIR, type SemanticView, type VisualView, type Warning } from '../ir';
import { stableJson, stableSha256 } from '../utils/stable-json';
import { deriveVisualView } from '../preview/derive-visual-view';
import { deriveSemanticView } from '../semantic/derive';

import {
  deriveInteractionSpec,
  type DeriveInteractionMode,
  type DeriveInteractionSpecInput,
} from './derive-interaction';
import { deriveComponentPlan } from './derive-component-plan';
import type { ComponentPlan, ComponentPlanMode } from './component-plan-schema';
import type { InteractionSpec } from './interaction-schema';

/* ── public types ────────────────────────────────────────────────────────── */

export interface RunContractInput {
  designIr: DesignIR;
  /** Optional precomputed upstream views. Must form a contiguous prefix. */
  visualView?: VisualView;
  semanticView?: SemanticView;
  interactionSpec?: InteractionSpec;
  /** component-plan codegen archetype (required, caller-explicit). */
  mode: ComponentPlanMode;
  /** Only consulted when interactionSpec is NOT provided (i.e. derived). */
  interactionMode?: DeriveInteractionMode;
  /** Required by deriveInteractionSpec when interactionMode is omitted/deferred. */
  approval?: DeriveInteractionSpecInput['approval'];
}

export interface RunContractResult {
  visualView: VisualView;
  semanticView: SemanticView;
  interactionSpec: InteractionSpec;
  componentPlan: ComponentPlan;
  /** Ordered merge of the warnings from the steps that were actually run. */
  warnings: Warning[];
}

/* ── entry ───────────────────────────────────────────────────────────────── */

export function runContract(input: RunContractInput): RunContractResult {
  const { designIr, mode } = input;

  /* §2.1 constraint 4 — provided views must be a contiguous prefix. */
  const hasVisual = input.visualView !== undefined;
  const hasSemantic = input.semanticView !== undefined;
  const hasInteraction = input.interactionSpec !== undefined;
  if (hasSemantic && !hasVisual) {
    throw new Error(
      'runContract: semanticView provided without visualView — provided views must form a contiguous prefix from designIr (supply visualView too, or omit semanticView to derive it)',
    );
  }
  if (hasInteraction && !hasSemantic) {
    throw new Error(
      'runContract: interactionSpec provided without semanticView — provided views must form a contiguous prefix from designIr (supply semanticView too, or omit interactionSpec to derive it)',
    );
  }
  /* §2.1 constraint 3 / §2 note — a provided interactionSpec is used as-is;
   * interactionMode / approval are derivation inputs and must not also be set. */
  if (hasInteraction && (input.interactionMode !== undefined || input.approval !== undefined)) {
    throw new Error(
      'runContract: interactionSpec was provided together with interactionMode/approval — these are mutually exclusive (a provided spec is used as-is; interactionMode/approval only drive derivation)',
    );
  }

  const designIrHash = stableSha256(stableJson(designIr));
  const warnings: Warning[] = [];

  /* ── step 1: visual-view ─────────────────────────────────────────────── */
  let visualView: VisualView;
  if (input.visualView !== undefined) {
    if (input.visualView.generatedFrom.designIrHash !== designIrHash) {
      throw new Error(
        `runContract: provided visualView designIrHash mismatch — expected ${designIrHash}, got ${input.visualView.generatedFrom.designIrHash ?? '(absent)'}`,
      );
    }
    visualView = input.visualView;
  } else {
    const result = deriveVisualView(designIr);
    visualView = result.visualView;
    warnings.push(...result.warnings);
  }
  const visualViewHash = stableSha256(stableJson(visualView));

  /* ── step 2: semantic-view ───────────────────────────────────────────── */
  let semanticView: SemanticView;
  if (input.semanticView !== undefined) {
    if (input.semanticView.generatedFrom.designIrHash !== designIrHash) {
      throw new Error(
        `runContract: provided semanticView designIrHash mismatch — expected ${designIrHash}, got ${input.semanticView.generatedFrom.designIrHash ?? '(absent)'}`,
      );
    }
    if (input.semanticView.generatedFrom.visualViewHash !== visualViewHash) {
      throw new Error(
        `runContract: provided semanticView visualViewHash mismatch — expected ${visualViewHash}, got ${input.semanticView.generatedFrom.visualViewHash ?? '(absent)'}`,
      );
    }
    semanticView = input.semanticView;
  } else {
    const result = deriveSemanticView({ designIr, visualView });
    semanticView = result.semanticView;
    warnings.push(...result.warnings);
  }
  const semanticViewHash = stableSha256(stableJson(semanticView));

  /* ── step 3: interaction-spec ────────────────────────────────────────── */
  let interactionSpec: InteractionSpec;
  if (input.interactionSpec !== undefined) {
    if (input.interactionSpec.generatedFrom.designIrHash !== designIrHash) {
      throw new Error(
        `runContract: provided interactionSpec designIrHash mismatch — expected ${designIrHash}, got ${input.interactionSpec.generatedFrom.designIrHash ?? '(absent)'}`,
      );
    }
    if (input.interactionSpec.generatedFrom.visualViewHash !== visualViewHash) {
      throw new Error(
        `runContract: provided interactionSpec visualViewHash mismatch — expected ${visualViewHash}, got ${input.interactionSpec.generatedFrom.visualViewHash ?? '(absent)'}`,
      );
    }
    if (input.interactionSpec.generatedFrom.semanticViewHash !== semanticViewHash) {
      throw new Error(
        `runContract: provided interactionSpec semanticViewHash mismatch — expected ${semanticViewHash}, got ${input.interactionSpec.generatedFrom.semanticViewHash ?? '(absent)'}`,
      );
    }
    interactionSpec = input.interactionSpec;
  } else {
    const result = deriveInteractionSpec({
      designIr,
      visualView,
      semanticView,
      mode: input.interactionMode,
      approval: input.approval,
    });
    interactionSpec = result.interactionSpec;
    warnings.push(...result.warnings);
  }

  /* ── step 4: component-plan ──────────────────────────────────────────────
   * deriveComponentPlan re-validates the full hash chain AND enforces the
   * mode × interaction-status rule (5C §3.2): mode='interactive' demands an
   * approved interactionSpec, so a non-approved spec here throws. runContract
   * does not special-case it — it lets that contract violation surface. */
  const componentResult = deriveComponentPlan({
    designIr,
    visualView,
    semanticView,
    interactionSpec,
    mode,
  });
  warnings.push(...componentResult.warnings);

  return {
    visualView,
    semanticView,
    interactionSpec,
    componentPlan: componentResult.componentPlan,
    warnings,
  };
}
