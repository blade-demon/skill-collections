import { describe, expect, it } from 'vitest';

import type { PlannedComponent } from '../component-plan-schema';
import { deriveComponentReuse, type DeriveComponentReuseInput } from '../derive-component-reuse';
import {
  makeFoldableSymbolInstancesView,
  makeFoldedChildUnfoldedParentView,
  makeMismatchedSymbolInstancesView,
  makeNestedFoldableSymbolInstancesView,
  makeUnresolvedChildBoundaryView,
  presentationalInput,
} from './component-plan-fixtures';

function reuseInput(
  makeInput: Parameters<typeof presentationalInput>[0],
): DeriveComponentReuseInput {
  const input = presentationalInput(makeInput);
  const nodeById = new Map(input.semanticView.body.nodes.map((node) => [node.id, node]));
  const rootNode = nodeById.get(input.semanticView.body.screen.semanticNodeId);
  if (rootNode === undefined) throw new Error('fixture root missing');

  const makeComponent = (
    semanticNodeId: string,
    name: string,
    role: PlannedComponent['role'],
  ): PlannedComponent => {
    const node = nodeById.get(semanticNodeId);
    if (node === undefined) throw new Error(`fixture semantic node missing: ${semanticNodeId}`);
    return {
      id: `pc_${semanticNodeId}`,
      semanticNodeId,
      name,
      role,
      renderAs: 'component',
      childSemanticNodeIds: [...node.childIds],
      props: [],
      eventBindings: [],
      dataBindings: [],
      confidence: node.confidence,
      warnings: [],
    };
  };

  const rootComponent = makeComponent(rootNode.id, rootNode.name, 'root');
  const candidates = input.semanticView.body.componentCandidates
    .filter((candidate) => candidate.rootSemanticNodeId !== rootNode.id)
    .filter(
      (candidate, index, all) =>
        all.findIndex((item) => item.rootSemanticNodeId === candidate.rootSemanticNodeId) === index,
    )
    .map((candidate) => {
      const node = nodeById.get(candidate.rootSemanticNodeId);
      if (node === undefined) throw new Error(`fixture candidate node missing: ${candidate.id}`);
      return {
        candidateId: candidate.id,
        plannedComponent: makeComponent(node.id, candidate.suggestedName, 'component'),
      };
    });

  return {
    semanticView: input.semanticView,
    visualView: input.visualView,
    rootComponent,
    candidates,
  };
}

