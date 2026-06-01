import type { VisualBlock, VisualNode, Warning } from '../ir';

export interface OverrideStats {
  overrideApplied: number;
  overrideUnmapped: number;
  overrideUnsupported: number;
}

export interface ApplyOverridesResult {
  visual: VisualBlock;
  warnings: Warning[];
  stats: OverrideStats;
}

export function applySymbolOverrides(visual: VisualBlock): ApplyOverridesResult {
  const cloned = cloneVisualBlock(visual);
  const warnings: Warning[] = [];
  const stats: OverrideStats = {
    overrideApplied: 0,
    overrideUnmapped: 0,
    overrideUnsupported: 0,
  };

  walkPostOrder(cloned.root, (node) => {
    for (const override of node.symbol?.overrides ?? []) {
      const textTargetPath = parseTextOverrideTargetPath(override.path);
      if (!textTargetPath || typeof override.value !== 'string') {
        stats.overrideUnsupported += 1;
        warnings.push(
          makeWarning(
            'unsupported-symbol-override',
            node,
            `Unsupported symbol override "${override.path}"`,
          ),
        );
        continue;
      }

      const target = findTextNodeByOverridePath(node, textTargetPath);
      if (!target?.text) {
        stats.overrideUnmapped += 1;
        warnings.push(
          makeWarning(
            'unmapped-symbol-override',
            node,
            `Could not map text override "${override.path}"`,
          ),
        );
        continue;
      }

      target.text = {
        ...target.text,
        content: override.value,
      };
      stats.overrideApplied += 1;
    }
  });

  return { visual: cloned, warnings, stats };
}

function parseTextOverrideTargetPath(path: string): string[] | undefined {
  const lastSegment = path.split('/').filter(Boolean).at(-1);
  if (!lastSegment?.endsWith('_stringValue')) return undefined;
  const prefix = path.slice(0, -'_stringValue'.length);
  const segments = prefix.split('/').filter(Boolean);
  return segments.length > 0 ? segments : undefined;
}

function findTextNodeByOverridePath(
  root: VisualNode,
  sourceNodePath: readonly string[],
): VisualNode | undefined {
  const scoped = findTextNodeByPath(root, sourceNodePath);
  return scoped ?? findTextNode(root, sourceNodePath[sourceNodePath.length - 1] ?? '');
}

function findTextNodeByPath(
  root: VisualNode,
  sourceNodePath: readonly string[],
): VisualNode | undefined {
  if (sourceNodePath.length === 0) return undefined;
  let candidates: VisualNode[] = [root];
  for (let i = 0; i < sourceNodePath.length; i++) {
    const sourceNodeId = sourceNodePath[i];
    if (!sourceNodeId) return undefined;
    const matches = candidates.flatMap((candidate) =>
      findDescendantsBySourceNodeId(candidate, sourceNodeId),
    );
    if (matches.length === 0) return undefined;
    if (i === sourceNodePath.length - 1) {
      return matches.find((node) => node.kind === 'text' && node.text);
    }
    candidates = matches;
  }
  return undefined;
}

function findDescendantsBySourceNodeId(root: VisualNode, sourceNodeId: string): VisualNode[] {
  const matches: VisualNode[] = [];
  walk(root, (node) => {
    if (node !== root && node.source.nodeId === sourceNodeId) matches.push(node);
  });
  return matches;
}

function findTextNode(root: VisualNode, sourceNodeId: string): VisualNode | undefined {
  let found: VisualNode | undefined;
  walk(root, (node) => {
    if (!found && node.kind === 'text' && node.source.nodeId === sourceNodeId) {
      found = node;
    }
  });
  return found;
}

function walk(node: VisualNode, visit: (node: VisualNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

function walkPostOrder(node: VisualNode, visit: (node: VisualNode) => void): void {
  for (const child of node.children) walkPostOrder(child, visit);
  visit(node);
}

function makeWarning(code: string, node: VisualNode, message: string): Warning {
  return {
    code,
    message,
    severity: 'warning',
    sourceNodeId: node.source.nodeId,
    stage: 'preview-derive',
  };
}

function cloneVisualBlock(visual: VisualBlock): VisualBlock {
  return JSON.parse(JSON.stringify(visual)) as VisualBlock;
}
