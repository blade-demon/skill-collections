/**
 * Stage 5A-PR-3 integration — derive output → SemanticViewSchema envelope.
 *
 * Confirms that `deriveSemanticView` produces a value that round-trips
 * through the (now tight) `SemanticViewSchema` from `../../ir/views`,
 * not just `SemanticViewBodySchema` from `../schema`. This is the actual
 * surface external consumers will validate against, so the test catches
 * any envelope-vs-body drift the body-only tests miss.
 */
import { describe, expect, it } from 'vitest';

import { SemanticViewSchema } from '../../ir';
import { deriveSemanticView } from '../derive';
import {
  makeAmbiguousGroupView,
  makeDecorativeBgView,
  makeFullChatView,
  makeListView,
  makeSymbolHeavyView,
} from './fixtures';

const fixtures = [
  ['symbol-heavy', makeSymbolHeavyView],
  ['list', makeListView],
  ['ambiguous-groups', makeAmbiguousGroupView],
  ['decorative-bg', makeDecorativeBgView],
  ['full-chat', makeFullChatView],
] as const;

describe('SemanticView envelope integration', () => {
  for (const [name, maker] of fixtures) {
    it(`deriveSemanticView(${name}) output passes SemanticViewSchema end-to-end`, () => {
      const { semanticView } = deriveSemanticView(maker());
      const parsed = SemanticViewSchema.safeParse(semanticView);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(
        true,
      );
    });
  }

  it('derive populates both designIrHash and visualViewHash on generatedFrom', () => {
    const { semanticView } = deriveSemanticView(makeFullChatView());
    expect(semanticView.kind).toBe('semantic-view');
    expect(semanticView.generatedFrom.designIrHash).toMatch(/^[0-9a-f]{64}$/);
    expect(semanticView.generatedFrom.visualViewHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derive output preserves sourceRef from the upstream visual-view when present', () => {
    const fx = makeListView();
    const { semanticView } = deriveSemanticView(fx);
    expect(semanticView.generatedFrom.sourceRef).toEqual(fx.visualView.generatedFrom.sourceRef);
  });
});
