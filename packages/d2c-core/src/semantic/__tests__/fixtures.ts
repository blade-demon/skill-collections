/**
 * Stage 5A-PR-2 — inline TS fixtures for deriveSemanticView tests.
 *
 * Per plan §8 we deliberately do NOT use real .sketch fixtures here;
 * those land in 5D when the CLI + Gate 2 signal arrive. Each maker
 * returns a fully-wired `{ designIr, visualView }` pair where the
 * `visualView.generatedFrom.designIrHash` already matches the IR —
 * so callers can pass the pair straight to `deriveSemanticView`.
 */
import type { AssetEntry, DesignIR, VisualNode, VisualView } from '../../ir';
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

/**
 * Collect one AssetEntry per distinct image-node assetRef so the design-ir's
 * asset catalog matches the nodes that reference it (a real design-ir is never
 * inconsistent this way). Codegen needs these to resolve media to package files.
 */
export function collectImageAssets(root: VisualNode): AssetEntry[] {
  const byId = new Map<string, AssetEntry>();
  const visit = (node: VisualNode): void => {
    if (node.kind === 'image' && node.assetRef !== undefined && !byId.has(node.assetRef)) {
      byId.set(node.assetRef, {
        id: node.assetRef,
        kind: 'image',
        ref: `${node.assetRef}.png`,
        originalPath: `${node.assetRef}.png`,
      });
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return [...byId.values()];
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
      assets: collectImageAssets(root),
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

/* ── 6) Design-IR-candidate-only view ──────────────────────────────────────
 * A plain group with no symbol, no name prefix. The only thing pointing at
 * it as component-worthy is an explicit entry in
 * `designIr.semantic.candidates`. Targets the P1 finding: Stage 3 normalizers
 * write `candidates[*].nodeId = VisualNode.id`, so derive must look up by
 * `visualNode.id` (not `visualNode.source.nodeId`).
 */
export function makeDesignIrCandidateOnlyView(): Stage5aFixture {
  const plain = group('plain-region', 'PlainRegion', { x: 0, y: 0, width: 320, height: 100 }, [
    text('plain-label', 'Hello', { x: 10, y: 10, width: 100, height: 20 }),
  ]);
  const root = frame('root', 'CandidateRoot', { x: 0, y: 0, width: 320, height: 200 }, [plain]);
  return fixtureFromRoot(root, 'CandidateOnly', [
    {
      /* matches plain.id which is `node-plain-region` */
      nodeId: 'node-plain-region',
      candidateName: 'PromotedFromIrCandidate',
      confidence: 'medium',
      reason: 'repeated-structure',
    },
  ]);
}

/* ── 7) Mismatched-shape repeat candidates ─────────────────────────────────
 * 3 same-kind region siblings, each with exactly 1 child, BUT the children
 * differ — text vs media-sized image vs nested group. Targets the P2 finding:
 * a per-child-count-only conformity check passes this set, even though the
 * subtrees look nothing alike. The §6.6 subtree signature (text count, asset
 * count, max depth) must reject it.
 */
export function makeMismatchedShapeListView(): Stage5aFixture {
  const root = frame('root', 'MismatchedRoot', { x: 0, y: 0, width: 320, height: 240 }, [
    group('item-a', 'ItemA', { x: 0, y: 0, width: 320, height: 60 }, [
      text('a-text', 'A', { x: 10, y: 10, width: 100, height: 20 }),
    ]),
    group('item-b', 'ItemB', { x: 0, y: 70, width: 320, height: 60 }, [
      /* width 100, height 40 — both >= 32, so derive classifies as `media`, not icon */
      image('b-img', { x: 10, y: 10, width: 100, height: 40 }),
    ]),
    group('item-c', 'ItemC', { x: 0, y: 140, width: 320, height: 60 }, [
      group('c-inner', 'CInner', { x: 10, y: 10, width: 200, height: 40 }, [
        text('c-deep', 'Deep', { x: 0, y: 0, width: 100, height: 20 }),
      ]),
    ]),
  ]);
  return fixtureFromRoot(root, 'Mismatched');
}

/* ── 8) Multi-kind repeat parent ───────────────────────────────────────────
 * One parent hosting two promotable repeat sets: 3 plain region siblings AND
 * 3 prefixed-component siblings (each prefixed with `Component/` so derive
 * classifies them as `component` kind). Both kind groups pass the white-list
 * and emit repeat-pattern ComponentCandidates rooted at the SAME parent.
 * Targets the P3 finding: the candidate id formerly hashed only
 * (parent.id, boundary), so the two candidates collided and the integrity
 * validator hard-threw on duplicate ComponentCandidate id.
 */
/* ── 9) Same-named symbol instances ────────────────────────────────────────
 * Two distinct symbol instances of the same conceptual `StatusBar` (e.g. one
 * at top, one at bottom) get the same `suggestedName` on each candidate.
 * 5C buildExports requires unique PlannedComponent.name and hard-throws on
 * collision; tests confirm deriveSemanticView's disambiguation pass renames
 * the second one to `StatusBar2`.
 */
export function makeSameNamedSymbolsView(): Stage5aFixture {
  const root = frame('root', 'SameNamedRoot', { x: 0, y: 0, width: 320, height: 200 }, [
    symbolInstance(
      'inst-1',
      'StatusBar',
      { x: 0, y: 0, width: 320, height: 40 },
      'master-statusbar',
    ),
    symbolInstance(
      'inst-2',
      'StatusBar',
      { x: 0, y: 160, width: 320, height: 40 },
      'master-statusbar',
    ),
  ]);
  return fixtureFromRoot(root, 'SameNamed');
}

export function makeMultiKindRepeatParentView(): Stage5aFixture {
  const regions: VisualNode[] = [];
  for (let i = 0; i < 3; i++) {
    regions.push(
      group(`region-${i}`, `Region-${i}`, { x: 0, y: i * 50, width: 320, height: 40 }, [
        text(`region-${i}-text`, `R${i}`, { x: 10, y: 10, width: 100, height: 20 }),
      ]),
    );
  }
  const components: VisualNode[] = [];
  for (let i = 0; i < 3; i++) {
    components.push(
      frame(`comp-${i}`, `Component/Comp-${i}`, { x: 0, y: 200 + i * 50, width: 320, height: 40 }, [
        text(`comp-${i}-text`, `C${i}`, { x: 10, y: 10, width: 100, height: 20 }),
      ]),
    );
  }
  const root = frame('root', 'MultiKindRoot', { x: 0, y: 0, width: 320, height: 400 }, [
    ...regions,
    ...components,
  ]);
  return fixtureFromRoot(root, 'MultiKind');
}
