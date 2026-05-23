import { describe, it, expect } from 'vitest';
import {
  ComponentPlanSchema,
  InteractionSpecSchema,
  SemanticViewSchema,
  VisualViewSchema,
} from '../views';
import { makeVisualBlock } from '../../preview/__tests__/fixtures';

const generatedFrom = { schemaVersion: 'd2c.design-ir/v0.2.0' };

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
        body: {},
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

  it('rejects an invalid visual-view body', () => {
    expect(
      VisualViewSchema.safeParse({
        kind: 'visual-view',
        generatedFrom,
        body: {},
      }).success,
    ).toBe(false);
  });

  it('accepts arbitrary content inside the semantic-view loose body', () => {
    expect(
      SemanticViewSchema.safeParse({
        kind: 'semantic-view',
        generatedFrom,
        body: { candidates: [{ kind: 'card' }], anything: [1, 2] },
      }).success,
    ).toBe(true);
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
