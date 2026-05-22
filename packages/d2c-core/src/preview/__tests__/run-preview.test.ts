import { describe, expect, it } from 'vitest';

import { runPreview } from '../run-preview';
import { makeDesignIR } from './fixtures';

describe('runPreview', () => {
  it('returns all preview artifacts and the gate-1 approval signal', () => {
    const result = runPreview(makeDesignIR());

    expect(result.requiresApproval).toBe('gate-1');
    expect(result.visualView.kind).toBe('visual-view');
    expect(result.visualViewJson).toContain('"kind": "visual-view"');
    expect(result.html).toContain('Applied override');
    expect(result.css).toContain('background-image: url("./assets/asset-hero.svg");');
    expect(result.report).toContain('Visual Review Report');
    expect(result.assets).toHaveLength(1);
    expect(result.stats).toEqual({
      overrideApplied: 1,
      overrideUnmapped: 1,
      overrideUnsupported: 1,
      placeholderAssets: 1,
    });
  });

  it('is byte-stable for the same design IR', () => {
    const first = runPreview(makeDesignIR());
    const second = runPreview(makeDesignIR());

    expect(second.visualViewJson).toBe(first.visualViewJson);
    expect(second.html).toBe(first.html);
    expect(second.css).toBe(first.css);
    expect(second.report).toBe(first.report);
    expect(JSON.stringify(second.assets)).toBe(JSON.stringify(first.assets));
  });
});
