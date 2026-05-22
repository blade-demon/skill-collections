import type { VisualNode, Warning } from '@skill-collections/d2c-core';

export function cleanChildren(children: VisualNode[], warnings: Warning[]): VisualNode[] {
  const cleaned: VisualNode[] = [];
  for (const child of children) {
    if (isEmptyContainer(child)) {
      warnings.push({
        code: 'dropped-empty-container',
        message: `Dropped empty ${child.kind} "${child.name}"`,
        severity: 'info',
        sourceNodeId: child.source.nodeId,
        stage: 'sketch-normalize',
      });
      continue;
    }
    if (isAnonymousPassthroughGroup(child)) {
      warnings.push({
        code: 'flattened-anonymous-group',
        message: `Flattened anonymous group "${child.name}"`,
        severity: 'info',
        sourceNodeId: child.source.nodeId,
        stage: 'sketch-normalize',
      });
      cleaned.push(...child.children);
      continue;
    }
    cleaned.push(child);
  }
  return cleaned;
}

function isEmptyContainer(node: VisualNode): boolean {
  return (
    (node.kind === 'group' || node.kind === 'frame') &&
    node.children.length === 0 &&
    !node.style &&
    !node.text &&
    !node.assetRef
  );
}

function isAnonymousPassthroughGroup(node: VisualNode): boolean {
  if (node.kind !== 'group' || node.children.length !== 1 || node.style || node.symbol) return false;
  return /^编组|^Group\s*\d*$/i.test(node.source.name ?? node.name);
}