describe('deriveComponentReuse', () => {
  it('folds same-master instances while ignoring root placement and binding changed text', () => {
    const reuse = deriveComponentReuse(reuseInput(makeFoldableSymbolInstancesView));

    expect(reuse.componentDefinitions).toHaveLength(1);
    expect(reuse.componentDefinitions[0]?.propSchema).toEqual([
      {
        name: 'text1',
        type: 'text',
        defaultValue: expect.stringMatching(/^(First|Second)$/),
      },
    ]);
    expect(reuse.componentInvocations).toHaveLength(2);
    expect(reuse.componentInvocations.map((invocation) => invocation.placement.x)).toEqual([
      0, 400,
    ]);
    expect(reuse.componentInvocations.map((invocation) => invocation.placement.y)).toEqual([0, 60]);
    expect(reuse.componentInvocations[1]?.bindings).toEqual({ text1: 'Second' });
    expect(reuse.componentInvocations.map((invocation) => invocation.bindings.text1)).toEqual([
      'First',
      'Second',
    ]);
    expect(Object.keys(reuse.componentInvocations[1]!.nodeMap)).toHaveLength(2);
    expect(reuse.invocationEdges).toHaveLength(2);
    expect(reuse.warnings).toEqual([]);
  });

  it('falls back when root geometry differs', () => {
    const reuse = deriveComponentReuse(reuseInput(makeMismatchedSymbolInstancesView));

    expect(reuse.componentDefinitions).toEqual([]);
    expect(reuse.componentInvocations).toEqual([]);
    expect(reuse.foldedComponentIds).toEqual([]);
    expect(reuse.warnings).toEqual([
      expect.objectContaining({
        code: 'component-reuse-fallback',
        message: expect.stringMatching(/master-card.*geometry/i),
      }),
    ]);
  });

  it('keeps meaningful provider style payloads in the fingerprint', () => {
    const input = reuseInput(makeFoldableSymbolInstancesView);
    const changedVisualRoot = {
      ...input.visualView.body.root,
      children: input.visualView.body.root.children.map((node, index) => ({
        ...node,
        style: {
          ...node.style,
          fills: node.style?.fills?.map((fill) => ({
            ...fill,
            raw: {
              gradient: {
                stops: [
                  { position: 0, color: index === 0 ? '#FFFFFFFF' : '#000000FF' },
                  { position: 1, color: '#111111FF' },
                ],
              },
            },
          })),
        },
      })),
    };
    const reuse = deriveComponentReuse({
      ...input,
      visualView: {
        ...input.visualView,
        body: { ...input.visualView.body, root: changedVisualRoot },
      },
    });

    expect(reuse.componentDefinitions).toEqual([]);
    expect(reuse.warnings).toEqual([
      expect.objectContaining({
        code: 'component-reuse-fallback',
        message: expect.stringMatching(/style/i),
      }),
    ]);
  });

  it('uses component callers when folded children live under unfolded parents', () => {
    const reuse = deriveComponentReuse(reuseInput(makeFoldedChildUnfoldedParentView));

    expect(reuse.componentDefinitions).toHaveLength(1);
    expect(reuse.componentInvocations).toHaveLength(2);
    expect(reuse.componentInvocations.map((invocation) => invocation.caller.kind)).toEqual([
      'component',
      'component',
    ]);
    expect(
      reuse.componentInvocations.map((invocation) =>
        invocation.caller.kind === 'component' ? invocation.caller.componentId : '',
      ),
    ).toHaveLength(2);
    expect(
      new Set(
        reuse.componentInvocations.map((invocation) =>
          invocation.caller.kind === 'component' ? invocation.caller.componentId : '',
        ),
      ).size,
    ).toBe(2);
  });

  it('folds nested children before parents and uses invocation callers', () => {
    const reuse = deriveComponentReuse(reuseInput(makeNestedFoldableSymbolInstancesView));

    expect(reuse.componentDefinitions).toHaveLength(2);
    expect(reuse.componentInvocations).toHaveLength(4);
    const nestedInvocations = reuse.componentInvocations.filter(
      (invocation) => invocation.caller.kind === 'invocation',
    );
    expect(nestedInvocations).toHaveLength(2);
    expect(
      nestedInvocations.every((invocation) =>
        reuse.componentInvocations.some(
          (parent) =>
            invocation.caller.kind === 'invocation' && parent.id === invocation.caller.invocationId,
        ),
      ),
    ).toBe(true);
  });

  it('treats unresolved nested component ids as unequal parent boundary identities', () => {
    const reuse = deriveComponentReuse(reuseInput(makeUnresolvedChildBoundaryView));

    expect(reuse.componentDefinitions).toEqual([]);
    expect(reuse.warnings).toHaveLength(2);
    expect(reuse.warnings.map((warning) => warning.message).join('\n')).toMatch(
      /master-icon[\s\S]*master-prompt|master-prompt[\s\S]*master-icon/,
    );
  });

  it('is stable when candidate input order is reversed', () => {
    const input = reuseInput(makeNestedFoldableSymbolInstancesView);
    const forward = deriveComponentReuse(input);
    const reversed = deriveComponentReuse({
      ...input,
      candidates: [...input.candidates].reverse(),
    });

    expect(reversed).toEqual(forward);
    expect(
      forward.componentDefinitions.every((definition) => definition.id.startsWith('cd_')),
    ).toBe(true);
    expect(
      forward.componentInvocations.every((invocation) => invocation.id.startsWith('ci_')),
    ).toBe(true);
  });
});
