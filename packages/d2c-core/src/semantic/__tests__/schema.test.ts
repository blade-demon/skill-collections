import { describe, expect, it } from 'vitest';

import {
  ComponentCandidateSchema,
  LayoutCandidateSchema,
  RepeatedPatternSchema,
  SemanticEvidenceSchema,
  SemanticNodeSchema,
  SemanticViewBodySchema,
  type SemanticViewBody,
} from '../schema';

/**
 * Stage 5A schema tests — SHAPE LEVEL ONLY.
 *
 * What belongs here: missing required fields, wrong types, invalid enums,
 * discriminator violations, empty min(1) arrays, unknown extra keys.
 *
 * What does NOT belong here: cross-node integrity (duplicate ids, dangling
 * childIds, asymmetric parent/child, screen pointer kind). Those are
 * graph-level constraints — see ./validate.test.ts.
 */

function makeValidBody(): SemanticViewBody {
  return {
    screen: { semanticNodeId: 's_root_screen', name: 'Screen' },
    nodes: [
      {
        kind: 'screen',
        id: 's_root_screen',
        name: 'Screen',
        primaryVisualNodeId: 'v_root',
        visualNodeIds: ['v_root'],
        childIds: [],
        bounds: { x: 0, y: 0, width: 375, height: 812 },
        confidence: 'high',
        evidence: [{ kind: 'visual-node', nodeId: 'v_root', reason: 'root frame' }],
        source: { nodeIds: ['v_root'], 提供方: 'sketch' },
      },
    ],
    componentCandidates: [],
    repeatedPatterns: [],
    layoutCandidates: [],
    warnings: [],
  };
}

describe('SemanticViewBodySchema (shape)', () => {
  it('parses a minimal valid body', () => {
    const result = SemanticViewBodySchema.safeParse(makeValidBody());
    expect(result.success).toBe(true);
  });

  it('rejects a body missing `screen`', () => {
    const body = makeValidBody() as unknown as Record<string, unknown>;
    delete body.screen;
    expect(SemanticViewBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects a body with empty `nodes` (min 1)', () => {
    const body = makeValidBody();
    body.nodes = [] as SemanticViewBody['nodes'];
    expect(SemanticViewBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects unknown extra keys (strict)', () => {
    const body = makeValidBody() as unknown as Record<string, unknown>;
    body.somethingExtra = true;
    expect(SemanticViewBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('SemanticNodeSchema (shape)', () => {
  it('rejects a node missing `source`', () => {
    const body = makeValidBody();
    const node = { ...body.nodes[0]! } as unknown as Record<string, unknown>;
    delete node.source;
    expect(SemanticNodeSchema.safeParse(node).success).toBe(false);
  });

  it('rejects a node with empty `evidence` (min 1)', () => {
    const body = makeValidBody();
    const node = { ...body.nodes[0]!, evidence: [] };
    expect(SemanticNodeSchema.safeParse(node).success).toBe(false);
  });

  it('rejects a node with invalid `confidence`', () => {
    const body = makeValidBody();
    const node = { ...body.nodes[0]!, confidence: 'maybe' as never };
    expect(SemanticNodeSchema.safeParse(node).success).toBe(false);
  });

  it('rejects a node with an unknown `kind`', () => {
    const body = makeValidBody();
    const node = { ...body.nodes[0]!, kind: 'mystery' as never };
    expect(SemanticNodeSchema.safeParse(node).success).toBe(false);
  });

  it('rejects bounds with negative width', () => {
    const body = makeValidBody();
    const node = {
      ...body.nodes[0]!,
      bounds: { x: 0, y: 0, width: -1, height: 10 },
    };
    expect(SemanticNodeSchema.safeParse(node).success).toBe(false);
  });

  it('rejects empty `visualNodeIds` (min 1)', () => {
    const body = makeValidBody();
    const node = { ...body.nodes[0]!, visualNodeIds: [] as string[] };
    expect(SemanticNodeSchema.safeParse(node).success).toBe(false);
  });
});

describe('SemanticEvidenceSchema (discriminated union)', () => {
  it('parses each of the four kinds', () => {
    const samples = [
      { kind: 'visual-node', nodeId: 'v_1', reason: 'r' },
      {
        kind: 'design-ir-candidate',
        candidateName: 'Hero',
        nodeId: 'v_1',
        reason: 'r',
      },
      {
        kind: 'annotation',
        annotationKey: '@component',
        nodeId: 'v_1',
        reason: 'r',
      },
      { kind: 'project-rule', ruleName: 'prefix-comp', reason: 'r' },
    ];
    for (const sample of samples) {
      expect(SemanticEvidenceSchema.safeParse(sample).success).toBe(true);
    }
  });

  it('rejects evidence missing the discriminator `kind`', () => {
    const e = { nodeId: 'v_1', reason: 'r' };
    expect(SemanticEvidenceSchema.safeParse(e).success).toBe(false);
  });

  it('rejects evidence with an unknown kind', () => {
    const e = { kind: 'invented-source', nodeId: 'v_1', reason: 'r' };
    expect(SemanticEvidenceSchema.safeParse(e).success).toBe(false);
  });

  it('rejects design-ir-candidate without `candidateName`', () => {
    const e = { kind: 'design-ir-candidate', nodeId: 'v_1', reason: 'r' };
    expect(SemanticEvidenceSchema.safeParse(e).success).toBe(false);
  });
});

describe('RepeatedPatternSchema (shape)', () => {
  it('rejects fewer than 3 itemSemanticNodeIds', () => {
    const pattern = {
      id: 'rp_1',
      itemSemanticNodeIds: ['s_a', 's_b'],
      axis: 'y',
      itemCount: 2,
      similarity: 1,
      confidence: 'medium',
      evidence: [{ kind: 'visual-node', nodeId: 'v_p', reason: 'r' }],
    };
    expect(RepeatedPatternSchema.safeParse(pattern).success).toBe(false);
  });

  it('rejects similarity > 1', () => {
    const pattern = {
      id: 'rp_1',
      itemSemanticNodeIds: ['s_a', 's_b', 's_c'],
      axis: 'y',
      itemCount: 3,
      similarity: 1.2,
      confidence: 'medium',
      evidence: [{ kind: 'visual-node', nodeId: 'v_p', reason: 'r' }],
    };
    expect(RepeatedPatternSchema.safeParse(pattern).success).toBe(false);
  });
});

describe('LayoutCandidateSchema (shape)', () => {
  it('rejects unknown layout kind', () => {
    const layout = {
      id: 'lc_1',
      semanticNodeId: 's_a',
      kind: 'masonry',
      confidence: 'low',
      constraints: [],
      caveats: [],
    };
    expect(LayoutCandidateSchema.safeParse(layout).success).toBe(false);
  });
});

describe('ComponentCandidateSchema (shape)', () => {
  it('rejects unknown boundary', () => {
    const candidate = {
      id: 'cc_1',
      rootSemanticNodeId: 's_a',
      suggestedName: 'Card',
      boundary: 'guess',
      confidence: 'medium',
      evidence: [{ kind: 'visual-node', nodeId: 'v_a', reason: 'r' }],
    };
    expect(ComponentCandidateSchema.safeParse(candidate).success).toBe(false);
  });
});
