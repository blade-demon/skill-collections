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

function bodyWith(
  nodes: SemanticViewBody['nodes'],
  overrides?: {
    screenId?: string;
    componentCandidates?: SemanticViewBody['componentCandidates'];
    repeatedPatterns?: SemanticViewBody['repeatedPatterns'];
    layoutCandidates?: SemanticViewBody['layoutCandidates'];
  },
): SemanticViewBody {
  return {
    screen: { semanticNodeId: overrides?.screenId ?? 's_root', name: 'Screen' },
    nodes,
    componentCandidates: overrides?.componentCandidates ?? [],
    repeatedPatterns: overrides?.repeatedPatterns ?? [],
    layoutCandidates: overrides?.layoutCandidates ?? [],
    warnings: [],
  };
}

function componentCandidate(
  id: string,
  rootSemanticNodeId: string,
): SemanticViewBody['componentCandidates'][number] {
  return {
    id,
    rootSemanticNodeId,
    suggestedName: id,
    boundary: 'visual-region',
    confidence: 'medium',
    evidence: [{ kind: 'visual-node', nodeId: 'v_x', reason: 'r' }],
  };
}

function repeatedPattern(
  id: string,
  itemSemanticNodeIds: string[],
  itemCountOverride?: number,
): SemanticViewBody['repeatedPatterns'][number] {
  return {
    id,
    itemSemanticNodeIds,
    axis: 'y',
    itemCount: itemCountOverride ?? itemSemanticNodeIds.length,
    similarity: 1,
    confidence: 'medium',
    evidence: [{ kind: 'visual-node', nodeId: 'v_p', reason: 'r' }],
  };
}

function layoutCandidate(
  id: string,
  semanticNodeId: string,
): SemanticViewBody['layoutCandidates'][number] {
  return {
    id,
    semanticNodeId,
    kind: 'absolute',
    confidence: 'high',
    constraints: [],
    caveats: [],
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
    const body = bodyWith([screenNode()], { screenId: 's_nowhere' });
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

describe('assertSemanticViewIntegrity — cross-array references', () => {
  it('passes when componentCandidates, repeatedPatterns, layoutCandidates all reference valid nodes', () => {
    const nodes = [
      screenNode({ childIds: ['s_a', 's_b', 's_c'] }),
      regionNode('s_a', 's_root'),
      regionNode('s_b', 's_root'),
      regionNode('s_c', 's_root'),
    ];
    const body = bodyWith(nodes, {
      componentCandidates: [componentCandidate('cc_1', 's_a')],
      repeatedPatterns: [repeatedPattern('rp_1', ['s_a', 's_b', 's_c'])],
      layoutCandidates: [layoutCandidate('lc_1', 's_a')],
    });
    expect(() => assertSemanticViewIntegrity(body)).not.toThrow();
  });

  it('throws when ComponentCandidate.rootSemanticNodeId is dangling', () => {
    const body = bodyWith([screenNode()], {
      componentCandidates: [componentCandidate('cc_1', 's_missing')],
    });
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /componentCandidate cc_1: rootSemanticNodeId s_missing does not exist/,
    );
  });

  it('throws on duplicate ComponentCandidate id', () => {
    const body = bodyWith([screenNode()], {
      componentCandidates: [
        componentCandidate('cc_1', 's_root'),
        componentCandidate('cc_1', 's_root'),
      ],
    });
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /duplicate ComponentCandidate id: cc_1/,
    );
  });

  it('throws when RepeatedPattern.itemSemanticNodeIds contains a dangling id', () => {
    const nodes = [
      screenNode({ childIds: ['s_a', 's_b'] }),
      regionNode('s_a', 's_root'),
      regionNode('s_b', 's_root'),
    ];
    const body = bodyWith(nodes, {
      repeatedPatterns: [repeatedPattern('rp_1', ['s_a', 's_b', 's_ghost'])],
    });
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /repeatedPattern rp_1: itemSemanticNodeIds entry s_ghost does not exist/,
    );
  });

  it('throws when RepeatedPattern.itemCount disagrees with itemSemanticNodeIds.length', () => {
    const nodes = [
      screenNode({ childIds: ['s_a', 's_b', 's_c'] }),
      regionNode('s_a', 's_root'),
      regionNode('s_b', 's_root'),
      regionNode('s_c', 's_root'),
    ];
    const body = bodyWith(nodes, {
      repeatedPatterns: [repeatedPattern('rp_1', ['s_a', 's_b', 's_c'], 4)],
    });
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /repeatedPattern rp_1: itemCount 4 does not match itemSemanticNodeIds.length 3/,
    );
  });

  it('throws on duplicate RepeatedPattern id', () => {
    const nodes = [
      screenNode({ childIds: ['s_a', 's_b', 's_c'] }),
      regionNode('s_a', 's_root'),
      regionNode('s_b', 's_root'),
      regionNode('s_c', 's_root'),
    ];
    const body = bodyWith(nodes, {
      repeatedPatterns: [
        repeatedPattern('rp_1', ['s_a', 's_b', 's_c']),
        repeatedPattern('rp_1', ['s_a', 's_b', 's_c']),
      ],
    });
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /duplicate RepeatedPattern id: rp_1/,
    );
  });

  it('throws when LayoutCandidate.semanticNodeId is dangling', () => {
    const body = bodyWith([screenNode()], {
      layoutCandidates: [layoutCandidate('lc_1', 's_missing')],
    });
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /layoutCandidate lc_1: semanticNodeId s_missing does not exist/,
    );
  });

  it('throws on duplicate LayoutCandidate id', () => {
    const body = bodyWith([screenNode()], {
      layoutCandidates: [layoutCandidate('lc_1', 's_root'), layoutCandidate('lc_1', 's_root')],
    });
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /duplicate LayoutCandidate id: lc_1/,
    );
  });
});

