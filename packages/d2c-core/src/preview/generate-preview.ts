import { VisualViewSchema, type Fill, type VisualNode, type VisualView } from '../ir';

export interface PreviewAsset {
  path: string;
  assetId: string;
  /** Placeholder SVGs are text; real bitmaps are raw bytes. */
  content: string | Uint8Array;
}

/** A real image the caller resolved from disk, keyed by VisualNode.assetRef. */
export interface RealImageAsset {
  /** On-disk file name to reference and re-emit, e.g. `ab12cd.png`. */
  fileName: string;
  bytes: Uint8Array;
}

export interface GeneratePreviewOptions {
  /**
   * Real images keyed by `VisualNode.assetRef`. When an image node's assetRef
   * is present, preview renders the actual bitmap; otherwise it falls back to
   * the generated placeholder SVG. Defaults to none (all placeholders).
   */
  realAssets?: ReadonlyMap<string, RealImageAsset>;
}

export interface GeneratePreviewResult {
  html: string;
  css: string;
  assets: PreviewAsset[];
  stats: {
    placeholderAssets: number;
    realAssets: number;
  };
}

export function generatePreview(
  input: VisualView,
  options: GeneratePreviewOptions = {},
): GeneratePreviewResult {
  const visualView = VisualViewSchema.parse(input);
  const realAssets = options.realAssets ?? new Map<string, RealImageAsset>();
  // Placeholders only for image nodes without a resolved real image.
  const placeholderAssets = collectPlaceholderAssets(visualView.body.root, realAssets);
  const usedRealAssets = collectUsedRealAssets(visualView.body.root, realAssets);
  const html = renderHtml(visualView.body.root, realAssets);
  const css = renderCss(visualView.body.root, placeholderAssets, realAssets);

  const placeholderPreviewAssets: PreviewAsset[] = [...placeholderAssets.values()].map(
    ({ assetId, width, height }) => ({
      path: `assets/${assetId}.svg`,
      assetId,
      content: renderPlaceholderSvg(assetId, width, height),
    }),
  );
  const realPreviewAssets: PreviewAsset[] = [...usedRealAssets].map(([assetId, real]) => ({
    path: `assets/${real.fileName}`,
    assetId,
    content: real.bytes,
  }));

  return {
    html,
    css,
    assets: [...placeholderPreviewAssets, ...realPreviewAssets],
    stats: {
      placeholderAssets: placeholderPreviewAssets.length,
      realAssets: realPreviewAssets.length,
    },
  };
}

function renderHtml(root: VisualNode, realAssets: ReadonlyMap<string, RealImageAsset>): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>D2C Visual Preview</title>',
    '  <link rel="stylesheet" href="./preview.css">',
    '</head>',
    '<body>',
    '  <main class="d2c-preview">',
    indent(renderNode(root, realAssets), 4),
    '  </main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function renderNode(node: VisualNode, realAssets: ReadonlyMap<string, RealImageAsset>): string {
  const className = nodeClassName(node);
  const attrs = `class="d2c-node ${className}" data-node-id="${escapeAttr(node.id)}" data-kind="${node.kind}"`;
  if (node.kind === 'text') {
    return `<div ${attrs}>${escapeHtml(node.text?.content ?? '')}</div>`;
  }
  if (node.kind === 'image') {
    // Real images render via background-image (CSS); only placeholders get the label.
    if (node.assetRef && realAssets.has(node.assetRef)) {
      return `<div ${attrs}></div>`;
    }
    const label = node.assetRef ? `Image placeholder: ${node.assetRef}` : 'Image placeholder';
    return `<div ${attrs}><span class="d2c-image-label">${escapeHtml(label)}</span></div>`;
  }
  if (node.children.length === 0) return `<div ${attrs}></div>`;
  return [
    `<div ${attrs}>`,
    ...node.children.map((child) => indent(renderNode(child, realAssets), 2)),
    '</div>',
  ].join('\n');
}

function renderCss(
  root: VisualNode,
  placeholderAssets: Map<string, PlaceholderAsset>,
  realAssets: ReadonlyMap<string, RealImageAsset>,
): string {
  const rules = [
    'html, body {',
    '  margin: 0;',
    '  min-height: 100%;',
    '  background: #f5f5f5;',
    '  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '}',
    '',
    '.d2c-preview {',
    '  padding: 24px;',
    '}',
    '',
    '.d2c-node {',
    '  box-sizing: border-box;',
    '}',
    '',
    '.d2c-image-label {',
    '  position: absolute;',
    '  left: 8px;',
    '  right: 8px;',
    '  top: 50%;',
    '  transform: translateY(-50%);',
    '  color: #666;',
    '  font-size: 11px;',
    '  text-align: center;',
    '}',
    '',
  ];

  walk(root, (node, isRoot) => {
    rules.push(`${nodeSelector(node)} {`);
    for (const declaration of nodeDeclarations(node, isRoot, placeholderAssets, realAssets)) {
      rules.push(`  ${declaration}`);
    }
    rules.push('}');
    rules.push('');
  });

  return `${rules.join('\n')}`;
}

