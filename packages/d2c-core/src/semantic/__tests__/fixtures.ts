/**
 * Stage 5A-PR-2 — inline TS fixtures for deriveSemanticView tests.
 *
 * Per plan §8 we deliberately do NOT use real .sketch fixtures here;
 * those land in 5D when the CLI + Gate 2 signal arrive. Each maker
 * returns a fully-wired `{ designIr, visualView }` pair where the
 * `visualView.generatedFrom.designIrHash` already matches the IR —
 * so callers can pass the pair straight to `deriveSemanticView`.
 */
import type { DesignIR, VisualNode, VisualView } from '../../ir';
import { stableJson, stableSha256 } from '../../utils/stable-json';

function source(nodeId: string, originalType = 'group'): VisualNode['source'] {
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

function group(
  id: string,
  name: string,
  layout: VisualNode['layout'],
  children: VisualNode[] = [],
  extras: Partial<VisualNode> = {},
): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'group',
    name,
    source: source(id, 'group'),
    layout,
    children,
    ...extras,
  };
}

function text(id: string, content: string, layout: VisualNode['layout']): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'text',
    name: `Text-${id}`,
    source: source(id, 'text'),
    layout,
    text: {
      content,
      style: { fontFamily: 'Inter', fontSize: 14, color: '#111111FF' },
    },
    children: [],
  };
}

function image(id: string, layout: VisualNode['layout'], assetRef?: string): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'image',
    name: `Image-${id}`,
    source: source(id, 'bitmap'),
    layout,
    assetRef: assetRef ?? 'asset-img',
    children: [],
  };
}

function vector(id: string, layout: VisualNode['layout']): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'vector',
    name: `Vector-${id}`,
    source: source(id, 'vector'),
    layout,
    children: [],
  };
}

function shape(id: string, layout: VisualNode['layout']): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'shape',
    name: `Shape-${id}`,
    source: source(id, 'rectangle'),
    layout,
    style: { fills: [{ type: 'color', color: '#EEEEEEFF' }] },
    children: [],
  };
}

function symbolInstance(
  id: string,
  name: string,
  layout: VisualNode['layout'],
  masterId: string,
  children: VisualNode[] = [],
): VisualNode {
  return {
    id: `node-${id}`,
    kind: 'frame',
    name,
    source: source(id, 'symbolInstance'),
    layout,
    symbol: { instanceId: id, masterId, overrides: [] },
    children,
  };
}

