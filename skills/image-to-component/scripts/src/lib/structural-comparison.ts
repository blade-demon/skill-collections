import { OVERLAY_TYPES, type ImageResult } from '../types.js';
import {
  parseSlotExpr,
  type AtomNode,
  type ContainerNode,
  type LeafNode,
  type RowNode,
  type SequenceNode,
  type SlotExprNode,
} from './slot-parser.js';

const BASE_SLOTS = ['T', 'M', 'B'] as const;
const OUTPUT_SLOTS = ['T', 'M', 'B', 'F'] as const;

export type StructuralDecision = 'same-component' | 'different-components' | 'manual-review';

export type ComparisonReasonCode =
  | 'identical-structure'
  | 'container-topology-changed'
  | 'role-count-threshold-exceeded'
  | 'leaf-swap'
  | 'uncertain-leaf'
  | 'leaf-added'
  | 'leaf-removed'
  | 'whole-slot-replaced'
  | 'floating-variant'
  | 'unresolved-leaf-variation'
  | 'manual-multi-slot-variation'
  | 'manual-mixed-large-set';

export interface SlotDiff {
  slot: 'T' | 'M' | 'B' | 'F';
  kind: ComparisonReasonCode;
  left: string;
  right: string;
  roleDelta: number;
}

export interface PairComparison {
  left: string;
  right: string;
  decision: StructuralDecision;
  reasonCodes: ComparisonReasonCode[];
  slotDiffs: SlotDiff[];
}

export interface OverlayGroup {
  overlayType: 'modal' | 'drawer' | 'toast' | 'sheet';
  files: string[];
  skeletons: Array<{ filename: string; skeleton: string }>;
}

export interface StructuralComparisonResult {
  decision: StructuralDecision;
  reasonCodes: ComparisonReasonCode[];
  skeletons: Array<{
    filename: string;
    slots: Record<(typeof OUTPUT_SLOTS)[number], string>;
  }>;
  pairs: PairComparison[];
  overlayGroups: OverlayGroup[];
}

const REASON_ORDER: ComparisonReasonCode[] = [
  'container-topology-changed',
  'role-count-threshold-exceeded',
  'manual-multi-slot-variation',
  'unresolved-leaf-variation',
  'manual-mixed-large-set',
  'whole-slot-replaced',
  'leaf-swap',
  'uncertain-leaf',
  'leaf-added',
  'leaf-removed',
  'floating-variant',
  'identical-structure',
];

function parseOrThrow(expr: string): SlotExprNode {
  const result = parseSlotExpr(expr);
  if (!result.valid) throw new Error(result.error);
  return result.ast;
}

function renderSkeleton(node: SlotExprNode): string {
  if (node.kind === 'missing') return '-';
  return renderSequence(node, renderSkeletonAtom);
}

function renderSkeletonAtom(atom: AtomNode): string {
  return atom.kind === 'leaf' ? '_' : `${atom.role}(${renderSkeleton(atom.child)})`;
}

function renderContainerTopology(node: SlotExprNode): string {
  if (node.kind === 'missing') return '-';

  const rows = node.rows
    .map((row) => renderTopologyRow(row))
    .filter((row): row is string => row !== null);
  return rows.length === 0 ? '-' : rows.join(' -> ');
}

function renderTopologyRow(row: RowNode): string | null {
  const containers = row.atoms.filter((atom): atom is ContainerNode => atom.kind === 'container');
  if (containers.length === 0) return null;
  return containers.map(renderContainerTopologyAtom).join(' + ');
}

function renderContainerTopologyAtom(container: ContainerNode): string {
  const nested = renderContainerTopology(container.child);
  return nested === '-' ? container.role : `${container.role}(${nested})`;
}

function renderSequence(node: SequenceNode, renderAtom: (atom: AtomNode) => string): string {
  return node.rows.map((row) => row.atoms.map(renderAtom).join(' + ')).join(' -> ');
}

function countRoles(node: SlotExprNode): number {
  if (node.kind === 'missing') return 0;
  return node.rows.reduce(
    (total, row) =>
      total +
      row.atoms.reduce(
        (rowTotal, atom) => rowTotal + 1 + (atom.kind === 'container' ? countRoles(atom.child) : 0),
        0,
      ),
    0,
  );
}

