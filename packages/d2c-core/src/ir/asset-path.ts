/**
 * Provider-neutral asset-path parsing. Pure and IO-free so both the script-side
 * preview loader and the codegen resolver agree on the on-disk source name.
 *
 * Lives in the IR layer (not codegen) to avoid a reverse codegen→ir dependency;
 * it only depends on the `AssetEntry` shape.
 */
import { posix } from 'node:path';

import type { AssetEntry } from './visual';

/**
 * The file name extract mirrors on disk for an asset: the POSIX basename of
 * `originalPath` (falling back to `ref`). Case is preserved; the codegen output
 * name lowercases the extension separately.
 */
export function assetSourceFileName(asset: AssetEntry): string {
  return posix.basename(asset.originalPath ?? asset.ref);
}
