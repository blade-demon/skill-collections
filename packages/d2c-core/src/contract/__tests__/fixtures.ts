/**
 * Stage 5B-PR-2 — inline TS fixtures for deriveInteractionSpec tests.
 *
 * Two kinds of fixtures:
 *
 *   1. 5A → 5B bridges: helpers that take one of the existing 5A
 *      Stage5aFixture makers, run deriveSemanticView once, and return a
 *      fully-wired DeriveInteractionSpecInput. Saves every test from
 *      re-running 5A boilerplate.
 *
 *   2. 5B-specific fixtures (Stage5bRawFixture): inline VisualNode trees
 *      tailored to stress the draft heuristics — button/tab/input regex,
 *      text/media data slots, icon skip, kind guards.
 */
import { deriveSemanticView } from '../../semantic';
import type { DesignIR, VisualNode, VisualView } from '../../ir';
import { stableJson, stableSha256 } from '../../utils/stable-json';

import type { DeriveInteractionSpecInput } from '../derive-interaction';

import {
  makeAmbiguousGroupView,
  makeDecorativeBgView,
  makeFullChatView,
  makeListView,
  makeMultiKindRepeatParentView,
  makeSymbolHeavyView,
  collectImageAssets,
  type Stage5aFixture,
} from '../../semantic/__tests__/fixtures';

/* ── 5A → 5B bridge ──────────────────────────────────────────────────────── */

export function bridge(fx: Stage5aFixture): DeriveInteractionSpecInput {
  const { semanticView } = deriveSemanticView(fx);
  return { designIr: fx.designIr, visualView: fx.visualView, semanticView };
}

export const bridgedSymbolHeavy = (): DeriveInteractionSpecInput => bridge(makeSymbolHeavyView());
export const bridgedList = (): DeriveInteractionSpecInput => bridge(makeListView());
export const bridgedAmbiguousGroup = (): DeriveInteractionSpecInput =>
  bridge(makeAmbiguousGroupView());
export const bridgedDecorativeBg = (): DeriveInteractionSpecInput => bridge(makeDecorativeBgView());
export const bridgedFullChat = (): DeriveInteractionSpecInput => bridge(makeFullChatView());
export const bridgedMultiKindRepeatParent = (): DeriveInteractionSpecInput =>
  bridge(makeMultiKindRepeatParentView());

/* ── 5B-specific raw VisualNode helpers ──────────────────────────────────── */

function source(nodeId: string, originalType = 'group'): VisualNode['source'] {
  return { nodeId, name: nodeId, originalType, 提供方: 'test' };
}

function frame(
  id: string,
  name: string,
  layout: VisualNode['layout'],
  children: VisualNode[] = [],
): VisualNode {
  return { id: `node-${id}`, kind: 'frame', name, source: source(id, 'frame'), layout, children };
}

function text(id: string, content: string, layout: VisualNode['layout']): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'text',
    name: `Text-${id}`,
    source: source(id, 'text'),
    layout,
    text: { content, style: { fontFamily: 'Inter', fontSize: 14, color: '#111111FF' } },
    children: [],
  };
}

function image(
  id: string,
  name: string,
  layout: VisualNode['layout'],
  assetRef = 'asset-img',
): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'image',
    name,
    source: source(id, 'bitmap'),
    layout,
    assetRef,
    children: [],
  };
}

function symbolInstance(
  id: string,
  name: string,
  layout: VisualNode['layout'],
  masterId: string,
  children: VisualNode[] = [],
  extras: Partial<VisualNode> = {},
): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'frame',
    name,
    source: source(id, 'symbolInstance'),
    layout,
    symbol: { instanceId: id, masterId, overrides: [] },
    children,
    ...extras,
  };
}

function wrapDesignIR(root: VisualNode, rootName: string): DesignIR {
  return {
    schemaVersion: 'd2c.design-ir/v0.3.0',
    source: {
      提供方: 'test',
      ref: { fileName: 'fixture.sketch', documentId: 'doc-1' },
      rootName,
    },
    visual: {
      artboard: { width: root.layout.width, height: root.layout.height },
      root,
      assets: collectImageAssets(root),
    },
    semantic: { candidates: [] },
    interaction: { status: 'draft' },
    warnings: [],
  };
}

function packVisualView(designIr: DesignIR): VisualView {
  return {
    kind: 'visual-view',
    generatedFrom: {
      schemaVersion: designIr.schemaVersion,
      sourceRef: designIr.source.ref,
      designIrHash: stableSha256(stableJson(designIr)),
    },
    body: designIr.visual,
  };
}

