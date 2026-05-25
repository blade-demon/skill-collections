import { describe, expect, it } from 'vitest';

import { type SemanticViewBody } from '../schema';
import { SemanticViewIntegrityError, assertSemanticViewIntegrity } from '../validate';

/**
 * Stage 5A graph-level validator tests.
 *
 * Shape-level negatives live in schema.test.ts. The fixtures here are
 * always shape-valid; they violate graph-level constraints only.
 */

function screenNode(overrides?: {
  id?: string;
  parentId?: string;
  childIds?: string[];
  primaryVisualNodeId?: string;
  visualNodeIds?: string[];
  kind?: SemanticViewBody['nodes'][number]['kind'];
}): SemanticViewBody['nodes'][number] {
  return {
    kind: overrides?.kind ?? 'screen',
    id: overrides?.id ?? 's_root',
    name: 'Screen',
    primaryVisualNodeId: overrides?.primaryVisualNodeId ?? 'v_root',
    visualNodeIds: overrides?.visualNodeIds ?? ['v_root'],
    parentId: overrides?.parentId,
    childIds: overrides?.childIds ?? [],
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    confidence: 'high',
    evidence: [{ kind: 'visual-node', nodeId: 'v_root', reason: 'r' }],
    source: { nodeIds: ['v_root'] },
  };
}

function regionNode(
  id: string,
  parentId: string | undefined,
  childIds: string[] = [],
): SemanticViewBody['nodes'][number] {
  return {
    kind: 'region',
    id,
    name: id,
    primaryVisualNodeId: `v_${id}`,
    visualNodeIds: [`v_${id}`],
    parentId,
    childIds,
    bounds: { x: 0, y: 0, width: 50, height: 50 },
    confidence: 'medium',
    evidence: [{ kind: 'visual-node', nodeId: `v_${id}`, reason: 'r' }],
    source: { nodeIds: [`v_${id}`] },
  };
}

function bodyWith(nodes: SemanticViewBody['nodes'], screenId = 's_root'): SemanticViewBody {
  return {
    screen: { semanticNodeId: screenId, name: 'Screen' },
    nodes,
    componentCandidates: [],
    repeatedPatterns: [],
    layoutCandidates: [],
    warnings: [],
  };
}

describe('assertSemanticViewIntegrity', () => {
  it('passes a minimal valid graph', () => {
    const body = bodyWith([screenNode({ childIds: ['s_a'] }), regionNode('s_a', 's_root')]);
    expect(() => assertSemanticViewIntegrity(body)).not.toThrow();
  });

  it('throws on duplicate SemanticNode id', () => {
    const body = bodyWith([screenNode(), screenNode({ id: 's_root', kind: 'region' })]);
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(SemanticViewIntegrityError);
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /duplicate SemanticNode id: s_root/,
    );
  });

  it('throws when childIds reference a non-existent node', () => {
    const body = bodyWith([screenNode({ childIds: ['s_missing'] })]);
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /childId s_missing does not exist/,
    );
  });

  it('throws when childIds and parentId are not reciprocal (parent forgets child)', () => {
    // s_a says parentId=s_root but s_root.childIds is empty
    const body = bodyWith([screenNode(), regionNode('s_a', 's_root')]);
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /parent.childIds does not include s_a/,
    );
  });

  it('throws when childIds and parentId are not reciprocal (child forgets parent)', () => {
    // s_root lists s_a as child but s_a.parentId is undefined
    const body = bodyWith([screenNode({ childIds: ['s_a'] }), regionNode('s_a', undefined)]);
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /childId s_a but child.parentId is \(absent\)/,
    );
  });

  it('throws when parentId references a non-existent node', () => {
    const body = bodyWith([screenNode(), regionNode('s_a', 's_ghost')]);
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(/parentId s_ghost does not exist/);
  });

  it('throws when screen pointer references a non-existent node', () => {
    const body = bodyWith([screenNode()], 's_nowhere');
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /body.screen.semanticNodeId s_nowhere does not exist/,
    );
  });

  it('throws when screen pointer references a non-screen node', () => {
    const body = bodyWith([screenNode({ id: 's_root', kind: 'region', childIds: [] })]);
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /references a node of kind 'region', expected 'screen'/,
    );
  });

  it('throws when primaryVisualNodeId is not in visualNodeIds', () => {
    const body = bodyWith([
      screenNode({ primaryVisualNodeId: 'v_other', visualNodeIds: ['v_root'] }),
    ]);
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /primaryVisualNodeId v_other not in visualNodeIds \[v_root\]/,
    );
  });
});
