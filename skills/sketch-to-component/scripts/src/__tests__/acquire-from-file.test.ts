import { TextEncoder } from 'node:util';
import { describe, expect, it } from 'vitest';

import { acquireFromFile } from '../acquire-from-file.js';
import { ExtractError } from '../errors.js';
import type { SketchArchive } from '../open-sketch-file.js';

const encoder = new TextEncoder();

function archive(entries: Record<string, string | Uint8Array>): SketchArchive {
  return {
    entries: new Map(
      Object.entries(entries).map(([path, value]) => [
        path,
        typeof value === 'string' ? encoder.encode(value) : value,
      ]),
    ),
  };
}

describe('acquireFromFile', () => {
  it('builds a deterministic whole-document SketchRawModel', () => {
    const model = acquireFromFile(
      archive({
        'pages/z-page.json': JSON.stringify({ name: 'Z page' }),
        'images/icon.png': new Uint8Array([1, 2, 3]),
        'pages/a-page.json': JSON.stringify({ name: 'A page' }),
        'fonts/font.ttf': new Uint8Array([4, 5]),
        'previews/preview.png': new Uint8Array([6]),
        'document.json': JSON.stringify({ do_objectID: 'doc-1' }),
        'meta.json': JSON.stringify({ app: 'Sketch' }),
        'images/': new Uint8Array(),
        'user.json': JSON.stringify({ ignored: true }),
        'ignored.json': JSON.stringify({ ignored: true }),
        'resources/blob.bin': new Uint8Array([7, 8, 9, 10]),
      }),
    );

    expect(model.document).toEqual({ do_objectID: 'doc-1' });
    expect(model.meta).toEqual({ app: 'Sketch' });
    expect(model.pages.map((page) => [page.id, page.path])).toEqual([
      ['a-page', 'pages/a-page.json'],
      ['z-page', 'pages/z-page.json'],
    ]);
    expect(model.assets).toEqual([
      { path: 'fonts/font.ttf', kind: 'font', byteLength: 2 },
      { path: 'images/icon.png', kind: 'image', byteLength: 3 },
      { path: 'previews/preview.png', kind: 'preview', byteLength: 1 },
      { path: 'resources/blob.bin', kind: 'other', byteLength: 4 },
    ]);
  });

  it('requires document.json', () => {
    expect(() =>
      acquireFromFile(
        archive({
          'meta.json': '{}',
          'pages/a-page.json': '{}',
        }),
      ),
    ).toThrowError(expect.objectContaining<Partial<ExtractError>>({ code: 'missing-entry' }));
  });

  it('requires meta.json', () => {
    expect(() =>
      acquireFromFile(
        archive({
          'document.json': JSON.stringify({ do_objectID: 'doc-1' }),
          'pages/a-page.json': '{}',
        }),
      ),
    ).toThrowError(expect.objectContaining<Partial<ExtractError>>({ code: 'missing-entry' }));
  });

  it('requires at least one pages/*.json entry', () => {
    expect(() =>
      acquireFromFile(
        archive({
          'document.json': JSON.stringify({ do_objectID: 'doc-1' }),
          'meta.json': '{}',
        }),
      ),
    ).toThrowError(expect.objectContaining<Partial<ExtractError>>({ code: 'missing-entry' }));
  });

  it('classifies bad JSON as bad-entry', () => {
    expect(() =>
      acquireFromFile(
        archive({
          'document.json': '{',
          'meta.json': '{}',
          'pages/a-page.json': '{}',
        }),
      ),
    ).toThrowError(expect.objectContaining<Partial<ExtractError>>({ code: 'bad-entry' }));
  });

  it('leaves documentId validation to extractRaw', () => {
    const model = acquireFromFile(
      archive({
        'document.json': JSON.stringify({ name: 'Sketch Document' }),
        'meta.json': JSON.stringify({ app: 'Sketch' }),
        'pages/a-page.json': '{}',
      }),
    );

    expect(model.document).toEqual({ name: 'Sketch Document' });
  });
});
