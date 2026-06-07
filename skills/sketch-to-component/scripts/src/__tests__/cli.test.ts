import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { confineOutDir, parseExtractArgs, parseNormalizeArgs, parsePreviewArgs } from '../cli.js';

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

describe('confineOutDir', () => {
  const cwd = '/work/project';

  it('resolves a relative subdir under the current folder', () => {
    expect(confineOutDir('out', cwd)).toBe(join(cwd, 'out'));
    expect(confineOutDir('build/d2c', cwd)).toBe(join(cwd, 'build', 'd2c'));
  });

  it('allows the current folder itself', () => {
    expect(confineOutDir('.', cwd)).toBe(resolve(cwd));
  });

  it('normalizes interior traversal that stays inside', () => {
    expect(confineOutDir('out/../dist', cwd)).toBe(join(cwd, 'dist'));
  });

  it('accepts an absolute path that lives inside the current folder', () => {
    expect(confineOutDir(join(cwd, 'nested', 'out'), cwd)).toBe(join(cwd, 'nested', 'out'));
  });

  it('rejects a parent-relative path that escapes the current folder', () => {
    expect(() => confineOutDir('..', cwd)).toThrow(/\[bad-out-dir\]/);
    expect(() => confineOutDir('../sibling', cwd)).toThrow(/\[bad-out-dir\]/);
    expect(() => confineOutDir('out/../../escape', cwd)).toThrow(/\[bad-out-dir\]/);
  });

  it('rejects an absolute path outside the current folder', () => {
    expect(() => confineOutDir('/tmp/elsewhere', cwd)).toThrow(/\[bad-out-dir\]/);
  });

  it('names the offending flag in the rejection message (e.g. approve --spec)', () => {
    expect(() => confineOutDir('../escape', cwd, '--spec')).toThrow(/--spec must stay inside/);
  });
});
