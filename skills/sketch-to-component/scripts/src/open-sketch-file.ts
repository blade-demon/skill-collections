import { readFile as nodeReadFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

import { ExtractError, isNodeErrorWithCode } from './errors.js';

export interface SketchArchive {
  entries: Map<string, Uint8Array>;
}

export interface OpenSketchFileDeps {
  readFile?: (filePath: string) => Promise<Uint8Array>;
}

function hasZipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function openSketchFile(
  filePath: string,
  deps: OpenSketchFileDeps = {},
): Promise<SketchArchive> {
  let bytes: Uint8Array;
  try {
    bytes = await (deps.readFile ?? nodeReadFile)(filePath);
  } catch (error) {
    if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
      throw new ExtractError('file-not-found', `Sketch file not found: ${filePath}`, {
        cause: error,
      });
    }
    throw new ExtractError('read-failed', `Failed to read Sketch file: ${filePath}`, {
      cause: error,
    });
  }

  if (!hasZipMagic(bytes)) {
    throw new ExtractError('not-a-sketch-zip', `File is not a Sketch zip archive: ${filePath}`);
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (error) {
    throw new ExtractError('corrupt-archive', `Sketch zip archive is corrupt: ${filePath}`, {
      cause: error,
    });
  }

  return {
    entries: new Map(Object.entries(unzipped).sort(([a], [b]) => a.localeCompare(b))),
  };
}
