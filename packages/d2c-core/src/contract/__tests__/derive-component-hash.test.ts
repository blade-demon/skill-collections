import { describe, expect, it } from 'vitest';

import { stableJson, stableSha256 } from '../../utils/stable-json';
import { deriveComponentPlan } from '../derive-component-plan';
import { interactiveInput, presentationalInput } from './component-plan-fixtures';

describe('deriveComponentPlan — hash chain validation', () => {
  it('throws when visualView.generatedFrom.designIrHash does not match the designIr', () => {
    const input = presentationalInput();
    const tampered = {
      ...input,
      visualView: {
        ...input.visualView,
        generatedFrom: { ...input.visualView.generatedFrom, designIrHash: 'deadbeef' },
      },
    };
    expect(() => deriveComponentPlan(tampered)).toThrowError(/visual-view designIrHash mismatch/);
  });

  it('throws when semanticView.generatedFrom.designIrHash does not match the designIr', () => {
    const input = presentationalInput();
    const tampered = {
      ...input,
      semanticView: {
        ...input.semanticView,
        generatedFrom: { ...input.semanticView.generatedFrom, designIrHash: 'deadbeef' },
      },
    };
    expect(() => deriveComponentPlan(tampered)).toThrowError(/semantic-view designIrHash mismatch/);
  });

  it('throws when semanticView.generatedFrom.visualViewHash does not match the visualView', () => {
    const input = presentationalInput();
    const tampered = {
      ...input,
      semanticView: {
        ...input.semanticView,
        generatedFrom: { ...input.semanticView.generatedFrom, visualViewHash: 'feedface' },
      },
    };
    expect(() => deriveComponentPlan(tampered)).toThrowError(
      /semantic-view visualViewHash mismatch/,
    );
  });

  it('throws when interactionSpec.generatedFrom.designIrHash does not match the designIr', () => {
    const input = presentationalInput();
    const tampered = {
      ...input,
      interactionSpec: {
        ...input.interactionSpec,
        generatedFrom: { ...input.interactionSpec.generatedFrom, designIrHash: 'deadbeef' },
      },
    };
    expect(() => deriveComponentPlan(tampered)).toThrowError(
      /interaction-spec designIrHash mismatch/,
    );
  });

  it('throws when interactionSpec.generatedFrom.visualViewHash does not match the visualView', () => {
    const input = presentationalInput();
    const tampered = {
      ...input,
      interactionSpec: {
        ...input.interactionSpec,
        generatedFrom: { ...input.interactionSpec.generatedFrom, visualViewHash: 'feedface' },
      },
    };
    expect(() => deriveComponentPlan(tampered)).toThrowError(
      /interaction-spec visualViewHash mismatch/,
    );
  });

  it('throws when interactionSpec.generatedFrom.semanticViewHash does not match the semanticView', () => {
    const input = presentationalInput();
    const tampered = {
      ...input,
      interactionSpec: {
        ...input.interactionSpec,
        generatedFrom: { ...input.interactionSpec.generatedFrom, semanticViewHash: 'cafebabe' },
      },
    };
    expect(() => deriveComponentPlan(tampered)).toThrowError(
      /interaction-spec semanticViewHash mismatch/,
    );
  });
});

describe('deriveComponentPlan — hash chain output', () => {
  it('writes all four hashes on generatedFrom (designIr / visualView / semanticView / interactionSpec)', () => {
    const input = interactiveInput();
    const { componentPlan } = deriveComponentPlan(input);

    expect(componentPlan.generatedFrom.designIrHash).toBe(stableSha256(stableJson(input.designIr)));
    expect(componentPlan.generatedFrom.visualViewHash).toBe(
      stableSha256(stableJson(input.visualView)),
    );
    expect(componentPlan.generatedFrom.semanticViewHash).toBe(
      stableSha256(stableJson(input.semanticView)),
    );
    expect(componentPlan.generatedFrom.interactionSpecHash).toBe(
      stableSha256(stableJson(input.interactionSpec)),
    );
  });

  it('preserves sourceRef from the upstream visualView', () => {
    const input = presentationalInput();
    const { componentPlan } = deriveComponentPlan(input);
    expect(componentPlan.generatedFrom.sourceRef).toEqual(input.visualView.generatedFrom.sourceRef);
  });

  it('preserves schemaVersion from the upstream designIr', () => {
    const input = presentationalInput();
    const { componentPlan } = deriveComponentPlan(input);
    expect(componentPlan.generatedFrom.schemaVersion).toBe(input.designIr.schemaVersion);
  });
});
