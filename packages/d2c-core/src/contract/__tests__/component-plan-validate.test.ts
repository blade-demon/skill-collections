import { describe, expect, it } from 'vitest';

import type { ComponentPlan, ComponentPlanBody, PlannedComponent } from '../component-plan-schema';
import type {
  InteractionCoverageStatus,
  InteractionSpec,
  InteractionSpecBody,
} from '../interaction-schema';
import {
  ComponentPlanIntegrityError,
  assertComponentPlanIntegrity,
} from '../component-plan-validate';

/**
 * Stage 5C-PR-1 graph-level validator tests.
 *
 * Shape-level and approval-shape negatives live in
 * ./component-plan-schema.test.ts. The fixtures here are shape-valid unless a
 * test intentionally proves the validator does not own approval shape.
 */

const generatedFrom = {
  schemaVersion: 'd2c.design-ir/v0.2.0',
  designIrHash: 'a'.repeat(64),
  visualViewHash: 'b'.repeat(64),
  semanticViewHash: 'c'.repeat(64),
  interactionSpecHash: 'd'.repeat(64),
};

const approvalFull = {
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

function rootComponent(overrides: Partial<PlannedComponent> = {}): PlannedComponent {
  return {
    id: 'pc_root',
    semanticNodeId: 's_screen',
    name: 'Screen',
    role: 'root',
    renderAs: 'component',
    childSemanticNodeIds: ['s_title'],
    props: [],
    eventBindings: [],
    dataBindings: [],
    confidence: 'high',
    warnings: [],
    ...overrides,
  };
}

function body(overrides: Partial<ComponentPlanBody> = {}): ComponentPlanBody {
  const root = rootComponent();
  return {
    target: { framework: 'react', language: 'ts', styling: 'bem-css' },
    rootComponent: root,
    components: [root],
    exports: [
      { id: 'pe_root', plannedComponentId: 'pc_root', exportName: 'Screen', kind: 'default' },
    ],
    layoutPlan: [
      {
        id: 'pl_root',
        semanticNodeId: 's_screen',
        strategy: 'absolute',
        confidence: 'medium',
        constraints: [],
        caveats: [],
      },
      {
        id: 'pl_title',
        semanticNodeId: 's_title',
        strategy: 'inline',
        confidence: 'medium',
        constraints: [],
        caveats: [],
      },
    ],
    assetPlan: [],
    interactionCoverage: coverageAll('omitted'),
    warnings: [],
    ...overrides,
  };
}

function plan(overrides: Partial<ComponentPlan> = {}): ComponentPlan {
  return {
    kind: 'component-plan',
    generatedFrom,
    status: 'draft',
    mode: 'presentational',
    body: body(),
    ...overrides,
  };
}

function interactionBody(
  coverageStatus: InteractionCoverageStatus = 'omitted',
): InteractionSpecBody {
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

function interactionSpec(
  status: 'approved' | 'omitted' | 'deferred' = 'omitted',
  overrides: Partial<InteractionSpecBody> = {},
): InteractionSpec {
  const fullBody = { ...interactionBody(status === 'approved' ? 'covered' : status), ...overrides };
  if (status === 'approved') {
    return {
      kind: 'interaction-spec',
      generatedFrom,
      status,
      ...approvalFull,
      body: fullBody,
    };
  }
  return {
    kind: 'interaction-spec',
    generatedFrom,
    status,
    reason: 'approved for component planning',
    ...approvalFull,
    body: fullBody,
  };
}

describe('assertComponentPlanIntegrity — intra-plan', () => {
  it('passes a minimal presentational draft', () => {
    expect(() => assertComponentPlanIntegrity(plan())).not.toThrow();
  });

  it('does not repeat schema-owned approval shape checks', () => {
    const approvedWithoutApproval = plan({
      status: 'approved',
      mode: 'interactive',
    });
    expect(() => assertComponentPlanIntegrity(approvedWithoutApproval)).not.toThrow();
  });

  it('throws when rootComponent.id is absent from body.components', () => {
    const broken = plan({ body: body({ components: [] }) });
    expect(() => assertComponentPlanIntegrity(broken)).toThrowError(ComponentPlanIntegrityError);
    expect(() => assertComponentPlanIntegrity(broken)).toThrowError(
      /rootComponent.id pc_root must appear in body.components/,
    );
  });

  it('throws when the root component role is not root', () => {
    const nonRoot = rootComponent({ role: 'component' });
    const broken = plan({
      body: body({ rootComponent: nonRoot, components: [nonRoot] }),
    });
    expect(() => assertComponentPlanIntegrity(broken)).toThrowError(
      /rootComponent pc_root must have role 'root'/,
    );
  });

  it('throws when an id is reused across components and exports', () => {
    const broken = plan({
      body: body({
        exports: [
          {
            id: 'pc_root',
            plannedComponentId: 'pc_root',
            exportName: 'Screen',
            kind: 'default',
          },
        ],
      }),
    });
    expect(() => assertComponentPlanIntegrity(broken)).toThrowError(
      /id pc_root is reused across component-plan body/,
    );
  });

  it('throws when an export points at a missing planned component', () => {
    const broken = plan({
      body: body({
        exports: [
          {
            id: 'pe_missing',
            plannedComponentId: 'pc_missing',
            exportName: 'Missing',
            kind: 'named',
          },
        ],
      }),
    });
    expect(() => assertComponentPlanIntegrity(broken)).toThrowError(
      /export pe_missing: plannedComponentId pc_missing does not match any body.components id/,
    );
  });

  it('throws when a component lists its own semanticNodeId as a child', () => {
    const self = rootComponent({ childSemanticNodeIds: ['s_screen'] });
    const broken = plan({ body: body({ rootComponent: self, components: [self] }) });
    expect(() => assertComponentPlanIntegrity(broken)).toThrowError(
      /component pc_root: childSemanticNodeIds must not include its own semanticNodeId s_screen/,
    );
  });

  it('throws when a layout semanticNodeId is not used by a component or root child', () => {
    const broken = plan({
      body: body({
        layoutPlan: [
          {
            id: 'pl_orphan',
            semanticNodeId: 's_orphan',
            strategy: 'absolute',
            confidence: 'low',
            constraints: [],
            caveats: [],
          },
        ],
      }),
    });
    expect(() => assertComponentPlanIntegrity(broken)).toThrowError(
      /layout pl_orphan: semanticNodeId s_orphan is not used by a planned component or root child/,
    );
  });

  it('throws when a presentational-stub prop is not explained by deferred dataBinding coverage', () => {
    const root = rootComponent({
      props: [
        {
          name: 'title',
          type: 'string',
          source: 'presentational-stub',
          required: false,
          interactionRefId: 'dm_title',
        },
      ],
    });
    const broken = plan({ body: body({ rootComponent: root, components: [root] }) });
    expect(() => assertComponentPlanIntegrity(broken)).toThrowError(
      /presentational-stub prop pc_root.title requires interactionCoverage.dataBinding.status='deferred'/,
    );
  });

  it('accepts a presentational-stub prop when dataBinding coverage is deferred', () => {
    const root = rootComponent({
      props: [
        {
          name: 'title',
          type: 'string',
          source: 'presentational-stub',
          required: false,
          interactionRefId: 'dm_title',
        },
      ],
    });
    expect(() =>
      assertComponentPlanIntegrity(
        plan({
          body: body({
            rootComponent: root,
            components: [root],
            interactionCoverage: coverageAll('deferred'),
          }),
        }),
      ),
    ).not.toThrow();
  });
});

describe('assertComponentPlanIntegrity — artifact-chain context', () => {
  it('passes when semantic ids and interaction refs resolve', () => {
    const root = rootComponent({
      eventBindings: [
        {
          eventId: 'ie_submit',
          sourceSemanticNodeId: 's_button',
          handlerProp: 'onSubmit',
          payload: {},
        },
      ],
      dataBindings: [
        {
          dataModelId: 'dm_title',
          sourceSemanticNodeId: 's_title',
          propName: 'title',
          type: 'string',
        },
      ],
    });
    expect(() =>
      assertComponentPlanIntegrity(
        plan({ mode: 'interactive', body: body({ rootComponent: root, components: [root] }) }),
        {
          semanticNodeIds: new Set(['s_screen', 's_title', 's_button']),
          interactionSpec: interactionSpec('approved', {
            coverage: coverageAll('covered'),
            events: [
              {
                id: 'ie_submit',
                eventName: 'submit',
                source: 's_button',
                handlerProp: 'onSubmit',
                payload: {},
                confidence: 'low',
                evidenceMessage: 'button name',
              },
            ],
            dataModels: [
              {
                id: 'dm_title',
                slotName: 'title',
                source: 's_title',
                type: 'string',
                confidence: 'medium',
                evidenceMessage: 'text node',
              },
            ],
          }),
        },
      ),
    ).not.toThrow();
  });

  it('throws when a planned component semanticNodeId is missing upstream', () => {
    expect(() =>
      assertComponentPlanIntegrity(plan(), {
        semanticNodeIds: new Set(['s_title']),
      }),
    ).toThrowError(
      /component pc_root: semanticNodeId s_screen does not exist in upstream semantic-view/,
    );
  });

  it('throws when a childSemanticNodeId is missing upstream', () => {
    expect(() =>
      assertComponentPlanIntegrity(plan(), {
        semanticNodeIds: new Set(['s_screen']),
      }),
    ).toThrowError(
      /component pc_root: childSemanticNodeId s_title does not exist in upstream semantic-view/,
    );
  });

  it('throws when an asset semanticNodeId is missing upstream', () => {
    const broken = plan({
      body: body({
        assetPlan: [
          {
            id: 'pa_logo',
            semanticNodeId: 's_logo',
            assetRef: 'asset_logo.png',
            usage: 'image',
            required: true,
          },
        ],
      }),
    });
    expect(() =>
      assertComponentPlanIntegrity(broken, {
        semanticNodeIds: new Set(['s_screen', 's_title']),
      }),
    ).toThrowError(/asset pa_logo: semanticNodeId s_logo does not exist in upstream semantic-view/);
  });

  it('throws when an event binding points at a missing interaction event', () => {
    const root = rootComponent({
      eventBindings: [
        {
          eventId: 'ie_missing',
          sourceSemanticNodeId: 's_button',
          handlerProp: 'onSubmit',
          payload: {},
        },
      ],
    });
    expect(() =>
      assertComponentPlanIntegrity(
        plan({ mode: 'interactive', body: body({ rootComponent: root, components: [root] }) }),
        {
          interactionSpec: interactionSpec('approved', { coverage: coverageAll('covered') }),
        },
      ),
    ).toThrowError(
      /component pc_root: eventBinding ie_missing does not match any interactionSpec.body.events id/,
    );
  });

  it('throws when a data binding points at a missing interaction data model', () => {
    const root = rootComponent({
      dataBindings: [
        {
          dataModelId: 'dm_missing',
          sourceSemanticNodeId: 's_title',
          propName: 'title',
          type: 'string',
        },
      ],
    });
    expect(() =>
      assertComponentPlanIntegrity(
        plan({ mode: 'interactive', body: body({ rootComponent: root, components: [root] }) }),
        {
          interactionSpec: interactionSpec('approved', { coverage: coverageAll('covered') }),
        },
      ),
    ).toThrowError(
      /component pc_root: dataBinding dm_missing does not match any interactionSpec.body.dataModels id/,
    );
  });

  it('throws when interactive mode is paired with a non-approved interaction spec', () => {
    expect(() =>
      assertComponentPlanIntegrity(plan({ mode: 'interactive' }), {
        interactionSpec: interactionSpec('deferred'),
      }),
    ).toThrowError(
      /plan.mode is 'interactive' but interactionSpec.status is 'deferred' — interactive mode requires an approved interaction spec/,
    );
  });

  it('throws when presentational mode is paired with an approved interaction spec', () => {
    expect(() =>
      assertComponentPlanIntegrity(plan({ mode: 'presentational' }), {
        interactionSpec: interactionSpec('approved', { coverage: coverageAll('covered') }),
      }),
    ).toThrowError(
      /plan.mode is 'presentational' but interactionSpec.status is 'approved' — presentational mode requires omitted or deferred interaction spec/,
    );
  });
});
