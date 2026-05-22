import { describe, it, expect } from 'vitest';
import { RawArtifactSchema } from '../port';

const validRaw = {
  provider: 'mastergo',
  ref: { fileId: 'f1', nodeId: 'n1' },
  payload: { nodes: [] },
  capturedAt: '2026-05-20T00:00:00.000Z',
};

describe('RawArtifactSchema', () => {
  it('parses a valid raw artifact', () => {
    expect(RawArtifactSchema.safeParse(validRaw).success).toBe(true);
  });

  it('rejects a missing payload key', () => {
    const { payload, ...rest } = validRaw;
    void payload;
    expect(RawArtifactSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an explicit undefined payload', () => {
    expect(
      RawArtifactSchema.safeParse({ ...validRaw, payload: undefined }).success,
    ).toBe(false);
  });

  it('accepts a null payload (null is a defined value)', () => {
    expect(
      RawArtifactSchema.safeParse({ ...validRaw, payload: null }).success,
    ).toBe(true);
  });

  it('rejects an empty ref (no trace anchor)', () => {
    expect(RawArtifactSchema.safeParse({ ...validRaw, ref: {} }).success).toBe(false);
  });

  it('rejects a non-ISO capturedAt', () => {
    expect(
      RawArtifactSchema.safeParse({ ...validRaw, capturedAt: 'yesterday' }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      RawArtifactSchema.safeParse({ ...validRaw, extra: true }).success,
    ).toBe(false);
  });
});
