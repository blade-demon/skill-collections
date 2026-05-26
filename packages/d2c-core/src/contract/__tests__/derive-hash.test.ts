import { describe, expect, it } from 'vitest';

import { stableJson, stableSha256 } from '../../utils/stable-json';
import { deriveInteractionSpec } from '../derive-interaction';
import { bridgedList } from './fixtures';

describe('deriveInteractionSpec — hash chain validation', () => {
  it('throws when visualView.generatedFrom.designIrHash does not match the IR', () => {
    const input = bridgedList();
    const tampered = {
      ...input,
      visualView: {
        ...input.visualView,
        generatedFrom: { ...input.visualView.generatedFrom, designIrHash: 'deadbeef' },
      },
    };
    expect(() => deriveInteractionSpec(tampered)).toThrowError(/visual-view designIrHash mismatch/);
  });

  it('throws when semanticView.generatedFrom.designIrHash does not match the IR', () => {
    const input = bridgedList();
    const tampered = {
      ...input,
      semanticView: {
        ...input.semanticView,
        generatedFrom: { ...input.semanticView.generatedFrom, designIrHash: 'deadbeef' },
      },
    };
    expect(() => deriveInteractionSpec(tampered)).toThrowError(
      /semantic-view designIrHash mismatch/,
    );
  });

  it('throws when semanticView.generatedFrom.visualViewHash does not match the visualView', () => {
    const input = bridgedList();
    const tampered = {
      ...input,
      semanticView: {
        ...input.semanticView,
        generatedFrom: { ...input.semanticView.generatedFrom, visualViewHash: 'feedface' },
      },
    };
    expect(() => deriveInteractionSpec(tampered)).toThrowError(
      /semantic-view visualViewHash mismatch/,
    );
  });
});

describe('deriveInteractionSpec — hash chain output', () => {
  it('writes all three hashes (designIr / visualView / semanticView) on generatedFrom', () => {
    const input = bridgedList();
    const { interactionSpec } = deriveInteractionSpec(input);

    expect(interactionSpec.generatedFrom.designIrHash).toBe(
      stableSha256(stableJson(input.designIr)),
    );
    expect(interactionSpec.generatedFrom.visualViewHash).toBe(
      stableSha256(stableJson(input.visualView)),
    );
    expect(interactionSpec.generatedFrom.semanticViewHash).toBe(
      stableSha256(stableJson(input.semanticView)),
    );
  });

  it('preserves sourceRef from the upstream visualView', () => {
    const input = bridgedList();
    const { interactionSpec } = deriveInteractionSpec(input);
    expect(interactionSpec.generatedFrom.sourceRef).toEqual(
      input.visualView.generatedFrom.sourceRef,
    );
  });
});
