import { describe, expect, it } from 'vitest';

import { deriveComponentPlan } from '../../contract/derive-component-plan';
import {
  interactiveInput,
  makeMixedTextMediaView,
  presentationalInput,
} from '../../contract/__tests__/component-plan-fixtures';
import { generateComponentPackage } from '../generate';
import type { CodegenInput } from '../target';

describe('generateComponentPackage — guards', () => {
  it('refuses to generate an interactive plan (presentational only in v1)', () => {
    const input = interactiveInput();
    const { componentPlan } = deriveComponentPlan(input);
    const codegenInput: CodegenInput = {
      componentPlan,
      semanticView: input.semanticView,
      interactionSpec: input.interactionSpec,
    };
    expect(() => generateComponentPackage(codegenInput)).toThrow(/presentational/i);
  });

  it('warns and does not emit asset files when the plan carries assets (post-v1)', () => {
    const input = presentationalInput(makeMixedTextMediaView);
    const { componentPlan } = deriveComponentPlan(input);
    expect(componentPlan.body.assetPlan.length, 'fixture should carry an asset').toBeGreaterThan(0);

    const result = generateComponentPackage({
      componentPlan,
      semanticView: input.semanticView,
      interactionSpec: input.interactionSpec,
    });

    expect(result.warnings.some((w) => /asset/i.test(w))).toBe(true);
    expect(result.files.some((f) => f.path.includes('/assets/'))).toBe(false);
  });
});
