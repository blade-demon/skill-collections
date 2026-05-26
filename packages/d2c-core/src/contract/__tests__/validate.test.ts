import { describe, expect, it } from 'vitest';

import {
  type InteractionCoverageStatus,
  type InteractionSpec,
  type InteractionSpecBody,
} from '../interaction-schema';
import {
  InteractionSpecIntegrityError,
  assertInteractionSpecIntegrity,
} from '../interaction-validate';

/**
 * Stage 5B-PR-1 graph-level validator tests.
 *
 * Shape-level negatives live in ./schema.test.ts. The fixtures here are
 * always shape-valid; they only violate graph-level / chain constraints.
 */

const generatedFrom = {
  schemaVersion: 'd2c.design-ir/v0.2.0',
  designIrHash: 'a'.repeat(64),
  visualViewHash: 'b'.repeat(64),
  semanticViewHash: 'c'.repeat(64),
};

const approvalFull = {
  reason: 'sandbox',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
};

function coverageAll(status: InteractionCoverageStatus): InteractionSpecBody['coverage'] {
  return {
    states: { status, notes: '' },
    events: { status, notes: '' },
    dataBinding: { status, notes: '' },
    stateTransitions: { status, notes: '' },
  };
}

function emptyBody(coverageStatus: InteractionCoverageStatus = 'omitted'): InteractionSpecBody {
  return {
    components: [],
    states: [],
    events: [],
    dataModels: [],
    stateTransitions: [],
    coverage: coverageAll(coverageStatus),
    warnings: [],
  };
}

function draftSpec(body: InteractionSpecBody = emptyBody('draft')): InteractionSpec {
  return { kind: 'interaction-spec', generatedFrom, status: 'draft', body };
}

function omittedSpec(body: InteractionSpecBody = emptyBody('omitted')): InteractionSpec {
  return { kind: 'interaction-spec', generatedFrom, status: 'omitted', ...approvalFull, body };
}

function deferredSpec(body: InteractionSpecBody = emptyBody('deferred')): InteractionSpec {
  return { kind: 'interaction-spec', generatedFrom, status: 'deferred', ...approvalFull, body };
}

function approvedSpec(body: InteractionSpecBody): InteractionSpec {
  return {
    kind: 'interaction-spec',
    generatedFrom,
    status: 'approved',
    approvedBy: 'alice',
    approvedAt: '2026-05-26T00:00:00Z',
    body,
  };
}

/* ── §5.1 intra-spec ─────────────────────────────────────────────────────── */

describe('assertInteractionSpecIntegrity — intra-spec', () => {
  it('passes a minimal draft', () => {
    expect(() => assertInteractionSpecIntegrity(draftSpec())).not.toThrow();
  });

  it('passes a minimal omitted with all coverage entries omitted', () => {
    expect(() => assertInteractionSpecIntegrity(omittedSpec())).not.toThrow();
  });
});

describe('id uniqueness', () => {
  it('throws on duplicate InteractionEvent id within events array', () => {
    const body = emptyBody('draft');
    body.events = [
      {
        id: 'ie_1',
        eventName: 'a',
        source: 's_a',
        handlerProp: 'onA',
        payload: {},
        confidence: 'low',
        evidenceMessage: 'r',
      },
      {
        id: 'ie_1',
        eventName: 'b',
        source: 's_b',
        handlerProp: 'onB',
        payload: {},
        confidence: 'low',
        evidenceMessage: 'r',
      },
    ];
    expect(() => assertInteractionSpecIntegrity(draftSpec(body))).toThrowError(
      InteractionSpecIntegrityError,
    );
    expect(() => assertInteractionSpecIntegrity(draftSpec(body))).toThrowError(
      /duplicate InteractionEvent id: ie_1/,
    );
  });

  it('throws when the same id token is reused across InteractionEvent and InteractionDataModel', () => {
    const body = emptyBody('draft');
    body.events = [
      {
        id: 'shared_1',
        eventName: 'a',
        source: 's_a',
        handlerProp: 'onA',
        payload: {},
        confidence: 'low',
        evidenceMessage: 'r',
      },
    ];
    body.dataModels = [
      {
        id: 'shared_1',
        slotName: 'title',
        source: 's_a',
        type: 'string',
        confidence: 'medium',
        evidenceMessage: 'r',
      },
    ];
    expect(() => assertInteractionSpecIntegrity(draftSpec(body))).toThrowError(
      /id shared_1 is reused across body: appears as both InteractionEvent and InteractionDataModel/,
    );
  });
});

