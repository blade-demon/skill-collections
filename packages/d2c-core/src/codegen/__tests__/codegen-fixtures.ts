/**
 * Shared codegen test fixtures — produce an APPROVED component-plan + its
 * upstream views, ready for `generateComponentPackage`.
 *
 * `generateComponentPackage` rejects any plan whose status is not 'approved'
 * (the core API enforces Gate 2 itself, not just the CLI), so codegen tests
 * must sign the derived draft off first.
 */
import { deriveComponentPlan } from '../../contract/derive-component-plan';
import { runContract } from '../../contract/run-contract';
import { bridgedFullChat } from '../../contract/__tests__/fixtures';
import {
  makeMixedTextMediaView,
  presentationalInput,
} from '../../contract/__tests__/component-plan-fixtures';
import type { DesignIR, VisualNode } from '../../ir';
import { approveComponentPlan } from '../sign-off';
import type { CodegenInput } from '../target';

const APPROVAL = {
  reason: 'visual delivery first; interaction deferred',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
} as const;

const SIGN_OFF = {
  approvedBy: 'alice',
  approvedAt: '2026-05-29T00:00:00Z',
  acknowledgedBehaviorStubbed: true,
} as const;

/** Approved presentational input from the full runContract chain (no stub props). */
export function approvedCodegenInput(): CodegenInput {
  const { designIr } = bridgedFullChat();
  const { componentPlan, visualView, semanticView, interactionSpec } = runContract({
    designIr,
    mode: 'presentational',
    interactionMode: 'deferred',
    approval: APPROVAL,
  });
  return {
    componentPlan: approveComponentPlan(componentPlan, SIGN_OFF),
    visualView,
    semanticView,
    interactionSpec,
  };
}

/**
 * Approved presentational input that carries presentational-stub props
 * (presentationalInput's deferred interaction-spec injects dataModels).
 */
export function approvedStubPropsInput(): CodegenInput {
  const input = presentationalInput();
  const { componentPlan } = deriveComponentPlan(input);
  return {
    componentPlan: approveComponentPlan(componentPlan, SIGN_OFF),
    visualView: input.visualView,
    semanticView: input.semanticView,
    interactionSpec: input.interactionSpec,
  };
}

/** Approved presentational input with visible text + media child nodes. */
export function approvedMixedTextMediaInput(): CodegenInput {
  const input = presentationalInput(makeMixedTextMediaView);
  const { componentPlan } = deriveComponentPlan(input);
  return {
    componentPlan: approveComponentPlan(componentPlan, SIGN_OFF),
    visualView: input.visualView,
    semanticView: input.semanticView,
    interactionSpec: input.interactionSpec,
  };
}

function source(nodeId: string, originalType = 'frame'): VisualNode['source'] {
  return { nodeId, name: nodeId, originalType, provider: 'test' };
}

function frame(
  id: string,
  name: string,
  layout: VisualNode['layout'],
  children: VisualNode[] = [],
  extras: Partial<VisualNode> = {},
): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'frame',
    name,
    source: source(id, 'frame'),
    layout,
    children,
    ...extras,
  };
}

function text(
  id: string,
  content: string,
  layout: VisualNode['layout'],
  style: NonNullable<VisualNode['text']>['style'],
): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'text',
    name: `Text-${id}`,
    source: source(id, 'text'),
    layout,
    text: { content, style },
    children: [],
  };
}

function shape(id: string, layout: VisualNode['layout'], children: VisualNode[] = []): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'shape',
    name: `Shape-${id}`,
    source: source(id, 'shape'),
    layout,
    children,
  };
}

