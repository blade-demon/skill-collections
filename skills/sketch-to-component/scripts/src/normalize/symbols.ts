import type { Warning } from '@skill-collections/d2c-core';
import type { SketchRawModel } from '../sketch-raw-model.js';
import {
  addWarning,
  asSketchNode,
  getNodeClass,
  getPageLayers,
  getPages,
  type SketchNode,
} from './sketch-nodes.js';

export interface SymbolIndex {
  mastersBySymbolId: Map<string, SketchNode>;
}

export function buildSymbolIndex(model: SketchRawModel): SymbolIndex {
  const mastersBySymbolId = new Map<string, SketchNode>();
  for (const page of getPages(model)) {
    for (const layer of getPageLayers(page)) {
      const node = asSketchNode(layer);
      if (getNodeClass(node) === 'symbolMaster' && typeof node.symbolID === 'string') {
        mastersBySymbolId.set(node.symbolID, node);
      }
    }
  }
  return { mastersBySymbolId };
}

export function getMasterForInstance(
  node: SketchNode,
  symbols: SymbolIndex,
  warnings: Warning[],
): SketchNode | undefined {
  if (typeof node.symbolID !== 'string') return undefined;
  const master = symbols.mastersBySymbolId.get(node.symbolID);
  if (!master) {
    addWarning(warnings, 'missing-symbol-master', `Missing symbol master for ${node.symbolID}`, node);
  }
  return master;
}

export function extractOverrides(node: SketchNode): Array<{ path: string; value: unknown }> | undefined {
  if (!Array.isArray(node.overrideValues)) return undefined;
  return node.overrideValues.map((override, index) => ({
    path:
      typeof override.overrideName === 'string'
        ? override.overrideName
        : typeof override.path === 'string'
          ? override.path
          : `override-${index}`,
    value: override.value,
  }));
}
