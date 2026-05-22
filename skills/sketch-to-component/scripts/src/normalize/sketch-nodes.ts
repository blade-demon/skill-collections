import type { Warning } from '@skill-collections/d2c-core';
import type { SketchPage, SketchRawModel } from '../sketch-raw-model.js';

export type SketchNode = Record<string, unknown> & {
  _class?: string;
  do_objectID?: string;
  name?: string;
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

export function asSketchNode(value: unknown): SketchNode {
  return value && typeof value === 'object' ? (value as SketchNode) : {};
}

export function getNodeClass(node: SketchNode): string {
  return typeof node._class === 'string' ? node._class : 'unknown';
}

export function getNodeId(node: SketchNode): string {
  return typeof node.do_objectID === 'string' && node.do_objectID.length > 0
    ? node.do_objectID
    : 'missing-node-id';
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
