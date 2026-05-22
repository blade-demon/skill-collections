import { basename, resolve } from 'node:path';
import { RawArtifactSchema, type RawArtifact } from '@skill-collections/d2c-core';

import { acquireFromFile } from './acquire-from-file.js';
import { ExtractError } from './errors.js';
import { openSketchFile, type OpenSketchFileDeps } from './open-sketch-file.js';
import { SketchRawModelSchema } from './sketch-raw-model.js';

export type SketchExtractInput = { source: 'file'; filePath: string };

export interface ExtractRawDeps extends OpenSketchFileDeps {
  now?: () => Date;
}

interface AcquiredSketchRawModel {
  ref: Record<string, string>;
  model: unknown;
}

function getDocumentId(document: Record<string, unknown>): string {
  const documentId = document.do_objectID;
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
  const parsedModel = SketchRawModelSchema.safeParse(acquired.model);
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
