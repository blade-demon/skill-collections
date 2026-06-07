import { describe, expect, it } from 'vitest';

import {
  ComponentPlanApprovalSchema,
  ComponentPlanBodySchema,
  ComponentPlanModeSchema,
  ComponentPlanSchema,
  PlannedAssetSchema,
  PlannedComponentSchema,
  PlannedExportSchema,
  PlannedLayoutSchema,
  PlannedPropSchema,
  type ComponentPlan,
  type ComponentPlanBody,
  type PlannedComponent,
} from '../component-plan-schema';

/**
 * Stage 5C-PR-1 schema tests — SHAPE LEVEL + ENVELOPE superRefine.
 *
 * Graph-level checks (id uniqueness, export ref, child/self, layout usage,
 * mode × interaction-status combos) live in ./component-plan-validate.test.ts.
 *
 * Plan refs:
 *   §3.3 — status × mode × approval superRefine combos.
 *   §3.2 — mode × interaction-status: enforced by validator (artifact-chain).
 *   §4   — body shape.
 *   §9   — schema test row.
 */

/* ── shared fixtures ─────────────────────────────────────────────────────── */

const generatedFrom = {
  schemaVersion: 'd2c.design-ir/v0.3.0',
  designIrHash: 'a'.repeat(64),
  visualViewHash: 'b'.repeat(64),
  semanticViewHash: 'c'.repeat(64),
  interactionSpecHash: 'd'.repeat(64),
};

function rootComponent(overrides: Partial<PlannedComponent> = {}): PlannedComponent {
  return {
    id: 'pc_root',
    semanticNodeId: 's_screen',
    name: 'Screen',
    role: 'root',
    renderAs: 'component',
    childSemanticNodeIds: [],
    props: [],
    eventBindings: [],
    dataBindings: [],
    confidence: 'high',
    warnings: [],
    ...overrides,
  };
}