function collectLeaves(node: SlotExprNode): LeafNode[] {
  if (node.kind === 'missing') return [];
  return node.rows.flatMap((row) =>
    row.atoms.flatMap((atom) => (atom.kind === 'leaf' ? [atom] : collectLeaves(atom.child))),
  );
}

function containsContainer(node: SlotExprNode): boolean {
  if (node.kind === 'missing') return false;
  return node.rows.some((row) => row.atoms.some((atom) => atom.kind === 'container'));
}

function sameLeaves(left: LeafNode[], right: LeafNode[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (leaf, index) =>
        leaf.role === right[index]?.role && leaf.uncertain === right[index]?.uncertain,
    )
  );
}

function sameLeafRoles(left: LeafNode[], right: LeafNode[]): boolean {
  return (
    left.length === right.length && left.every((leaf, index) => leaf.role === right[index]?.role)
  );
}

function sameSlotAst(
  left: SlotExprNode,
  right: SlotExprNode,
  sameLeaf: (leftLeaf: LeafNode, rightLeaf: LeafNode) => boolean,
): boolean {
  if (left.kind === 'missing' || right.kind === 'missing') return left.kind === right.kind;
  return sameSequenceAst(left, right, sameLeaf);
}

function sameSequenceAst(
  left: SequenceNode,
  right: SequenceNode,
  sameLeaf: (leftLeaf: LeafNode, rightLeaf: LeafNode) => boolean,
): boolean {
  return (
    left.rows.length === right.rows.length &&
    left.rows.every((row, index) => {
      const rightRow = right.rows[index];
      return rightRow !== undefined && sameRowAst(row, rightRow, sameLeaf);
    })
  );
}

function sameRowAst(
  left: RowNode,
  right: RowNode,
  sameLeaf: (leftLeaf: LeafNode, rightLeaf: LeafNode) => boolean,
): boolean {
  return (
    left.atoms.length === right.atoms.length &&
    left.atoms.every((atom, index) => {
      const rightAtom = right.atoms[index];
      if (rightAtom === undefined || atom.kind !== rightAtom.kind) return false;
      if (atom.kind === 'leaf' && rightAtom.kind === 'leaf') return sameLeaf(atom, rightAtom);
      if (atom.kind === 'container' && rightAtom.kind === 'container') {
        return (
          atom.role === rightAtom.role && sameSequenceAst(atom.child, rightAtom.child, sameLeaf)
        );
      }
      return false;
    })
  );
}

function sameLeafLayout(left: SlotExprNode, right: SlotExprNode): boolean {
  return sameSlotAst(left, right, () => true);
}

function sameCompleteAst(left: SlotExprNode, right: SlotExprNode): boolean {
  return sameSlotAst(
    left,
    right,
    (leftLeaf, rightLeaf) =>
      leftLeaf.role === rightLeaf.role && leftLeaf.uncertain === rightLeaf.uncertain,
  );
}

function removeLeafAt(node: SlotExprNode, targetIndex: number): SlotExprNode | null {
  if (node.kind === 'missing') return null;

  let leafIndex = 0;
  let removed = false;

  const removeFromSequence = (sequence: SequenceNode): SequenceNode | null => {
    const rows: RowNode[] = [];

    for (const row of sequence.rows) {
      const atoms: AtomNode[] = [];

      for (const atom of row.atoms) {
        if (atom.kind === 'leaf') {
          if (leafIndex === targetIndex) {
            removed = true;
          } else {
            atoms.push(atom);
          }
          leafIndex += 1;
          continue;
        }

        const child = removeFromSequence(atom.child);
        if (child === null) return null;
        atoms.push({ ...atom, child });
      }

      if (atoms.length > 0) rows.push({ kind: 'row', atoms });
    }

    return rows.length > 0 ? { kind: 'sequence', rows } : null;
  };

  const result = removeFromSequence(node);
  return removed ? result : null;
}

function preservesLayoutAfterSingleLeafRemoval(
  shorter: SlotExprNode,
  longer: SlotExprNode,
  longerLeafCount: number,
): boolean {
  for (let index = 0; index < longerLeafCount; index += 1) {
    const candidate = removeLeafAt(longer, index);
    if (candidate !== null && sameCompleteAst(shorter, candidate)) return true;
  }
  return false;
}

