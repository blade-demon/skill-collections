import { describe, expect, it } from 'vitest';

import {
  InteractionCoverageSchema,
  InteractionDataModelSchema,
  InteractionEventSchema,
  InteractionSpecBodySchema,
  InteractionSpecSchema,
  InteractionStateSchema,
  InteractionStatusSchema,
  InteractionTransitionSchema,
  type InteractionSpecBody,
} from '../interaction-schema';

/**
 * Stage 5B-PR-1 schema tests — SHAPE LEVEL ONLY.
 *
 * Cross-array references, coverage-vs-status consistency, and chain checks
 * live in ./validate.test.ts (graph-level).
 */

function emptyCoverage(
  status: 'draft' | 'omitted' | 'deferred' = 'omitted',
): InteractionSpecBody['coverage'] {
  return {
    states: { status, notes: '' },
    events: { status, notes: '' },
    dataBinding: { status, notes: '' },
    stateTransitions: { status, notes: '' },
  };
}

function emptyBody(
  coverageStatus: 'draft' | 'omitted' | 'deferred' = 'omitted',
): InteractionSpecBody {
  return {
    components: [],
    states: [],
    events: [],
    dataModels: [],
    stateTransitions: [],
    coverage: emptyCoverage(coverageStatus),
    warnings: [],
  };
}

const generatedFrom = {
  schemaVersion: 'd2c.design-ir/v0.3.0',
  designIrHash: 'a'.repeat(64),
  visualViewHash: 'b'.repeat(64),
  semanticViewHash: 'c'.repeat(64),
};

const approvalFull = {
  reason: 'sandbox-only delivery',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
};

describe('InteractionStatusSchema', () => {
  it('accepts all five values', () => {
    for (const status of ['draft', 'in-review', 'approved', 'omitted', 'deferred'] as const) {
      expect(InteractionStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('rejects an unknown value', () => {
    expect(InteractionStatusSchema.safeParse('shipped').success).toBe(false);
  });
});

describe('InteractionSpecSchema (envelope, discriminated union)', () => {
  it('parses a minimal draft', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'draft',
      body: emptyBody('draft'),
    });
    expect(result.success).toBe(true);
  });

  it('parses a minimal omitted with all approval fields', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'omitted',
      ...approvalFull,
      body: emptyBody('omitted'),
    });
    expect(result.success).toBe(true);
  });

  it('parses a minimal deferred with all approval fields', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'deferred',
      ...approvalFull,
      body: emptyBody('deferred'),
    });
    expect(result.success).toBe(true);
  });

  it('parses an approved with approvedBy + approvedAt and optional reason', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'approved',
      approvedBy: 'alice',
      approvedAt: '2026-05-26T00:00:00Z',
      body: emptyBody('omitted'),
    });
    expect(result.success).toBe(true);
  });

  it('rejects draft carrying approvedBy (strict envelope)', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'draft',
      approvedBy: 'alice',
      body: emptyBody('draft'),
    });
    expect(result.success).toBe(false);
  });

  it('rejects in-review carrying any approval field', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'in-review',
      reason: 'preview',
      body: emptyBody('draft'),
    });
    expect(result.success).toBe(false);
  });

  it('rejects omitted missing reason', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'omitted',
      approvedBy: 'alice',
      approvedAt: '2026-05-26T00:00:00Z',
      body: emptyBody('omitted'),
    });
    expect(result.success).toBe(false);
  });

  it('rejects deferred missing approvedAt', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'deferred',
      reason: 'later',
      approvedBy: 'alice',
      body: emptyBody('deferred'),
    });
    expect(result.success).toBe(false);
  });

  it('rejects approved missing approvedBy', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'approved',
      approvedAt: '2026-05-26T00:00:00Z',
      body: emptyBody('omitted'),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown status value', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'shipped',
      body: emptyBody('omitted'),
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    const result = InteractionSpecSchema.safeParse({
      kind: 'interaction-spec',
      generatedFrom,
      status: 'draft',
      body: emptyBody('draft'),
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('InteractionSpecBodySchema (body shape)', () => {
  it('rejects a body missing coverage', () => {
    const body = { ...emptyBody('draft') } as unknown as Record<string, unknown>;
    delete body.coverage;
    expect(InteractionSpecBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects a body whose coverage is missing one of the four entries', () => {
    const body = emptyBody('draft');
    const broken = { ...body, coverage: { ...body.coverage } } as Record<string, unknown>;
    delete (broken.coverage as Record<string, unknown>).dataBinding;
    expect(InteractionSpecBodySchema.safeParse(broken).success).toBe(false);
  });

  it('accepts a body with non-empty components/events/dataModels', () => {
    const body: InteractionSpecBody = {
      ...emptyBody('draft'),
      components: [{ id: 'ic_1', semanticNodeId: 's_root', name: 'Root', confidence: 'high' }],
      events: [
        {
          id: 'ie_1',
          eventName: 'submit',
          source: 's_button',
          handlerProp: 'onSubmit',
          payload: {},
          confidence: 'low',
          evidenceMessage: 'name matches /button/i',
        },
      ],
      dataModels: [
        {
          id: 'id_1',
          slotName: 'title',
          source: 's_title',
          type: 'string',
          confidence: 'medium',
          evidenceMessage: 'text node',
        },
      ],
    };
    expect(InteractionSpecBodySchema.safeParse(body).success).toBe(true);
  });
});

describe('Body element schemas', () => {
  it('InteractionEventSchema rejects missing handlerProp', () => {
    expect(
      InteractionEventSchema.safeParse({
        id: 'ie_1',
        eventName: 'submit',
        source: 's_x',
        payload: {},
        confidence: 'low',
        evidenceMessage: 'r',
      }).success,
    ).toBe(false);
  });

  it('InteractionDataModelSchema rejects missing type', () => {
    expect(
      InteractionDataModelSchema.safeParse({
        id: 'id_1',
        slotName: 'title',
        source: 's_title',
        confidence: 'medium',
        evidenceMessage: 'r',
      }).success,
    ).toBe(false);
  });

  it('InteractionStateSchema parses', () => {
    expect(
      InteractionStateSchema.safeParse({
        id: 'is_1',
        stateName: 'idle',
        confidence: 'medium',
        evidenceMessage: 'r',
      }).success,
    ).toBe(true);
  });

  it('InteractionTransitionSchema parses', () => {
    expect(
      InteractionTransitionSchema.safeParse({
        id: 'it_1',
        from: 'idle',
        on: 'submit',
        to: 'loading',
        confidence: 'medium',
      }).success,
    ).toBe(true);
  });

  it('InteractionCoverageSchema rejects an invalid coverage entry status', () => {
    expect(
      InteractionCoverageSchema.safeParse({
        states: { status: 'half', notes: '' },
        events: { status: 'omitted', notes: '' },
        dataBinding: { status: 'omitted', notes: '' },
        stateTransitions: { status: 'omitted', notes: '' },
      }).success,
    ).toBe(false);
  });
});
