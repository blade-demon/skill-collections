import { describe, expect, it } from 'vitest';

import { deriveComponentPlan } from '../derive-component-plan';
import {
  makeFoldableSymbolInstancesView,
  makeMismatchedSymbolInstancesView,
  presentationalInput,
} from './component-plan-fixtures';
import { bridgedList, makeMixedTextMediaView } from './fixtures';

describe('deriveComponentPlan — presentational (deferred interaction)', () => {
  it('produces status=draft, mode=presentational, kind=component-plan', () => {
    const { componentPlan } = deriveComponentPlan(presentationalInput());
    expect(componentPlan.kind).toBe('component-plan');
    expect(componentPlan.status).toBe('draft');
    expect(componentPlan.mode).toBe('presentational');
    expect(componentPlan.approval).toBeUndefined();
  });

  it('rootComponent is built from the screen node and also appears in body.components', () => {
    const { componentPlan } = deriveComponentPlan(presentationalInput());
    const { rootComponent, components } = componentPlan.body;
    expect(rootComponent.role).toBe('root');
    expect(rootComponent.renderAs).toBe('component');
    const head = components[0];
    expect(head?.id).toBe(rootComponent.id);
  });

  it('consumes interactionSpec.dataModels as optional presentational-stub props', () => {
    const input = presentationalInput();
    const { componentPlan } = deriveComponentPlan(input);
    const stubProps = componentPlan.body.components.flatMap((c) =>
      c.props.filter((p) => p.source === 'presentational-stub'),
    );
    expect(stubProps.length).toBeGreaterThan(0);
    for (const prop of stubProps) {
      expect(prop.required).toBe(false);
      expect(prop.interactionRefId).toMatch(/^id_/);
    }
    /* exactly one stub prop per interaction data model. */
    expect(stubProps).toHaveLength(input.interactionSpec.body.dataModels.length);
  });

  it('does NOT emit any event bindings or handler props in presentational mode', () => {
    const { componentPlan } = deriveComponentPlan(presentationalInput());
    for (const component of componentPlan.body.components) {
      expect(component.eventBindings).toHaveLength(0);
      expect(component.props.filter((p) => p.source === 'event-payload')).toHaveLength(0);
    }
  });

  it('snapshots interactionSpec.body.coverage into componentPlan.body.interactionCoverage', () => {
    const input = presentationalInput();
    const { componentPlan } = deriveComponentPlan(input);
    expect(componentPlan.body.interactionCoverage).toEqual(input.interactionSpec.body.coverage);
  });

  it('produces exports: one default for root + one named per candidate component', () => {
    const { componentPlan } = deriveComponentPlan(presentationalInput());
    const defaults = componentPlan.body.exports.filter((e) => e.kind === 'default');
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.plannedComponentId).toBe(componentPlan.body.rootComponent.id);
    const candidates = componentPlan.body.components.length - 1; /* minus root */
    expect(componentPlan.body.exports.filter((e) => e.kind === 'named')).toHaveLength(candidates);
  });

  it('writes interactionSpecHash on generatedFrom', () => {
    const { componentPlan } = deriveComponentPlan(presentationalInput());
    expect(componentPlan.generatedFrom.interactionSpecHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('emits a layout entry for the root component (absolute fallback when no candidate matched)', () => {
    const { componentPlan } = deriveComponentPlan(presentationalInput());
    const rootLayout = componentPlan.body.layoutPlan.find(
      (l) => l.semanticNodeId === componentPlan.body.rootComponent.semanticNodeId,
    );
    expect(rootLayout).toBeDefined();
  });

  it('emits assetPlan entries for media + icon semantic nodes', () => {
    const { componentPlan } = deriveComponentPlan(presentationalInput(makeMixedTextMediaView));
    expect(componentPlan.body.assetPlan.length).toBeGreaterThan(0);
    for (const asset of componentPlan.body.assetPlan) {
      expect(asset.usage).toMatch(/^(image|icon)$/);
      expect(asset.required).toBe(true);
    }
    const hasImage = componentPlan.body.assetPlan.some((a) => a.usage === 'image');
    expect(hasImage).toBe(true);
  });

  it('emits empty reuse arrays for plans without repeated symbol masters', () => {
    const { componentPlan } = deriveComponentPlan(presentationalInput());

    expect(componentPlan.body.componentDefinitions).toEqual([]);
    expect(componentPlan.body.componentInvocations).toEqual([]);
    expect(componentPlan.body.invocationEdges).toEqual([]);
    expect(componentPlan.body.collections).toEqual([]);
  });

  it('folds identical symbol-master components to one definition and one export', () => {
    const { componentPlan, warnings } = deriveComponentPlan(
      presentationalInput(makeFoldableSymbolInstancesView),
    );
    const body = componentPlan.body;

    expect(body.componentDefinitions).toHaveLength(1);
    expect(body.componentInvocations).toHaveLength(2);
    expect(body.invocationEdges).toHaveLength(2);
    expect(body.collections).toEqual([]);
    expect(
      body.components.filter((component) => component.name.startsWith('StatusBar')),
    ).toHaveLength(1);
    expect(body.exports.filter((entry) => entry.exportName.startsWith('StatusBar'))).toHaveLength(
      1,
    );
    expect(warnings).toEqual([]);
  });

  it('keeps non-identical instances separate and emits fallback warnings', () => {
    const input = presentationalInput(makeMismatchedSymbolInstancesView);
    const candidateCount = input.semanticView.body.componentCandidates.length;
    const { componentPlan, warnings } = deriveComponentPlan(input);

    expect(componentPlan.body.componentDefinitions).toEqual([]);
    expect(componentPlan.body.componentInvocations).toEqual([]);
    expect(componentPlan.body.components).toHaveLength(candidateCount + 1);
    expect(componentPlan.body.exports).toHaveLength(candidateCount + 1);
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'component-reuse-fallback',
        message: expect.stringMatching(/master-card was not folded: geometry differs at/),
      }),
    ]);
    expect(componentPlan.body.warnings).toEqual(warnings);
  });
});

describe('deriveComponentPlan — presentational (omitted interaction)', () => {
  it('does not consume dataModels when interaction is omitted', () => {
    /* omitted spec has no dataModels by construction, so derive should
     * just emit zero stub props. */
    const input = presentationalInput(bridgedList, { interactionMode: 'omitted' });
    const { componentPlan } = deriveComponentPlan(input);
    const stubProps = componentPlan.body.components.flatMap((c) =>
      c.props.filter((p) => p.source === 'presentational-stub'),
    );
    expect(stubProps).toHaveLength(0);
  });
});
