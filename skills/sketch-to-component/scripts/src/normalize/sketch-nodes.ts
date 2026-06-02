import type { Warning } from '@skill-collections/d2c-core';
import type { SketchPage, SketchRawModel } from '../sketch-raw-model.js';
import {
  INVALID_ID_SENTINEL,
  MISSING_ID_SENTINEL,
  asAnyLayer,
  getLayerClass,
  getLayerId,
  isCorruptClass,
  type SketchLayerLike,
} from './sketch-types.js';

/**
 * Loose Sketch layer type used throughout downstream normalize modules
 * (visual.ts / symbols.ts / select-artboard.ts). Composes the typed
 * `SketchLayerLike` boundary base with bag-of-fields extensions for the
 * properties that legacy normalize code reads directly.
 *
 * Migration strategy: this commit keeps `SketchNode` as the *stable*
 * downstream API (shape and contract unchanged) and only routes the
 * runtime helpers through `sketch-types`. A later PR may collapse this
 * into `FileFormat.AnyLayer` where each downstream call site uses the
 * appropriate type guard — but that is out of scope here.
 */
export type SketchNode = SketchLayerLike & {
  frame?: Record<string, unknown>;
  layers?: SketchNode[];
  style?: Record<string, unknown>;
  symbolID?: string;
  overrideValues?: Array<Record<string, unknown>>;
  isVisible?: boolean;
};

export interface SketchFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Coerce an `unknown` to `SketchNode`. Preserves the legacy contract of
 * "always returns an object" — non-object inputs become `{}` so
 * downstream `getNodeClass` / `getNodeId` produce their legacy sentinels
 * (`'unknown'` / `'missing-node-id'`) rather than throwing.
 *
 * The runtime boundary is delegated to `asAnyLayer`; only the
 * never-undefined contract differs.
 */
export function asSketchNode(value: unknown): SketchNode {
  return (asAnyLayer(value) as SketchNode | undefined) ?? {};
}

/**
 * Legacy contract: returns `'unknown'` for any unreadable class
 * (missing field OR non-string value). The `sketch-types` helpers
 * distinguish those two cases via separate sentinels, so we collapse
 * both back into the historical string here. Downstream callers that
 * want the finer distinction should use `getLayerClass` directly.
 */
export function getNodeClass(node: SketchNode): string {
  const klass = getLayerClass(node);
  return isCorruptClass(klass) ? 'unknown' : klass;
}

/**
 * Legacy contract: returns `'missing-node-id'` for both missing and
 * invalid (empty / non-string) `do_objectID`. Mirrors `getNodeClass`'s
 * collapse of the two sentinels into a single legacy string.
 */
export function getNodeId(node: SketchNode): string {
  const id = getLayerId(node);
  return id === MISSING_ID_SENTINEL || id === INVALID_ID_SENTINEL ? 'missing-node-id' : id;
}

export function getNodeName(node: SketchNode): string {
  return typeof node.name === 'string' && node.name.length > 0 ? node.name : getNodeClass(node);
}

export function getLayers(node: SketchNode): SketchNode[] {
  return Array.isArray(node.layers) ? node.layers.map(asSketchNode) : [];
}

export function isVisible(node: SketchNode): boolean {
  return node.isVisible !== false;
}

export function readFrame(node: SketchNode): SketchFrame {
  const frame = node.frame ?? {};
  return {
    x: readNumber(frame.x, 0),
    y: readNumber(frame.y, 0),
    width: readNumber(frame.width, 0),
    height: readNumber(frame.height, 0),
  };
}

export function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function addWarning(
  warnings: Warning[],
  code: string,
  message: string,
  node?: SketchNode,
  severity: Warning['severity'] = 'warning',
): void {
  warnings.push({
    code,
    message,
    severity,
    sourceNodeId: node ? getNodeId(node) : undefined,
    stage: 'sketch-normalize',
  });
}

export function getPages(model: SketchRawModel): SketchPage[] {
  return [...model.pages].sort((a, b) => a.path.localeCompare(b.path));
}

export function getPageLayers(page: SketchPage): SketchNode[] {
  return Array.isArray(page.data.layers) ? page.data.layers.map(asSketchNode) : [];
}
