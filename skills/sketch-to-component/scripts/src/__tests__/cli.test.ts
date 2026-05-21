import { describe, expect, it } from 'vitest';

import { parseExtractArgs } from '../cli.js';

describe('parseExtractArgs', () => {
  it('parses valid extract arguments', () => {
    expect(
      parseExtractArgs(['node', 'cli.ts', 'extract', '--file', '/tmp/mock.sketch', '--out', '/tmp/out']),
    ).toEqual({
      command: 'extract',
      filePath: '/tmp/mock.sketch',
      outDir: '/tmp/out',
    });
  });

  it('rejects another option flag as an argument value', () => {
    expect(parseExtractArgs(['node', 'cli.ts', 'extract', '--file', '--out', '/tmp/out'])).toBeUndefined();
  });
});
