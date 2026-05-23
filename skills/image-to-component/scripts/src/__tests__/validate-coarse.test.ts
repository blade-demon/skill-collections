import { describe, it, expect } from 'vitest';
import { validateCoarseBatchResult } from '../validate-coarse.js';

const validCoarse = {
  batch: 'batch-1',
  images: [
    {
      filename: 'a.png',
      coarse_signature: { T: ['nav'], M: ['card'], B: ['action'] },
      needs_full_signature: true,
      reason: 'slot contains nested container',
    },
    {
      filename: 'b.png',
      coarse_signature: { T: ['title'], M: ['list'], B: ['action'] },
      needs_full_signature: false,
      reason: 'stable top-level skeleton',
    },
  ],
};

describe('validateCoarseBatchResult', () => {
  it('accepts valid coarse batch', () => {
    const result = validateCoarseBatchResult(validCoarse, 'batch-1', ['a.png', 'b.png']);
    expect(result.valid).toBe(true);
  });

  it('rejects unknown role in coarse slot', () => {
    const bad = {
      ...validCoarse,
      images: [
        {
          ...validCoarse.images[0]!,
          coarse_signature: { T: ['unknown'], M: ['card'], B: ['action'] },
        },
        validCoarse.images[1]!,
      ],
    };
    const result = validateCoarseBatchResult(bad as never, 'batch-1', ['a.png', 'b.png']);
    expect(result.valid).toBe(false);
  });

  it('rejects role with operators in coarse slot', () => {
    const bad = {
      ...validCoarse,
      images: [
        {
          ...validCoarse.images[0]!,
          coarse_signature: { T: ['nav -> title'], M: ['card'], B: ['action'] },
        },
        validCoarse.images[1]!,
      ],
    };
    const result = validateCoarseBatchResult(bad as never, 'batch-1', ['a.png', 'b.png']);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.includes('operator'))).toBe(true);
  });

  it('rejects invalid reason string', () => {
    const bad = {
      ...validCoarse,
      images: [{ ...validCoarse.images[0]!, reason: 'my custom reason' }, validCoarse.images[1]!],
    };
    const result = validateCoarseBatchResult(bad as never, 'batch-1', ['a.png', 'b.png']);
    expect(result.valid).toBe(false);
  });

  it('rejects batch id mismatch', () => {
    const result = validateCoarseBatchResult(validCoarse, 'batch-2', ['a.png', 'b.png']);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.includes('batch id'))).toBe(true);
  });
});
