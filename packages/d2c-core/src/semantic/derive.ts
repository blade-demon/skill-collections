/**
 * Stage 5A — `deriveSemanticView`.
 *
 * Pure function: `{ designIr, visualView }` → `semanticView` + warnings.
 * No file IO, no network, no clock. Same input ⇒ byte-identical output
 * (per plan §2 determinism contract).
 *
 * Behavior matrix (per docs/stage-5a-derive-semantic-view-plan.md):
 *
 *   §6.1  reject hash mismatch at input
 *   §6.2  write designIrHash + visualViewHash onto output
 *   §6.3  walk VisualBlock.root depth-first → SemanticNode list
 *   §6.4  classify SemanticNode.kind from VisualNode kind / heuristics
 *   §6.5  promote ComponentCandidate from symbol / design-ir candidate /
 *         name prefix, with repeat-pattern white-list per §3.4
 *   §6.6  detect RepeatedPattern (≥ 3 same-kind same-parent siblings,
 *         main-axis only, dual threshold absDelta ≤ 2px OR relDelta ≤ 15%)
 *   §6.7  emit LayoutCandidate (default absolute; stack/inline only when a
 *         pattern covers all children of a region/component/screen node)
 *   §6.8  determinism via stable-json hash + tiebreak on id sort
 *
 * Graph integrity is enforced by `assertSemanticViewIntegrity` on the
 * produced body — any failure there is a derive bug, throws hard.
 */
import {
  type DesignIR,
  type SemanticView,
  type VisualNode,
  type VisualView,
  type Warning,
  type SemanticCandidate,
  type Confidence,
} from '../ir';
import { stableJson, stableSha256 } from '../utils/stable-json';

import { evidenceFromDesignIrCandidate, evidenceFromVisualNode } from './evidence';
import {
  type ComponentCandidate,
  type LayoutCandidate,
  type LayoutCandidateKind,
  type RepeatedPattern,
  type RepeatedPatternAxis,
  type SemanticEvidence,
  type SemanticNode,
  type SemanticNodeKind,
  type SemanticViewBody,
  SemanticViewBodySchema,
} from './schema';
import { assertSemanticViewIntegrity } from './validate';

const COMPONENT_NAME_PREFIXES = ['组件/', 'Component/', 'comp:'];

const ICON_SIZE_THRESHOLD = 32;

const REPEAT_PATTERN_GAP_ABS_PX = 2;
const REPEAT_PATTERN_GAP_REL = 0.15;
const REPEAT_PATTERN_GRID_AXIS_RATIO = 0.2;

export interface DeriveSemanticViewInput {
  designIr: DesignIR;
  visualView: VisualView;
}

export interface DeriveSemanticViewResult {
  /**
   * Stage 5A output envelope. Reuses the canonical `SemanticView` type from
   * `../ir`, which 5A-PR-3 tightened to carry the typed `SemanticViewBody`
   * (replacing the previous loose `z.record(z.unknown())`). Both
   * `generatedFrom.designIrHash` and `generatedFrom.visualViewHash` are
   * always populated by derive, even though the schema marks them optional.
   */
  semanticView: SemanticView;
  warnings: Warning[];
}

interface DeriveContext {
  designIr: DesignIR;
  nodes: SemanticNode[];
  componentCandidates: ComponentCandidate[];
  repeatedPatterns: RepeatedPattern[];
  layoutCandidates: LayoutCandidate[];
  warnings: Warning[];
  candidatesByVisualNodeId: Map<string, SemanticCandidate>;
}

