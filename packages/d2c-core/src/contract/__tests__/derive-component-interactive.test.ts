import { describe, expect, it } from 'vitest';

import { deriveComponentPlan } from '../derive-component-plan';
import { interactiveInput, withMode } from './component-plan-fixtures';
import {
  makeButtonyView,
  makeFoldableBoundSymbolInstancesView,
  makeInputComposerView,
} from './fixtures';

describe('deriveComponentPlan — interactive', () => {
  it('produces status=draft, mode=interactive, kind=component-plan from an approved interaction spec', () => {
    const { componentPlan } = deriveComponentPlan(interactiveInput());
    expect(componentPlan.kind).toBe('component-plan');
    expect(componentPlan.status).toBe('draft');
    expect(componentPlan.mode).toBe('interactive');
    expect(componentPlan.approval).toBeUndefined();
  });

  it('emits one eventBinding + one event-payload handler prop per interactionSpec.body.events entry', () => {
    const input = interactiveInput(makeButtonyView);
    const { componentPlan } = deriveComponentPlan(input);

    const allEventBindings = componentPlan.body.components.flatMap((c) => c.eventBindings);
    expect(allEventBindings).toHaveLength(input.interactionSpec.body.events.length);

    const handlerProps = componentPlan.body.components.flatMap((c) =>
      c.props.filter((p) => p.source === 'event-payload'),
    );
    expect(handlerProps).toHaveLength(input.interactionSpec.body.events.length);
    for (const prop of handlerProps) {
      expect(prop.required).toBe(true);
      expect(prop.name).toMatch(/^on/);
      expect(prop.interactionRefId).toMatch(/^ie_/);
    }
  });

  it('emits dataBindings + required data-model props for interactionSpec.body.dataModels', () => {
    const input = interactiveInput(makeInputComposerView);
    const { componentPlan } = deriveComponentPlan(input);

    const allDataBindings = componentPlan.body.components.flatMap((c) => c.dataBindings);
    expect(allDataBindings).toHaveLength(input.interactionSpec.body.dataModels.length);

    const dataProps = componentPlan.body.components.flatMap((c) =>
      c.props.filter((p) => p.source === 'data-model'),
    );
    expect(dataProps).toHaveLength(input.interactionSpec.body.dataModels.length);
    for (const prop of dataProps) {
      expect(prop.required).toBe(true);
      expect(prop.interactionRefId).toMatch(/^id_/);
    }
  });

  it('does NOT emit presentational-stub props in interactive mode', () => {
    const { componentPlan } = deriveComponentPlan(interactiveInput(makeInputComposerView));
    const stubProps = componentPlan.body.components.flatMap((c) =>
      c.props.filter((p) => p.source === 'presentational-stub'),
    );
    expect(stubProps).toHaveLength(0);
  });

  it('does not fold symbol instances whose bindings folding would drop', () => {
    const input = interactiveInput(makeFoldableBoundSymbolInstancesView);
    const { componentPlan, warnings } = deriveComponentPlan(input);
    const body = componentPlan.body;

    expect(body.componentDefinitions).toEqual([]);
    expect(body.componentInvocations).toEqual([]);
    expect(body.invocationEdges).toEqual([]);

    /* Both instances survive with their click bindings intact. */
    const boundComponents = body.components.filter((c) => c.eventBindings.length > 0);
    expect(boundComponents).toHaveLength(2);
    const allEventBindings = body.components.flatMap((c) => c.eventBindings);
    expect(allEventBindings.map((binding) => binding.eventId).sort()).toEqual(
      input.interactionSpec.body.events.map((event) => event.id).sort(),
    );
    expect(body.exports).toHaveLength(3);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: 'component-reuse-fallback',
        message: expect.stringMatching(/master-send.*interaction bindings/i),
      }),
    );
  });

  it('throws when mode=interactive is paired with a non-approved interaction spec', () => {
    /* presentationalInput defaults to deferred — switch mode without
     * re-approving the spec. */
    const draftedSpec = interactiveInput();
    const tampered = {
      ...draftedSpec,
      interactionSpec: {
        ...draftedSpec.interactionSpec,
        status: 'deferred' as const,
        reason: 'manually downgraded for test',
      },
    };
    /* the cast above produces an object that's no longer a valid
     * InteractionSpec (deferred branch requires extra fields), but we
     * only need to verify derive rejects the combo before parse. */
    expect(() =>
      deriveComponentPlan(tampered as unknown as ReturnType<typeof interactiveInput>),
    ).toThrowError(/mode='interactive' requires interaction-spec status='approved'/);
  });

  it('throws when mode=presentational is paired with an approved interaction spec', () => {
    const approved = interactiveInput();
    expect(() => deriveComponentPlan(withMode(approved, 'presentational'))).toThrowError(
      /mode='presentational' is not compatible with an 'approved' interaction-spec/,
    );
  });
});
