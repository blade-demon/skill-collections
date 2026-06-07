/**
 * Pure join between a component-plan `assetPlan` and the visual-view asset
 * entries. Produces a deterministic copy plan (`CodegenAssetFile[]`) plus a
 * semantic-node → output-path lookup the React generator uses to emit CSS image
 * references. No bytes, no IO — the CLI owns reads/writes.
 *
 * Output names are `src/assets/asset-<sha(assetRef)>.<ext>` so distinct assets
 * never collide on a shared basename; repeated `assetRef` values collapse to one
 * file with `required` OR-merged.
 */
import { posix } from 'node:path';

import type { PlannedAsset } from '../contract/component-plan-schema';
import type { AssetEntry } from '../ir/visual';
import { assetSourceFileName } from '../ir/asset-path';
import { stableSha256 } from '../utils/stable-json';
import type { CodegenAssetFile } from './target';

export interface ResolvedCodegenAssets {
  /** Sorted by `outputPath`, one entry per unique `assetRef`. */
  assets: CodegenAssetFile[];
  /** Resolved output path for each planned semantic node that carries an asset. */
  outputPathBySemanticNodeId: Map<string, string>;
  /** Deterministic, ordered notices for skipped optional assets. */
  warnings: string[];
}

function codegenAssetOutputPath(assetRef: string, sourceFileName: string): string {
  const ext = posix.extname(sourceFileName).toLowerCase();
  return `src/assets/asset-${stableSha256(assetRef).slice(0, 12)}${ext}`;
}

/**
 * Resolve planned assets against visual-view asset entries.
 *
 * Failure semantics (a required asset must always be deliverable):
 * - required planned asset without `assetRef` → throw;
 * - required `assetRef` missing from `visualAssets` → throw;
 * - required asset with no resolvable filename/extension → throw;
 * - optional unresolved planned asset → warning, omitted from the lookup so the
 *   generator keeps its placeholder styling.
 */
export function resolveCodegenAssets(input: {
  plannedAssets: PlannedAsset[];
  visualAssets: AssetEntry[];
}): ResolvedCodegenAssets {
  const { plannedAssets, visualAssets } = input;
  const visualAssetById = new Map(visualAssets.map((asset) => [asset.id, asset] as const));

  const byRef = new Map<string, CodegenAssetFile>();
  const outputPathBySemanticNodeId = new Map<string, string>();
  const warnings: string[] = [];

  for (const planned of plannedAssets) {
    const { assetRef, required, semanticNodeId } = planned;

    if (assetRef === undefined) {
      if (required) {
        throw new Error(
          `required asset ${planned.id} (node ${semanticNodeId}) has no assetRef to resolve`,
        );
      }
      warnings.push(
        `codegen assets: optional planned asset ${planned.id} has no assetRef; skipped`,
      );
      continue;
    }

    const visualAsset = visualAssetById.get(assetRef);
    if (visualAsset === undefined) {
      if (required) {
        throw new Error(
          `required asset ${assetRef} (node ${semanticNodeId}) is missing from visual-view assets`,
        );
      }
      warnings.push(`codegen assets: optional asset ${assetRef} not found in visual-view; skipped`);
      continue;
    }

    const sourceFileName = assetSourceFileName(visualAsset);
    if (sourceFileName === '' || posix.extname(sourceFileName) === '') {
      if (required) {
        throw new Error(
          `required asset ${assetRef} has no resolvable filename/extension (source '${sourceFileName}')`,
        );
      }
      warnings.push(`codegen assets: optional asset ${assetRef} has no extension; skipped`);
      continue;
    }

    const outputPath = codegenAssetOutputPath(assetRef, sourceFileName);
    const existing = byRef.get(assetRef);
    if (existing === undefined) {
      byRef.set(assetRef, { assetRef, sourceFileName, outputPath, required });
    } else {
      existing.required = existing.required || required;
    }
    outputPathBySemanticNodeId.set(semanticNodeId, outputPath);
  }

  const assets = [...byRef.values()].sort((a, b) =>
    a.outputPath < b.outputPath ? -1 : a.outputPath > b.outputPath ? 1 : 0,
  );

  return { assets, outputPathBySemanticNodeId, warnings };
}