export function deriveSemanticView(input: DeriveSemanticViewInput): DeriveSemanticViewResult {
  /* §6.1 — input validation */
  const computedIrHash = stableSha256(stableJson(input.designIr));
  const declaredIrHash = input.visualView.generatedFrom.designIrHash;
  if (declaredIrHash !== computedIrHash) {
    throw new Error(
      `deriveSemanticView: visual-view designIrHash mismatch — expected ${computedIrHash}, got ${declaredIrHash ?? '(absent)'}`,
    );
  }

  const candidatesByVisualNodeId = new Map<string, SemanticCandidate>();
  for (const c of input.designIr.semantic.candidates) {
    if (!candidatesByVisualNodeId.has(c.nodeId)) {
      candidatesByVisualNodeId.set(c.nodeId, c);
    }
  }

  const ctx: DeriveContext = {
    designIr: input.designIr,
    nodes: [],
    componentCandidates: [],
    repeatedPatterns: [],
    layoutCandidates: [],
    warnings: [],
    candidatesByVisualNodeId,
  };

  /* §6.3 — walk visual tree, push SemanticNode list depth-first pre-order */
  const screenSemanticNode = walkVisualNode(input.visualView.body.root, undefined, true, ctx);

  /* §6.6 — repeated-pattern detection (per parent, after walking) +
   * §6.5 conditional ComponentCandidate via repeat-pattern boundary +
   * §6.7 LayoutCandidate stack/inline emission when pattern covers all children */
  const nodesById = new Map(ctx.nodes.map((n) => [n.id, n] as const));
  for (const parent of ctx.nodes) {
    if (parent.childIds.length < 3) continue;
    detectRepeatedPatternsForParent(parent, nodesById, ctx);
  }

  /* §6.7 — default LayoutCandidate (absolute) for any region/component/screen
   * that did not get an upgraded layout from a pattern. */
  const layoutOwnerNodeIds = new Set(ctx.layoutCandidates.map((l) => l.semanticNodeId));
  for (const node of ctx.nodes) {
    if (
      (node.kind === 'screen' || node.kind === 'region' || node.kind === 'component') &&
      !layoutOwnerNodeIds.has(node.id)
    ) {
      ctx.layoutCandidates.push({
        id: generateLayoutId(node.id, 'absolute'),
        semanticNodeId: node.id,
        kind: 'absolute',
        confidence: 'high',
        constraints: [],
        caveats: [],
      });
    }
  }

  /* Stage 5C buildExports() requires unique PlannedComponent.name across
   * exports and hard-throws on collision (it explicitly tells callers to
   * "Fix the upstream semantic-view candidate names instead of dedup-ing in
   * 5C"). Walk-order first-wins: repeated suggestedNames pick up a numeric
   * suffix (StatusBar, StatusBar2, ...). Each rename emits an info warning
   * so reviewers see the disambiguation. */
  disambiguateSuggestedNames(ctx);

  const body: SemanticViewBody = {
    screen: { semanticNodeId: screenSemanticNode.id, name: screenSemanticNode.name },
    nodes: ctx.nodes,
    componentCandidates: ctx.componentCandidates,
    repeatedPatterns: ctx.repeatedPatterns,
    layoutCandidates: ctx.layoutCandidates,
    warnings: ctx.warnings,
  };

  /* Parse through the Zod schema so the returned value has been validated
   * by the same surface external consumers will run on it. */
  const parsed = SemanticViewBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `deriveSemanticView produced a body that fails SemanticViewBodySchema: ${parsed.error.message}`,
    );
  }
  assertSemanticViewIntegrity(parsed.data);

  const generatedFrom: SemanticView['generatedFrom'] = {
    schemaVersion: input.designIr.schemaVersion,
    designIrHash: computedIrHash,
    visualViewHash: stableSha256(stableJson(input.visualView)),
  };
  if (input.visualView.generatedFrom.sourceRef !== undefined) {
    generatedFrom.sourceRef = input.visualView.generatedFrom.sourceRef;
  }

  return {
    semanticView: {
      kind: 'semantic-view',
      generatedFrom,
      body: parsed.data,
    },
    warnings: ctx.warnings,
  };
}

/* ── walker ─────────────────────────────────────────────────────────────── */

