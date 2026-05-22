import { ExtractError } from './errors.js';
import type { SketchArchive } from './open-sketch-file.js';
import { type SketchAssetEntry, type SketchPage, type SketchRawModel } from './sketch-raw-model.js';

const decoder = new TextDecoder();
const PAGE_ENTRY_RE = /^pages\/([^/]+)\.json$/;

function parseJsonObject(path: string, bytes: Uint8Array): Record<string, unknown> {
  try {
    const parsed = JSON.parse(decoder.decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('entry is not a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new ExtractError('bad-entry', `Invalid JSON object in ${path}`, { cause: error });
  }
}

function classifyAsset(path: string): SketchAssetEntry['kind'] {
  if (path.startsWith('images/')) return 'image';
  if (path.startsWith('fonts/')) return 'font';
  if (path.startsWith('previews/')) return 'preview';
  return 'other';
}

export function acquireFromFile(archive: SketchArchive): SketchRawModel {
  let document: Record<string, unknown> | undefined;
  let meta: Record<string, unknown> | undefined;
  const pages: SketchPage[] = [];
  const assets: SketchAssetEntry[] = [];

  const entries = [...archive.entries.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [path, bytes] of entries) {
    if (path.endsWith('/')) continue;

    if (path === 'document.json') {
      document = parseJsonObject(path, bytes);
      continue;
    }

    if (path === 'meta.json') {
      meta = parseJsonObject(path, bytes);
      continue;
    }

    const pageMatch = PAGE_ENTRY_RE.exec(path);
    if (pageMatch) {
      pages.push({
        id: pageMatch[1]!,
        path,
        data: parseJsonObject(path, bytes),
      });
      continue;
    }

    if (path === 'user.json' || path.endsWith('.json')) continue;

    assets.push({ path, kind: classifyAsset(path), byteLength: bytes.byteLength });
  }

  if (!document) {
    throw new ExtractError('missing-entry', 'Missing required Sketch entry: document.json');
  }
  if (!meta) {
    throw new ExtractError('missing-entry', 'Missing required Sketch entry: meta.json');
  }
  if (pages.length === 0) {
    throw new ExtractError('missing-entry', 'Missing required Sketch entries: pages/*.json');
  }

  const model: SketchRawModel = {
    meta,
    document,
    pages: pages.sort((a, b) => a.path.localeCompare(b.path)),
    assets: assets.sort((a, b) => a.path.localeCompare(b.path)),
  };

  return model;
}
