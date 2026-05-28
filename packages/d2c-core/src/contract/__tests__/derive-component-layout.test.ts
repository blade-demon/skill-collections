import { describe, expect, it } from 'vitest';

import { deriveComponentPlan } from '../derive-component-plan';
import { presentationalInput, rechainHashes } from './component-plan-fixtures';
import { bridgedFullChat } from './fixtures';
import type { SemanticNode } from '../../semantic';

/**
 * Regression for the layoutPlan / validator §6.1.5 mismatch.
 *
 * Stage 5A emits a default `absolute` layout candidate for EVERY
 * screen / region / component node anywhere in the tree (semantic/derive.ts
 * §6.7). `assertComponentPlanIntegrity` (§6.1.5) only accepts a PlannedLayout
 * whose semanticNodeId is a planned component OR a direct child of the root.
 *
 * If `buildLayouts` promoted a layout candidate for a nested region/component
 * that is a child of a *non-root* planned component (and not itself a
 * candidate), derive would emit a layout the validator then rejects — i.e.
 * derive throwing on its own output for a perfectly legal semantic view.
 *
 * This test injects exactly that shape and asserts derive succeeds while
 * leaving the disallowed nested layout out of the plan.
 */
describe('deriveComponentPlan — layoutPlan respects validator §6.1.5 allowed set', () => {
  it('does not emit a layout for a nested child of a non-root component candidate', () => {
    const base = presentationalInput(bridgedFullChat);
    const screenId = base.semanticView.body.screen.semanticNodeId;
    const parentCandidate = base.semanticView.body.componentCandidates.find(
      (c) => c.rootSemanticNodeId !== screenId,
    );
    if (parentCandidate === undefined) {
      throw new Error('fixture invariant: bridgedFullChat needs a non-screen component candidate');
    }
    const parentSemanticId = parentCandidate.rootSemanticNodeId;
    const parentNode = base.semanticView.body.nodes.find((n) => n.id === parentSemanticId);
    if (parentNode === undefined) {
      throw new Error('fixture invariant: candidate root node missing from body.nodes');
    }

    const nestedId = 'sem-nested-region';
    const nested: SemanticNode = {
      kind: 'region',
      id: nestedId,
      name: 'NestedRegion',
      primaryVisualNodeId: parentNode.primaryVisualNodeId,
      visualNodeIds: [parentNode.primaryVisualNodeId],
      parentId: parentSemanticId,
      childIds: [],
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      confidence: 'medium',
      evidence: [
        {
          kind: 'project-rule',
          ruleName: 'test-nested-region',
          reason: 'nested region injected for layout §6.1.5 regression',
        },
      ],
      source: { nodeIds: [parentNode.primaryVisualNodeId] },
    };

    const nodes = base.semanticView.body.nodes.map((n) =>
      n.id === parentSemanticId ? { ...n, childIds: [...n.childIds, nestedId] } : n,
    );
    nodes.push(nested);

    /* 5A would emit a default absolute layout candidate for the nested
     * region — this is the candidate that used to leak into the plan. */
    const layoutCandidates = [
      ...base.semanticView.body.layoutCandidates,
      {
        id: 'lc_nested_region',
        semanticNodeId: nestedId,
        kind: 'absolute' as const,
        confidence: 'high' as const,
        constraints: [],
        caveats: [],
      },
    ];

    const mutated = {
      ...base,
      semanticView: {
        ...base.semanticView,
        body: { ...base.semanticView.body, nodes, layoutCandidates },
      },
    };

    const { componentPlan } = deriveComponentPlan(rechainHashes(mutated));

    /* The nested region is a child of a non-root component → its layout must
     * NOT appear (validator §6.1.5 would reject it). */
    expect(
      componentPlan.body.layoutPlan.find((l) => l.semanticNodeId === nestedId),
    ).toBeUndefined();
    /* The parent candidate is a planned component → it keeps a layout entry. */
    expect(
      componentPlan.body.layoutPlan.find((l) => l.semanticNodeId === parentSemanticId),
    ).toBeDefined();
  });

  it('still emits a layout for a direct child of the root that is not itself a component', () => {
    /* The root child branch of §6.1.5 must keep working: a layout candidate
     * for a direct child of the screen (not promoted to a component) is
     * allowed and should appear in the plan. */
    const base = presentationalInput(bridgedFullChat);
    const screenId = base.semanticView.body.screen.semanticNodeId;
    const screenNode = base.semanticView.body.nodes.find((n) => n.id === screenId);
    if (screenNode === undefined) {
      throw new Error('fixture invariant: screen node missing');
    }
    const rootChildId = screenNode.childIds[0];
    if (rootChildId === undefined) {
      throw new Error('fixture invariant: screen has no children');
    }

    /* Replace any existing layout candidate for this root child with a
     * distinctive 'stack' so the assertion is unambiguous. */
    const layoutCandidates = [
      ...base.semanticView.body.layoutCandidates.filter((l) => l.semanticNodeId !== rootChildId),
      {
        id: 'lc_root_child',
        semanticNodeId: rootChildId,
        kind: 'stack' as const,
        confidence: 'high' as const,
        constraints: [],
        caveats: [],
      },
    ];
    const mutated = {
      ...base,
      semanticView: {
        ...base.semanticView,
        body: { ...base.semanticView.body, layoutCandidates },
      },
    };

    const { componentPlan } = deriveComponentPlan(rechainHashes(mutated));
    const rootChildLayout = componentPlan.body.layoutPlan.find(
      (l) => l.semanticNodeId === rootChildId,
    );
    /* A direct child of the root is in the validator-allowed set, so its
     * layout candidate is emitted regardless of whether it is a component. */
    expect(rootChildLayout).toBeDefined();
    expect(rootChildLayout?.strategy).toBe('stack');
  });
});
