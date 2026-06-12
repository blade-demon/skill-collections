import { describe, expect, it } from 'vitest';

import type { SemanticView } from '../../ir';
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
  schemaVersion: 'd2c.design-ir/v0.3.0',
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

function reuseBody(overrides: Partial<ComponentPlanBody> = {}): ComponentPlanBody {
  const root = rootComponent({
    childSemanticNodeIds: ['s_status_a', 's_status_b'],
  });
  const representative = rootComponent({
    id: 'pc_status_a',
    semanticNodeId: 's_status_a',
    name: 'StatusBar',
    role: 'component',
    childSemanticNodeIds: ['s_label_a'],
  });
  return body({
    rootComponent: root,
    components: [root, representative],
    exports: [
      { id: 'pe_root', plannedComponentId: 'pc_root', exportName: 'Screen', kind: 'default' },
      {
        id: 'pe_status',
        plannedComponentId: 'pc_status_a',
        exportName: 'StatusBar',
        kind: 'named',
      },
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
        id: 'pl_status_a',
        semanticNodeId: 's_status_a',
        strategy: 'absolute',
        confidence: 'medium',
        constraints: [],
        caveats: [],
      },
      {
        id: 'pl_status_b',
        semanticNodeId: 's_status_b',
        strategy: 'absolute',
        confidence: 'medium',
        constraints: [],
        caveats: [],
      },
    ],
    componentDefinitions: [
      {
        id: 'cd_status',
        source: { kind: 'symbol-master', masterId: 'master-status' },
        componentId: 'pc_status_a',
        propSchema: [{ name: 'title', type: 'text', defaultValue: 'A' }],
      },
    ],
    componentInvocations: [
      {
        id: 'ci_status_a',
        definitionId: 'cd_status',
        semanticNodeId: 's_status_a',
        caller: { kind: 'component', componentId: 'pc_root' },
        order: 0,
        placement: { x: 0, y: 0, width: 320, height: 44 },
        bindings: { title: 'A' },
        nodeMap: {
          s_status_a: 's_status_a',
          s_label_a: 's_label_a',
        },
      },
      {
        id: 'ci_status_b',
        definitionId: 'cd_status',
        semanticNodeId: 's_status_b',
        caller: { kind: 'component', componentId: 'pc_root' },
        order: 1,
        placement: { x: 0, y: 100, width: 320, height: 44 },
        bindings: { title: 'B' },
        nodeMap: {
          s_status_a: 's_status_b',
          s_label_a: 's_label_b',
        },
      },
    ],
    invocationEdges: [
      {
        caller: { kind: 'component', componentId: 'pc_root' },
        boundarySemanticNodeId: 's_status_a',
        invocationId: 'ci_status_a',
      },
      {
        caller: { kind: 'component', componentId: 'pc_root' },
        boundarySemanticNodeId: 's_status_b',
        invocationId: 'ci_status_b',
      },
    ],
    collections: [],
    ...overrides,
  });
}

function reusePlan(bodyOverrides: Partial<ComponentPlanBody> = {}): ComponentPlan {
  return plan({ body: reuseBody(bodyOverrides) });
}

function semanticNode(
  id: string,
  parentId: string | undefined,
  childIds: string[],
  kind: 'screen' | 'component' | 'text',
) {
  return {
    kind,
    id,
    name: id,
    primaryVisualNodeId: `v_${id}`,
    visualNodeIds: [`v_${id}`],
    ...(parentId === undefined ? {} : { parentId }),
    childIds,
    bounds: { x: 0, y: 0, width: 100, height: 20 },
    confidence: 'high' as const,
    evidence: [{ kind: 'visual-node' as const, nodeId: `v_${id}`, reason: 'fixture' }],
    source: { nodeIds: [`src_${id}`] },
  };
}

