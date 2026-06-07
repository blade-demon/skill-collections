import { describe, expect, it } from 'vitest';

import * as rootD2c from '../../index';
import * as contractBarrel from '../index';
import { ComponentPlanSchema as ComponentPlanSchemaFromContract } from '../component-plan-schema';
import {
  ComponentPlanSchema as ComponentPlanSchemaFromViews,
  ComponentPlanModeSchema as ComponentPlanModeSchemaFromViews,
} from '../../ir/views';
import { deriveComponentPlan } from '../derive-component-plan';
import { interactiveInput, presentationalInput } from './component-plan-fixtures';

/**
 * Stage 5C-PR-3 integration: lock in that the canonical
 * `ComponentPlanSchema` flows correctly through both the contract barrel
 * and the legacy `ir/views.ts` re-export, and that real `deriveComponentPlan`
 * output round-trips through each public-surface entry.
 */
describe('component-plan wiring across barrels (Stage 5C)', () => {
  it('the canonical ComponentPlanSchema is the same binding from contract/, ir/views, and the root barrel', () => {
    const rootExports = rootD2c as unknown as Record<string, unknown>;
    expect(ComponentPlanSchemaFromViews).toBe(ComponentPlanSchemaFromContract);
    expect(contractBarrel.ComponentPlanSchema).toBe(ComponentPlanSchemaFromContract);
    expect(rootExports.ComponentPlanSchema).toBe(ComponentPlanSchemaFromContract);
  });

  it('the canonical ComponentPlanModeSchema is the same binding from contract/, ir/views, and the root barrel', () => {
    const rootExports = rootD2c as unknown as Record<string, unknown>;
    expect(ComponentPlanModeSchemaFromViews).toBe(contractBarrel.ComponentPlanModeSchema);
    expect(rootExports.ComponentPlanModeSchema).toBe(contractBarrel.ComponentPlanModeSchema);
  });

  it('contract barrel exports deriveComponentPlan + integrity validator', () => {
    expect(typeof contractBarrel.deriveComponentPlan).toBe('function');
    expect(typeof contractBarrel.assertComponentPlanIntegrity).toBe('function');
  });

  it('ir/views.ts no longer exports a loose ComponentPlanSchema — body shape is the canonical one', () => {
    /* A loose body like `{}` used to pass the Stage 5B+ era envelope. With
     * the canonical schema in place, the envelope rejects it. */
    expect(
      ComponentPlanSchemaFromViews.safeParse({
        kind: 'component-plan',
        generatedFrom: {
          schemaVersion: 'd2c.design-ir/v0.3.0',
          designIrHash: 'a'.repeat(64),
          visualViewHash: 'b'.repeat(64),
          semanticViewHash: 'c'.repeat(64),
          interactionSpecHash: 'd'.repeat(64),
        },
        status: 'draft',
        mode: 'presentational',
        body: {},
      }).success,
    ).toBe(false);
  });

  it('deriveComponentPlan output (presentational) parses through each public-surface entry', () => {
    const { componentPlan } = deriveComponentPlan(presentationalInput());
    expect(ComponentPlanSchemaFromContract.safeParse(componentPlan).success).toBe(true);
    expect(ComponentPlanSchemaFromViews.safeParse(componentPlan).success).toBe(true);
    expect(contractBarrel.ComponentPlanSchema.safeParse(componentPlan).success).toBe(true);
    const rootExports = rootD2c as unknown as {
      ComponentPlanSchema: typeof ComponentPlanSchemaFromContract;
    };
    expect(rootExports.ComponentPlanSchema.safeParse(componentPlan).success).toBe(true);
  });

  it('deriveComponentPlan output (interactive) parses through each public-surface entry', () => {
    const { componentPlan } = deriveComponentPlan(interactiveInput());
    expect(ComponentPlanSchemaFromContract.safeParse(componentPlan).success).toBe(true);
    expect(ComponentPlanSchemaFromViews.safeParse(componentPlan).success).toBe(true);
    expect(contractBarrel.ComponentPlanSchema.safeParse(componentPlan).success).toBe(true);
  });
});
