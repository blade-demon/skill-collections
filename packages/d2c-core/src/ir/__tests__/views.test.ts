import { describe, it, expect } from 'vitest';
import * as rootD2c from '../../index';
import {
  ComponentPlanSchema,
  ComponentPlanModeSchema,
  InteractionSpecSchema,
  SemanticViewSchema,
  VisualViewSchema,
} from '../views';
import {
  InteractionStatusSchema,
  type ComponentPlanBody,
  type InteractionSpecBody,
} from '../../contract';
import { makeVisualBlock } from '../../preview/__tests__/fixtures';
import type { SemanticViewBody } from '../../semantic/schema';

const generatedFrom = { schemaVersion: 'd2c.design-ir/v0.3.0' };
const interactionGeneratedFrom = {
  ...generatedFrom,
  designIrHash: 'a'.repeat(64),
  visualViewHash: 'b'.repeat(64),
  semanticViewHash: 'c'.repeat(64),
};
const componentPlanGeneratedFrom = {
  ...interactionGeneratedFrom,
  interactionSpecHash: 'd'.repeat(64),
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

  it('root barrel exposes the Stage 5C component-plan contract surface', () => {
    const rootExports = rootD2c as unknown as Record<string, unknown>;
    expect(rootExports.ComponentPlanSchema).toBe(ComponentPlanSchema);
    expect(rootExports.ComponentPlanModeSchema).toBe(ComponentPlanModeSchema);
  });

  it('component-plan keeps the three-state contract status enum', () => {
    for (const status of ['draft', 'in-review', 'approved'] as const) {
      const plan: Record<string, unknown> = {
        kind: 'component-plan',
        generatedFrom: componentPlanGeneratedFrom,
        status,
        mode: 'presentational',
        body: makeMinimalComponentPlanBody(),
      };
      if (status === 'approved') {
        plan.approval = {
          gate: 'gate-2',
          level: 'presentational',
          approvedBy: 'alice',
          approvedAt: '2026-05-26T00:00:00Z',
          acknowledgedBehaviorStubbed: true,
        };
      }
      expect(ComponentPlanSchema.safeParse(plan).success).toBe(true);
    }
  });

  it('rejects an unknown status (Stage 5C tightened schema)', () => {
    expect(
      ComponentPlanSchema.safeParse({
        kind: 'component-plan',
        generatedFrom: componentPlanGeneratedFrom,
        status: 'published',
        mode: 'presentational',
        body: makeMinimalComponentPlanBody(),
      }).success,
    ).toBe(false);
  });

  it('rejects a component-plan missing the mode field (Stage 5C tightened schema)', () => {
    expect(
      ComponentPlanSchema.safeParse({
        kind: 'component-plan',
        generatedFrom: componentPlanGeneratedFrom,
        status: 'draft',
        /* mode deliberately omitted */
        body: makeMinimalComponentPlanBody(),
      }).success,
    ).toBe(false);
  });

  it('rejects a component-plan body that is a loose record (Stage 5C tightened schema)', () => {
    expect(
      ComponentPlanSchema.safeParse({
        kind: 'component-plan',
        generatedFrom: componentPlanGeneratedFrom,
        status: 'draft',
        mode: 'presentational',
        body: { anything: [1, 2], stillLoose: true },
      }).success,
    ).toBe(false);
  });

  it('rejects an approved + presentational plan missing acknowledgedBehaviorStubbed', () => {
    expect(
      ComponentPlanSchema.safeParse({
        kind: 'component-plan',
        generatedFrom: componentPlanGeneratedFrom,
        status: 'approved',
        mode: 'presentational',
        body: makeMinimalComponentPlanBody(),
        approval: {
          gate: 'gate-2',
          level: 'presentational',
          approvedBy: 'alice',
          approvedAt: '2026-05-26T00:00:00Z',
        },
      }).success,
    ).toBe(false);
  });

  it('accepts an interactionSpecHash in component-plan generatedFrom (added in Stage 5C)', () => {
    expect(
      ComponentPlanSchema.safeParse({
        kind: 'component-plan',
        generatedFrom: componentPlanGeneratedFrom,
        status: 'draft',
        mode: 'interactive',
        body: makeMinimalComponentPlanBody(),
      }).success,
    ).toBe(true);
  });
});

/* ── helpers (Stage 5C) ───────────────────────────────────────────────────
 *
 * Minimal component-plan body for envelope-level shape tests: one root
 * planned component, no children, no exports, no layout, no assets, and a
 * coverage snapshot whose entries are all 'omitted'. Real derive output is
 * exercised by component-plan-views-integration.test.ts.
 */
function makeMinimalComponentPlanBody(): ComponentPlanBody {
  const root: ComponentPlanBody['rootComponent'] = {
    id: 'pc_test00000000',
    semanticNodeId: 's_root',
    name: 'Screen',
    role: 'root',
    renderAs: 'component',
    childSemanticNodeIds: [],
    props: [],
    eventBindings: [],
    dataBindings: [],
    confidence: 'high',
    warnings: [],
  };
  return {
    target: { framework: 'react', language: 'ts', styling: 'bem-css' },
    rootComponent: root,
    components: [root],
    exports: [],
    layoutPlan: [],
    assetPlan: [],
    interactionCoverage: {
      states: { status: 'omitted', notes: '' },
      events: { status: 'omitted', notes: '' },
      dataBinding: { status: 'omitted', notes: '' },
      stateTransitions: { status: 'omitted', notes: '' },
    },
    warnings: [],
  };
}
