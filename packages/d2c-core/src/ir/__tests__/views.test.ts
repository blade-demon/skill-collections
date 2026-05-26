import { describe, it, expect } from 'vitest';
import * as rootD2c from '../../index';
import {
  ComponentPlanSchema,
  InteractionSpecSchema,
  SemanticViewSchema,
  VisualViewSchema,
} from '../views';
import { InteractionStatusSchema, type InteractionSpecBody } from '../../contract';
import { makeVisualBlock } from '../../preview/__tests__/fixtures';
import type { SemanticViewBody } from '../../semantic/schema';

const generatedFrom = { schemaVersion: 'd2c.design-ir/v0.2.0' };
const interactionGeneratedFrom = {
  ...generatedFrom,
  designIrHash: 'a'.repeat(64),
  visualViewHash: 'b'.repeat(64),
  semanticViewHash: 'c'.repeat(64),
};

const approvalFields = {
  reason: 'visual-only delivery for this review',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
};

function makeMinimalSemanticViewBody(): SemanticViewBody {
  return {
    screen: { semanticNodeId: 's_root', name: 'Screen' },
    nodes: [
      {
        kind: 'screen',
        id: 's_root',
        name: 'Screen',
        primaryVisualNodeId: 'v_root',
        visualNodeIds: ['v_root'],
        childIds: [],
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        confidence: 'high',
        evidence: [{ kind: 'visual-node', nodeId: 'v_root', reason: 'r' }],
        source: { nodeIds: ['v_root'] },
      },
    ],
    componentCandidates: [],
    repeatedPatterns: [],
    layoutCandidates: [],
    warnings: [],
  };
}

function makeEmptyInteractionBody(
  coverageStatus: 'draft' | 'omitted' | 'deferred' = 'omitted',
): InteractionSpecBody {
  return {
    components: [],
    states: [],
    events: [],
    dataModels: [],
    stateTransitions: [],
    coverage: {
      states: { status: coverageStatus, notes: '' },
      events: { status: coverageStatus, notes: '' },
      dataBinding: { status: coverageStatus, notes: '' },
      stateTransitions: { status: coverageStatus, notes: '' },
    },
    warnings: [],
  };
}

function minimalInteractionSpec(status: string): Record<string, unknown> {
  const base = {
    kind: 'interaction-spec',
    generatedFrom: interactionGeneratedFrom,
    status,
    body: makeEmptyInteractionBody(
      status === 'draft' || status === 'in-review' || status === 'approved'
        ? 'draft'
        : (status as 'omitted' | 'deferred'),
    ),
  };

  if (status === 'approved') {
    return {
      ...base,
      approvedBy: approvalFields.approvedBy,
      approvedAt: approvalFields.approvedAt,
    };
  }
  if (status === 'omitted' || status === 'deferred') {
    return { ...base, ...approvalFields };
  }
  return base;
}

