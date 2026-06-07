import { describe, it, expect } from 'vitest';
import { normalizeAndValidate, type Provider, type RawArtifact } from '../index';
import type { DesignIR } from '../../ir';
import minimalDesignIR from '../../ir/__tests__/fixtures/minimal-design-ir.json';

// The fixture's source.提供方 is "sketch", so a consistent provider/raw
// pair uses the same id.
const raw: RawArtifact = {
  提供方: 'sketch',
  ref: { fileName: 'minimal.sketch', documentId: 'doc-1' },
  payload: { nodes: [] },
  capturedAt: '2026-05-20T00:00:00.000Z',
};

describe('Provider port', () => {
  it('a provider implementing only the required methods type-checks and validates', async () => {
    // No exportAssets / exportReferenceFrame — optional capabilities omitted.
    const provider: Provider = {
      id: 'sketch',
      extractRaw: async () => raw,
      normalize: async () => minimalDesignIR as unknown as DesignIR,
    };

    const result = await normalizeAndValidate(provider, raw);
    expect(result.ok).toBe(true);
  });

  it('normalizeAndValidate surfaces an invalid normalize output', async () => {
    const brokenRaw: RawArtifact = { ...raw, 提供方: 'broken' };
    const provider: Provider = {
      id: 'broken',
      extractRaw: async () => brokenRaw,
      // Missing source / visual / semantic / interaction / warnings.
      normalize: async () => ({ schemaVersion: 'd2c.design-ir/v0.3.0' }) as unknown as DesignIR,
    };

    const result = await normalizeAndValidate(provider, brokenRaw);
    expect(result.ok).toBe(false);
  });

  it('rejects a raw artifact whose provider does not match the provider id', async () => {
    const provider: Provider = {
      id: 'sketch',
      extractRaw: async () => raw,
      normalize: async () => minimalDesignIR as unknown as DesignIR,
    };
    const foreignRaw: RawArtifact = { ...raw, 提供方: 'figma' };

    const result = await normalizeAndValidate(provider, foreignRaw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('does not match provider id');
  });

  it('rejects an IR whose source.提供方 does not match the provider id', async () => {
    // provider id is "figma" but the fixture IR says source.提供方 "sketch".
    const figmaRaw: RawArtifact = { ...raw, 提供方: 'figma' };
    const provider: Provider = {
      id: 'figma',
      extractRaw: async () => figmaRaw,
      normalize: async () => minimalDesignIR as unknown as DesignIR,
    };

    const result = await normalizeAndValidate(provider, figmaRaw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('source.提供方');
  });
});
