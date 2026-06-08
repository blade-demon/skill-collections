/**
 * Stage 5D — stable artifact filenames + contract manifest builder.
 *
 * Pure data + a pure builder, NO disk IO. The CLI / skill layer (5D-PR-3)
 * owns `mkdir` / `writeFile` and the `<out>/design-spec/` directory layout;
 * this module only owns the stable names and the manifest shape so Stage 6
 * and any reuse path read the same constants instead of re-deriving paths
 * (plan docs/stages/stage-5d-contract-runner-plan.md §3.2 / §3.3).
 */
import type { GeneratedFrom } from '../ir';
import { stableJson, stableSha256 } from '../utils/stable-json';

import type { RunContractInput, RunContractResult } from './run-contract';

/* ── stable filenames ────────────────────────────────────────────────────── */

/**
 * `designIr` is the input root — it lives in `ir/` (normalize already wrote
 * it) and is NOT a `runContract` output, so it does not appear in the
 * manifest. The other four are the `runContract` outputs and land in
 * `design-spec/`.
 */
export const ARTIFACT_FILENAMES = {
  designIr: 'design-ir.json',
  visualView: 'visual-view.json',
  semanticView: 'semantic-view.json',
  interactionSpec: 'interaction-spec.json',
  componentPlan: 'component-plan.json',
} as const;
export type ArtifactKey = keyof typeof ARTIFACT_FILENAMES;

/** Stable basename of the manifest file the CLI writes into `design-spec/`. */
export const MANIFEST_FILENAME = 'manifest.json';

/* ── manifest ────────────────────────────────────────────────────────────── */

export type ArtifactOrigin = 'provided' | 'derived';

export interface ContractManifestEntry {
  /** One of the four contract-artifact filenames (not `design-ir.json`). */
  filename: string;
  /** `stableSha256(stableJson(artifact))` of the FINAL adopted artifact. */
  hash: string;
  /**
   * Whether this run reused a caller-provided artifact (`provided`) or freshly
   * derived it (`derived`). Hash is identical either way — `origin` records
   * provenance only, it does not change hash semantics (plan §3.3).
   */
  origin: ArtifactOrigin;
  /** The artifact's upstream hash chain, taken verbatim. */
  generatedFrom: GeneratedFrom;
}

export interface ContractManifest {
  /** Entries in chain order: visual → semantic → interaction → component. */
  artifacts: ContractManifestEntry[];
}

/**
 * Build the contract manifest for a `runContract` pass. Pure: hashes the four
 * output artifacts and reads provenance from which upstream views the caller
 * supplied. `componentPlan` is always `derived` (runContract always derives
 * it; it is never a caller input).
 */
export function buildContractManifest(
  input: RunContractInput,
  result: RunContractResult,
): ContractManifest {
  const entry = (
    filename: string,
    artifact: { generatedFrom: GeneratedFrom },
    origin: ArtifactOrigin,
  ): ContractManifestEntry => ({
    filename,
    hash: stableSha256(stableJson(artifact)),
    origin,
    generatedFrom: artifact.generatedFrom,
  });

  return {
    artifacts: [
      entry(
        ARTIFACT_FILENAMES.visualView,
        result.visualView,
        input.visualView !== undefined ? 'provided' : 'derived',
      ),
      entry(
        ARTIFACT_FILENAMES.semanticView,
        result.semanticView,
        input.semanticView !== undefined ? 'provided' : 'derived',
      ),
      entry(
        ARTIFACT_FILENAMES.interactionSpec,
        result.interactionSpec,
        input.interactionSpec !== undefined ? 'provided' : 'derived',
      ),
      entry(ARTIFACT_FILENAMES.componentPlan, result.componentPlan, 'derived'),
    ],
  };
}