export function styledCardDesignIr(): DesignIR {
  const root = frame(
    'root',
    'LaunchPanel',
    { x: 0, y: 0, width: 390, height: 260 },
    [
      text(
        'eyebrow',
        'D2C Preview',
        { x: 28, y: 28, width: 180, height: 20 },
        {
          fontFamily: 'Inter',
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 18,
          color: '#2563EBFF',
        },
      ),
      text(
        'title',
        'Launch faster',
        { x: 28, y: 60, width: 300, height: 42 },
        {
          fontFamily: 'Inter',
          fontSize: 32,
          fontWeight: 800,
          lineHeight: 38,
          color: '#0F172AFF',
        },
      ),
      text(
        'subtitle',
        'Generated React should preserve layout, text and visual styling.',
        { x: 28, y: 112, width: 315, height: 46 },
        {
          fontFamily: 'Inter',
          fontSize: 15,
          fontWeight: 400,
          lineHeight: 22,
          color: '#475569FF',
        },
      ),
      frame(
        'cta',
        'Primary CTA',
        { x: 28, y: 184, width: 132, height: 44 },
        [
          text(
            'cta-label',
            'Start',
            // parent-relative to `cta` (28,184): real normalized layout is
            // parent-relative, so nested coordinates are offsets, not absolute.
            { x: 14, y: 12, width: 70, height: 20 },
            {
              fontFamily: 'Inter',
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 20,
              color: '#FFFFFFFF',
              textAlign: 'center',
            },
          ),
        ],
        {
          style: {
            fills: [{ type: 'color', color: '#2563EBFF' }],
            radius: 22,
          },
        },
      ),
    ],
    {
      style: {
        fills: [{ type: 'color', color: '#F8FAFCFF' }],
        borders: [{ type: 'color', color: '#CBD5E1FF', thickness: 1 }],
        effects: [{ type: 'dropShadow', x: 0, y: 18, blur: 40, spread: -18, color: '#0F172A33' }],
        radius: 24,
      },
    },
  );

  return {
    schemaVersion: 'd2c.design-ir/v0.2.0',
    source: {
      provider: 'test',
      ref: { fileName: 'fixture.sketch', documentId: 'doc-1' },
      rootName: 'Launch Panel',
    },
    visual: {
      artboard: { width: root.layout.width, height: root.layout.height },
      root,
      assets: [],
    },
    semantic: { candidates: [] },
    interaction: { status: 'draft' },
    warnings: [],
  };
}

/** Approved presentational input with card-level visual styling and no assets. */
export function approvedStyledCardInput(): CodegenInput {
  const { componentPlan, visualView, semanticView, interactionSpec } = runContract({
    designIr: styledCardDesignIr(),
    mode: 'presentational',
    interactionMode: 'deferred',
    approval: APPROVAL,
  });
  return {
    componentPlan: approveComponentPlan(componentPlan, SIGN_OFF),
    visualView,
    semanticView,
    interactionSpec,
  };
}

/**
 * Mirrors the real KeyboardInput3 symbol-instance repro. `panel` is a 36×36
 * component-sized frame placed at the parent-relative offset (295,11); its own
 * children sit at frame-local coordinates (4,4) / (13,17.25). Bounds are
 * parent-relative (identical to visual layout — see the real design-ir), so the
 * children must keep their local offsets. The pre-fix codegen subtracted the
 * already-relative parent origin, producing left:-291 / -282 — i.e. rendering
 * the children ~290px outside the 36×36 frame.
 */
export function nestedRebasingDesignIr(): DesignIR {
  const root = frame('screen', 'Screen', { x: 0, y: 0, width: 375, height: 200 }, [
    frame('panel', 'KeyboardInput3', { x: 295, y: 11, width: 36, height: 36 }, [
      frame('box', 'Box', { x: 4, y: 4, width: 28, height: 28 }, [], {
        style: { borders: [{ type: 'color', color: '#198CFEFF', thickness: 1.5 }] },
      }),
      frame('bar', 'Bar', { x: 13, y: 17.25, width: 10, height: 1.5 }, [], {
        style: { fills: [{ type: 'color', color: '#198CFEFF' }] },
      }),
    ]),
  ]);

  return {
    schemaVersion: 'd2c.design-ir/v0.2.0',
    source: {
      provider: 'test',
      ref: { fileName: 'fixture.sketch', documentId: 'doc-1' },
      rootName: 'Screen',
    },
    visual: {
      artboard: { width: root.layout.width, height: root.layout.height },
      root,
      assets: [],
    },
    semantic: { candidates: [] },
    interaction: { status: 'draft' },
    warnings: [],
  };
}

/** Approved presentational input reproducing the nested component-boundary rebasing bug. */
export function approvedNestedRebasingInput(): CodegenInput {
  const { componentPlan, visualView, semanticView, interactionSpec } = runContract({
    designIr: nestedRebasingDesignIr(),
    mode: 'presentational',
    interactionMode: 'deferred',
    approval: APPROVAL,
  });
  return {
    componentPlan: approveComponentPlan(componentPlan, SIGN_OFF),
    visualView,
    semanticView,
    interactionSpec,
  };
}