function walkVisualNode(
  visualNode: VisualNode,
  parentId: string | undefined,
  isRoot: boolean,
  ctx: DeriveContext,
): SemanticNode {
  const classification = classifyKind(visualNode, isRoot);
  for (const w of classification.warnings) ctx.warnings.push(w);

  const id = generateNodeId(visualNode.id, classification.kind);

  const evidence: SemanticEvidence[] = [
    evidenceFromVisualNode(visualNode.id, classification.evidenceReason),
  ];
  /* Stage 3 normalizers (Sketch / future MasterGo) write
   * `semantic.candidates[*].nodeId` as the canonical `VisualNode.id`, NOT
   * the provider `source.nodeId`. See skills/sketch-to-component/scripts/src/
   * normalize/semantic.ts — `nodeId: node.id`. We index and look up the same
   * way; otherwise no Sketch input ever connects to its IR-level candidates. */
  const matchedCandidate = ctx.candidatesByVisualNodeId.get(visualNode.id);
  if (matchedCandidate !== undefined) {
    evidence.push(
      evidenceFromDesignIrCandidate(
        matchedCandidate.candidateName,
        visualNode.id,
        `design-ir.semantic.candidates: ${matchedCandidate.reason}`,
      ),
    );
  }

  const node: SemanticNode = {
    kind: classification.kind,
    id,
    name: visualNode.name,
    primaryVisualNodeId: visualNode.id,
    visualNodeIds: [visualNode.id],
    parentId,
    childIds: [],
    bounds: { ...visualNode.layout },
    confidence: classification.confidence,
    evidence,
    source: {
      nodeIds: [visualNode.source.nodeId],
      ...(visualNode.source.提供方 !== undefined ? { 提供方: visualNode.source.提供方 } : {}),
    },
  };

  ctx.nodes.push(node);

  /* §6.5 — ComponentCandidate from symbol / design-ir candidate / name prefix.
   * repeat-pattern boundary is emitted later (in detectRepeatedPatternsForParent). */
  maybePromoteToComponentCandidate(node, visualNode, ctx);

  for (const child of visualNode.children) {
    const childNode = walkVisualNode(child, node.id, false, ctx);
    node.childIds.push(childNode.id);
  }

  return node;
}

/* ── kind classification (§6.4) ──────────────────────────────────────────── */

interface KindClassification {
  kind: SemanticNodeKind;
  confidence: Confidence;
  evidenceReason: string;
  warnings: Warning[];
}

function classifyKind(visualNode: VisualNode, isRoot: boolean): KindClassification {
  const warnings: Warning[] = [];

  if (isRoot) {
    return { kind: 'screen', confidence: 'high', evidenceReason: 'visual-view root', warnings };
  }

  if (visualNode.symbol?.instanceId !== undefined) {
    return {
      kind: 'component',
      confidence: 'high',
      evidenceReason: `symbol instance ${visualNode.symbol.instanceId}`,
      warnings,
    };
  }

  if (COMPONENT_NAME_PREFIXES.some((p) => visualNode.name.startsWith(p))) {
    return {
      kind: 'component',
      confidence: 'medium',
      evidenceReason: `name prefix match`,
      warnings,
    };
  }

  if (visualNode.kind === 'text') {
    return { kind: 'text', confidence: 'high', evidenceReason: 'text node', warnings };
  }

  if (visualNode.kind === 'image') {
    const isSmall =
      visualNode.layout.width < ICON_SIZE_THRESHOLD &&
      visualNode.layout.height < ICON_SIZE_THRESHOLD;
    if (isSmall) {
      warnings.push({
        code: 'icon-from-size-heuristic',
        message: `node ${visualNode.id} classified as icon by size (${visualNode.layout.width}×${visualNode.layout.height} < ${ICON_SIZE_THRESHOLD}px)`,
        severity: 'info',
        sourceNodeId: visualNode.id,
      });
      return { kind: 'icon', confidence: 'low', evidenceReason: 'small image heuristic', warnings };
    }
    return { kind: 'media', confidence: 'high', evidenceReason: 'image node', warnings };
  }

  if (visualNode.kind === 'vector' || visualNode.kind === 'shape') {
    const isLeaf =
      visualNode.children.length === 0 &&
      visualNode.text === undefined &&
      visualNode.assetRef === undefined &&
      visualNode.symbol === undefined;
    if (isLeaf) {
      return {
        kind: 'decorative',
        confidence: 'medium',
        evidenceReason: 'leaf vector/shape with no text or asset',
        warnings,
      };
    }
    return {
      kind: 'media',
      confidence: 'low',
      evidenceReason: 'non-leaf vector/shape, treated as media',
      warnings,
    };
  }

  /* frame / group default */
  return {
    kind: 'region',
    confidence: 'medium',
    evidenceReason: `${visualNode.kind} grouping`,
    warnings,
  };
}

/* ── ComponentCandidate promotion (§6.5) ─────────────────────────────────── */

