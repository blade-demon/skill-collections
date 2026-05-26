import { describe, expect, it } from 'vitest';

import { InteractionSpecSchema } from '../../ir/views';
import { stableJson, stableSha256 } from '../../utils/stable-json';
import { deriveInteractionSpec } from '../derive-interaction';
import {
  bridgedFullChat,
  bridgedList,
  makeButtonyView,
  makeInputComposerView,
  makeMixedTextMediaView,
} from './fixtures';

const approval = {
  reason: 'presentational delivery approved for Stage 5B integration test',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
};

const fixtures = [
  ['bridgedFullChat', bridgedFullChat],
  ['bridgedList', bridgedList],
  ['makeButtonyView', makeButtonyView],
  ['makeInputComposerView', makeInputComposerView],
  ['makeMixedTextMediaView', makeMixedTextMediaView],
] as const;

describe('InteractionSpecSchema integration through ir/views', () => {
  for (const [fixtureName, makeInput] of fixtures) {
    it(`${fixtureName}: parses deriveInteractionSpec output for draft / omitted / deferred`, () => {
      const input = makeInput();

      const results = [
        deriveInteractionSpec(input).interactionSpec,
        deriveInteractionSpec({ ...input, mode: 'omitted', approval }).interactionSpec,
        deriveInteractionSpec({ ...input, mode: 'deferred', approval }).interactionSpec,
      ];

      for (const spec of results) {
        expect(InteractionSpecSchema.safeParse(spec).success).toBe(true);
        expect(spec.generatedFrom.designIrHash).toBe(stableSha256(stableJson(input.designIr)));
        expect(spec.generatedFrom.visualViewHash).toBe(stableSha256(stableJson(input.visualView)));
        expect(spec.generatedFrom.semanticViewHash).toBe(
          stableSha256(stableJson(input.semanticView)),
        );
        expect(spec.generatedFrom.sourceRef).toEqual(input.visualView.generatedFrom.sourceRef);
      }
    });
  }
});
