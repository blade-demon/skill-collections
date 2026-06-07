import { describe, it, expect } from 'vitest';
import { DESIGN_IR_SCHEMA_VERSION, isCompatible, parseSchemaVersion } from '../version';

describe('parseSchemaVersion', () => {
  it('parses a well-formed version', () => {
    expect(parseSchemaVersion('d2c.design-ir/v0.3.0')).toEqual({
      family: 'd2c.design-ir',
      version: { major: 0, minor: 3, patch: 0 },
    });
  });

  it('returns null for malformed input', () => {
    expect(parseSchemaVersion('v0.1.0')).toBeNull();
    expect(parseSchemaVersion('garbage')).toBeNull();
  });
});

describe('isCompatible', () => {
  it('accepts the current version', () => {
    expect(isCompatible(DESIGN_IR_SCHEMA_VERSION).ok).toBe(true);
  });

  it('ignores patch differences', () => {
    expect(isCompatible('d2c.design-ir/v0.3.9').ok).toBe(true);
  });

  it('classifies a malformed string', () => {
    expect(isCompatible('not-a-version')).toMatchObject({
      ok: false,
      code: 'malformed',
    });
  });

  it('classifies a family mismatch', () => {
    expect(isCompatible('other.ir/v0.2.0')).toMatchObject({
      ok: false,
      code: 'family-mismatch',
    });
  });

  it('classifies a major incompatibility', () => {
    expect(isCompatible('d2c.design-ir/v9.2.0')).toMatchObject({
      ok: false,
      code: 'major-incompatible',
    });
  });

  it('classifies a pre-1.0 minor incompatibility', () => {
    expect(isCompatible('d2c.design-ir/v0.9.0')).toMatchObject({
      ok: false,
      code: 'minor-incompatible',
    });
  });
});
