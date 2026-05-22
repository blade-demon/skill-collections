import { TextEncoder } from 'node:util';
import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';

import { ExtractError } from '../errors.js';
import { openSketchFile } from '../open-sketch-file.js';

const encoder = new TextEncoder();

function makeZip(entries: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, content]) => [path, encoder.encode(content)]),
    ),
  );
}

function readFailure(code: string): () => Promise<Uint8Array> {
  return async () => {
    throw Object.assign(new Error(code), { code });
  };
}

describe('openSketchFile', () => {
  it('opens a .sketch zip archive through an injected reader', async () => {
    const archive = await openSketchFile('/tmp/mock.sketch', {
      readFile: async () =>
        makeZip({
          'document.json': '{}',
          'meta.json': '{}',
          'pages/page-a.json': '{}',
        }),
    });

    expect([...archive.entries.keys()]).toEqual([
      'document.json',
      'meta.json',
      'pages/page-a.json',
    ]);
  });

  it('classifies ENOENT as file-not-found', async () => {
    await expect(
      openSketchFile('/tmp/missing.sketch', { readFile: readFailure('ENOENT') }),
    ).rejects.toMatchObject({ code: 'file-not-found' } satisfies Partial<ExtractError>);
  });

  it('classifies non-ENOENT read errors as read-failed', async () => {
    await expect(
      openSketchFile('/tmp/no-access.sketch', { readFile: readFailure('EACCES') }),
    ).rejects.toMatchObject({ code: 'read-failed' } satisfies Partial<ExtractError>);
  });

  it('rejects files without a zip magic header', async () => {
    await expect(
      openSketchFile('/tmp/not-zip.sketch', {
        readFile: async () => encoder.encode('not a zip'),
      }),
    ).rejects.toMatchObject({ code: 'not-a-sketch-zip' } satisfies Partial<ExtractError>);
  });

  it('classifies invalid zip bytes with a PK header as corrupt-archive', async () => {
    await expect(
      openSketchFile('/tmp/corrupt.sketch', {
        readFile: async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff]),
      }),
    ).rejects.toMatchObject({ code: 'corrupt-archive' } satisfies Partial<ExtractError>);
  });
});
