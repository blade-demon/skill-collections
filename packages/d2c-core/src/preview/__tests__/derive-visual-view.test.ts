import { describe, expect, it } from 'vitest';

import { deriveVisualView } from '../derive-visual-view';
import { stableJson, stableSha256 } from '../stable-json';
import { makeDesignIR } from './fixtures';

describe('deriveVisualView', () => {
  it('creates a visual-view with a VisualBlock body and stable provenance hash', () => {
    const designIr = makeDesignIR();
    const result = deriveVisualView(designIr);

    expect(result.visualView.kind).toBe('visual-view');
    expect(result.visualView.generatedFrom).toEqual({
      schemaVersion: 'd2c.design-ir/v0.2.0',
      sourceRef: { fileName: 'fixture.sketch', documentId: 'doc-1' },
      designIrHash: stableSha256(stableJson(designIr)),
    });
    expect(result.visualView.body.root.children[0]?.children[0]?.text?.content).toBe(
      'Applied override',
    );
    expect(result.stats.overrideApplied).toBe(1);
    expect(result.warnings.some((warning) => warning.code === 'unmapped-symbol-override')).toBe(true);
  });

  it('uses stable JSON independent of object key insertion order', () => {
    const first = { b: 2, a: { y: 1, x: 0 } };
    const second = { a: { x: 0, y: 1 }, b: 2 };

    expect(stableJson(first)).toBe(stableJson(second));
    expect(stableSha256(stableJson(first))).toBe(stableSha256(stableJson(second)));
  });
});
