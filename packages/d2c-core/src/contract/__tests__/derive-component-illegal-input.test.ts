import { describe, expect, it } from 'vitest';

import { deriveComponentPlan } from '../derive-component-plan';
import { interactiveInput, presentationalInput, rechainHashes } from './component-plan-fixtures';
import { bridgedFullChat } from './fixtures';
import type { SemanticView } from '../../ir';
import type { SemanticNode } from '../../semantic';

const PRIMITIVE_KINDS = ['text', 'media', 'icon', 'control', 'decorative'] as const;

/**
 * Append a synthetic semantic node of the requested primitive kind into
 * `semanticView.body.nodes`, so tests can construct a tampered candidate
 * pointing at that kind regardless of what the underlying 5A fixture
 * happened to classify. The synthetic node reuses the screen's first child
 * as its primary visual reference so it stays consistent with visualView.
 */
function appendSyntheticPrimitiveNode(
  semanticView: SemanticView,
  kind: (typeof PRIMITIVE_KINDS)[number],
): { semanticView: SemanticView; nodeId: string } {
  const screenNode = semanticView.body.nodes.find((n) => n.kind === 'screen');
  if (screenNode === undefined) {
    throw new Error('fixture invariant: semantic-view has no screen node');
  }
  const id = `synthetic-${kind}-node`;
  const synthetic: SemanticNode = {
    kind,
    id,
    name: `Synthetic${kind}`,
    primaryVisualNodeId: screenNode.primaryVisualNodeId,
    visualNodeIds: [screenNode.primaryVisualNodeId],
    parentId: screenNode.id,
    childIds: [],
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    confidence: 'low',
    evidence: [
      {
        kind: 'project-rule',
        ruleName: 'test-synthetic-primitive',
        reason: `synthetic ${kind} node injected for derive-component-illegal-input tests`,
      },
    ],
    source: { nodeIds: [screenNode.primaryVisualNodeId] },
  };
  return {
    semanticView: {
      ...semanticView,
      body: {
        ...semanticView.body,
        nodes: [...semanticView.body.nodes, synthetic],
      },
    },
    nodeId: id,
  };
}

describe('deriveComponentPlan — illegal componentCandidate root kinds throw', () => {
  for (const primitiveKind of PRIMITIVE_KINDS) {
    it(`throws when a componentCandidate.rootSemanticNodeId points to a '${primitiveKind}' semantic node`, () => {
      const input = presentationalInput();
      const injected = appendSyntheticPrimitiveNode(input.semanticView, primitiveKind);
      const firstCandidate = injected.semanticView.body.componentCandidates[0];
      if (firstCandidate === undefined) {
        throw new Error('fixture invariant: no componentCandidates present');
      }
      const tampered = {
        ...input,
        semanticView: {
          ...injected.semanticView,
          body: {
            ...injected.semanticView.body,
            componentCandidates: [
              { ...firstCandidate, rootSemanticNodeId: injected.nodeId },
              ...injected.semanticView.body.componentCandidates.slice(1),
            ],
          },
        },
      };
      expect(() => deriveComponentPlan(rechainHashes(tampered))).toThrowError(
        new RegExp(
          `componentCandidate ${firstCandidate.id} rootSemanticNodeId points to a '${primitiveKind}' node`,
        ),
      );
    });
  }

  it('silently skips componentCandidates whose root is the screen (already handled by rootComponent)', () => {
    /* 5A's visual-region pass legitimately matches the screen node when
     * its name starts with a component-naming prefix; that surfaces as a
     * candidate pointing back at the screen. Derive must treat it as a
     * no-op rather than an illegal input — there is exactly one root, and
     * step 3 already produced it. */
    const input = presentationalInput();
    const screenNodeId = input.semanticView.body.screen.semanticNodeId;
    const firstCandidate = input.semanticView.body.componentCandidates[0];
    if (firstCandidate === undefined) {
      throw new Error('fixture invariant: no componentCandidates present');
    }
    const tampered = {
      ...input,
      semanticView: {
        ...input.semanticView,
        body: {
          ...input.semanticView.body,
          componentCandidates: [
            { ...firstCandidate, rootSemanticNodeId: screenNodeId },
            ...input.semanticView.body.componentCandidates.slice(1),
          ],
        },
      },
    };
    const { componentPlan } = deriveComponentPlan(rechainHashes(tampered));
    /* exactly one component whose semanticNodeId is the screen — root. */
    const screenComponents = componentPlan.body.components.filter(
      (c) => c.semanticNodeId === screenNodeId,
    );
    expect(screenComponents).toHaveLength(1);
    expect(screenComponents[0]?.role).toBe('root');
  });

  it('throws when a componentCandidate.rootSemanticNodeId is dangling (not in body.nodes)', () => {
    const input = presentationalInput();
    const firstCandidate = input.semanticView.body.componentCandidates[0];
    if (firstCandidate === undefined) {
      throw new Error('fixture invariant: no componentCandidates present');
    }
    const tampered = {
      ...input,
      semanticView: {
        ...input.semanticView,
        body: {
          ...input.semanticView.body,
          componentCandidates: [
            { ...firstCandidate, rootSemanticNodeId: 'sem-does-not-exist' },
            ...input.semanticView.body.componentCandidates.slice(1),
          ],
        },
      },
    };
    expect(() => deriveComponentPlan(rechainHashes(tampered))).toThrowError(
      new RegExp(`componentCandidate ${firstCandidate.id} rootSemanticNodeId sem-does-not-exist`),
    );
  });
});

describe('deriveComponentPlan — PascalCase export name collision throws', () => {
  it('throws when two candidates pascal-case to the same exportName, naming both candidate ids', () => {
    /* bridgedFullChat is the only stage-5B fixture known to expose ≥ 2
     * component candidates (symbol header + composer); other fixtures
     * (makeButtonyView, makeInputComposerView) leave plain frames that
     * 5A does not promote into ComponentCandidates. */
    const input = interactiveInput(bridgedFullChat);
    const candidates = input.semanticView.body.componentCandidates;
    if (candidates.length < 2) {
      /* every interactive fixture must give us ≥ 2 candidates; otherwise
       * we cannot construct a collision. */
      throw new Error(
        `fixture invariant: interactiveInput needs at least 2 candidates, got ${candidates.length}`,
      );
    }
    const [first, second] = candidates as [(typeof candidates)[0], (typeof candidates)[0]];
    const tampered = {
      ...input,
      semanticView: {
        ...input.semanticView,
        body: {
          ...input.semanticView.body,
          componentCandidates: [
            { ...first, suggestedName: 'DuplicateName' },
            { ...second, suggestedName: 'duplicate-name' },
            ...candidates.slice(2),
          ],
        },
      },
    };
    const rechained = rechainHashes(tampered);
    expect(() => deriveComponentPlan(rechained)).toThrowError(
      /export name collision — 'DuplicateName'/,
    );
    expect(() => deriveComponentPlan(rechained)).toThrowError(new RegExp(first.id));
    expect(() => deriveComponentPlan(rechained)).toThrowError(new RegExp(second.id));
  });
});