describe('transition reference resolution', () => {
  function specWithStatesEventsTransitions(
    states: InteractionSpecBody['states'],
    events: InteractionSpecBody['events'],
    transitions: InteractionSpecBody['stateTransitions'],
  ): InteractionSpec {
    const body = emptyBody('draft');
    body.states = states;
    body.events = events;
    body.stateTransitions = transitions;
    return draftSpec(body);
  }

  it('throws when transition.from references an unknown stateName', () => {
    const spec = specWithStatesEventsTransitions(
      [{ id: 'is_idle', stateName: 'idle', confidence: 'medium', evidenceMessage: 'r' }],
      [
        {
          id: 'ie_submit',
          eventName: 'submit',
          source: 's_btn',
          handlerProp: 'onSubmit',
          payload: {},
          confidence: 'low',
          evidenceMessage: 'r',
        },
      ],
      [{ id: 'it_1', from: 'mystery', on: 'submit', to: 'idle', confidence: 'medium' }],
    );
    expect(() => assertInteractionSpecIntegrity(spec)).toThrowError(
      /transition it_1: from 'mystery' does not match any state/,
    );
  });

  it('throws when transition.to references an unknown stateName', () => {
    const spec = specWithStatesEventsTransitions(
      [{ id: 'is_idle', stateName: 'idle', confidence: 'medium', evidenceMessage: 'r' }],
      [
        {
          id: 'ie_submit',
          eventName: 'submit',
          source: 's_btn',
          handlerProp: 'onSubmit',
          payload: {},
          confidence: 'low',
          evidenceMessage: 'r',
        },
      ],
      [{ id: 'it_1', from: 'idle', on: 'submit', to: 'gone', confidence: 'medium' }],
    );
    expect(() => assertInteractionSpecIntegrity(spec)).toThrowError(
      /transition it_1: to 'gone' does not match any state/,
    );
  });

  it('throws when transition.on references an unknown eventName', () => {
    const spec = specWithStatesEventsTransitions(
      [
        { id: 'is_idle', stateName: 'idle', confidence: 'medium', evidenceMessage: 'r' },
        { id: 'is_loading', stateName: 'loading', confidence: 'medium', evidenceMessage: 'r' },
      ],
      [],
      [{ id: 'it_1', from: 'idle', on: 'submit', to: 'loading', confidence: 'medium' }],
    );
    expect(() => assertInteractionSpecIntegrity(spec)).toThrowError(
      /transition it_1: on 'submit' does not match any event/,
    );
  });
});

