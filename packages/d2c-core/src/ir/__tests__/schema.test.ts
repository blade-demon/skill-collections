import { describe, it, expect } from 'vitest';
import { DesignIRSchema } from '../schema';
import minimalDesignIR from './fixtures/minimal-design-ir.json';

describe('DesignIRSchema', () => {
  it('parses the minimal design-ir fixture', () => {
    expect(DesignIRSchema.safeParse(minimalDesignIR).success).toBe(true);
  });

  it('accepts unknown fields inside the loose visual/semantic blocks', () => {
    const ir = {
      ...minimalDesignIR,
      visual: { page: { width: 375 }, anything: [1, 2, 3] },
      semantic: { candidates: [{ kind: 'card' }] },
    };
    expect(DesignIRSchema.safeParse(ir).success).toBe(true);
  });

  it('rejects unknown top-level keys', () => {
    const ir = { ...minimalDesignIR, extra: true };
    expect(DesignIRSchema.safeParse(ir).success).toBe(false);
  });

  it('rejects an empty source.ref (no trace anchor)', () => {
    const ir = { ...minimalDesignIR, source: { provider: 'mastergo', ref: {} } };
    expect(DesignIRSchema.safeParse(ir).success).toBe(false);
  });

  it('rejects a missing source block', () => {
    const { source, ...rest } = minimalDesignIR;
    void source;
    expect(DesignIRSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a malformed warnings entry', () => {
    const ir = { ...minimalDesignIR, warnings: [{ message: 'no code' }] };
    expect(DesignIRSchema.safeParse(ir).success).toBe(false);
  });

  it('rejects a malformed schemaVersion at the schema level', () => {
    const ir = { ...minimalDesignIR, schemaVersion: 'bogus' };
    expect(DesignIRSchema.safeParse(ir).success).toBe(false);
  });
});
