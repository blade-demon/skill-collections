import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareBatchInput } from '../compare-signatures.js';
import { caseA } from './fixtures/structural-comparison-cases.js';

describe('compareBatchInput', () => {
  it('flattens multiple batches and preserves image order', () => {
    const result = compareBatchInput({
      batches: [
        { ...caseA, batch: 'first', images: caseA.images.slice(0, 1) },
        { ...caseA, batch: 'second', images: caseA.images.slice(1) },
      ],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.result.skeletons.map((item) => item.filename)).toEqual([
        'pending.png',
        'used.png',
        'expired.png',
      ]);
    }
  });

  it('rejects duplicate filenames across batches', () => {
    const duplicate = caseA.images[0]!;
    const result = compareBatchInput({
      batches: [
        { batch: 'one', images: [duplicate] },
        { batch: 'two', images: [duplicate] },
      ],
    });
    expect(result).toEqual({
      valid: false,
      errors: ['image "pending.png": duplicate filename across batches'],
    });
  });

  it('collects slot errors in image and slot order', () => {
    const result = compareBatchInput({
      batches: [
        {
          batch: 'bad',
          images: [
            {
              filename: 'bad.png',
              signature: {
                T: 'title->meta',
                M: 'section(title)',
                B: '-',
                O: '-',
                F: '-',
              },
              notes: {},
            },
            caseA.images[1],
          ],
        },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain('image "bad.png" T slot');
      expect(result.errors[1]).toContain('image "bad.png" M slot');
    }
  });

  it('requires at least two images after flattening', () => {
    const result = compareBatchInput({
      batches: [{ batch: 'single', images: [caseA.images[0]] }],
    });
    expect(result).toEqual({
      valid: false,
      errors: ['at least 2 images are required for comparison'],
    });
  });
});

describe('compare-signatures process', () => {
  const cli = fileURLToPath(new URL('../compare-signatures.ts', import.meta.url));

  it('exits zero and prints valid JSON for Case A', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', cli], {
      input: JSON.stringify({ batches: [caseA] }),
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      valid: true,
      result: { decision: 'same-component' },
    });
  });

  it('exits nonzero for invalid JSON', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', cli], {
      input: '{not-json',
      encoding: 'utf8',
    });
    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout)).toEqual({
      valid: false,
      errors: ['input is not valid JSON'],
    });
  });

  it('flushes schema validation JSON larger than the pipe buffer before exiting', () => {
    const invalidImages = Array.from({ length: 5_000 }, () => ({
      filename: '',
      signature: { T: '-', M: '-', B: '-', O: '-', F: '-' },
      notes: {},
    }));
    const run = spawnSync(process.execPath, ['--import', 'tsx', cli], {
      input: JSON.stringify({ batches: [{ batch: 'invalid', images: invalidImages }] }),
      encoding: 'utf8',
    });

    expect(run.status).toBe(1);
    expect(run.stdout.length).toBeGreaterThan(65_536);
    const output = JSON.parse(run.stdout) as { valid: boolean; errors: string[] };
    expect(output.valid).toBe(false);
    expect(output.errors).toHaveLength(5_000);
  });
});
