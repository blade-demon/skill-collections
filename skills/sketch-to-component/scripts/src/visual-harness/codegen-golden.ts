import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPreview, type DesignIR, type PreviewAsset } from '@skill-collections/d2c-core';

import { loadRealImageAssets } from '../assets/load-real-image-assets.js';

export interface NodeMetrics {
  nodeId: string;
  present: boolean;
  rect: { x: number; y: number; width: number; height: number };
  styles: {
    textAlign: string;
    fontSize: string;
    color: string;
    backgroundColor: string;
    borderColor: string;
    borderWidth: string;
    borderRadius: string;
    boxShadow: string;
  };
  /** Computed `background-image` value, or `'none'` when the node has none. */
  backgroundImage: string;
  /** True only when a background image actually decoded in the browser. */
  backgroundImageLoaded: boolean;
}

export interface HarnessNodes {
  nodeIds: string[];
  rootNodeId: string;
  textNodeIds: Set<string>;
  mediaNodeIds: Set<string>;
}

interface ReviewHtmlInput {
  title: string;
  baselineScreenshot: string;
  candidateScreenshot: string;
  baselineMetrics: NodeMetrics[];
  candidateMetrics: NodeMetrics[];
  failures: string[];
}

type PresentNodeMetrics = NodeMetrics & { present: true };

