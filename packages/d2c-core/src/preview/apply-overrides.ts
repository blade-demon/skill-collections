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

  walk(cloned.root, (node) => {
    for (const override of node.symbol?.overrides ?? []) {
      const textTargetId = parseTextOverrideTarget(override.path);
      if (!textTargetId || typeof override.value !== 'string') {
        stats.overrideUnsupported += 1;
        warnings.push(makeWarning('unsupported-symbol-override', node, `Unsupported symbol override "${override.path}"`));
        continue;
      }

      const target = findTextNode(node, textTargetId);
      if (!target?.text) {
        stats.overrideUnmapped += 1;
        warnings.push(makeWarning('unmapped-symbol-override', node, `Could not map text override "${override.path}"`));
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

function parseTextOverrideTarget(path: string): string | undefined {
  const lastSegment = path.split('/').filter(Boolean).at(-1);
  if (!lastSegment?.endsWith('_stringValue')) return undefined;
  const nodeId = lastSegment.slice(0, -'_stringValue'.length);
  return nodeId.length > 0 ? nodeId : undefined;
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
