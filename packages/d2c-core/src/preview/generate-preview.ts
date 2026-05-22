import { VisualViewSchema, type VisualNode, type VisualView } from '../ir';

export interface PreviewAsset {
  path: string;
  assetId: string;
  content: string;
}

export interface GeneratePreviewResult {
  html: string;
  css: string;
  assets: PreviewAsset[];
  stats: {
    placeholderAssets: number;
  };
}

export function generatePreview(input: VisualView): GeneratePreviewResult {
  const visualView = VisualViewSchema.parse(input);
  const placeholderAssets = collectPlaceholderAssets(visualView.body.root);
  const html = renderHtml(visualView.body.root);
  const css = renderCss(visualView.body.root, placeholderAssets);
  const assets = [...placeholderAssets.values()].map(({ assetId, width, height }) => ({
    path: `assets/${assetId}.svg`,
    assetId,
    content: renderPlaceholderSvg(assetId, width, height),
  }));

  return {
    html,
    css,
    assets,
    stats: {
      placeholderAssets: assets.length,
    },
  };
}

function renderHtml(root: VisualNode): string {
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
    indent(renderNode(root), 4),
    '  </main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function renderNode(node: VisualNode): string {
  const className = nodeClassName(node);
  const attrs = `class="d2c-node ${className}" data-node-id="${escapeAttr(node.id)}" data-kind="${node.kind}"`;
  if (node.kind === 'text') {
    return `<div ${attrs}>${escapeHtml(node.text?.content ?? '')}</div>`;
  }
  if (node.kind === 'image') {
    const label = node.assetRef ? `Image placeholder: ${node.assetRef}` : 'Image placeholder';
    return `<div ${attrs}><span class="d2c-image-label">${escapeHtml(label)}</span></div>`;
  }
  if (node.children.length === 0) return `<div ${attrs}></div>`;
  return [
    `<div ${attrs}>`,
    ...node.children.map((child) => indent(renderNode(child), 2)),
    '</div>',
  ].join('\n');
}

function renderCss(root: VisualNode, placeholderAssets: Map<string, PlaceholderAsset>): string {
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
    '  overflow: hidden;',
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
    for (const declaration of nodeDeclarations(node, isRoot, placeholderAssets)) {
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
  if (shouldRenderBoxFill(node) && fill?.color)
    declarations.push(`background-color: ${fill.color};`);
  const border = style?.borders?.[0];
  if (border?.color || border?.thickness !== undefined) {
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
    const placeholder = placeholderAssets.get(node.assetRef);
    if (placeholder) {
      declarations.push(`background-image: url("./assets/${placeholder.assetId}.svg");`);
      declarations.push('background-size: cover;');
      declarations.push('background-position: center;');
      declarations.push('background-repeat: no-repeat;');
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

interface PlaceholderAsset {
  assetId: string;
  width: number;
  height: number;
}

function collectPlaceholderAssets(root: VisualNode): Map<string, PlaceholderAsset> {
  const assets = new Map<string, PlaceholderAsset>();
  walk(root, (node) => {
    if (node.kind === 'image' && node.assetRef && !assets.has(node.assetRef)) {
      assets.set(node.assetRef, {
        assetId: node.assetRef,
        width: node.layout.width,
        height: node.layout.height,
      });
    }
  });
  return assets;
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

function indent(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n');
}
