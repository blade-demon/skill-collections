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
            { x: 42, y: 196, width: 70, height: 20 },
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
