import { basename, resolve } from 'node:path';
import { RawArtifactSchema, type RawArtifact } from '@skill-collections/d2c-core';
import type FileFormat from '@sketch-hq/sketch-file-format-ts';

import { acquireFromFile } from './acquire-from-file.js';
import { ExtractError } from './errors.js';
import { openSketchFile, type OpenSketchFileDeps } from './open-sketch-file.js';
import { safeParseSketchRawModel } from './sketch-raw-model.js';

export type SketchExtractInput = { source: 'file'; filePath: string };

/** A real bitmap asset pulled out of the .sketch archive, bytes included. */
export interface ExtractedImageAsset {
  /** Original path inside the .sketch zip, e.g. `images/ab12cd.png`. */
  sourcePath: string;
  /** Basename reused as the on-disk file name, e.g. `ab12cd.png`. */
  fileName: string;
  /** Raw image bytes (already unzipped). */
  bytes: Uint8Array;
}

/**
 * Pull the real bitmap bytes out of a .sketch archive.
 *
 * `extractRaw` keeps only asset *metadata* (path / kind / byteLength) in the
 * DSL — the bytes are dropped after parsing, so preview/codegen can only render
 * placeholders. This re-opens the archive and returns the `images/*` entries so
 * the extract CLI can mirror them to disk (original file names preserved),
 * making extract lossless for image assets without coupling to normalize's
 * id scheme. Downstream consumers map a `design-ir` asset to its file via
 * `basename(AssetEntry.originalPath)`.
 */
export async function extractImageAssets(
  input: SketchExtractInput,
  deps: ExtractRawDeps = {},
): Promise<ExtractedImageAsset[]> {
  const archive = await openSketchFile(resolve(input.filePath), deps);
  const images: ExtractedImageAsset[] = [];
  for (const [path, bytes] of archive.entries) {
    if (path.endsWith('/') || !path.startsWith('images/')) continue;
    images.push({ sourcePath: path, fileName: basename(path), bytes });
  }
  return images.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export interface ExtractRawDeps extends OpenSketchFileDeps {
  now?: () => Date;
}

interface AcquiredSketchRawModel {
  ref: Record<string, string>;
  model: unknown;
}

function getDocumentId(document: FileFormat.Document): string {
  // Defensive: zod only verified that `document` is a non-empty object, not
  // that `do_objectID` is present and a string. Keep the runtime check —
  // newer Sketch versions or corrupt files could violate the FileFormat
  // contract that `do_objectID: Uuid` (a string) is always set.
  const documentId: unknown = (document as { do_objectID?: unknown }).do_objectID;
  if (typeof documentId !== 'string' || documentId.length === 0) {
    throw new ExtractError('bad-entry', 'document.do_objectID is required');
  }
  return documentId;
}

async function acquire(
  input: SketchExtractInput,
  deps: ExtractRawDeps,
): Promise<AcquiredSketchRawModel> {
  switch (input.source) {
    case 'file': {
      const filePath = resolve(input.filePath);
      return {
        ref: {
          filePath,
          fileName: basename(filePath),
        },
        model: acquireFromFile(await openSketchFile(filePath, deps)),
      };
    }
  }
}

export async function extractRaw(
  input: SketchExtractInput,
  deps: ExtractRawDeps = {},
): Promise<RawArtifact> {
  const acquired = await acquire(input, deps);
  const parsedModel = safeParseSketchRawModel(acquired.model);
  if (!parsedModel.success) {
    throw new ExtractError('bad-entry', parsedModel.error.message, {
      cause: parsedModel.error,
    });
  }

  const raw: RawArtifact = {
    provider: 'sketch',
    ref: {
      ...acquired.ref,
      documentId: getDocumentId(parsedModel.data.document),
    },
    payload: parsedModel.data,
    capturedAt: (deps.now ?? (() => new Date()))().toISOString(),
  };

  const parsedRaw = RawArtifactSchema.safeParse(raw);
  if (!parsedRaw.success) {
    throw new Error(`Internal error: RawArtifact failed validation: ${parsedRaw.error.message}`);
  }
  return parsedRaw.data;
}
