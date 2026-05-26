import { describe, it, expect } from 'vitest';
import {
  ComponentPlanSchema,
  InteractionSpecSchema,
  SemanticViewSchema,
  VisualViewSchema,
} from '../views';
import { makeVisualBlock } from '../../preview/__tests__/fixtures';
import type { SemanticViewBody } from '../../semantic/schema';

const generatedFrom = { schemaVersion: 'd2c.design-ir/v0.2.0' };

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

  it('interaction-spec and component-plan share the contract status enum', () => {
    for (const status of ['draft', 'in-review', 'approved'] as const) {
      expect(
        InteractionSpecSchema.safeParse({
          kind: 'interaction-spec',
          generatedFrom,
          status,
          body: {},
        }).success,
      ).toBe(true);
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
      ComponentPlanSchema.safeParse({
        kind: 'component-plan',
        generatedFrom,
        status: 'published',
        body: {},
      }).success,
    ).toBe(false);
  });
});