function wrapDesignIR(
  root: VisualNode,
  rootName: string,
  candidates: DesignIR['semantic']['candidates'] = [],
): DesignIR {
  return {
    schemaVersion: 'd2c.design-ir/v0.2.0',
    source: {
      provider: 'test',
      ref: { fileName: 'fixture.sketch', documentId: 'doc-1' },
      rootName,
    },
    visual: {
      artboard: { width: root.layout.width, height: root.layout.height },
      root,
      assets: [],
    },
    semantic: { candidates },
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

export interface Stage5aFixture {
  designIr: DesignIR;
  visualView: VisualView;
}

function fixtureFromRoot(
  root: VisualNode,
  rootName: string,
  candidates: DesignIR['semantic']['candidates'] = [],
): Stage5aFixture {
  const designIr = wrapDesignIR(root, rootName, candidates);
  return { designIr, visualView: packVisualView(designIr) };
}

/* ── 1) Symbol-heavy view ──────────────────────────────────────────────────
 * Two distinct symbol instances under the root. Tests confirm both get
 * promoted to ComponentCandidate(boundary='symbol', confidence='high').
 */
export function makeSymbolHeavyView(): Stage5aFixture {
  const root = frame('root', 'SymbolHeavyRoot', { x: 0, y: 0, width: 320, height: 240 }, [
    symbolInstance(
      'hero-instance',
      'HeroCard',
      { x: 0, y: 0, width: 320, height: 100 },
      'master-hero',
    ),
    symbolInstance(
      'cta-instance',
      'CtaButton',
      { x: 0, y: 120, width: 200, height: 40 },
      'master-cta',
    ),
  ]);
  return fixtureFromRoot(root, 'Symbol Heavy');
}

/* ── 2) List view ──────────────────────────────────────────────────────────
 * 5 equally-spaced same-kind siblings on the y axis. Tests confirm
 * RepeatedPattern(axis='y', similarity≈1) + LayoutCandidate(kind='stack').
 */
export function makeListView(): Stage5aFixture {
  const items: VisualNode[] = [];
  for (let i = 0; i < 5; i++) {
    items.push(
      group(`item-${i}`, `Item-${i}`, { x: 0, y: i * 60, width: 320, height: 40 }, [
        text(`item-${i}-label`, `Item ${i}`, { x: 16, y: 8, width: 200, height: 20 }),
      ]),
    );
  }
  const root = frame('root', 'ListRoot', { x: 0, y: 0, width: 320, height: 320 }, items);
  return fixtureFromRoot(root, 'List');
}

/* ── 3) Ambiguous group view ───────────────────────────────────────────────
 * Two frame groups with no prefix, no symbol, no annotations. Tests
 * confirm neither group is promoted to ComponentCandidate and a
 * `low-confidence-component` warning is NOT emitted (we only warn when
 * something has SOME evidence but not enough; mere bare groups are just
 * region SemanticNodes by default).
 */
export function makeAmbiguousGroupView(): Stage5aFixture {
  const root = frame('root', 'AmbiguousRoot', { x: 0, y: 0, width: 320, height: 200 }, [
    group('group-a', 'GroupA', { x: 0, y: 0, width: 320, height: 100 }, [
      text('a-label', 'Hello', { x: 10, y: 10, width: 100, height: 20 }),
    ]),
    group('group-b', 'GroupB', { x: 0, y: 100, width: 320, height: 100 }, [
      text('b-label', 'World', { x: 10, y: 10, width: 100, height: 20 }),
    ]),
  ]);
  return fixtureFromRoot(root, 'Ambiguous');
}

/* ── 4) Decorative-background view ─────────────────────────────────────────
 * One large vector (treated as decorative) plus a real text node. Tests
 * confirm vector → decorative kind and text → text kind.
 */
export function makeDecorativeBgView(): Stage5aFixture {
  const root = frame('root', 'DecorativeRoot', { x: 0, y: 0, width: 320, height: 240 }, [
    vector('bg', { x: 0, y: 0, width: 320, height: 240 }),
    text('title', 'Headline', { x: 20, y: 80, width: 280, height: 32 }),
  ]);
  return fixtureFromRoot(root, 'Decorative');
}

/* ── 5) Full chat view ─────────────────────────────────────────────────────
 * Composite end-to-end smoke: header (symbol), list of 3 messages
 * (repeated pattern → ComponentCandidate via repeat-pattern boundary),
 * an input composer (frame with name-prefix promotion using `Component/`),
 * and a misc decorative shape. Exercises the entire derive pipeline.
 */
export function makeFullChatView(): Stage5aFixture {
  const messages: VisualNode[] = [];
  for (let i = 0; i < 3; i++) {
    messages.push(
      group(`msg-${i}`, `Message-${i}`, { x: 0, y: 60 + i * 50, width: 320, height: 40 }, [
        image(`msg-${i}-avatar`, { x: 8, y: 8, width: 24, height: 24 }),
        text(`msg-${i}-text`, `Hello ${i}`, { x: 40, y: 10, width: 200, height: 20 }),
      ]),
    );
  }
  const root = frame('root', 'ChatRoot', { x: 0, y: 0, width: 320, height: 480 }, [
    symbolInstance(
      'header-inst',
      'ChatHeader',
      { x: 0, y: 0, width: 320, height: 50 },
      'master-header',
    ),
    ...messages,
    frame('composer', 'Component/InputComposer', { x: 0, y: 420, width: 320, height: 60 }, [
      shape('input-bg', { x: 10, y: 10, width: 240, height: 40 }),
      text('placeholder', 'Type here', { x: 20, y: 20, width: 200, height: 20 }),
    ]),
  ]);
  return fixtureFromRoot(root, 'Chat');
}
