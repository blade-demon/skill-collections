import { describe, it, expect } from 'vitest';
import { assertDesignIR, validateDesignIR } from '../validate';
import minimalDesignIR from './fixtures/minimal-design-ir.json';

describe('validateDesignIR', () => {
  it('accepts the minimal fixture', () => {
    expect(validateDesignIR(minimalDesignIR).ok).toBe(true);
  });

  it('rejects an incompatible schemaVersion', () => {
    const result = validateDesignIR({
      ...minimalDesignIR,
      schemaVersion: 'd2c.design-ir/v9.0.0',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('major-incompatible');
  });

  it('rejects a malformed schemaVersion', () => {
    const result = validateDesignIR({ ...minimalDesignIR, schemaVersion: 'bogus' });
    expect(result.ok).toBe(false);
  });

  it('rejects a missing source trace', () => {
    const result = validateDesignIR({
      ...minimalDesignIR,
      source: { provider: 'mastergo', ref: {} },
    });
    expect(result.ok).toBe(false);
  });
});

describe('assertDesignIR', () => {
  it('throws on invalid input', () => {
    expect(() => assertDesignIR({})).toThrow(/Invalid DesignIR/);
  });

  it('returns the typed value on valid input', () => {
    expect(assertDesignIR(minimalDesignIR).source.provider).toBe('mastergo');
  });
});