describe('assertSemanticViewIntegrity — global id uniqueness across arrays', () => {
  it('throws when a SemanticNode id collides with a ComponentCandidate id', () => {
    // Same token 'x_1' used for both a node and a candidate. Prefix
    // convention (s_ / cc_) is a derive contract; validator does not
    // enforce prefixes but does enforce global uniqueness of the token.
    const body = bodyWith([screenNode({ id: 'x_1' })], {
      screenId: 'x_1',
      componentCandidates: [componentCandidate('x_1', 'x_1')],
    });
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /id x_1 is reused across body: appears as both SemanticNode and ComponentCandidate/,
    );
  });

  it('throws when a ComponentCandidate id collides with a RepeatedPattern id', () => {
    const nodes = [
      screenNode({ childIds: ['s_a', 's_b', 's_c'] }),
      regionNode('s_a', 's_root'),
      regionNode('s_b', 's_root'),
      regionNode('s_c', 's_root'),
    ];
    const body = bodyWith(nodes, {
      componentCandidates: [componentCandidate('shared_1', 's_a')],
      repeatedPatterns: [repeatedPattern('shared_1', ['s_a', 's_b', 's_c'])],
    });
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /id shared_1 is reused across body: appears as both ComponentCandidate and RepeatedPattern/,
    );
  });

  it('throws when a RepeatedPattern id collides with a LayoutCandidate id', () => {
    const nodes = [
      screenNode({ childIds: ['s_a', 's_b', 's_c'] }),
      regionNode('s_a', 's_root'),
      regionNode('s_b', 's_root'),
      regionNode('s_c', 's_root'),
    ];
    const body = bodyWith(nodes, {
      repeatedPatterns: [repeatedPattern('shared_2', ['s_a', 's_b', 's_c'])],
      layoutCandidates: [layoutCandidate('shared_2', 's_a')],
    });
    expect(() => assertSemanticViewIntegrity(body)).toThrowError(
      /id shared_2 is reused across body: appears as both RepeatedPattern and LayoutCandidate/,
    );
  });
});