const fixtureDir = fileURLToPath(new URL('../__tests__/fixtures/codegen-golden', import.meta.url));
const defaultOutDir = '/private/tmp/skill-collections-visual-harness/codegen-golden';
const visualStyleKeys = ['backgroundColor', 'borderWidth', 'borderRadius', 'boxShadow'] as const;
const textStyleKeys = ['textAlign', 'fontSize', 'color'] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeStyleValue(key: keyof NodeMetrics['styles'], value: string): string {
  if (key === 'textAlign' && value === 'start') return 'left';
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function deriveHarnessNodesFromSemanticView(value: unknown): HarnessNodes {
  if (!isRecord(value) || !isRecord(value.body) || !Array.isArray(value.body.nodes)) {
    throw new Error('semantic-view fixture does not contain body.nodes');
  }

  const nodeIds: string[] = [];
  const textNodeIds = new Set<string>();
  const mediaNodeIds = new Set<string>();
  let rootNodeId: string | undefined;

  for (const node of value.body.nodes) {
    if (!isRecord(node) || typeof node.primaryVisualNodeId !== 'string') continue;
    if (!nodeIds.includes(node.primaryVisualNodeId)) {
      nodeIds.push(node.primaryVisualNodeId);
    }
    if (node.kind === 'screen' && rootNodeId === undefined) {
      rootNodeId = node.primaryVisualNodeId;
    }
    if (node.kind === 'text') {
      textNodeIds.add(node.primaryVisualNodeId);
    }
    if (node.kind === 'media') {
      mediaNodeIds.add(node.primaryVisualNodeId);
    }
  }

  if (nodeIds.length === 0) {
    throw new Error('semantic-view fixture does not contain visual node coverage');
  }

  return { nodeIds, rootNodeId: rootNodeId ?? nodeIds[0]!, textNodeIds, mediaNodeIds };
}

function metricIsPresent(metric: NodeMetrics | undefined): metric is PresentNodeMetrics {
  return metric?.present === true;
}

function formatMetricNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function assertComparableMetrics(
  baselineMetrics: NodeMetrics[],
  candidateMetrics: NodeMetrics[],
  harnessNodes: HarnessNodes,
): string[] {
  const failures: string[] = [];
  const candidateById = new Map(candidateMetrics.map((metric) => [metric.nodeId, metric]));
  const baselineById = new Map(baselineMetrics.map((metric) => [metric.nodeId, metric]));
  const baselineRoot = baselineById.get(harnessNodes.rootNodeId);
  const candidateRoot = candidateById.get(harnessNodes.rootNodeId);
  for (const baseline of baselineMetrics) {
    const candidate = candidateById.get(baseline.nodeId);
    const baselinePresent = metricIsPresent(baseline);
    const candidatePresent = metricIsPresent(candidate);
    if (!baselinePresent) {
      failures.push(`${baseline.nodeId} missing from baseline metrics`);
    }
    if (!candidatePresent) {
      failures.push(`${baseline.nodeId} missing from candidate metrics`);
    }
    if (!baselinePresent || !candidatePresent) {
      continue;
    }
    for (const key of ['width', 'height'] as const) {
      if (Math.abs(candidate.rect[key] - baseline.rect[key]) > 0.5) {
        failures.push(
          `${baseline.nodeId} rect ${key} mismatch: expected ${baseline.rect[key]}, got ${candidate.rect[key]}`,
        );
      }
    }
    for (const key of visualStyleKeys) {
      const expected = normalizeStyleValue(key, baseline.styles[key]);
      const actual = normalizeStyleValue(key, candidate.styles[key]);
      if (actual !== expected) {
        failures.push(
          `${baseline.nodeId} style ${key} mismatch: expected ${expected}, got ${actual}`,
        );
      }
    }
    const expectedBorderWidth = normalizeStyleValue('borderWidth', baseline.styles.borderWidth);
    const actualBorderWidth = normalizeStyleValue('borderWidth', candidate.styles.borderWidth);
    if (expectedBorderWidth !== '0px' || actualBorderWidth !== '0px') {
      const expected = normalizeStyleValue('borderColor', baseline.styles.borderColor);
      const actual = normalizeStyleValue('borderColor', candidate.styles.borderColor);
      if (actual !== expected) {
        failures.push(
          `${baseline.nodeId} style borderColor mismatch: expected ${expected}, got ${actual}`,
        );
      }
    }
    if (
      baseline.nodeId !== harnessNodes.rootNodeId &&
      metricIsPresent(baselineRoot) &&
      metricIsPresent(candidateRoot)
    ) {
      const relativePairs = [
        [
          'relativeX',
          baseline.rect.x - baselineRoot.rect.x,
          candidate.rect.x - candidateRoot.rect.x,
        ],
        [
          'relativeY',
          baseline.rect.y - baselineRoot.rect.y,
          candidate.rect.y - candidateRoot.rect.y,
        ],
      ] as const;
      for (const [label, expected, actual] of relativePairs) {
        if (Math.abs(actual - expected) > 0.5) {
          failures.push(
            `${baseline.nodeId} rect ${label} mismatch: expected ${formatMetricNumber(expected)}, got ${formatMetricNumber(actual)}`,
          );
        }
      }
    }
    if (harnessNodes.mediaNodeIds.has(baseline.nodeId)) {
      // Compare load success, not the literal URL: the baseline page inlines a
      // data: URL while the candidate resolves a Vite file URL.
      if (!baseline.backgroundImageLoaded) {
        failures.push(`${baseline.nodeId} baseline image failed to load`);
      }
      if (!candidate.backgroundImageLoaded) {
        failures.push(`${baseline.nodeId} generated image failed to load`);
      }
    }
    if (!harnessNodes.textNodeIds.has(baseline.nodeId)) continue;
    for (const key of textStyleKeys) {
      const expected = normalizeStyleValue(key, baseline.styles[key]);
      const actual = normalizeStyleValue(key, candidate.styles[key]);
      if (actual !== expected) {
        failures.push(
          `${baseline.nodeId} style ${key} mismatch: expected ${expected}, got ${actual}`,
        );
      }
    }
  }
  return failures;
}

export function renderReviewHtml(input: ReviewHtmlInput): string {
  const rows = input.baselineMetrics
    .map((baseline) => {
      const candidate = input.candidateMetrics.find((metric) => metric.nodeId === baseline.nodeId);
      const baselineSize = metricIsPresent(baseline)
        ? `${baseline.rect.width}x${baseline.rect.height}`
        : 'missing';
      const candidateSize = metricIsPresent(candidate)
        ? `${candidate.rect.width}x${candidate.rect.height}`
        : 'missing';
      const candidateTextAlign = metricIsPresent(candidate)
        ? candidate.styles.textAlign
        : 'missing';
      const candidateBackground = metricIsPresent(candidate)
        ? candidate.styles.backgroundColor
        : 'missing';
      const candidateRadius = metricIsPresent(candidate)
        ? candidate.styles.borderRadius
        : 'missing';
      return `<tr><td>${escapeHtml(baseline.nodeId)}</td><td>${baselineSize}</td><td>${candidateSize}</td><td>${escapeHtml(candidateTextAlign)}</td><td>${escapeHtml(candidateBackground)}</td><td>${escapeHtml(candidateRadius)}</td></tr>`;
    })
    .join('\n');
  const failures = input.failures.length
    ? `<ul>${input.failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join('')}</ul>`
    : '<p>No metric failures.</p>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
  <style>
    body { margin: 0; padding: 24px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #111827; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
    figure { margin: 0; border: 1px solid #d1d5db; background: white; padding: 12px; }
    img { display: block; max-width: 100%; height: auto; }
    table { width: 100%; margin-top: 20px; border-collapse: collapse; background: white; }
    th, td { padding: 8px 10px; border: 1px solid #d1d5db; text-align: left; }
  </style>
</head>
<body>
  <h1>${escapeHtml(input.title)}</h1>
  <div class="split">
    <figure><figcaption>Baseline preview</figcaption><img src="${escapeHtml(input.baselineScreenshot)}" alt="Baseline preview"></figure>
    <figure><figcaption>Generated React candidate</figcaption><img src="${escapeHtml(input.candidateScreenshot)}" alt="Generated React candidate"></figure>
  </div>
  <h2>Metric Result</h2>
  ${failures}
  <table><thead><tr><th>Node</th><th>Baseline size</th><th>Candidate size</th><th>Candidate text-align</th><th>Candidate background</th><th>Candidate radius</th></tr></thead><tbody>${rows}</tbody></table>
</body>
</html>
`;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function inlinePreview(html: string, css: string): string {
  return html.replace('<link rel="stylesheet" href="./preview.css">', `<style>${css}</style>`);
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

function mimeForFileName(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

function assetDataUrl(asset: PreviewAsset): string {
  const fileName = asset.path.slice(asset.path.lastIndexOf('/') + 1);
  const mime = mimeForFileName(fileName);
  const base64 =
    typeof asset.content === 'string'
      ? Buffer.from(asset.content, 'utf8').toString('base64')
      : Buffer.from(asset.content).toString('base64');
  return `data:${mime};base64,${base64}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite each `url("./assets/<file>")` reference in baseline preview CSS to a
 * deterministic `data:` URL built from the matching `PreviewAsset` bytes. The
 * baseline page is rendered via `page.setContent()` with no asset server, so a
 * relative `./assets/<file>` URL would 404; inlining the bytes lets the image
 * actually decode in the browser.
 *
 * Pure and browser-free: identical input always yields identical output, and
 * unrelated CSS is left untouched. Only used for the in-memory baseline page —
 * generated React must keep its real file URLs, never a data: URL.
 */
export function inlineBaselineAssetUrls(css: string, assets: PreviewAsset[]): string {
  let result = css;
  for (const asset of assets) {
    const fileName = asset.path.slice(asset.path.lastIndexOf('/') + 1);
    if (!fileName) continue;
    const dataUrl = assetDataUrl(asset);
    const pattern = new RegExp(`url\\("\\./assets/${escapeRegExp(fileName)}"\\)`, 'g');
    result = result.replace(pattern, `url("${dataUrl}")`);
  }
  return result;
}

async function captureMetrics(
  page: import('playwright').Page,
  selectorAttr: 'data-node-id' | 'data-d2c-node-id',
  nodeIds: readonly string[],
): Promise<NodeMetrics[]> {
  return page.evaluate(
    ({ ids, attr }) =>
      Promise.all(
        ids.map(async (nodeId) => {
          const node = document.querySelector(`[${attr}="${nodeId}"]`);
          if (!(node instanceof HTMLElement)) {
            return {
              nodeId,
              present: false,
              rect: { x: 0, y: 0, width: 0, height: 0 },
              styles: {
                textAlign: 'missing',
                fontSize: 'missing',
                color: 'missing',
                backgroundColor: 'missing',
                borderColor: 'missing',
                borderWidth: 'missing',
                borderRadius: 'missing',
                boxShadow: 'missing',
              },
              backgroundImage: 'none',
              backgroundImageLoaded: false,
            };
          }
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const backgroundImage = style.backgroundImage;
          const urlMatch = /url\((['"]?)(.*?)\1\)/.exec(backgroundImage);
          let backgroundImageLoaded = false;
          if (urlMatch && urlMatch[2]) {
            const resolved = new URL(urlMatch[2], document.baseURI).href;
            backgroundImageLoaded = await new Promise<boolean>((resolveLoaded) => {
              const image = new Image();
              image.onload = () => resolveLoaded(image.complete && image.naturalWidth > 0);
              image.onerror = () => resolveLoaded(false);
              image.src = resolved;
              if (image.complete) {
                resolveLoaded(image.complete && image.naturalWidth > 0);
              }
            });
          }
          return {
            nodeId,
            present: true,
            rect: {
              x: Math.round(rect.x * 100) / 100,
              y: Math.round(rect.y * 100) / 100,
              width: Math.round(rect.width * 100) / 100,
              height: Math.round(rect.height * 100) / 100,
            },
            styles: {
              textAlign: style.textAlign,
              fontSize: style.fontSize,
              color: style.color,
              backgroundColor: style.backgroundColor,
              borderColor: style.borderTopColor,
              borderWidth: style.borderTopWidth,
              borderRadius: style.borderTopLeftRadius,
              boxShadow: style.boxShadow,
            },
            backgroundImage,
            backgroundImageLoaded,
          };
        }),
      ),
    { ids: [...nodeIds], attr: selectorAttr },
  );
}

async function main(): Promise<void> {
  const outArg = process.argv.indexOf('--out');
  const candidateArg = process.argv.indexOf('--candidate-url');
  const outDir = outArg === -1 ? defaultOutDir : resolve(process.argv[outArg + 1] ?? defaultOutDir);
  const candidateUrl = process.argv[candidateArg + 1];
  if (candidateArg === -1 || candidateUrl === undefined || candidateUrl.startsWith('--')) {
    throw new Error('Usage: visual-harness:codegen --candidate-url <url> [--out <dir>]');
  }

  await mkdir(outDir, { recursive: true });
  const designIr = (await readJson(join(fixtureDir, 'design-ir.json'))) as DesignIR;
  const semanticView = await readJson(join(fixtureDir, 'design-spec', 'semantic-view.json'));
  const harnessNodes = deriveHarnessNodesFromSemanticView(semanticView);
  // Render the baseline with real bytes so its media nodes can actually decode.
  const realAssets = await loadRealImageAssets(designIr, join(fixtureDir, 'assets'));
  const preview = runPreview(designIr, { realAssets });
  // The baseline page has no asset server, so rewrite url("./assets/<file>") to
  // deterministic data: URLs from the resolved bytes before setContent.
  const baselineCss = inlineBaselineAssetUrls(preview.css, preview.assets);
  await writeFile(join(outDir, 'baseline-preview.html'), preview.html, 'utf8');
  await writeFile(join(outDir, 'baseline-preview.css'), baselineCss, 'utf8');

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const baselinePage = await browser.newPage({ viewport: { width: 520, height: 360 } });
    await baselinePage.setContent(inlinePreview(preview.html, baselineCss), { waitUntil: 'load' });
    await baselinePage.screenshot({ path: join(outDir, 'baseline.png'), fullPage: true });
    const baselineMetrics = await captureMetrics(
      baselinePage,
      'data-node-id',
      harnessNodes.nodeIds,
    );

    const candidatePage = await browser.newPage({ viewport: { width: 520, height: 360 } });
    await candidatePage.goto(candidateUrl, { waitUntil: 'networkidle' });
    await candidatePage.screenshot({ path: join(outDir, 'candidate.png'), fullPage: true });
    const candidateMetrics = await captureMetrics(
      candidatePage,
      'data-d2c-node-id',
      harnessNodes.nodeIds,
    );

    const failures = assertComparableMetrics(baselineMetrics, candidateMetrics, harnessNodes);
    await writeFile(
      join(outDir, 'baseline-metrics.json'),
      `${JSON.stringify(baselineMetrics, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      join(outDir, 'candidate-metrics.json'),
      `${JSON.stringify(candidateMetrics, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      join(outDir, 'review.html'),
      renderReviewHtml({
        title: 'codegen-golden visual harness',
        baselineScreenshot: 'baseline.png',
        candidateScreenshot: 'candidate.png',
        baselineMetrics,
        candidateMetrics,
        failures,
      }),
      'utf8',
    );

    console.log(`review: ${join(outDir, 'review.html')}`);
    console.log(`baseline: ${join(outDir, 'baseline.png')}`);
    console.log(`candidate: ${join(outDir, 'candidate.png')}`);
    if (failures.length > 0) {
      for (const failure of failures) console.error(`failure: ${failure}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