function emptyBody(rootOverrides: Partial<PlannedComponent> = {}): ComponentPlanBody {
  const root = rootComponent(rootOverrides);
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

function draftPlan(): ComponentPlan {
  return {
    kind: 'component-plan',
    generatedFrom,
    status: 'draft',
    mode: 'presentational',
    body: emptyBody(),
  };
}

/* ── mode + approval shape ───────────────────────────────────────────────── */

describe('ComponentPlanModeSchema', () => {
  it('accepts presentational and interactive', () => {
    expect(ComponentPlanModeSchema.safeParse('presentational').success).toBe(true);
    expect(ComponentPlanModeSchema.safeParse('interactive').success).toBe(true);
  });

  it('rejects an unknown mode (no draft/in-review/approved leaking in)', () => {
    expect(ComponentPlanModeSchema.safeParse('draft').success).toBe(false);
    expect(ComponentPlanModeSchema.safeParse('approved').success).toBe(false);
  });
});

describe('ComponentPlanApprovalSchema (discriminated union on level)', () => {
  it('accepts an interactive approval', () => {
    const result = ComponentPlanApprovalSchema.safeParse({
      gate: 'gate-2',
      level: 'interactive',
      approvedBy: 'alice',
      approvedAt: '2026-05-26T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a presentational approval carrying acknowledgedBehaviorStubbed: true', () => {
    const result = ComponentPlanApprovalSchema.safeParse({
      gate: 'gate-2',
      level: 'presentational',
      approvedBy: 'alice',
      approvedAt: '2026-05-26T00:00:00Z',
      acknowledgedBehaviorStubbed: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a presentational approval missing acknowledgedBehaviorStubbed', () => {
    const result = ComponentPlanApprovalSchema.safeParse({
      gate: 'gate-2',
      level: 'presentational',
      approvedBy: 'alice',
      approvedAt: '2026-05-26T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a presentational approval with acknowledgedBehaviorStubbed: false', () => {
    // The presentational branch types `acknowledgedBehaviorStubbed` as
    // z.literal(true), so even false is rejected.
    const result = ComponentPlanApprovalSchema.safeParse({
      gate: 'gate-2',
      level: 'presentational',
      approvedBy: 'alice',
      approvedAt: '2026-05-26T00:00:00Z',
      acknowledgedBehaviorStubbed: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an interactive approval carrying stray acknowledgedBehaviorStubbed (strict)', () => {
    const result = ComponentPlanApprovalSchema.safeParse({
      gate: 'gate-2',
      level: 'interactive',
      approvedBy: 'alice',
      approvedAt: '2026-05-26T00:00:00Z',
      acknowledgedBehaviorStubbed: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown level', () => {
    const result = ComponentPlanApprovalSchema.safeParse({
      gate: 'gate-2',
      level: 'partial',
      approvedBy: 'alice',
      approvedAt: '2026-05-26T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

/* ── envelope superRefine: status × mode × approval ──────────────────────── */

describe('ComponentPlanSchema.superRefine — approval enforcement (§3.3)', () => {
  it('accepts a draft plan with no approval (presentational mode)', () => {
    const plan = draftPlan();
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('accepts a draft plan with no approval (interactive mode)', () => {
    const plan: ComponentPlan = { ...draftPlan(), mode: 'interactive' };
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('rejects a draft plan carrying approval', () => {
    const plan: ComponentPlan = {
      ...draftPlan(),
      approval: {
        gate: 'gate-2',
        level: 'interactive',
        approvedBy: 'alice',
        approvedAt: '2026-05-26T00:00:00Z',
      },
    };
    const result = ComponentPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('approval'))).toBe(true);
    }
  });

  it('rejects an in-review plan carrying approval', () => {
    const plan: ComponentPlan = {
      ...draftPlan(),
      status: 'in-review',
      approval: {
        gate: 'gate-2',
        level: 'interactive',
        approvedBy: 'alice',
        approvedAt: '2026-05-26T00:00:00Z',
      },
    };
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(false);
  });

  it('accepts approved + interactive with interactive approval', () => {
    const plan: ComponentPlan = {
      ...draftPlan(),
      status: 'approved',
      mode: 'interactive',
      approval: {
        gate: 'gate-2',
        level: 'interactive',
        approvedBy: 'alice',
        approvedAt: '2026-05-26T00:00:00Z',
      },
    };
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('rejects approved + interactive missing approval', () => {
    const plan: ComponentPlan = {
      ...draftPlan(),
      status: 'approved',
      mode: 'interactive',
    };
    const result = ComponentPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects approved + interactive carrying presentational approval', () => {
    const plan: ComponentPlan = {
      ...draftPlan(),
      status: 'approved',
      mode: 'interactive',
      approval: {
        gate: 'gate-2',
        level: 'presentational',
        approvedBy: 'alice',
        approvedAt: '2026-05-26T00:00:00Z',
        acknowledgedBehaviorStubbed: true,
      },
    };
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(false);
  });

  it('accepts approved + presentational with presentational approval (acknowledged)', () => {
    const plan: ComponentPlan = {
      ...draftPlan(),
      status: 'approved',
      mode: 'presentational',
      approval: {
        gate: 'gate-2',
        level: 'presentational',
        approvedBy: 'alice',
        approvedAt: '2026-05-26T00:00:00Z',
        acknowledgedBehaviorStubbed: true,
      },
    };
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('rejects approved + presentational missing approval', () => {
    const plan: ComponentPlan = {
      ...draftPlan(),
      status: 'approved',
      mode: 'presentational',
    };
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(false);
  });

  it('rejects approved + presentational carrying interactive approval', () => {
    const plan: ComponentPlan = {
      ...draftPlan(),
      status: 'approved',
      mode: 'presentational',
      approval: {
        gate: 'gate-2',
        level: 'interactive',
        approvedBy: 'alice',
        approvedAt: '2026-05-26T00:00:00Z',
      },
    };
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(false);
  });
});

/* ── envelope shape ──────────────────────────────────────────────────────── */

describe('ComponentPlanSchema (envelope shape)', () => {
  it('rejects an unknown top-level key (strict)', () => {
    const plan = { ...draftPlan(), extra: true } as unknown as Record<string, unknown>;
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(false);
  });

  it('rejects a plan missing mode', () => {
    const plan = draftPlan() as unknown as Record<string, unknown>;
    delete plan.mode;
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(false);
  });

  it('rejects a plan with body = {} (no longer loose)', () => {
    const plan = { ...draftPlan(), body: {} };
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(false);
  });

  it('rejects unknown status', () => {
    const plan = { ...draftPlan(), status: 'shipped' };
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(false);
  });
});

/* ── body shape ──────────────────────────────────────────────────────────── */

describe('ComponentPlanBodySchema (§4)', () => {
  it('parses a minimal body with one root component', () => {
    const result = ComponentPlanBodySchema.safeParse(emptyBody());
    expect(result.success).toBe(true);
  });

  it('rejects body missing target', () => {
    const body = emptyBody() as unknown as Record<string, unknown>;
    delete body.target;
    expect(ComponentPlanBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects body whose target.framework is not the configured enum value', () => {
    const body = {
      ...emptyBody(),
      target: { framework: 'vue', language: 'ts', styling: 'bem-css' },
    };
    expect(ComponentPlanBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects body missing interactionCoverage', () => {
    const body = emptyBody() as unknown as Record<string, unknown>;
    delete body.interactionCoverage;
    expect(ComponentPlanBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects body whose interactionCoverage is missing one of the four entries', () => {
    const body = emptyBody();
    const broken = {
      ...body,
      interactionCoverage: { ...body.interactionCoverage },
    } as Record<string, unknown>;
    delete (broken.interactionCoverage as Record<string, unknown>).dataBinding;
    expect(ComponentPlanBodySchema.safeParse(broken).success).toBe(false);
  });
});

/* ── body element schemas ────────────────────────────────────────────────── */

describe('PlannedPropSchema', () => {
  it('accepts a data-model prop with required = true', () => {
    expect(
      PlannedPropSchema.safeParse({
        name: 'title',
        type: 'string',
        source: 'data-model',
        required: true,
      }).success,
    ).toBe(true);
  });

  it('accepts an optional presentational-stub prop (required = false, §3.2 / §7.2 step 5)', () => {
    expect(
      PlannedPropSchema.safeParse({
        name: 'title',
        type: 'string',
        source: 'presentational-stub',
        required: false,
        interactionRefId: 'id_title',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown source enum value', () => {
    expect(
      PlannedPropSchema.safeParse({
        name: 'title',
        type: 'string',
        source: 'props-spread',
        required: false,
      }).success,
    ).toBe(false);
  });
});

describe('PlannedComponentSchema', () => {
  it('accepts a minimal root component', () => {
    expect(PlannedComponentSchema.safeParse(rootComponent()).success).toBe(true);
  });

  it('rejects unknown role', () => {
    expect(
      PlannedComponentSchema.safeParse({
        ...rootComponent(),
        role: 'page',
      }).success,
    ).toBe(false);
  });

  it("only emits renderAs='component' in 5C but schema keeps the enum surface", () => {
    // Schema-level: enum stays open so PR-2 / Stage 6 can extend without
    // bumping schemaVersion. Derive policy (§7.2 step 4) restricts to
    // 'component' in 5C and is tested in derive-component-*.test.ts later.
    expect(
      PlannedComponentSchema.safeParse({ ...rootComponent(), renderAs: 'markup' }).success,
    ).toBe(true);
    expect(PlannedComponentSchema.safeParse({ ...rootComponent(), renderAs: 'slot' }).success).toBe(
      true,
    );
  });
});

describe('PlannedExportSchema', () => {
  it('accepts a default export', () => {
    expect(
      PlannedExportSchema.safeParse({
        id: 'pe_1',
        plannedComponentId: 'pc_root',
        exportName: 'Screen',
        kind: 'default',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown kind', () => {
    expect(
      PlannedExportSchema.safeParse({
        id: 'pe_1',
        plannedComponentId: 'pc_root',
        exportName: 'Screen',
        kind: 'reexport',
      }).success,
    ).toBe(false);
  });
});

describe('PlannedLayoutSchema', () => {
  it('accepts an absolute layout with caveat', () => {
    expect(
      PlannedLayoutSchema.safeParse({
        id: 'pl_1',
        semanticNodeId: 's_root',
        strategy: 'absolute',
        confidence: 'low',
        constraints: [],
        caveats: ['no layout candidate'],
      }).success,
    ).toBe(true);
  });

  it('rejects unknown strategy', () => {
    expect(
      PlannedLayoutSchema.safeParse({
        id: 'pl_1',
        semanticNodeId: 's_root',
        strategy: 'flow',
        confidence: 'low',
        constraints: [],
        caveats: [],
      }).success,
    ).toBe(false);
  });
});

describe('PlannedAssetSchema', () => {
  it('accepts a required image with an assetRef', () => {
    expect(
      PlannedAssetSchema.safeParse({
        id: 'pa_1',
        semanticNodeId: 's_logo',
        assetRef: 'asset_logo.png',
        usage: 'image',
        required: true,
      }).success,
    ).toBe(true);
  });

  it('accepts an asset with no assetRef (lookup miss; warning lives elsewhere)', () => {
    expect(
      PlannedAssetSchema.safeParse({
        id: 'pa_1',
        semanticNodeId: 's_logo',
        usage: 'icon',
        required: true,
      }).success,
    ).toBe(true);
  });
});
