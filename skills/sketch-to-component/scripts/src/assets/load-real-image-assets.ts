import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assetSourceFileName,
  type DesignIR,
  type RealImageAsset,
} from '@skill-collections/d2c-core';

/**
 * Resolve real image bytes from an extract assets dir, keyed by `AssetEntry.id`
 * (which equals the image node's `assetRef`). Missing or unreadable files are
 * skipped so preview falls back to a placeholder.
 *
 * Script-side (IO) helper shared by the preview command and the visual harness.
 * Source-name resolution is shared with codegen via core's `assetSourceFileName`
 * so both consumers agree on the on-disk file name.
 */
export async function loadRealImageAssets(
  designIr: DesignIR,
  assetsDir: string,
): Promise<Map<string, RealImageAsset>> {
  const realAssets = new Map<string, RealImageAsset>();
  for (const asset of designIr.visual.assets) {
    if (asset.kind !== 'image') continue;
    const fileName = assetSourceFileName(asset);
    if (!fileName) continue;
    try {
      const bytes = await readFile(join(assetsDir, fileName));
      realAssets.set(asset.id, { fileName, bytes });
    } catch {
      // Missing/unreadable → leave it to the placeholder path.
    }
  }
  return realAssets;
}