function fixtureFromRoot(root: VisualNode, rootName: string): DeriveInteractionSpecInput {
  const designIr = wrapDesignIR(root, rootName);
  const visualView = packVisualView(designIr);
  const { semanticView } = deriveSemanticView({ designIr, visualView });
  return { designIr, visualView, semanticView };
}

/* ── 6) Buttony view ───────────────────────────────────────────────────────
 * Two frames with button-flavored names → 2 click events with low confidence.
 * Plus a text node literally named "Send" — must NOT promote (kind guard).
 */
export function makeButtonyView(): DeriveInteractionSpecInput {
  const root = frame('root', 'ButtonyRoot', { x: 0, y: 0, width: 320, height: 200 }, [
    frame('primary-button', 'PrimaryButton', { x: 0, y: 0, width: 160, height: 40 }),
    frame('send-cta', 'Send CTA', { x: 0, y: 50, width: 160, height: 40 }),
    /* text 'Send' MUST stay as a dataModel candidate, NOT become an event. */
    text('label-send', 'Send', { x: 0, y: 100, width: 160, height: 20 }),
  ]);
  return fixtureFromRoot(root, 'Buttony');
}

/* ── 7) Input composer view ────────────────────────────────────────────────
 * One frame with input-flavored name → event(change) + dataModel(value).
 */
export function makeInputComposerView(): DeriveInteractionSpecInput {
  const root = frame('root', 'InputRoot', { x: 0, y: 0, width: 320, height: 100 }, [
    frame('search-input', 'Search Input', { x: 0, y: 0, width: 320, height: 40 }, [
      text('placeholder', 'Type here', { x: 10, y: 10, width: 200, height: 20 }),
    ]),
  ]);
  return fixtureFromRoot(root, 'Input');
}

/* ── 8) Mixed text + media view ────────────────────────────────────────────
 * 3 text + 2 media (with assetRef) under root → 5 dataModels.
 * coverage.dataBinding = 'draft'.
 */
export function makeMixedTextMediaView(): DeriveInteractionSpecInput {
  const root = frame('root', 'MixedRoot', { x: 0, y: 0, width: 320, height: 360 }, [
    text('title', 'Title', { x: 0, y: 0, width: 320, height: 30 }),
    text('subtitle', 'Subtitle', { x: 0, y: 40, width: 320, height: 20 }),
    text('caption', 'Caption', { x: 0, y: 70, width: 320, height: 20 }),
    image('hero-image', 'HeroImage', { x: 0, y: 100, width: 320, height: 120 }, 'asset-hero'),
    image('avatar-image', 'AvatarImage', { x: 0, y: 240, width: 80, height: 80 }, 'asset-avatar'),
  ]);
  return fixtureFromRoot(root, 'MixedTextMedia');
}

/* ── Stage 7 component-reuse fixtures ───────────────────────────────────── */

export function makeFoldableSymbolInstancesView(): DeriveInteractionSpecInput {
  const root = frame('root', 'ReusableRoot', { x: 0, y: 0, width: 720, height: 120 }, [
    symbolInstance(
      'status-a',
      'StatusBar',
      { x: 0, y: 0, width: 320, height: 40 },
      'master-status',
      [text('status-a-label', 'First', { x: 16, y: 10, width: 100, height: 20 })],
      {
        style: {
          fills: [{ type: 'color', color: '#FFFFFFFF' }],
          raw: { sketchStyleId: 'instance-style-a' },
        },
      },
    ),
    symbolInstance(
      'status-b',
      'StatusBar',
      { x: 400, y: 60, width: 320, height: 40 },
      'master-status',
      [text('status-b-label', 'Second', { x: 16, y: 10, width: 100, height: 20 })],
      {
        style: {
          fills: [{ type: 'color', color: '#FFFFFFFF' }],
          raw: { sketchStyleId: 'instance-style-b' },
        },
      },
    ),
  ]);
  return fixtureFromRoot(root, 'Foldable Symbols');
}

