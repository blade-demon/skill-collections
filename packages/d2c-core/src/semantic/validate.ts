/**
 * Stage 5A — graph-level integrity check for `SemanticViewBody`.
 *
 * `SemanticViewBodySchema` (in `./schema.ts`) only enforces shape: each
 * field exists, types are right, enums are valid, discriminated unions
 * pick correctly. It cannot catch cross-node constraints because those
 * require traversing the whole graph.
 *
 * `assertSemanticViewIntegrity` covers exactly those graph-level invariants
 * that downstream Stage 5B/5C/5D consumers will assume:
 *
 *   - every `SemanticNode.id` is unique;
 *   - every `childIds` reference resolves to an existing node;
 *   - parent/child links are reciprocal (if A.parentId === B, then
 *     B.childIds includes A);
 *   - `body.screen.semanticNodeId` points to a node whose `kind === 'screen'`;
 *   - `primaryVisualNodeId` is always present in the same node's
 *     `visualNodeIds` array;
 *   - every `ComponentCandidate.rootSemanticNodeId`, every
 *     `RepeatedPattern.itemSemanticNodeIds[*]`, and every
 *     `LayoutCandidate.semanticNodeId` resolves to a node in `body.nodes`;
 *   - `RepeatedPattern.itemCount` matches `itemSemanticNodeIds.length`;
 *   - every id token appearing on a node, component candidate, repeated
 *     pattern, or layout candidate is unique across the whole body — both
 *     within and across arrays. The prefix convention in plan §3.5 makes
 *     this collision rare by construction, but enforcing it here keeps
 *     downstream consumers from having to disambiguate when a derive bug
 *     reuses the same id for two different kinds of artifact.
 *
 * Any violation throws a `SemanticViewIntegrityError` whose `message`
 * names the offending id, the field, and the reason. `deriveSemanticView`
 * (5A-PR-2) will call this on its output — a graph-level violation there
 * is a derive bug, not user-actionable, so throw rather than warn.
 */
import type { SemanticViewBody } from './schema';

export class SemanticViewIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SemanticViewIntegrityError';
  }
}

type IdKind = 'SemanticNode' | 'ComponentCandidate' | 'RepeatedPattern' | 'LayoutCandidate';

export function assertSemanticViewIntegrity(body: SemanticViewBody): void {
  const idOwners = new Map<string, IdKind>();
  const registerId = (id: string, kind: IdKind): void => {
    const existing = idOwners.get(id);
    if (existing === undefined) {
      idOwners.set(id, kind);
      return;
    }
    if (existing === kind) {
      throw new SemanticViewIntegrityError(`duplicate ${kind} id: ${id}`);
    }
    throw new SemanticViewIntegrityError(
      `id ${id} is reused across body: appears as both ${existing} and ${kind}`,
    );
  };

  const nodesById = new Map<string, SemanticViewBody['nodes'][number]>();
  for (const node of body.nodes) {
    registerId(node.id, 'SemanticNode');
    nodesById.set(node.id, node);
  }

  for (const node of body.nodes) {
    if (!node.visualNodeIds.includes(node.primaryVisualNodeId)) {
      throw new SemanticViewIntegrityError(
        `node ${node.id}: primaryVisualNodeId ${node.primaryVisualNodeId} not in visualNodeIds [${node.visualNodeIds.join(', ')}]`,
      );
    }

    for (const childId of node.childIds) {
      const child = nodesById.get(childId);
      if (!child) {
        throw new SemanticViewIntegrityError(
          `node ${node.id}: childId ${childId} does not exist in body.nodes`,
        );
      }
      if (child.parentId !== node.id) {
        throw new SemanticViewIntegrityError(
          `node ${node.id}: childId ${childId} but child.parentId is ${child.parentId ?? '(absent)'}`,
        );
      }
    }

    if (node.parentId !== undefined) {
      const parent = nodesById.get(node.parentId);
      if (!parent) {
        throw new SemanticViewIntegrityError(
          `node ${node.id}: parentId ${node.parentId} does not exist in body.nodes`,
        );
      }
      if (!parent.childIds.includes(node.id)) {
        throw new SemanticViewIntegrityError(
          `node ${node.id}: parentId ${node.parentId} but parent.childIds does not include ${node.id}`,
        );
      }
    }
  }

  const screenTarget = nodesById.get(body.screen.semanticNodeId);
  if (!screenTarget) {
    throw new SemanticViewIntegrityError(
      `body.screen.semanticNodeId ${body.screen.semanticNodeId} does not exist in body.nodes`,
    );
  }
  if (screenTarget.kind !== 'screen') {
    throw new SemanticViewIntegrityError(
      `body.screen.semanticNodeId ${body.screen.semanticNodeId} references a node of kind '${screenTarget.kind}', expected 'screen'`,
    );
  }

  for (const candidate of body.componentCandidates) {
    registerId(candidate.id, 'ComponentCandidate');
    if (!nodesById.has(candidate.rootSemanticNodeId)) {
      throw new SemanticViewIntegrityError(
        `componentCandidate ${candidate.id}: rootSemanticNodeId ${candidate.rootSemanticNodeId} does not exist in body.nodes`,
      );
    }
  }

  for (const pattern of body.repeatedPatterns) {
    registerId(pattern.id, 'RepeatedPattern');
    if (pattern.itemCount !== pattern.itemSemanticNodeIds.length) {
      throw new SemanticViewIntegrityError(
        `repeatedPattern ${pattern.id}: itemCount ${pattern.itemCount} does not match itemSemanticNodeIds.length ${pattern.itemSemanticNodeIds.length}`,
      );
    }
    for (const itemId of pattern.itemSemanticNodeIds) {
      if (!nodesById.has(itemId)) {
        throw new SemanticViewIntegrityError(
          `repeatedPattern ${pattern.id}: itemSemanticNodeIds entry ${itemId} does not exist in body.nodes`,
        );
      }
    }
  }

  for (const layout of body.layoutCandidates) {
    registerId(layout.id, 'LayoutCandidate');
    if (!nodesById.has(layout.semanticNodeId)) {
      throw new SemanticViewIntegrityError(
        `layoutCandidate ${layout.id}: semanticNodeId ${layout.semanticNodeId} does not exist in body.nodes`,
      );
    }
  }
}