function nodeDeclarations(
  node: VisualNode,
  isRoot: boolean,
  placeholderAssets: Map<string, PlaceholderAsset>,
  realAssets: ReadonlyMap<string, RealImageAsset>,
): string[] {
  const declarations = [
    `position: ${isRoot ? 'relative' : 'absolute'};`,
    `left: ${px(node.layout.x)};`,
    `top: ${px(node.layout.y)};`,
    `width: ${px(node.layout.width)};`,
    `height: ${px(node.layout.height)};`,
  ];

  if (isRoot) declarations.push('margin: 0 auto;');

  const style = node.style;
  const fill = style?.fills?.[0];
  if (shouldRenderBoxFill(node) && fill) {
    const gradientCss = fill.type === 'gradient' ? linearGradientCss(fill) : undefined;
    if (gradientCss) {
      declarations.push(`background-image: ${gradientCss};`);
    } else if (fill.color) {
      declarations.push(`background-color: ${fill.color};`);
    }
  }
  const border = style?.borders?.[0];
  if (border && shouldRenderBorder(border)) {
    declarations.push(`border: ${px(border.thickness ?? 1)} solid ${border.color ?? '#000000FF'};`);
  }
  const effect = style?.effects?.[0];
  if (effect) {
    declarations.push(
      `box-shadow: ${px(effect.x ?? 0)} ${px(effect.y ?? 0)} ${px(effect.blur ?? 0)} ${px(effect.spread ?? 0)} ${effect.color ?? '#00000033'};`,
    );
  }
  if (style?.radius !== undefined)
    declarations.push(`border-radius: ${radiusValue(style.radius)};`);
  if (style?.opacity !== undefined) declarations.push(`opacity: ${formatNumber(style.opacity)};`);
  // Sketch clipping-mask siblings are skipped during normalize; their parent
  // carries style.raw.maskedContent so we clip oversize sibling shapes
  // (e.g. chat-bubble tails). Non-masked containers default to overflow:visible
  // so legitimate overflow (dropdowns, tooltips) is not silently swallowed.
  // See normalize/visual.ts markMaskedContent.
  if (style?.raw && (style.raw as Record<string, unknown>).maskedContent === true) {
    declarations.push('overflow: hidden;');
  }

  if (node.kind === 'text') {
    const textStyle = node.text?.style;
    declarations.push('white-space: pre-wrap;');
    if (textStyle?.fontFamily)
      declarations.push(`font-family: ${cssString(textStyle.fontFamily)};`);
    if (textStyle?.fontSize) declarations.push(`font-size: ${px(textStyle.fontSize)};`);
    if (textStyle?.fontWeight) declarations.push(`font-weight: ${textStyle.fontWeight};`);
    if (textStyle?.lineHeight) declarations.push(`line-height: ${px(textStyle.lineHeight)};`);
    if (textStyle?.color) declarations.push(`color: ${textStyle.color};`);
    if (textStyle?.textAlign) declarations.push(`text-align: ${textStyle.textAlign};`);
  }

  if (node.kind === 'image' && node.assetRef) {
    const real = realAssets.get(node.assetRef);
    if (real) {
      // Real bitmap: contain (not cover) so the whole image shows without crop.
      declarations.push(`background-image: url("./assets/${cssUrl(real.fileName)}");`);
      declarations.push('background-size: contain;');
      declarations.push('background-position: center;');
      declarations.push('background-repeat: no-repeat;');
    } else {
      const placeholder = placeholderAssets.get(node.assetRef);
      if (placeholder) {
        declarations.push(`background-image: url("./assets/${placeholder.assetId}.svg");`);
        declarations.push('background-size: cover;');
        declarations.push('background-position: center;');
        declarations.push('background-repeat: no-repeat;');
      }
    }
  }

  return declarations;
}

function shouldRenderBoxFill(node: VisualNode): boolean {
  if (node.kind === 'text') return false;
  if (node.kind === 'shape') {
    const originalType = node.source.originalType?.toLowerCase();
    if (originalType === 'shapegroup' || originalType === 'shapepath') return false;
  }
  return true;
}

/* Sketch position enum: 0 = center, 1 = inside, 2 = outside. */
const BORDER_POSITION_INSIDE = 1;

/**
 * A Sketch sub-pixel *inside* stroke (e.g. the 0.5px white inner border on a
 * chat bubble) is visually negligible in Sketch's own render, but emitting it
 * as a CSS border paints a thin seam wherever the shape abuts a sibling — most
 * visibly between a bubble body and its (separately rendered) tail. The
 * box-model can't place that stroke along the shared silhouette the way Sketch
 * does, so we skip these strokes. Borders ≥ 1px and non-inside strokes render
 * as before. See chat-bubble-tail-fidelity-investigation.md.
 */
function shouldRenderBorder(
  border: NonNullable<NonNullable<VisualNode['style']>['borders']>[number],
): boolean {
  const hasBorder = border.color !== undefined || border.thickness !== undefined;
  if (!hasBorder) return false;
  const thickness = border.thickness ?? 1;
  if (thickness < 1 && border.position === BORDER_POSITION_INSIDE) return false;
  return true;
}

