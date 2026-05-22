import { describe, expect, it } from 'vitest';

import { parseExtractArgs, parseNormalizeArgs, parsePreviewArgs } from '../cli.js';

describe('parseExtractArgs', () => {
  it('parses valid extract arguments', () => {
    expect(
      parseExtractArgs([
        'node',
        'cli.ts',
        'extract',
        '--file',
        '/tmp/mock.sketch',
        '--out',
        '/tmp/out',
      ]),
    ).toEqual({
      command: 'extract',
      filePath: '/tmp/mock.sketch',
      outDir: '/tmp/out',
    });
  });

  it('rejects another option flag as an argument value', () => {
    expect(
      parseExtractArgs(['node', 'cli.ts', 'extract', '--file', '--out', '/tmp/out']),
    ).toBeUndefined();
  });
});

describe('parseNormalizeArgs', () => {
  it('parses valid normalize arguments with an optional artboard', () => {
    expect(
      parseNormalizeArgs([
        'node',
        'cli.ts',
        'normalize',
        '--raw',
        '/tmp/raw-dsl.json',
        '--out',
        '/tmp/out',
        '--artboard',
        'screen-1',
      ]),
    ).toEqual({
      command: 'normalize',
      rawPath: '/tmp/raw-dsl.json',
      outDir: '/tmp/out',
      artboard: 'screen-1',
    });
  });

  it('rejects another option flag as a raw value', () => {
    expect(
      parseNormalizeArgs(['node', 'cli.ts', 'normalize', '--raw', '--out', '/tmp/out']),
    ).toBeUndefined();
  });
});

describe('parsePreviewArgs', () => {
  it('parses valid preview arguments', () => {
    expect(
      parsePreviewArgs([
        'node',
        'cli.ts',
        'preview',
        '--design-ir',
        '/tmp/design-ir.json',
        '--out',
        '/tmp/out',
      ]),
    ).toEqual({
      command: 'preview',
      designIrPath: '/tmp/design-ir.json',
      outDir: '/tmp/out',
    });
  });

  it('rejects another option flag as a design-ir value', () => {
    expect(
      parsePreviewArgs(['node', 'cli.ts', 'preview', '--design-ir', '--out', '/tmp/out']),
    ).toBeUndefined();
  });
});