export function makeFoldableBoundSymbolInstancesView(): DeriveInteractionSpecInput {
  const root = frame('root', 'BoundRoot', { x: 0, y: 0, width: 720, height: 120 }, [
    symbolInstance('send-a', 'SendButton', { x: 0, y: 0, width: 320, height: 40 }, 'master-send', [
      text('send-a-label', 'First', { x: 16, y: 10, width: 100, height: 20 }),
    ]),
    symbolInstance(
      'send-b',
      'SendButton',
      { x: 400, y: 60, width: 320, height: 40 },
      'master-send',
      [text('send-b-label', 'Second', { x: 16, y: 10, width: 100, height: 20 })],
    ),
  ]);
  return fixtureFromRoot(root, 'Bound Symbols');
}

export function makeMismatchedSymbolInstancesView(): DeriveInteractionSpecInput {
  const root = frame('root', 'MismatchRoot', { x: 0, y: 0, width: 720, height: 120 }, [
    symbolInstance('card-a', 'Card', { x: 0, y: 0, width: 320, height: 80 }, 'master-card', [
      text('card-a-label', 'First', { x: 16, y: 10, width: 100, height: 20 }),
    ]),
    symbolInstance('card-b', 'Card', { x: 400, y: 0, width: 300, height: 80 }, 'master-card', [
      text('card-b-label', 'Second', { x: 16, y: 10, width: 100, height: 20 }),
    ]),
  ]);
  return fixtureFromRoot(root, 'Mismatched Symbols');
}

export function makeFoldedChildUnfoldedParentView(): DeriveInteractionSpecInput {
  const root = frame('root', 'CallerRoot', { x: 0, y: 0, width: 720, height: 180 }, [
    symbolInstance(
      'panel-a',
      'Panel',
      { x: 0, y: 0, width: 320, height: 120 },
      'master-panel',
      [
        symbolInstance(
          'panel-a-icon',
          'Icon',
          { x: 20, y: 20, width: 24, height: 24 },
          'master-icon',
        ),
      ],
      { style: { opacity: 1 } },
    ),
    symbolInstance(
      'panel-b',
      'Panel',
      { x: 400, y: 0, width: 300, height: 120 },
      'master-panel',
      [
        symbolInstance(
          'panel-b-icon',
          'Icon',
          { x: 20, y: 20, width: 24, height: 24 },
          'master-icon',
        ),
      ],
      { style: { opacity: 1 } },
    ),
  ]);
  return fixtureFromRoot(root, 'Folded Child Unfolded Parent');
}

export function makeNestedFoldableSymbolInstancesView(): DeriveInteractionSpecInput {
  const root = frame('root', 'NestedRoot', { x: 0, y: 0, width: 720, height: 180 }, [
    symbolInstance(
      'prompt-a',
      'SuggestedPrompt',
      { x: 0, y: 0, width: 320, height: 120 },
      'master-prompt',
      [
        text('prompt-a-label', 'First', { x: 60, y: 20, width: 120, height: 20 }),
        symbolInstance(
          'prompt-a-icon',
          'Icon',
          { x: 20, y: 20, width: 24, height: 24 },
          'master-icon',
        ),
      ],
    ),
    symbolInstance(
      'prompt-b',
      'SuggestedPrompt',
      { x: 400, y: 0, width: 320, height: 120 },
      'master-prompt',
      [
        text('prompt-b-label', 'Second', { x: 60, y: 20, width: 120, height: 20 }),
        symbolInstance(
          'prompt-b-icon',
          'Icon',
          { x: 20, y: 20, width: 24, height: 24 },
          'master-icon',
        ),
      ],
    ),
  ]);
  return fixtureFromRoot(root, 'Nested Foldable Symbols');
}

export function makeUnresolvedChildBoundaryView(): DeriveInteractionSpecInput {
  const root = frame('root', 'UnresolvedRoot', { x: 0, y: 0, width: 720, height: 180 }, [
    symbolInstance(
      'prompt-a',
      'SuggestedPrompt',
      { x: 0, y: 0, width: 320, height: 120 },
      'master-prompt',
      [
        symbolInstance(
          'prompt-a-icon',
          'Icon',
          { x: 20, y: 20, width: 24, height: 24 },
          'master-icon',
        ),
      ],
    ),
    symbolInstance(
      'prompt-b',
      'SuggestedPrompt',
      { x: 400, y: 0, width: 320, height: 120 },
      'master-prompt',
      [
        symbolInstance(
          'prompt-b-icon',
          'Icon',
          { x: 20, y: 20, width: 20, height: 20 },
          'master-icon',
        ),
      ],
    ),
  ]);
  return fixtureFromRoot(root, 'Unresolved Child Boundary');
}