export function stackInlineLayoutDesignIr(): DesignIR {
  const root = frame('layout-screen', 'LayoutScreen', { x: 0, y: 0, width: 320, height: 260 }, [
    frame('stack-component', 'StackCard', { x: 20, y: 20, width: 260, height: 100 }, [
      shape('stack-item-a', { x: 12, y: 8, width: 80, height: 20 }),
      shape('stack-item-b', { x: 12, y: 38, width: 80, height: 20 }),
      shape('stack-item-c', { x: 12, y: 68, width: 80, height: 20 }),
    ]),
    frame('inline-container', 'InlineContainer', { x: 20, y: 140, width: 260, height: 80 }, [
      frame('inline-item-a', 'InlineItemA', { x: 10, y: 10, width: 60, height: 50 }, [
        shape('inline-nested-a', { x: 4, y: 5, width: 20, height: 10 }),
      ]),
      frame('inline-item-b', 'InlineItemB', { x: 80, y: 10, width: 60, height: 50 }, [
        shape('inline-nested-b', { x: 4, y: 5, width: 20, height: 10 }),
      ]),
      frame('inline-item-c', 'InlineItemC', { x: 150, y: 10, width: 60, height: 50 }, [
        shape('inline-nested-c', { x: 4, y: 5, width: 20, height: 10 }),
      ]),
    ]),
  ]);

  return {
    schemaVersion: 'd2c.design-ir/v0.2.0',
    source: {
      provider: 'test',
      ref: { fileName: 'layout-fixture.sketch', documentId: 'layout-doc' },
      rootName: 'Layout Screen',
    },
    visual: {
      artboard: { width: root.layout.width, height: root.layout.height },
      root,
      assets: [],
    },
    semantic: {
      candidates: [
        {
          nodeId: 'node-stack-component',
          candidateName: 'StackCard',
          confidence: 'high',
          reason: 'layout projection fixture component boundary',
        },
      ],
    },
    interaction: { status: 'draft' },
    warnings: [],
  };
}

function stackInlineDraftInput(): CodegenInput {
  const { componentPlan, visualView, semanticView, interactionSpec } = runContract({
    designIr: stackInlineLayoutDesignIr(),
    mode: 'presentational',
    interactionMode: 'deferred',
    approval: APPROVAL,
  });
  const inlineSemanticNodeId = semanticView.body.nodes.find(
    (node) => node.primaryVisualNodeId === 'node-inline-container',
  )?.id;
  if (inlineSemanticNodeId === undefined) {
    throw new Error('layout fixture invariant: inline container semantic node missing');
  }
  const inlineComponentId = componentPlan.body.components.find(
    (component) => component.semanticNodeId === inlineSemanticNodeId,
  )?.id;
  if (inlineComponentId === undefined) {
    throw new Error('layout fixture invariant: inferred inline component missing');
  }

  return {
    componentPlan: {
      ...componentPlan,
      body: {
        ...componentPlan.body,
        components: componentPlan.body.components.filter(
          (component) => component.id !== inlineComponentId,
        ),
        exports: componentPlan.body.exports.filter(
          (entry) => entry.plannedComponentId !== inlineComponentId,
        ),
      },
    },
    visualView,
    semanticView,
    interactionSpec,
  };
}

/**
 * Root component stays absolute, a planned child component owns a stack
 * `.root`, and the sibling inline container remains ordinary nested markup.
 */
export function approvedStackInlineInput(): CodegenInput {
  const input = stackInlineDraftInput();
  return {
    ...input,
    componentPlan: approveComponentPlan(input.componentPlan, SIGN_OFF),
  };
}

/**
 * Same graph as approvedStackInlineInput, but the root itself is stack so the
 * ordinary inline container is simultaneously a flow child and flex container.
 */
export function approvedNestedFlexContainersInput(): CodegenInput {
  const input = stackInlineDraftInput();
  const rootSemanticNodeId = input.componentPlan.body.rootComponent.semanticNodeId;
  const componentPlan = {
    ...input.componentPlan,
    body: {
      ...input.componentPlan.body,
      layoutPlan: input.componentPlan.body.layoutPlan.map((layout) =>
        layout.semanticNodeId === rootSemanticNodeId
          ? {
              id: 'layout-root-stack-test',
              semanticNodeId: rootSemanticNodeId,
              strategy: 'stack' as const,
              confidence: 'high' as const,
              constraints: [],
              caveats: ['test fixture: root stack projection'],
            }
          : layout,
      ),
    },
  };
  return {
    ...input,
    componentPlan: approveComponentPlan(componentPlan, SIGN_OFF),
  };
}