function maybePromoteToComponentCandidate(
  node: SemanticNode,
  visualNode: VisualNode,
  ctx: DeriveContext,
): void {
  if (visualNode.symbol?.instanceId !== undefined) {
    ctx.componentCandidates.push({
      id: generateCandidateId(node.id, 'symbol'),
      rootSemanticNodeId: node.id,
      suggestedName: visualNode.name || 'SymbolInstance',
      boundary: 'symbol',
      confidence: 'high',
      evidence: [
        evidenceFromVisualNode(visualNode.id, `symbol instance ${visualNode.symbol.instanceId}`),
      ],
    });
    return;
  }

  if (COMPONENT_NAME_PREFIXES.some((p) => visualNode.name.startsWith(p))) {
    ctx.componentCandidates.push({
      id: generateCandidateId(node.id, 'visual-region'),
      rootSemanticNodeId: node.id,
      suggestedName: visualNode.name,
      boundary: 'visual-region',
      confidence: 'medium',
      evidence: [evidenceFromVisualNode(visualNode.id, `name prefix match`)],
    });
    return;
  }

  const matched = ctx.candidatesByVisualNodeId.get(visualNode.id);
  if (matched !== undefined && visualNode.symbol?.instanceId === undefined) {
    ctx.componentCandidates.push({
      id: generateCandidateId(node.id, 'visual-region'),
      rootSemanticNodeId: node.id,
      suggestedName: matched.candidateName,
      boundary: 'visual-region',
      confidence: matched.confidence as Confidence,
      evidence: [
        evidenceFromDesignIrCandidate(
          matched.candidateName,
          visualNode.id,
          `design-ir.semantic.candidates: ${matched.reason}`,
        ),
      ],
    });
  }
}

/* ── RepeatedPattern detection (§6.6) ────────────────────────────────────── */

const REPEAT_PROMOTABLE_KINDS = new Set<SemanticNodeKind>(['region', 'component', 'repeated-item']);