function isOrderedSubsequence(shorter: LeafNode[], longer: LeafNode[]): boolean {
  let longerIndex = 0;
  for (const leaf of shorter) {
    while (
      longerIndex < longer.length &&
      (longer[longerIndex]?.role !== leaf.role || longer[longerIndex]?.uncertain !== leaf.uncertain)
    ) {
      longerIndex += 1;
    }
    if (longerIndex === longer.length) return false;
    longerIndex += 1;
  }
  return true;
}

function sortReasons(reasons: Iterable<ComparisonReasonCode>): ComparisonReasonCode[] {
  const unique = new Set(reasons);
  return REASON_ORDER.filter((reason) => unique.has(reason));
}

function addSlotDiff(
  slotDiffs: SlotDiff[],
  slot: SlotDiff['slot'],
  kind: ComparisonReasonCode,
  left: string,
  right: string,
  leftAst: SlotExprNode,
  rightAst: SlotExprNode,
): void {
  slotDiffs.push({
    slot,
    kind,
    left,
    right,
    roleDelta: countRoles(rightAst) - countRoles(leftAst),
  });
}

function classifyLeafDiff(
  leftAst: SlotExprNode,
  rightAst: SlotExprNode,
): ComparisonReasonCode | null {
  const leftLeaves = collectLeaves(leftAst);
  const rightLeaves = collectLeaves(rightAst);

  if (sameLeafLayout(leftAst, rightAst)) {
    if (sameLeaves(leftLeaves, rightLeaves)) return null;
    if (sameLeafRoles(leftLeaves, rightLeaves)) return 'uncertain-leaf';
    if (leftLeaves.length === rightLeaves.length) return 'leaf-swap';
  }

  const leftIsShorter = leftLeaves.length < rightLeaves.length;
  const shorter = leftIsShorter ? leftLeaves : rightLeaves;
  const longer = leftIsShorter ? rightLeaves : leftLeaves;
  const shorterAst = leftIsShorter ? leftAst : rightAst;
  const longerAst = leftIsShorter ? rightAst : leftAst;
  if (
    longer.length - shorter.length === 1 &&
    isOrderedSubsequence(shorter, longer) &&
    preservesLayoutAfterSingleLeafRemoval(shorterAst, longerAst, longer.length)
  ) {
    return leftIsShorter ? 'leaf-added' : 'leaf-removed';
  }

  if (!containsContainer(leftAst) && !containsContainer(rightAst)) return 'whole-slot-replaced';
  return 'unresolved-leaf-variation';
}

