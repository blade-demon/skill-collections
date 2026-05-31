import { TextDecoder, TextEncoder } from 'node:util';
import { isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { RawArtifactSchema } from '@skill-collections/d2c-core';

import { ExtractError } from '../errors.js';
import { extractImageAssets, extractRaw } from '../extract-raw.js';
import type { SketchRawModel } from '../sketch-raw-model.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function makeSketchZip(entries?: Partial<Record<string, string>>): Uint8Array {
  const defaultEntries = {
    'document.json': JSON.stringify({ do_objectID: 'doc-1' }),
    'meta.json': JSON.stringify({ app: 'Sketch' }),
    'pages/a-page.json': JSON.stringify({ name: 'A page' }),
  };
  return zipSync(
    Object.fromEntries(
      Object.entries({ ...defaultEntries, ...entries }).map(([path, content]) => [
        path,
        encoder.encode(content),
      ]),
    ),
  );
}

describe('extractRaw', () => {
  it('extracts a file input into a d2c-core RawArtifact', async () => {
    const raw = await extractRaw(
      { source: 'file', filePath: './mock.sketch' },
      {
        readFile: async () => makeSketchZip(),
        now: () => new Date('2026-05-21T00:00:00.000Z'),
      },
    );

    expect(RawArtifactSchema.safeParse(raw).success).toBe(true);
    expect(raw.provider).toBe('sketch');
    expect(raw.ref.fileName).toBe('mock.sketch');
    expect(raw.ref.documentId).toBe('doc-1');
    expect(typeof raw.ref.filePath).toBe('string');
    expect(isAbsolute(raw.ref.filePath ?? '')).toBe(true);
    expect(raw.capturedAt).toBe('2026-05-21T00:00:00.000Z');
    expect((raw.payload as SketchRawModel).pages).toHaveLength(1);
  });

  it('surfaces invalid SketchRawModel data as bad-entry', async () => {
    await expect(
      extractRaw(
        { source: 'file', filePath: './bad.sketch' },
        {
          readFile: async () => makeSketchZip({ 'document.json': '{}' }),
          now: () => new Date('2026-05-21T00:00:00.000Z'),
        },
      ),
    ).rejects.toMatchObject({ code: 'bad-entry' } satisfies Partial<ExtractError>);
  });
});

describe('extractImageAssets', () => {
  it('mirrors real image bytes from the images/ folder, preserving file names', async () => {
    const images = await extractImageAssets(
      { source: 'file', filePath: './mock.sketch' },
      {
        readFile: async () =>
          makeSketchZip({
            'images/zz-second.png': 'SECOND-BYTES',
            'images/aa-first.png': 'FIRST-BYTES',
          }),
      },
    );

    // sorted by file name for deterministic output
    expect(images.map((i) => i.fileName)).toEqual(['aa-first.png', 'zz-second.png']);
    expect(images[0]?.sourcePath).toBe('images/aa-first.png');
    expect(decoder.decode(images[0]?.bytes)).toBe('FIRST-BYTES');
    expect(decoder.decode(images[1]?.bytes)).toBe('SECOND-BYTES');
  });

  it('returns an empty list when the archive has no images', async () => {
    const images = await extractImageAssets(
      { source: 'file', filePath: './mock.sketch' },
      { readFile: async () => makeSketchZip() },
    );
    expect(images).toEqual([]);
  });
});