function detectRepeatedPatternsForParent(
  parent: SemanticNode,
  nodesById: Map<string, SemanticNode>,
  ctx: DeriveContext,
): void {
  const allChildren = parent.childIds
    .map((id) => nodesById.get(id))
    .filter((n): n is SemanticNode => n !== undefined);

  /* Group siblings by kind. */
  const byKind = new Map<SemanticNodeKind, SemanticNode[]>();
  for (const child of allChildren) {
    const arr = byKind.get(child.kind);
    if (arr === undefined) byKind.set(child.kind, [child]);
    else arr.push(child);
  }

  for (const [kind, items] of [...byKind.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (items.length < 3) continue;

    /* Determine main axis from center-of-bounds variance. */
    const xVar = variance(items.map((n) => n.bounds.x + n.bounds.width / 2));
    const yVar = variance(items.map((n) => n.bounds.y + n.bounds.height / 2));
    const hi = Math.max(xVar, yVar);
    const lo = Math.min(xVar, yVar);
    if (hi > 0 && lo / hi > REPEAT_PATTERN_GRID_AXIS_RATIO) {
      ctx.warnings.push({
        code: 'repeated-pattern-grid-skipped',
        message: `parent ${parent.id}: ${items.length} same-kind '${kind}' siblings span both axes; grid not detected by 5A`,
        severity: 'info',
        sourceNodeId: parent.id,
      });
      continue;
    }
    const axis: RepeatedPatternAxis = xVar > yVar ? 'x' : 'y';

    /* Sort along main axis, deterministic tiebreak on id. */
    const sorted = [...items].sort((a, b) => {
      const aPos = axis === 'x' ? a.bounds.x : a.bounds.y;
      const bPos = axis === 'x' ? b.bounds.x : b.bounds.y;
      if (aPos !== bPos) return aPos - bPos;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    /* Gaps as next-start minus previous-end along the main axis. */
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      const prevEnd =
        axis === 'x' ? prev.bounds.x + prev.bounds.width : prev.bounds.y + prev.bounds.height;
      const currStart = axis === 'x' ? curr.bounds.x : curr.bounds.y;
      gaps.push(currStart - prevEnd);
    }

    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    const irregular = gaps.some((g) => {
      const absDelta = Math.abs(g - meanGap);
      const relDelta =
        meanGap === 0 ? (absDelta === 0 ? 0 : Infinity) : absDelta / Math.abs(meanGap);
      /* Either threshold passing makes the gap "stable"; irregular iff both fail. */
      return absDelta > REPEAT_PATTERN_GAP_ABS_PX && relDelta > REPEAT_PATTERN_GAP_REL;
    });
    if (irregular) {
      ctx.warnings.push({
        code: 'repeated-pattern-spacing-irregular',
        message: `parent ${parent.id}: ${items.length} same-kind '${kind}' siblings, main-axis gaps exceed ${REPEAT_PATTERN_GAP_ABS_PX}px / ${Math.round(REPEAT_PATTERN_GAP_REL * 100)}% dual threshold`,
        severity: 'info',
        sourceNodeId: parent.id,
      });
      continue;
    }

    /* Shape conformity per plan §6.6 step 5 — every item's subtree must have
     * identical (text count, asset-bearing count, max depth). Plain childCount
     * equality (the prior implementation) was too weak: 3 regions each with
     * exactly 1 child but the children being text / image / nested group
     * would still slip through and be promoted as a pattern. */
    const signatures = sorted.map((it) => subtreeSignature(it, nodesById));
    if (new Set(signatures).size > 1) {
      ctx.warnings.push({
        code: 'repeated-pattern-shape-mismatch',
        message: `parent ${parent.id}: ${items.length} same-kind '${kind}' siblings have differing subtree shapes (${[...new Set(signatures)].join(' vs ')})`,
        severity: 'info',
        sourceNodeId: parent.id,
      });
      continue;
    }

    /* Promote the pattern itself. */
    const itemIds = sorted.map((it) => it.id);
    const similarity = computeSimilarity(gaps, meanGap);
    const patternId = generatePatternId(parent.id, axis, itemIds);
    ctx.repeatedPatterns.push({
      id: patternId,
      itemSemanticNodeIds: itemIds,
      axis,
      itemCount: itemIds.length,
      similarity,
      confidence: 'medium',
      evidence: [
        evidenceFromVisualNode(
          parent.primaryVisualNodeId,
          `${items.length} same-kind '${kind}' siblings on ${axis} axis`,
        ),
      ],
    });

    /* §6.5 white-list — only promote to ComponentCandidate if every item's
     * kind is in the promotable set. Otherwise emit a not-promoted warning.
     * The patternId is folded into the candidate id so multiple promotable
     * patterns under the same parent (different kind sets) do not collide. */
    if (REPEAT_PROMOTABLE_KINDS.has(kind)) {
      ctx.componentCandidates.push({
        id: generateCandidateId(parent.id, 'repeat-pattern', patternId),
        rootSemanticNodeId: parent.id,
        suggestedName: `${parent.name}Item`,
        boundary: 'repeat-pattern',
        confidence: 'medium',
        evidence: [
          evidenceFromVisualNode(
            parent.primaryVisualNodeId,
            `repeat-pattern boundary, ${items.length} '${kind}' items`,
          ),
        ],
      });
    } else {
      ctx.warnings.push({
        code: 'repeated-pattern-not-promoted',
        message: `parent ${parent.id}: repeat-pattern of ${items.length} '${kind}' items not promoted to ComponentCandidate (kind not in {region, component, repeated-item})`,
        severity: 'info',
        sourceNodeId: parent.id,
      });
    }

    /* §6.7 — upgrade LayoutCandidate to stack/inline when the pattern covers
     * all children of this parent. Strict equality is enough for 5A; mixed
     * pattern-plus-other-children remains 'absolute'. */
    if (sorted.length === allChildren.length) {
      const layoutKind: LayoutCandidateKind = axis === 'y' ? 'stack' : 'inline';
      ctx.layoutCandidates.push({
        id: generateLayoutId(parent.id, layoutKind),
        semanticNodeId: parent.id,
        kind: layoutKind,
        confidence: 'medium',
        constraints: [],
        caveats: [`spacing similarity ${similarity.toFixed(2)}`],
      });
    }
  }
}

/* ── id generation (§3.5) ────────────────────────────────────────────────── */

function generateNodeId(primaryVisualNodeId: string, kind: SemanticNodeKind): string {
  return 's_' + hashRecord({ form: 'node', primaryVisualNodeId, kind });
}

function generateCandidateId(
  rootSemanticNodeId: string,
  boundary: ComponentCandidate['boundary'],
  /**
   * Extra disambiguator. The single mandatory case today: `boundary ===
   * 'repeat-pattern'` must include the RepeatedPattern id, because a single
   * parent can host more than one promotable pattern (e.g. 3 region siblings
   * AND 3 component siblings, both passing the white-list). Without this slot
   * both candidates would hash to the same id and assertSemanticViewIntegrity
   * would hard-throw on duplicate ComponentCandidate ids. symbol /
   * visual-region candidates do not need it — those rootSemanticNodeIds are
   * already 1-to-1 with the originating node.
   */
  discriminator?: string,
): string {
  const record: Record<string, unknown> = { form: 'candidate', rootSemanticNodeId, boundary };
  if (discriminator !== undefined) record.discriminator = discriminator;
  return 'cc_' + hashRecord(record);
}

function generatePatternId(
  parentSemanticNodeId: string,
  axis: RepeatedPatternAxis,
  itemSemanticNodeIds: string[],
): string {
  const sortedItems = [...itemSemanticNodeIds].sort();
  return (
    'rp_' +
    hashRecord({ form: 'pattern', parentSemanticNodeId, axis, itemSemanticNodeIds: sortedItems })
  );
}

function generateLayoutId(semanticNodeId: string, kind: LayoutCandidateKind): string {
  return 'lc_' + hashRecord({ form: 'layout', semanticNodeId, kind });
}

function hashRecord(input: Record<string, unknown>): string {
  return stableSha256(stableJson(input)).slice(0, 12);
}

/* ── suggestedName disambiguation ─────────────────────────────────────────── */

/**
 * Walk-order first-wins. The first occurrence of each suggestedName keeps it;
 * the 2nd, 3rd, ... get a numeric suffix (`StatusBar`, `StatusBar2`, …). The
 * suffix value is chosen to also avoid existing-but-future suggestedNames
 * (e.g. an organic `Foo2` already in the list won't get shadowed when `Foo`
 * needs disambiguation).
 */
function disambiguateSuggestedNames(ctx: DeriveContext): void {
  const used = new Set<string>();
  for (const c of ctx.componentCandidates) {
    if (!used.has(c.suggestedName)) {
      used.add(c.suggestedName);
      continue;
    }
    const original = c.suggestedName;
    let n = 2;
    let next = `${original}${n}`;
    while (used.has(next)) {
      n += 1;
      next = `${original}${n}`;
    }
    c.suggestedName = next;
    used.add(next);
    ctx.warnings.push({
      code: 'component-candidate-name-disambiguated',
      message: `ComponentCandidate ${c.id}: suggestedName '${original}' already used; renamed to '${next}' to satisfy Stage 5C export uniqueness`,
      severity: 'info',
      sourceNodeId: c.rootSemanticNodeId,
    });
  }
}

/* ── subtree signature for repeat-pattern shape conformity ───────────────── */

/**
 * Per plan §6.6, two repeated-pattern items must have identical subtree shape:
 * same number of text descendants, same number of asset-bearing descendants
 * (media + icon), same max nesting depth. Encoded as `t<text>|a<asset>|d<depth>`
 * so a single Set check rejects any divergence.
 */
function subtreeSignature(root: SemanticNode, nodesById: Map<string, SemanticNode>): string {
  let textCount = 0;
  let assetCount = 0;
  let maxDepth = 0;

  const walk = (node: SemanticNode, depth: number): void => {
    if (depth > maxDepth) maxDepth = depth;
    if (node !== root) {
      if (node.kind === 'text') textCount++;
      else if (node.kind === 'media' || node.kind === 'icon') assetCount++;
    }
    for (const childId of node.childIds) {
      const child = nodesById.get(childId);
      if (child !== undefined) walk(child, depth + 1);
    }
  };
  walk(root, 0);

  return `t${textCount}|a${assetCount}|d${maxDepth}`;
}

/* ── numerical helpers ───────────────────────────────────────────────────── */

function variance(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / xs.length;
}

function computeSimilarity(gaps: number[], meanGap: number): number {
  if (gaps.length === 0) return 1;
  const maxAbs = Math.max(...gaps.map((g) => Math.abs(g - meanGap)));
  const denom = Math.max(Math.abs(meanGap), REPEAT_PATTERN_GAP_ABS_PX);
  const sim = 1 - maxAbs / denom;
  if (sim < 0) return 0;
  if (sim > 1) return 1;
  return sim;
}