function comparePair(left: ImageResult, right: ImageResult): PairComparison {
  const leftAsts = Object.fromEntries(
    OUTPUT_SLOTS.map((slot) => [slot, parseOrThrow(left.signature[slot])]),
  ) as Record<(typeof OUTPUT_SLOTS)[number], SlotExprNode>;
  const rightAsts = Object.fromEntries(
    OUTPUT_SLOTS.map((slot) => [slot, parseOrThrow(right.signature[slot])]),
  ) as Record<(typeof OUTPUT_SLOTS)[number], SlotExprNode>;
  const reasonCodes: ComparisonReasonCode[] = [];
  const slotDiffs: SlotDiff[] = [];

  for (const slot of BASE_SLOTS) {
    const leftAst = leftAsts[slot];
    const rightAst = rightAsts[slot];
    if (renderContainerTopology(leftAst) !== renderContainerTopology(rightAst)) {
      reasonCodes.push('container-topology-changed');
      addSlotDiff(
        slotDiffs,
        slot,
        'container-topology-changed',
        left.signature[slot],
        right.signature[slot],
        leftAst,
        rightAst,
      );
    }
  }

  if (reasonCodes.includes('container-topology-changed')) {
    return {
      left: left.filename,
      right: right.filename,
      decision: 'different-components',
      reasonCodes: sortReasons(reasonCodes),
      slotDiffs,
    };
  }

  const leftRoleCount = BASE_SLOTS.reduce((total, slot) => total + countRoles(leftAsts[slot]), 0);
  const rightRoleCount = BASE_SLOTS.reduce((total, slot) => total + countRoles(rightAsts[slot]), 0);
  const maxRoleCount = Math.max(leftRoleCount, rightRoleCount);
  if (maxRoleCount > 0 && Math.min(leftRoleCount, rightRoleCount) / maxRoleCount < 0.5) {
    reasonCodes.push('role-count-threshold-exceeded');
    return {
      left: left.filename,
      right: right.filename,
      decision: 'different-components',
      reasonCodes: sortReasons(reasonCodes),
      slotDiffs,
    };
  }

  let unresolvedSlots = 0;
  for (const slot of BASE_SLOTS) {
    const kind = classifyLeafDiff(leftAsts[slot], rightAsts[slot]);
    if (kind === null) continue;
    reasonCodes.push(kind);
    if (kind === 'unresolved-leaf-variation') unresolvedSlots += 1;
    addSlotDiff(
      slotDiffs,
      slot,
      kind,
      left.signature[slot],
      right.signature[slot],
      leftAsts[slot],
      rightAsts[slot],
    );
  }

  if (left.signature.F !== right.signature.F) {
    reasonCodes.push('floating-variant');
    addSlotDiff(
      slotDiffs,
      'F',
      'floating-variant',
      left.signature.F,
      right.signature.F,
      leftAsts.F,
      rightAsts.F,
    );
  }

  if (unresolvedSlots > 0) {
    if (unresolvedSlots >= 2) reasonCodes.push('manual-multi-slot-variation');
    return {
      left: left.filename,
      right: right.filename,
      decision: 'manual-review',
      reasonCodes: sortReasons(reasonCodes),
      slotDiffs,
    };
  }

  if (reasonCodes.length === 0) reasonCodes.push('identical-structure');
  return {
    left: left.filename,
    right: right.filename,
    decision: 'same-component',
    reasonCodes: sortReasons(reasonCodes),
    slotDiffs,
  };
}

function buildSkeletons(images: ImageResult[]): StructuralComparisonResult['skeletons'] {
  return images.map((image) => ({
    filename: image.filename,
    slots: {
      T: renderSkeleton(parseOrThrow(image.signature.T)),
      M: renderSkeleton(parseOrThrow(image.signature.M)),
      B: renderSkeleton(parseOrThrow(image.signature.B)),
      F: renderSkeleton(parseOrThrow(image.signature.F)),
    },
  }));
}

function buildOverlayGroups(images: ImageResult[]): OverlayGroup[] {
  return OVERLAY_TYPES.flatMap((overlayType) => {
    const overlays = images.filter(
      (image) => image.signature.O !== '-' && image.notes.overlay_type === overlayType,
    );
    if (overlays.length === 0) return [];

    return [
      {
        overlayType,
        files: overlays.map((image) => image.filename),
        skeletons: overlays.map((image) => ({
          filename: image.filename,
          skeleton: renderSkeleton(parseOrThrow(image.signature.O)),
        })),
      },
    ];
  });
}

export function compareSignatures(images: ImageResult[]): StructuralComparisonResult {
  const pairs: PairComparison[] = [];
  for (let leftIndex = 0; leftIndex < images.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < images.length; rightIndex += 1) {
      pairs.push(comparePair(images[leftIndex]!, images[rightIndex]!));
    }
  }

  const reasonCodes = sortReasons(pairs.flatMap((pair) => pair.reasonCodes));
  const hasDifferentComponents = pairs.some((pair) => pair.decision === 'different-components');
  const hasMixedLargeSet =
    images.length >= 4 &&
    !hasDifferentComponents &&
    (reasonCodes.includes('leaf-added') || reasonCodes.includes('leaf-removed')) &&
    reasonCodes.includes('whole-slot-replaced');
  if (hasMixedLargeSet) reasonCodes.push('manual-mixed-large-set');

  const decision: StructuralDecision = hasDifferentComponents
    ? 'different-components'
    : hasMixedLargeSet || pairs.some((pair) => pair.decision === 'manual-review')
      ? 'manual-review'
      : 'same-component';

  return {
    decision,
    reasonCodes: sortReasons(reasonCodes),
    skeletons: buildSkeletons(images),
    pairs,
    overlayGroups: buildOverlayGroups(images),
  };
}
