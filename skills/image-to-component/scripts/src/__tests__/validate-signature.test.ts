import { describe, it, expect } from 'vitest';
import { validateBatchResult } from '../validate-signature.js';

const validBatch = {
  batch: 'batch-1',
  images: [
    {
      filename: 'pending.png',
      signature: {
        T: 'nav -> title',
        M: 'card(media + card(title -> meta) -> status)',
        B: 'action',
        O: '-',
        F: '-',
      },
      notes: { overlay_type: null, float_anchor: null, divider: 'dashed' },
    },
    {
      filename: 'used.png',
      signature: {
        T: 'nav -> title',
        M: 'card(media + card(title -> meta) -> status)',
        B: 'hint',
        O: '-',
        F: '-',
      },
      notes: { overlay_type: null, float_anchor: null, divider: 'dashed' },
    },
  ],
};

describe('validateBatchResult', () => {
  it('accepts a valid batch', () => {
    const result = validateBatchResult(validBatch, 'batch-1', ['pending.png', 'used.png']);
    expect(result.valid).toBe(true);
  });

  it('rejects when batch id does not match', () => {
    const result = validateBatchResult(validBatch, 'batch-2', ['pending.png', 'used.png']);
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.errors).toContain('batch id mismatch: expected "batch-2", got "batch-1"');
  });

  it('rejects when image count does not match', () => {
    const result = validateBatchResult(validBatch, 'batch-1', ['pending.png']);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.includes('image count'))).toBe(true);
  });

  it('rejects when filename includes a directory path', () => {
    const bad = {
      ...validBatch,
      images: [
        { ...validBatch.images[0]!, filename: 'screens/pending.png' },
        validBatch.images[1]!,
      ],
    };
    const result = validateBatchResult(bad, 'batch-1', ['pending.png', 'used.png']);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.includes('basename'))).toBe(true);
  });

  it('rejects invalid slot expression', () => {
    const bad = {
      ...validBatch,
      images: [
        {
          ...validBatch.images[0]!,
          signature: { T: 'section(title)', M: '-', B: '-', O: '-', F: '-' },
        },
        validBatch.images[1]!,
      ],
    };
    const result = validateBatchResult(bad, 'batch-1', ['pending.png', 'used.png']);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.includes('T slot'))).toBe(true);
  });

  it('rejects O not "-" without notes.overlay_type', () => {
    const bad = {
      ...validBatch,
      images: [
        {
          ...validBatch.images[0]!,
          signature: { ...validBatch.images[0]!.signature, O: 'card(title -> action)' },
          notes: { overlay_type: null, float_anchor: null },
        },
        validBatch.images[1]!,
      ],
    };
    const result = validateBatchResult(bad, 'batch-1', ['pending.png', 'used.png']);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.includes('overlay_type'))).toBe(true);
  });

  it('rejects forbidden notes key', () => {
    const bad = {
      ...validBatch,
      images: [
        {
          ...validBatch.images[0]!,
          notes: { overlay_type: null, float_anchor: null, bg: 'warm' } as never,
        },
        validBatch.images[1]!,
      ],
    };
    const result = validateBatchResult(bad, 'batch-1', ['pending.png', 'used.png']);
    expect(result.valid).toBe(false);
  });

  it('rejects duplicate filenames', () => {
    const bad = { ...validBatch, images: [validBatch.images[0]!, validBatch.images[0]!] };
    const result = validateBatchResult(bad, 'batch-1', ['pending.png', 'used.png']);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
  });
});