describe('derived view envelopes', () => {
  it('parses a minimal visual-view', () => {
    expect(
      VisualViewSchema.safeParse({
        kind: 'visual-view',
        generatedFrom,
        body: makeVisualBlock(),
      }).success,
    ).toBe(true);
  });

  it('rejects a wrong kind discriminator', () => {
    expect(
      VisualViewSchema.safeParse({
        kind: 'semantic-view',
        generatedFrom,
        body: makeVisualBlock(),
      }).success,
    ).toBe(false);
  });

  it('rejects unknown top-level keys (strict envelope)', () => {
    expect(
      SemanticViewSchema.safeParse({
        kind: 'semantic-view',
        generatedFrom,
        body: makeMinimalSemanticViewBody(),
        extra: 1,
      }).success,
    ).toBe(false);
  });

  it('rejects unknown keys inside generatedFrom (strict)', () => {
    expect(
      VisualViewSchema.safeParse({
        kind: 'visual-view',
        generatedFrom: { ...generatedFrom, oops: true },
        body: makeVisualBlock(),
      }).success,
    ).toBe(false);
  });

  it('accepts an optional designIrHash in generatedFrom', () => {
    expect(
      VisualViewSchema.safeParse({
        kind: 'visual-view',
        generatedFrom: { ...generatedFrom, designIrHash: 'abc123' },
        body: makeVisualBlock(),
      }).success,
    ).toBe(true);
  });

  it('accepts an optional visualViewHash in generatedFrom (added in Stage 5A)', () => {
    expect(
      SemanticViewSchema.safeParse({
        kind: 'semantic-view',
        generatedFrom: {
          ...generatedFrom,
          designIrHash: 'abc',
          visualViewHash: 'def',
        },
        body: makeMinimalSemanticViewBody(),
      }).success,
    ).toBe(true);
  });

  it('accepts an optional semanticViewHash in generatedFrom (added in Stage 5B)', () => {
    expect(
      SemanticViewSchema.safeParse({
        kind: 'semantic-view',
        generatedFrom: {
          ...generatedFrom,
          designIrHash: 'abc',
          visualViewHash: 'def',
          semanticViewHash: 'ghi',
        },
        body: makeMinimalSemanticViewBody(),
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid visual-view body', () => {
    expect(
      VisualViewSchema.safeParse({
        kind: 'visual-view',
        generatedFrom,
        body: {},
      }).success,
    ).toBe(false);
  });

  it('parses a minimal semantic-view body (tightened in Stage 5A)', () => {
    expect(
      SemanticViewSchema.safeParse({
        kind: 'semantic-view',
        generatedFrom,
        body: makeMinimalSemanticViewBody(),
      }).success,
    ).toBe(true);
  });

  it('rejects an arbitrary record as semantic-view body now that the body is typed', () => {
    expect(
      SemanticViewSchema.safeParse({
        kind: 'semantic-view',
        generatedFrom,
        body: { candidates: [{ kind: 'card' }], anything: [1, 2] },
      }).success,
    ).toBe(false);
  });

  it('parses interaction-spec envelopes for all five Stage 5B statuses', () => {
    for (const status of ['draft', 'in-review', 'approved', 'omitted', 'deferred'] as const) {
      expect(InteractionSpecSchema.safeParse(minimalInteractionSpec(status)).success).toBe(true);
    }
  });

  it('rejects arbitrary records as interaction-spec body now that the body is typed', () => {
    expect(
      InteractionSpecSchema.safeParse({
        kind: 'interaction-spec',
        generatedFrom: interactionGeneratedFrom,
        status: 'draft',
        body: { anything: [1, 2], stillLoose: true },
      }).success,
    ).toBe(false);
  });

  it('rejects draft and in-review interaction specs carrying approval fields', () => {
    for (const status of ['draft', 'in-review'] as const) {
      expect(
        InteractionSpecSchema.safeParse({
          ...minimalInteractionSpec(status),
          approvedBy: approvalFields.approvedBy,
        }).success,
      ).toBe(false);
    }
  });

  it('rejects approved interaction specs missing required approval fields', () => {
    for (const missing of ['approvedBy', 'approvedAt'] as const) {
      const spec = minimalInteractionSpec('approved');
      delete spec[missing];
      expect(InteractionSpecSchema.safeParse(spec).success).toBe(false);
    }
  });

  it('rejects omitted and deferred interaction specs missing omission approval fields', () => {
    for (const status of ['omitted', 'deferred'] as const) {
      for (const missing of ['reason', 'approvedBy', 'approvedAt'] as const) {
        const spec = minimalInteractionSpec(status);
        delete spec[missing];
        expect(InteractionSpecSchema.safeParse(spec).success).toBe(false);
      }
    }
  });

  it('accepts semanticViewHash in interaction-spec generatedFrom', () => {
    expect(InteractionSpecSchema.safeParse(minimalInteractionSpec('draft')).success).toBe(true);
  });

  it('root barrel exposes the Stage 5B contract surface', () => {
    const rootExports = rootD2c as unknown as Record<string, unknown>;
    expect(rootExports.InteractionStatusSchema).toBe(InteractionStatusSchema);
    expect(rootExports.InteractionSpecSchema).toBe(InteractionSpecSchema);
  });

  it('component-plan keeps the three-state contract status enum', () => {
    for (const status of ['draft', 'in-review', 'approved'] as const) {
      expect(
        ComponentPlanSchema.safeParse({
          kind: 'component-plan',
          generatedFrom,
          status,
          body: {},
        }).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    expect(
      InteractionSpecSchema.safeParse({
        ...minimalInteractionSpec('draft'),
        status: 'published',
      }).success,
    ).toBe(false);

    expect(
      ComponentPlanSchema.safeParse({
        kind: 'component-plan',
        generatedFrom,
        status: 'published',
        body: {},
      }).success,
    ).toBe(false);
  });
});
