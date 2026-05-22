import type { SemanticBlock, SemanticCandidate, VisualNode, Warning } from '@skill-collections/d2c-core';

export function deriveSemanticBlock(root: VisualNode, warnings: Warning[]): SemanticBlock {
  const candidates: SemanticCandidate[] = [];
  const seen = new Set<string>();

  walk(root, (node) => {
    const candidate = candidateForNode(node);
    if (!candidate || seen.has(candidate.nodeId)) return;
    seen.add(candidate.nodeId);
    candidates.push(candidate);
    if (candidate.confidence === 'low') {
      warnings.push({
        code: 'low-confidence-semantic-candidate',
        message: `Low-confidence semantic candidate "${candidate.candidateName}" from ${candidate.reason}`,
        severity: 'info',
        sourceNodeId: node.source.nodeId,
        stage: 'sketch-normalize',
      });
    }
  });

  return {
    candidates: candidates.sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
  };
}

function candidateForNode(node: VisualNode): SemanticCandidate | undefined {
  if (node.symbol?.masterId) {
    return {
      nodeId: node.id,
      candidateName: node.name,
      confidence: node.name.includes('Icon') ? 'medium' : 'low',
      reason: 'symbolInstance',
      symbolMasterId: node.symbol.masterId,
    };
  }
  const sourceName = node.source.name ?? node.name;
  if (/^组件\//.test(sourceName) || /^icon\//i.test(sourceName)) {
    return {
      nodeId: node.id,
      candidateName: node.name,
      confidence: /^icon\//i.test(sourceName) ? 'medium' : 'low',
      reason: 'layer-name-prefix',
    };
  }
  if (hasRepeatedChildShape(node)) {
    return {
      nodeId: node.id,
      candidateName: node.name,
      confidence: 'low',
      reason: 'repeated-structure',
    };
  }
  return undefined;
}

function hasRepeatedChildShape(node: VisualNode): boolean {
  if (node.children.length < 3) return false;
  const signatures = new Map<string, number>();
  for (const child of node.children) {
    const signature = `${child.kind}:${Math.round(child.layout.width)}x${Math.round(child.layout.height)}:${child.children.length}`;
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
  }
  return [...signatures.values()].some((count) => count >= 3);
}

function walk(node: VisualNode, visit: (node: VisualNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}
