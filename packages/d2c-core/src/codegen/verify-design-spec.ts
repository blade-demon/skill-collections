/**
 * Stage 6 — Gate 2 input validation.
 *
 * Pure: turns the on-disk (JSON-parsed) design-spec artifacts into a trusted,
 * typed bundle, or throws. Codegen (Stage 6-PR-2) consumes only what this gate
 * returns. Checks run in order (plan docs/stages/stage-6-codegen-plan.md §3.3):
 *   1. each contract artifact parses against its canonical schema;
 *   2. each artifact's hash reconciles with its manifest entry;
 *   3. the `generatedFrom` hash chain is self-consistent, anchored at design-ir;
 *   4. `component-plan.status === 'approved'` (and, via parse, the
 *      status × mode × approval shape is consistent).
 *
 * Hashes are taken over the artifacts AS PROVIDED — that is exactly what the
 * manifest and each `generatedFrom` recorded upstream, so the comparison does
 * not depend on schema parsing being byte-identity (one IR sub-schema carries a
 * `.default`, so `parse(x)` is not strictly `x`).
 *
 * There is deliberately NO `mode` parameter: codegen mode is a property of the
 * approved plan, never a caller override (§3.2).
 */
import { z } from 'zod';

import { GeneratedFromSchema } from '../ir/generated-from';
import { DesignIRSchema, type DesignIR } from '../ir/schema';
import {
  SemanticViewSchema,
  VisualViewSchema,
  type SemanticView,
  type VisualView,
} from '../ir/views';
import { ARTIFACT_FILENAMES, type ContractManifest } from '../contract/artifact-paths';
import { ComponentPlanSchema, type ComponentPlan } from '../contract/component-plan-schema';
import { InteractionSpecSchema, type InteractionSpec } from '../contract/interaction-schema';
import { stableJson, stableSha256 } from '../utils/stable-json';

const ContractManifestSchema = z
  .object({
    artifacts: z.array(
      z
        .object({
          filename: z.string().min(1),
          hash: z.string().min(1),
          origin: z.enum(['provided', 'derived']),
          generatedFrom: GeneratedFromSchema,
        })
        .strict(),
    ),
  })
  .strict();

export interface DesignSpecInput {
  designIr: unknown;
  visualView: unknown;
  semanticView: unknown;
  interactionSpec: unknown;
  componentPlan: unknown;
  manifest: unknown;
}

export interface VerifiedDesignSpec {
  designIr: DesignIR;
  visualView: VisualView;
  semanticView: SemanticView;
  interactionSpec: InteractionSpec;
  componentPlan: ComponentPlan;
  manifest: ContractManifest;
}

export function verifyDesignSpec(input: DesignSpecInput): VerifiedDesignSpec {
  if (input.interactionSpec === undefined || input.interactionSpec === null) {
    throw new Error(
      'verifyDesignSpec: interaction-spec.json is required and must be present before codegen',
    );
  }

  // 1. schema parse (shape + status × mode × approval consistency)
  const designIr = DesignIRSchema.parse(input.designIr);
  const visualView = VisualViewSchema.parse(input.visualView);
  const semanticView = SemanticViewSchema.parse(input.semanticView);
  const interactionSpec = InteractionSpecSchema.parse(input.interactionSpec);
  const componentPlan = ComponentPlanSchema.parse(input.componentPlan);
  const manifest = ContractManifestSchema.parse(input.manifest);

  // 2. per-artifact hash reconciliation against the manifest (hash as provided)
  const designIrHash = stableSha256(stableJson(input.designIr));
  const visualViewHash = stableSha256(stableJson(input.visualView));
  const semanticViewHash = stableSha256(stableJson(input.semanticView));
  const interactionSpecHash = stableSha256(stableJson(input.interactionSpec));
  const componentPlanHash = stableSha256(stableJson(input.componentPlan));

  const entries = new Map(manifest.artifacts.map((e) => [e.filename, e] as const));
  const reconcile = (filename: string, computed: string): void => {
    const entry = entries.get(filename);
    if (entry === undefined) {
      throw new Error(`verifyDesignSpec: manifest has no entry for '${filename}'`);
    }
    if (entry.hash !== computed) {
      throw new Error(
        `verifyDesignSpec: ${filename} hash mismatch — manifest '${entry.hash}' vs computed '${computed}' (artifact tampered or manifest stale)`,
      );
    }
  };
  reconcile(ARTIFACT_FILENAMES.visualView, visualViewHash);
  reconcile(ARTIFACT_FILENAMES.semanticView, semanticViewHash);
  reconcile(ARTIFACT_FILENAMES.interactionSpec, interactionSpecHash);
  reconcile(ARTIFACT_FILENAMES.componentPlan, componentPlanHash);

  // 3. generatedFrom hash chain, anchored at design-ir
  const link = (artifact: string, field: string, got: string | undefined, want: string): void => {
    if (got === undefined) {
      throw new Error(
        `verifyDesignSpec: ${artifact}.generatedFrom.${field} is missing — broken hash chain`,
      );
    }
    if (got !== want) {
      throw new Error(
        `verifyDesignSpec: ${artifact}.generatedFrom.${field} '${got}' does not match upstream '${want}' — broken hash chain`,
      );
    }
  };
  link('visual-view', 'designIrHash', visualView.generatedFrom.designIrHash, designIrHash);
  link('semantic-view', 'designIrHash', semanticView.generatedFrom.designIrHash, designIrHash);
  link(
    'semantic-view',
    'visualViewHash',
    semanticView.generatedFrom.visualViewHash,
    visualViewHash,
  );
  link(
    'interaction-spec',
    'designIrHash',
    interactionSpec.generatedFrom.designIrHash,
    designIrHash,
  );
  link(
    'interaction-spec',
    'visualViewHash',
    interactionSpec.generatedFrom.visualViewHash,
    visualViewHash,
  );
  link(
    'interaction-spec',
    'semanticViewHash',
    interactionSpec.generatedFrom.semanticViewHash,
    semanticViewHash,
  );
  link('component-plan', 'designIrHash', componentPlan.generatedFrom.designIrHash, designIrHash);
  link(
    'component-plan',
    'visualViewHash',
    componentPlan.generatedFrom.visualViewHash,
    visualViewHash,
  );
  link(
    'component-plan',
    'semanticViewHash',
    componentPlan.generatedFrom.semanticViewHash,
    semanticViewHash,
  );
  link(
    'component-plan',
    'interactionSpecHash',
    componentPlan.generatedFrom.interactionSpecHash,
    interactionSpecHash,
  );

  // 4. Gate 2: only an approved plan enters Stage 6
  if (componentPlan.status !== 'approved') {
    throw new Error(
      `verifyDesignSpec: component-plan.status must be 'approved' to enter Stage 6 (got '${componentPlan.status}')`,
    );
  }

  return { designIr, visualView, semanticView, interactionSpec, componentPlan, manifest };
}