interface PlaceholderAsset {
  assetId: string;
  width: number;
  height: number;
}

function collectPlaceholderAssets(
  root: VisualNode,
  realAssets: ReadonlyMap<string, RealImageAsset>,
): Map<string, PlaceholderAsset> {
  const assets = new Map<string, PlaceholderAsset>();
  walk(root, (node) => {
    if (
      node.kind === 'image' &&
      node.assetRef &&
      !realAssets.has(node.assetRef) &&
      !assets.has(node.assetRef)
    ) {
      assets.set(node.assetRef, {
        assetId: node.assetRef,
        width: node.layout.width,
        height: node.layout.height,
      });
    }
  });
  return assets;
}

/** Real images actually referenced by an image node, deduped by assetRef. */
function collectUsedRealAssets(
  root: VisualNode,
  realAssets: ReadonlyMap<string, RealImageAsset>,
): Map<string, RealImageAsset> {
  const used = new Map<string, RealImageAsset>();
  walk(root, (node) => {
    if (node.kind === 'image' && node.assetRef && !used.has(node.assetRef)) {
      const real = realAssets.get(node.assetRef);
      if (real) used.set(node.assetRef, real);
    }
  });
  return used;
}

function renderPlaceholderSvg(assetId: string, width: number, height: number): string {
  const safeAssetId = escapeHtml(assetId);
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const strokeWidth = Math.max(0, safeWidth - 1);
  const strokeHeight = Math.max(0, safeHeight - 1);
  const label = `${safeAssetId} - ${safeWidth} x ${safeHeight}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">`,
    '  <rect width="100%" height="100%" fill="#E6E8EB"/>',
    `  <rect x="0.5" y="0.5" width="${strokeWidth}" height="${strokeHeight}" fill="none" stroke="#B8BEC7" stroke-dasharray="6 4"/>`,
    `  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#5B6470">${label}</text>`,
    '</svg>',
    '',
  ].join('\n');
}

function walk(
  node: VisualNode,
  visit: (node: VisualNode, isRoot: boolean) => void,
  isRoot = true,
): void {
  visit(node, isRoot);
  for (const child of node.children) walk(child, visit, false);
}

function nodeSelector(node: VisualNode): string {
  return `.${nodeClassName(node)}`;
}

function nodeClassName(node: VisualNode): string {
  const safe = node.id
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `d2c-${safe || 'node'}`;
}

function radiusValue(
  radius: Exclude<NonNullable<VisualNode['style']>['radius'], undefined>,
): string {
  if (typeof radius === 'number') return px(radius);
  return `${px(radius.topLeft)} ${px(radius.topRight)} ${px(radius.bottomRight)} ${px(radius.bottomLeft)}`;
}

function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Escape a file name for safe use inside a double-quoted CSS url(). */
function cssUrl(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function px(value: number): string {
  return `${formatNumber(value)}px`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function linearGradientCss(fill: Fill): string | undefined {
  const raw = fill.raw;
  if (!raw || typeof raw !== 'object') return undefined;
  const gradient = (raw as { gradient?: unknown }).gradient;
  if (!gradient || typeof gradient !== 'object') return undefined;
  const g = gradient as Record<string, unknown>;
  // gradientType: 0 = linear, 1 = radial, 2 = angular. Only linear supported here.
  if (g.gradientType !== 0) return undefined;

  const from = parseGradientPoint(g.from);
  const to = parseGradientPoint(g.to);
  if (!from || !to) return undefined;

  const stops = Array.isArray(g.stops) ? g.stops : undefined;
  if (!stops || stops.length === 0) return undefined;

  const ordered: Array<{ position: number; hex: string }> = [];
  for (const stop of stops) {
    if (!stop || typeof stop !== 'object') return undefined;
    const s = stop as Record<string, unknown>;
    const position = typeof s.position === 'number' ? s.position : undefined;
    const hex = gradientStopColor(s.color);
    if (position === undefined || !hex) return undefined;
    ordered.push({ position, hex });
  }
  ordered.sort((a, b) => a.position - b.position);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return undefined;
  const angleDeg = roundTo((Math.atan2(dx, -dy) * 180) / Math.PI + 360, 100) % 360;
  const stopsCss = ordered
    .map(({ position, hex }) => `${hex} ${formatNumber(roundTo(position * 100, 100))}%`)
    .join(', ');

  return `linear-gradient(${formatNumber(angleDeg)}deg, ${stopsCss})`;
}

function parseGradientPoint(value: unknown): { x: number; y: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const match =
    /^\{\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*\}$/i.exec(
      value.trim(),
    );
  if (!match || match[1] === undefined || match[2] === undefined) return undefined;
  const x = Number.parseFloat(match[1]);
  const y = Number.parseFloat(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
}

function gradientStopColor(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const c = value as Record<string, unknown>;
  const r = colorChannel(c.red);
  const g = colorChannel(c.green);
  const b = colorChannel(c.blue);
  const a = colorChannel(c.alpha ?? 1);
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}${toHexByte(a)}`;
}

function colorChannel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function roundTo(value: number, factor: number): number {
  return Math.round(value * factor) / factor;
}

function indent(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n');
}
