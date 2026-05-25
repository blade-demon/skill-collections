import { describe, expect, it } from 'vitest';

import { SemanticViewBodySchema } from '../schema';
import { deriveSemanticView } from '../derive';
import { stableJson, stableSha256 } from '../../utils/stable-json';
import { makeFullChatView, makeListView, makeSymbolHeavyView } from './fixtures';

describe('deriveSemanticView — hash chain and output validation', () => {
  it('throws when visualView.generatedFrom.designIrHash does not match the IR', () => {
    const fx = makeListView();
    const corrupted = {
      designIr: fx.designIr,
      visualView: {
        ...fx.visualView,
        generatedFrom: { ...fx.visualView.generatedFrom, designIrHash: 'deadbeef' },
      },
    };
    expect(() => deriveSemanticView(corrupted)).toThrowError(/designIrHash mismatch/);
  });

  it('writes a visualViewHash that matches stableSha256(stableJson(visualView))', () => {
    const fx = makeListView();
    const { semanticView } = deriveSemanticView(fx);
    expect(semanticView.generatedFrom.visualViewHash).toBe(stableSha256(stableJson(fx.visualView)));
  });

  it('writes a designIrHash that matches stableSha256(stableJson(designIr))', () => {
    const fx = makeListView();
    const { semanticView } = deriveSemanticView(fx);
    expect(semanticView.generatedFrom.designIrHash).toBe(stableSha256(stableJson(fx.designIr)));
  });

  it('output body parses against SemanticViewBodySchema for every fixture', () => {
    const fixtures = [makeSymbolHeavyView(), makeListView(), makeFullChatView()];
    for (const fx of fixtures) {
      const { semanticView } = deriveSemanticView(fx);
      const parsed = SemanticViewBodySchema.safeParse(semanticView.body);
      expect(parsed.success).toBe(true);
    }
  });
});
