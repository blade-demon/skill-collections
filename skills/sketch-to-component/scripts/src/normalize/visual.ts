import type {
  AssetEntry,
  Border,
  Effect,
  Fill,
  Style,
  TextContent,
  VisualBlock,
  VisualNode,
  VisualNodeKind,
  Warning,
} from '@skill-collections/d2c-core';
import type { SketchAssetEntry, SketchRawModel } from '../sketch-raw-model.js';
import { cleanChildren } from './clean-tree.js';
import { stableAssetId, stableComponentName, stableNodeId } from './names.js';
import {
  addWarning,
  getLayers,
  getNodeClass,
  getNodeId,
  getNodeName,
  isVisible,
  readFrame,
  readNumber,
  type SketchNode,
} from './sketch-nodes.js';
import {
  extractOverrides,
  getMasterForInstance,
  type SymbolIndex,
} from './symbols.js';

export interface BuildVisualBlockInput {
  model: SketchRawModel;
  artboard: SketchNode;
  symbols: SymbolIndex;
  warnings: Warning[];
}

interface VisualContext {
  model: SketchRawModel;
  symbols: SymbolIndex;
  warnings: Warning[];
  assetMap: Map<string, AssetEntry>;
}

export function buildVisualBlock(input: BuildVisualBlockInput): VisualBlock {
  const context: VisualContext = {
    model: input.model,
    symbols: input.symbols,
    warnings: input.warnings,
    assetMap: new Map(),
  };
  const frame = readFrame(input.artboard);
  const root = normalizeNode(input.artboard, context, {
    isRoot: true,
    visitedSymbols: new Set(),
  });
  if (!root) {
    throw new Error('Selected artboard could not be normalized');
  }
  return {
    artboard: { width: frame.width, height: frame.height },
    root,
    assets: [...context.assetMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

interface NormalizeNodeOptions {
  isRoot?: boolean;
  visitedSymbols: Set<string>;
}

function normalizeNode(
  node: SketchNode,
  context: VisualContext,
  options: NormalizeNodeOptions,
): VisualNode | undefined {
  if (!isVisible(node)) {
    addWarning(context.warnings, 'hidden-node-skipped', `Skipped hidden node "${getNodeName(node)}"`, node, 'info');
    return undefined;
  }

  const nodeClass = getNodeClass(node);
  if (nodeClass === 'symbolInstance') {
    return normalizeSymbolInstance(node, context, options);
  }

  const kind = mapKind(nodeClass, context.warnings, node);
  const frame = readFrame(node);
  const rawChildren = getLayers(node)
    .map((child) => normalizeNode(child, context, { visitedSymbols: new Set(options.visitedSymbols) }))
    .filter((child): child is VisualNode => Boolean(child));
  const children = cleanChildren(rawChildren, context.warnings);

  const visualNode: VisualNode = {
    id: stableNodeId(getNodeId(node)),
    kind,
    name: stableComponentName(getNodeName(node), getNodeId(node)),
    source: {
      nodeId: getNodeId(node),
      name: getNodeName(node),
      originalType: nodeClass,
      provider: 'sketch',
    },
    layout: options.isRoot
      ? { x: 0, y: 0, width: frame.width, height: frame.height }
      : frame,
    children,
  };

  const style = extractStyle(node, kind);
  if (style) visualNode.style = style;
  if (kind === 'text') visualNode.text = extractText(node);
  if (kind === 'image') {
    const asset = registerImageAsset(node, context);
    visualNode.assetRef = asset.id;
  }

  return visualNode;
}

function normalizeSymbolInstance(
  node: SketchNode,
  context: VisualContext,
  options: NormalizeNodeOptions,
): VisualNode {
  const symbolId = typeof node.symbolID === 'string' ? node.symbolID : undefined;
  const master = getMasterForInstance(node, context.symbols, context.warnings);
  const frame = readFrame(node);
  let children: VisualNode[] = [];

  if (symbolId && options.visitedSymbols.has(symbolId)) {
    addWarning(context.warnings, 'symbol-cycle', `Stopped cyclic symbol expansion for ${symbolId}`, node);
  } else if (master) {
    const nextVisited = new Set(options.visitedSymbols);
    if (symbolId) nextVisited.add(symbolId);
    children = cleanChildren(
      getLayers(master)
        .map((child) => normalizeNode(child, context, { visitedSymbols: nextVisited }))
        .filter((child): child is VisualNode => Boolean(child)),
      context.warnings,
    );
  }

  const kind: VisualNodeKind = master
    ? mapKind(getNodeClass(master), context.warnings, master)
    : 'frame';
  const visualNode: VisualNode = {
    id: stableNodeId(getNodeId(node)),
    kind,
    name: stableComponentName(getNodeName(node), getNodeId(node)),
    source: {
      nodeId: getNodeId(node),
      name: getNodeName(node),
      originalType: 'symbolInstance',
      provider: 'sketch',
    },
    layout: frame,
    symbol: {
      instanceId: getNodeId(node),
      masterId: symbolId,
      overrides: extractOverrides(node),
    },
    children,
  };
  const style = extractStyle(node, kind);
  if (style) visualNode.style = style;
  return visualNode;
}

function mapKind(nodeClass: string, warnings: Warning[], node: SketchNode): VisualNodeKind {
  if (nodeClass === 'artboard' || nodeClass === 'frame' || nodeClass === 'symbolMaster') return 'frame';
  if (nodeClass === 'group') return 'group';
  if (nodeClass === 'text') return 'text';
  if (nodeClass === 'bitmap') return 'image';
  if (['shapePath', 'oval', 'rectangle', 'shapeGroup'].includes(nodeClass)) return 'shape';
  if (nodeClass.startsWith('svg') || nodeClass === 'path') return 'vector';
  addWarning(warnings, 'unknown-node-class', `Mapped unknown Sketch class "${nodeClass}" to group`, node);
  return 'group';
}

function registerImageAsset(node: SketchNode, context: VisualContext): AssetEntry {
  const image = node.image && typeof node.image === 'object' ? (node.image as Record<string, unknown>) : {};
  const ref = typeof image._ref === 'string' ? image._ref : `missing-image/${getNodeId(node)}`;
  const rawAsset = context.model.assets.find((asset) => asset.path === ref);
  if (!rawAsset) {
    addWarning(context.warnings, 'missing-asset', `Image asset not found for ${ref}`, node);
  }
  const id = stableAssetId(ref);
  if (!context.assetMap.has(id)) {
    const asset: SketchAssetEntry | undefined = rawAsset;
    context.assetMap.set(id, {
      id,
      ref,
      kind: asset?.kind ?? 'image',
      originalPath: asset?.path ?? ref,
    });
  }
  return context.assetMap.get(id)!;
}

function extractText(node: SketchNode): TextContent {
  const attributedString =
    node.attributedString && typeof node.attributedString === 'object'
      ? (node.attributedString as Record<string, unknown>)
      : {};
  const content = typeof attributedString.string === 'string' ? attributedString.string : getNodeName(node);
  const encoded = getTextAttributes(node);
  const textStyle: NonNullable<TextContent['style']> = {};
  const font = encoded.MSAttributedStringFontAttribute as Record<string, unknown> | undefined;
  const fontAttrs = font?.attributes as Record<string, unknown> | undefined;
  if (typeof fontAttrs?.name === 'string') textStyle.fontFamily = fontAttrs.name;
  if (typeof fontAttrs?.size === 'number') textStyle.fontSize = fontAttrs.size;
  const color = colorToHex(encoded.MSAttributedStringColorAttribute) ?? layerTextColor(node);
  if (color) textStyle.color = color;
  const paragraph = encoded.paragraphStyle as Record<string, unknown> | undefined;
  const alignment = readNumber(paragraph?.alignment, 0);
  const alignmentMap = ['left', 'right', 'center', 'justify'] as const;
  textStyle.textAlign = alignmentMap[alignment] ?? 'left';
  return Object.keys(textStyle).length > 0 ? { content, style: textStyle } : { content };
}

function getTextAttributes(node: SketchNode): Record<string, unknown> {
  const attributedString =
    node.attributedString && typeof node.attributedString === 'object'
      ? (node.attributedString as Record<string, unknown>)
      : {};
  const attributes = Array.isArray(attributedString.attributes)
    ? (attributedString.attributes[0] as Record<string, unknown> | undefined)
    : undefined;
  if (attributes?.attributes && typeof attributes.attributes === 'object') {
    return attributes.attributes as Record<string, unknown>;
  }
  const style = node.style && typeof node.style === 'object' ? node.style : {};
  const textStyle = style.textStyle && typeof style.textStyle === 'object' ? (style.textStyle as Record<string, unknown>) : {};
  return textStyle.encodedAttributes && typeof textStyle.encodedAttributes === 'object'
    ? (textStyle.encodedAttributes as Record<string, unknown>)
    : {};
}

/** A Sketch text layer's enabled layer-level fill doubles as its text colour. */
function layerTextColor(node: SketchNode): string | undefined {
  const style = node.style && typeof node.style === 'object' ? node.style : undefined;
  if (!style) return undefined;
  return normalizeFills(style.fills)[0]?.color;
}

function extractStyle(node: SketchNode, kind: VisualNodeKind): Style | undefined {
  const style = node.style && typeof node.style === 'object' ? node.style : undefined;
  if (!style) return undefined;
  const result: Style = {};
  // A Sketch text layer's `style.fills` encode the *text colour*, not a box
  // background — that colour is captured in `text.style.color` (see extractText).
  // Emitting it as `style.fills` would let preview/codegen paint the text node
  // as a solid block (Gate-1 review defect, 2026-05-22).
  if (kind !== 'text') {
    const fills = normalizeFills(style.fills);
    if (fills.length > 0) result.fills = fills;
  }
  const borders = normalizeBorders(style.borders);
  if (borders.length > 0) result.borders = borders;
  const effects = normalizeEffects(style.shadows, style.innerShadows);
  if (effects.length > 0) result.effects = effects;
  const contextSettings = style.contextSettings as Record<string, unknown> | undefined;
  if (typeof contextSettings?.opacity === 'number') result.opacity = contextSettings.opacity;
  if (typeof node.fixedRadius === 'number' && node.fixedRadius >= 0) result.radius = node.fixedRadius;
  if (typeof style.do_objectID === 'string') result.raw = { sketchStyleId: style.do_objectID };
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeFills(value: unknown): Fill[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((fill) => fill && typeof fill === 'object' && (fill as Record<string, unknown>).isEnabled !== false)
    .map((fill) => {
      const f = fill as Record<string, unknown>;
      return {
        type: fillTypeName(f.fillType),
        color: colorToHex(f.color),
        raw: { fillType: f.fillType },
      };
    });
}

function normalizeBorders(value: unknown): Border[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((border) => border && typeof border === 'object' && (border as Record<string, unknown>).isEnabled !== false)
    .map((border) => {
      const b = border as Record<string, unknown>;
      return {
        color: colorToHex(b.color),
        thickness: typeof b.thickness === 'number' ? b.thickness : undefined,
        position: typeof b.position === 'number' ? b.position : undefined,
        raw: { fillType: b.fillType },
      };
    });
}

function normalizeEffects(shadows: unknown, innerShadows: unknown): Effect[] {
  const effects: Effect[] = [];
  for (const [type, value] of [
    ['shadow', shadows],
    ['innerShadow', innerShadows],
  ] as const) {
    if (!Array.isArray(value)) continue;
    for (const effect of value) {
      if (!effect || typeof effect !== 'object') continue;
      const raw = effect as Record<string, unknown>;
      if (raw.isEnabled === false) continue;
      effects.push({
        type,
        color: colorToHex(raw.color),
        x: typeof raw.offsetX === 'number' ? raw.offsetX : undefined,
        y: typeof raw.offsetY === 'number' ? raw.offsetY : undefined,
        blur: typeof raw.blurRadius === 'number' ? raw.blurRadius : undefined,
        spread: typeof raw.spread === 'number' ? raw.spread : undefined,
      });
    }
  }
  return effects;
}

function fillTypeName(value: unknown): string | undefined {
  if (value === 0) return 'color';
  if (value === 1) return 'gradient';
  if (value === 4) return 'image';
  return typeof value === 'number' ? `sketch-fill-${value}` : undefined;
}

function colorToHex(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const color = value as Record<string, unknown>;
  const r = colorChannel(color.red);
  const g = colorChannel(color.green);
  const b = colorChannel(color.blue);
  const a = colorChannel(color.alpha ?? 1);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
}

function colorChannel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}