describe('coverage vs status consistency', () => {
  it('rejects status=omitted when any coverage entry is not omitted', () => {
    const body = emptyBody('omitted');
    body.coverage.states = { status: 'draft', notes: '' };
    expect(() => assertInteractionSpecIntegrity(omittedSpec(body))).toThrowError(
      /coverage.states.status is 'draft' but spec.status is 'omitted'/,
    );
  });

  it('rejects status=deferred when any coverage entry is not deferred', () => {
    const body = emptyBody('deferred');
    body.coverage.events = { status: 'omitted', notes: '' };
    expect(() => assertInteractionSpecIntegrity(deferredSpec(body))).toThrowError(
      /coverage.events.status is 'omitted' but spec.status is 'deferred'/,
    );
  });

  it('rejects status=draft when any coverage entry is covered', () => {
    const body = emptyBody('draft');
    body.coverage.events = { status: 'covered', notes: '' };
    expect(() => assertInteractionSpecIntegrity(draftSpec(body))).toThrowError(
      /coverage.events.status is 'covered' but spec.status is 'draft'/,
    );
  });

  it('rejects status=in-review when any coverage entry is covered', () => {
    const body = emptyBody('draft');
    body.coverage.dataBinding = { status: 'covered', notes: '' };
    const spec: InteractionSpec = {
      kind: 'interaction-spec',
      generatedFrom,
      status: 'in-review',
      body,
    };
    expect(() => assertInteractionSpecIntegrity(spec)).toThrowError(
      /'covered' requires status === 'approved'/,
    );
  });

  it('rejects status=approved when no coverage entry is covered', () => {
    const body = emptyBody('draft');
    /* All four entries default to 'draft' or 'omitted' — none 'covered'. */
    expect(() => assertInteractionSpecIntegrity(approvedSpec(body))).toThrowError(
      /no coverage entry has status 'covered'/,
    );
  });

  it('passes status=approved when at least one coverage entry is covered', () => {
    const body = emptyBody('draft');
    body.coverage.events = { status: 'covered', notes: '' };
    expect(() => assertInteractionSpecIntegrity(approvedSpec(body))).not.toThrow();
  });
});

/* ── §5.2 artifact-chain ─────────────────────────────────────────────────── */

describe('artifact-chain checks (semanticNodeIds provided)', () => {
  function specWithComponent(
    componentSemanticNodeId: string,
    eventSource = 's_evt',
    dataSource = 's_data',
  ): InteractionSpec {
    const body = emptyBody('draft');
    body.components = [
      { id: 'ic_1', semanticNodeId: componentSemanticNodeId, name: 'C', confidence: 'medium' },
    ];
    body.events = [
      {
        id: 'ie_1',
        eventName: 'a',
        source: eventSource,
        handlerProp: 'onA',
        payload: {},
        confidence: 'low',
        evidenceMessage: 'r',
      },
    ];
    body.dataModels = [
      {
        id: 'id_1',
        slotName: 'title',
        source: dataSource,
        type: 'string',
        confidence: 'medium',
        evidenceMessage: 'r',
      },
    ];
    return draftSpec(body);
  }

  it('passes when all sources resolve in the provided id set', () => {
    const spec = specWithComponent('s_root', 's_evt', 's_data');
    const ids = new Set(['s_root', 's_evt', 's_data']);
    expect(() => assertInteractionSpecIntegrity(spec, ids)).not.toThrow();
  });

  it('throws when InteractionComponent.semanticNodeId is dangling', () => {
    const spec = specWithComponent('s_missing', 's_evt', 's_data');
    const ids = new Set(['s_root', 's_evt', 's_data']);
    expect(() => assertInteractionSpecIntegrity(spec, ids)).toThrowError(
      /component ic_1: semanticNodeId s_missing does not exist in upstream semantic-view/,
    );
  });

  it('throws when InteractionEvent.source is dangling', () => {
    const spec = specWithComponent('s_root', 's_ghost', 's_data');
    const ids = new Set(['s_root', 's_evt', 's_data']);
    expect(() => assertInteractionSpecIntegrity(spec, ids)).toThrowError(
      /event ie_1: source s_ghost does not exist in upstream semantic-view/,
    );
  });

  it('throws when InteractionDataModel.source is dangling', () => {
    const spec = specWithComponent('s_root', 's_evt', 's_phantom');
    const ids = new Set(['s_root', 's_evt', 's_data']);
    expect(() => assertInteractionSpecIntegrity(spec, ids)).toThrowError(
      /dataModel id_1: source s_phantom does not exist in upstream semantic-view/,
    );
  });

  it('skips chain checks when semanticNodeIds is not provided', () => {
    /* Same spec with dangling sources, but no id set passed — only §5.1 runs,
     * and that does not check sources. Validator should not throw. */
    const spec = specWithComponent('s_missing', 's_ghost', 's_phantom');
    expect(() => assertInteractionSpecIntegrity(spec)).not.toThrow();
  });
});
