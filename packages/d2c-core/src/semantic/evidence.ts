/**
 * Stage 5A — Semantic evidence constructors.
 *
 * Thin typed builders. The point isn't computation; it's to give every
 * piece of evidence a single, greppable point of origin. After Stage 5A
 * lands, `grep -r 'evidenceFromVisualNode('` enumerates every place
 * `derive-semantic-view` cites a visual node as evidence, etc.
 *
 * `evidenceFromAnnotation` and `evidenceFromProjectRule` are exported but
 * not used by Stage 5A's derive. They're reserved entry points so 5B+ can
 * wire in explicit annotations and project rules without touching the
 * SemanticEvidence shape.
 */
import type { SemanticEvidence } from './schema';

export function evidenceFromVisualNode(nodeId: string, reason: string): SemanticEvidence {
  return { kind: 'visual-node', nodeId, reason };
}

export function evidenceFromDesignIrCandidate(
  candidateName: string,
  nodeId: string,
  reason: string,
): SemanticEvidence {
  return { kind: 'design-ir-candidate', candidateName, nodeId, reason };
}

export function evidenceFromAnnotation(
  annotationKey: string,
  nodeId: string,
  reason: string,
): SemanticEvidence {
  return { kind: 'annotation', annotationKey, nodeId, reason };
}

export function evidenceFromProjectRule(ruleName: string, reason: string): SemanticEvidence {
  return { kind: 'project-rule', ruleName, reason };
}