function reuseSemanticView(): SemanticView {
  return {
    kind: 'semantic-view',
    generatedFrom: {
      schemaVersion: 'd2c.design-ir/v0.3.0',
      designIrHash: 'a'.repeat(64),
      visualViewHash: 'b'.repeat(64),
    },
    body: {
      screen: { semanticNodeId: 's_screen', name: 'Screen' },
      nodes: [
        semanticNode('s_screen', undefined, ['s_status_a', 's_status_b'], 'screen'),
        semanticNode('s_status_a', 's_screen', ['s_label_a'], 'component'),
        semanticNode('s_label_a', 's_status_a', [], 'text'),
        semanticNode('s_status_b', 's_screen', ['s_label_b'], 'component'),
        semanticNode('s_label_b', 's_status_b', [], 'text'),
      ],
      componentCandidates: [],
      repeatedPatterns: [],
      layoutCandidates: [],
      warnings: [],
    },
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

  it('accepts a valid definition/invocation graph', () => {
    expect(() => assertComponentPlanIntegrity(reusePlan())).not.toThrow();
  });

  it('rejects an invocation whose definition is missing', () => {
    expect(() =>
      assertComponentPlanIntegrity(reusePlan({ componentDefinitions: [] })),
    ).toThrowError(/invocation ci_status_a: definitionId cd_status does not resolve/);
  });

  it('rejects a dangling component caller', () => {
    const invocations = reuseBody().componentInvocations!;
    const broken = invocations.map((invocation, index) =>
      index === 0
        ? {
            ...invocation,
            caller: { kind: 'component' as const, componentId: 'pc_missing' },
          }
        : invocation,
    );
    expect(() =>
      assertComponentPlanIntegrity(reusePlan({ componentInvocations: broken })),
    ).toThrowError(/invocation ci_status_a: caller componentId pc_missing does not resolve/);
  });

  it('rejects a binding not declared by the definition propSchema', () => {
    const invocations = reuseBody().componentInvocations!;
    const broken = invocations.map((invocation, index) =>
      index === 0
        ? { ...invocation, bindings: { ...invocation.bindings, unknown: 'value' } }
        : invocation,
    );
    expect(() =>
      assertComponentPlanIntegrity(reusePlan({ componentInvocations: broken })),
    ).toThrowError(/invocation ci_status_a: binding unknown is not declared/);
  });

  it('rejects a non-bijective nodeMap', () => {
    const invocations = reuseBody().componentInvocations!;
    const broken = invocations.map((invocation, index) =>
      index === 0
        ? {
            ...invocation,
            nodeMap: { s_status_a: 's_status_a', s_label_a: 's_status_a' },
          }
        : invocation,
    );
    expect(() =>
      assertComponentPlanIntegrity(reusePlan({ componentInvocations: broken })),
    ).toThrowError(/invocation ci_status_a: nodeMap values must be unique/);
  });

  it('rejects an empty nodeMap without requiring semantic-view context', () => {
    const invocations = reuseBody().componentInvocations!;
    const broken = invocations.map((invocation, index) =>
      index === 0 ? { ...invocation, nodeMap: {} } : invocation,
    );
    expect(() =>
      assertComponentPlanIntegrity(reusePlan({ componentInvocations: broken })),
    ).toThrowError(/invocation ci_status_a: nodeMap must not be empty/);
  });

  it('rejects an edge whose caller disagrees with the child invocation', () => {
    const edges = reuseBody().invocationEdges!;
    const broken = edges.map((edge, index) =>
      index === 0
        ? {
            ...edge,
            caller: { kind: 'component' as const, componentId: 'pc_status_a' },
          }
        : edge,
    );
    expect(() => assertComponentPlanIntegrity(reusePlan({ invocationEdges: broken }))).toThrowError(
      /edge for invocation ci_status_a: caller does not match invocation caller/,
    );
  });

  it('rejects duplicate edges for the same caller boundary', () => {
    const edges = reuseBody().invocationEdges!;
    expect(() =>
      assertComponentPlanIntegrity(reusePlan({ invocationEdges: [...edges, edges[0]!] })),
    ).toThrowError(/duplicate invocation edge boundary/);
  });

  it('rejects an invocation caller cycle', () => {
    const invocations = reuseBody().componentInvocations!;
    const broken = invocations.map((invocation, index) => ({
      ...invocation,
      caller:
        index === 0
          ? { kind: 'invocation' as const, invocationId: 'ci_status_b' }
          : { kind: 'invocation' as const, invocationId: 'ci_status_a' },
    }));
    const edges = reuseBody().invocationEdges!.map((edge, index) => ({
      ...edge,
      caller: broken[index]!.caller,
    }));
    expect(() =>
      assertComponentPlanIntegrity(
        reusePlan({ componentInvocations: broken, invocationEdges: edges }),
      ),
    ).toThrowError(/invocation graph cycle/);
  });

  it('requires nodeMap keys and values to cover representative and instance render domains', () => {
    const invocations = reuseBody().componentInvocations!;
    const broken = invocations.map((invocation, index) =>
      index === 1
        ? {
            ...invocation,
            nodeMap: { s_status_a: 's_status_b' },
          }
        : invocation,
    );
    expect(() =>
      assertComponentPlanIntegrity(reusePlan({ componentInvocations: broken }), {
        semanticView: reuseSemanticView(),
      }),
    ).toThrowError(/invocation ci_status_b: nodeMap keys must equal definition render domain/);
  });

  it('rejects a caller that resolves but is not the invocation boundary semantic owner', () => {
    const invocations = reuseBody().componentInvocations!.map((invocation, index) =>
      index === 1
        ? {
            ...invocation,
            caller: { kind: 'component' as const, componentId: 'pc_status_a' },
          }
        : invocation,
    );
    const edges = reuseBody().invocationEdges!.map((edge, index) =>
      index === 1 ? { ...edge, caller: invocations[index]!.caller } : edge,
    );
    expect(() =>
      assertComponentPlanIntegrity(
        reusePlan({ componentInvocations: invocations, invocationEdges: edges }),
        { semanticView: reuseSemanticView() },
      ),
    ).toThrowError(/invocationEdges boundary set does not match semantic caller boundaries/);
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

  it('throws when invocation semantic ids or nodeMap ids are missing upstream', () => {
    const invocations = reuseBody().componentInvocations!.map((invocation, index) =>
      index === 1
        ? {
            ...invocation,
            semanticNodeId: 's_missing_invocation',
            nodeMap: {
              s_status_a: 's_missing_invocation',
              s_label_a: 's_missing_label',
            },
          }
        : invocation,
    );
    const edges = reuseBody().invocationEdges!.map((edge, index) =>
      index === 1
        ? {
            ...edge,
            boundarySemanticNodeId: 's_missing_invocation',
          }
        : edge,
    );
    expect(() =>
      assertComponentPlanIntegrity(
        reusePlan({ componentInvocations: invocations, invocationEdges: edges }),
        {
          semanticNodeIds: new Set([
            's_screen',
            's_status_a',
            's_label_a',
            's_status_b',
            's_label_b',
          ]),
        },
      ),
    ).toThrowError(
      /invocation ci_status_b: semanticNodeId s_missing_invocation does not exist in upstream semantic-view/,
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
