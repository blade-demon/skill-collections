# Codegen Visual Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first visual harness slice for the existing codegen golden fixture, producing side-by-side preview-vs-React artifacts plus stable DOM/layout/style assertions.

**Architecture:** Keep deterministic file golden tests separate from visual harness checks. Add stable `data-d2c-node-id` anchors to generated React, mount the candidate package in a neutral/controlled fixture page, and add a Sketch scripts harness command that captures baseline preview and candidate React screenshots plus metrics. Pixel diff remains deferred.

**Tech Stack:** TypeScript, Vitest, React 19, Vite fixture app, Playwright for local browser capture, existing `@skill-collections/d2c-core` preview and codegen APIs.

---

## File Structure

- Modify `packages/d2c-core/src/codegen/react/generate.ts`
  - Emit `data-d2c-node-id` for generated root and visual-backed semantic nodes.
  - Emit default `text-align: left;` for text nodes when the design has no explicit alignment.
- Modify `packages/d2c-core/src/codegen/__tests__/generate-content.test.ts`
  - Add codegen tests for stable DOM anchors and default text alignment.
- Update generated golden files under `fixtures/apps/react-vite/src/golden/`
  - Regenerate after codegen changes so `codegen-golden.test.ts` remains byte-identical.
- Create `fixtures/apps/react-vite/visual-harness.html`
  - Dedicated Vite entry for visual harness candidate rendering.
- Create `fixtures/apps/react-vite/src/visual-harness/main.tsx`
  - Mount the generated package in a controlled candidate page.
- Create `fixtures/apps/react-vite/src/visual-harness/style.css`
  - Neutral page styles plus one controlled hostile wrapper to detect inherited typography.
- Create `fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js`
  - Static fixture test proving the harness entry imports and renders the generated package.
- Modify `skills/sketch-to-component/scripts/package.json`
  - Add `visual-harness:codegen` script and declare `playwright`.
- Create `skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts`
  - CLI runner that writes preview baseline artifacts, captures screenshots/metrics, and writes a side-by-side review page.
- Create `skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts`
  - Unit tests for side-by-side HTML rendering and metric comparison without launching a browser.

## Task 1: Add Stable DOM Anchors To React Codegen

**Files:**
- Modify: `packages/d2c-core/src/codegen/__tests__/generate-content.test.ts`
- Modify: `packages/d2c-core/src/codegen/react/generate.ts`
- Regenerate: `fixtures/apps/react-vite/src/golden/src/LaunchPanel/LaunchPanel.tsx`

- [ ] **Step 1: Write the failing DOM-anchor test**

In `packages/d2c-core/src/codegen/__tests__/generate-content.test.ts`, extend the existing test named `preserves core visual styling for a styled no-asset card`:

```ts
    expect(tsx).toContain('data-d2c-node-id="node-root"');
    expect(tsx).toContain('data-d2c-node-id="node-eyebrow"');
    expect(tsx).toContain('data-d2c-node-id="node-title"');
    expect(tsx).toContain('data-d2c-node-id="node-subtitle"');
    expect(tsx).toContain('data-d2c-node-id="node-cta"');
    expect(tsx).toContain('data-d2c-node-id="node-cta-label"');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/generate-content.test.ts -t "preserves core visual styling"
```

Expected: FAIL because generated TSX does not contain `data-d2c-node-id`.

- [ ] **Step 3: Implement the minimal DOM-anchor generation**

In `packages/d2c-core/src/codegen/react/generate.ts`, add this helper near the existing JSX/string helpers:

```ts
function jsxAttrValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function d2cNodeIdAttr(visualNode?: VisualNode): string {
  return visualNode === undefined ? '' : ` data-d2c-node-id="${jsxAttrValue(visualNode.id)}"`;
}

function rootVisualNodeFor(component: PlannedComponent, context: ReactCodegenContext): VisualNode | undefined {
  const rootSemanticNode = context.semanticById.get(component.semanticNodeId);
  return rootSemanticNode === undefined
    ? undefined
    : context.visualById.get(rootSemanticNode.primaryVisualNodeId);
}
```

Then update `componentTsx` so root renders include the root visual node ID:

```ts
  const rootVisualNode = rootVisualNodeFor(component, context);

  if (rendered.lines.length === 0) {
    lines.push(`  return <div className={styles.root}${d2cNodeIdAttr(rootVisualNode)} />;`, '}');
    return { content: lines.join('\n') + '\n', renderedSemanticNodeIds: rendered.semanticNodeIds };
  }

  lines.push(
    '  return (',
    `    <div className={styles.root}${d2cNodeIdAttr(rootVisualNode)}>`,
    ...rendered.lines,
    '    </div>',
    '  );',
    '}',
  );
```

Update `renderSemanticNode` so all visual-backed nodes emit the attribute:

```ts
  const visualNode = context.visualById.get(semanticNode.primaryVisualNodeId);
  const nodeIdAttr = d2cNodeIdAttr(visualNode);
```

Use `nodeIdAttr` in every generated `<div>` line:

```ts
`${indent}<div className={${classExpr}}${nodeIdAttr}>`
`${indent}<div className={${classExpr}}${nodeIdAttr}>${textExpression({ component, semanticNode, visualNode, context })}</div>`
`${indent}<div className={${classExpr}}${nodeIdAttr} role="img" aria-label=${ariaLabel} />`
`${indent}<div className={${classExpr}}${nodeIdAttr} />`
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/generate-content.test.ts -t "preserves core visual styling"
```

Expected: PASS.

- [ ] **Step 5: Regenerate the committed React golden**

Run:

```bash
./node_modules/.bin/tsx skills/sketch-to-component/scripts/src/cli.ts codegen \
  --spec skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/design-spec \
  --design-ir skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/design-ir.json \
  --out fixtures/apps/react-vite/src/golden
```

Expected output includes:

```text
out: fixtures/apps/react-vite/src/golden
files: 7
```

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/d2c-core/src/codegen/react/generate.ts \
  packages/d2c-core/src/codegen/__tests__/generate-content.test.ts \
  fixtures/apps/react-vite/src/golden
git commit -m "feat(codegen): add visual node DOM anchors"
```

## Task 2: Prevent Host `text-align` Inheritance In Generated Text

**Files:**
- Modify: `packages/d2c-core/src/codegen/__tests__/generate-content.test.ts`
- Modify: `packages/d2c-core/src/codegen/react/generate.ts`
- Regenerate: `fixtures/apps/react-vite/src/golden/src/LaunchPanel/LaunchPanel.module.css`

- [ ] **Step 1: Write the failing default text-align test**

In `packages/d2c-core/src/codegen/__tests__/generate-content.test.ts`, extend the same styled-card test:

```ts
    expect(css).toContain('text-align: left;');
    expect(css).toContain('text-align: center;');
```

This asserts that ordinary text nodes pin the browser default explicitly, while the CTA label keeps its design-specified centered alignment.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/generate-content.test.ts -t "preserves core visual styling"
```

Expected: FAIL because only `text-align: center;` is currently emitted.

- [ ] **Step 3: Implement the minimal text alignment fix**

In `packages/d2c-core/src/codegen/react/generate.ts`, replace the current text-align branch in `textStyleDeclarations`:

```ts
  declarations.push(`text-align: ${textStyle?.textAlign ?? 'left'};`);
```

Keep the existing font, size, weight, line-height, and color branches unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/generate-content.test.ts -t "preserves core visual styling"
```

Expected: PASS.

- [ ] **Step 5: Regenerate the committed React golden**

Run:

```bash
./node_modules/.bin/tsx skills/sketch-to-component/scripts/src/cli.ts codegen \
  --spec skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/design-spec \
  --design-ir skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/design-ir.json \
  --out fixtures/apps/react-vite/src/golden
```

Expected: `LaunchPanel.module.css` now has `text-align: left;` on non-centered generated text nodes and `text-align: center;` on the CTA label.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/d2c-core/src/codegen/react/generate.ts \
  packages/d2c-core/src/codegen/__tests__/generate-content.test.ts \
  fixtures/apps/react-vite/src/golden
git commit -m "fix(codegen): isolate generated text alignment"
```

## Task 3: Add A Neutral Candidate Harness Page

**Files:**
- Create: `fixtures/apps/react-vite/visual-harness.html`
- Create: `fixtures/apps/react-vite/src/visual-harness/main.tsx`
- Create: `fixtures/apps/react-vite/src/visual-harness/style.css`
- Create: `fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js`

- [ ] **Step 1: Write the failing fixture-page test**

Create `fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js`:

```js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('visual harness page mounts the generated golden package in a controlled scope', async () => {
  const html = await readFile(new URL('../visual-harness.html', import.meta.url), 'utf8')
  const source = await readFile(new URL('../src/visual-harness/main.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/visual-harness/style.css', import.meta.url), 'utf8')

  assert.match(html, /src="\/src\/visual-harness\/main\.tsx"/)
  assert.match(source, /from ['"]\.\.\/golden\/src['"]/)
  assert.match(source, /data-d2c-harness="candidate"/)
  assert.match(css, /\.visual-harness__hostile-scope/)
  assert.match(css, /text-align: center/)
})
```

- [ ] **Step 2: Run the fixture test and verify RED**

Run:

```bash
npm run test:fixtures:react
```

Expected: FAIL because `visual-harness.html` and `src/visual-harness/main.tsx` do not exist.

- [ ] **Step 3: Add the visual harness HTML entry**

Create `fixtures/apps/react-vite/visual-harness.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>D2C Codegen Visual Harness</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/visual-harness/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Add the neutral candidate React mount**

Create `fixtures/apps/react-vite/src/visual-harness/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import GeneratedPackage from '../golden/src'
import './style.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="visual-harness" data-d2c-harness="candidate">
      <div className="visual-harness__hostile-scope">
        <GeneratedPackage />
      </div>
    </main>
  </StrictMode>,
)
```

- [ ] **Step 5: Add controlled harness styles**

Create `fixtures/apps/react-vite/src/visual-harness/style.css`:

```css
:root {
  color: #111827;
  background: #f3f4f6;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

html,
body,
#root {
  min-height: 100%;
  margin: 0;
}

.visual-harness {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24px;
}

.visual-harness__hostile-scope {
  display: inline-block;
  color: #ff00ff;
  font-size: 99px;
  line-height: 99px;
  text-align: center;
}
```

- [ ] **Step 6: Run the fixture test and verify GREEN**

Run:

```bash
npm run test:fixtures:react
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add fixtures/apps/react-vite/visual-harness.html \
  fixtures/apps/react-vite/src/visual-harness/main.tsx \
  fixtures/apps/react-vite/src/visual-harness/style.css \
  fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js
git commit -m "feat(fixtures): add codegen visual harness page"
```

## Task 4: Add The Visual Harness Capture Runner

**Files:**
- Modify: `skills/sketch-to-component/scripts/package.json`
- Modify: `package-lock.json`
- Create: `skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts`
- Create: `skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts`

- [ ] **Step 1: Add dependency and script**

Run:

```bash
npm install --workspace @skill-collections/sketch-to-component-scripts --save-dev playwright@^1.59.1
```

Then add this script to `skills/sketch-to-component/scripts/package.json`:

```json
"visual-harness:codegen": "tsx src/visual-harness/codegen-golden.ts"
```

- [ ] **Step 2: Write pure failing tests for report HTML and metric assertions**

Create `skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { assertComparableMetrics, renderReviewHtml, type NodeMetrics } from '../visual-harness/codegen-golden.js';

const baseline: NodeMetrics[] = [
  {
    nodeId: 'node-root',
    rect: { x: 24, y: 24, width: 390, height: 260 },
    styles: { textAlign: 'left', fontSize: '16px', color: 'rgb(17, 24, 39)' },
  },
  {
    nodeId: 'node-title',
    rect: { x: 52, y: 84, width: 300, height: 42 },
    styles: { textAlign: 'left', fontSize: '32px', color: 'rgb(15, 23, 42)' },
  },
];

const candidate: NodeMetrics[] = [
  {
    nodeId: 'node-root',
    rect: { x: 24, y: 24, width: 390, height: 260 },
    styles: { textAlign: 'left', fontSize: '16px', color: 'rgb(17, 24, 39)' },
  },
  {
    nodeId: 'node-title',
    rect: { x: 52, y: 84, width: 300, height: 42 },
    styles: { textAlign: 'left', fontSize: '32px', color: 'rgb(15, 23, 42)' },
  },
];

describe('codegen visual harness helpers', () => {
  it('renders a side-by-side review page', () => {
    const html = renderReviewHtml({
      title: 'codegen-golden',
      baselineScreenshot: 'baseline.png',
      candidateScreenshot: 'candidate.png',
      baselineMetrics: baseline,
      candidateMetrics: candidate,
      failures: [],
    });

    expect(html).toContain('codegen-golden');
    expect(html).toContain('baseline.png');
    expect(html).toContain('candidate.png');
    expect(html).toContain('node-title');
  });

  it('fails when candidate text inherits centered alignment', () => {
    const failures = assertComparableMetrics(baseline, [
      candidate[0]!,
      {
        ...candidate[1]!,
        styles: { ...candidate[1]!.styles, textAlign: 'center' },
      },
    ]);

    expect(failures).toContain(
      'node-title style textAlign mismatch: expected left, got center',
    );
  });
});
```

- [ ] **Step 3: Run the Sketch tests and verify RED**

Run:

```bash
npm test --workspace @skill-collections/sketch-to-component-scripts -- src/__tests__/visual-harness.test.ts
```

Expected: FAIL because `src/visual-harness/codegen-golden.ts` does not exist.

- [ ] **Step 4: Implement the visual harness module**

Create `skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts`:

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPreview, type DesignIR } from '@skill-collections/d2c-core';

export interface NodeMetrics {
  nodeId: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: { textAlign: string; fontSize: string; color: string };
}

interface ReviewHtmlInput {
  title: string;
  baselineScreenshot: string;
  candidateScreenshot: string;
  baselineMetrics: NodeMetrics[];
  candidateMetrics: NodeMetrics[];
  failures: string[];
}

const fixtureDir = fileURLToPath(new URL('../__tests__/fixtures/codegen-golden', import.meta.url));
const defaultOutDir = '/private/tmp/skill-collections-visual-harness/codegen-golden';
const nodeIds = [
  'node-root',
  'node-eyebrow',
  'node-title',
  'node-subtitle',
  'node-cta',
  'node-cta-label',
] as const;
const textNodeIds = new Set(['node-eyebrow', 'node-title', 'node-subtitle', 'node-cta-label']);

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

export function assertComparableMetrics(
  baselineMetrics: NodeMetrics[],
  candidateMetrics: NodeMetrics[],
): string[] {
  const failures: string[] = [];
  const candidateById = new Map(candidateMetrics.map((metric) => [metric.nodeId, metric]));
  for (const baseline of baselineMetrics) {
    const candidate = candidateById.get(baseline.nodeId);
    if (candidate === undefined) {
      failures.push(`${baseline.nodeId} missing from candidate metrics`);
      continue;
    }
    for (const key of ['width', 'height'] as const) {
      if (Math.abs(candidate.rect[key] - baseline.rect[key]) > 0.5) {
        failures.push(
          `${baseline.nodeId} rect ${key} mismatch: expected ${baseline.rect[key]}, got ${candidate.rect[key]}`,
        );
      }
    }
    if (!textNodeIds.has(baseline.nodeId)) continue;
    for (const key of ['textAlign', 'fontSize', 'color'] as const) {
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
      return `<tr><td>${escapeHtml(baseline.nodeId)}</td><td>${baseline.rect.width}x${baseline.rect.height}</td><td>${candidate ? `${candidate.rect.width}x${candidate.rect.height}` : 'missing'}</td><td>${escapeHtml(candidate?.styles.textAlign ?? 'missing')}</td></tr>`;
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
  <table><thead><tr><th>Node</th><th>Baseline size</th><th>Candidate size</th><th>Candidate text-align</th></tr></thead><tbody>${rows}</tbody></table>
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

async function captureMetrics(page: import('playwright').Page, selectorAttr: 'data-node-id' | 'data-d2c-node-id'): Promise<NodeMetrics[]> {
  return page.evaluate(
    ({ ids, attr }) =>
      ids.map((nodeId) => {
        const node = document.querySelector(`[${attr}="${nodeId}"]`);
        if (!(node instanceof HTMLElement)) {
          return {
            nodeId,
            rect: { x: 0, y: 0, width: 0, height: 0 },
            styles: { textAlign: 'missing', fontSize: 'missing', color: 'missing' },
          };
        }
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          nodeId,
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
          },
        };
      }),
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
  const preview = runPreview(designIr);
  await writeFile(join(outDir, 'baseline-preview.html'), preview.html, 'utf8');
  await writeFile(join(outDir, 'baseline-preview.css'), preview.css, 'utf8');

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const baselinePage = await browser.newPage({ viewport: { width: 520, height: 360 } });
    await baselinePage.setContent(inlinePreview(preview.html, preview.css), { waitUntil: 'load' });
    await baselinePage.screenshot({ path: join(outDir, 'baseline.png'), fullPage: true });
    const baselineMetrics = await captureMetrics(baselinePage, 'data-node-id');

    const candidatePage = await browser.newPage({ viewport: { width: 520, height: 360 } });
    await candidatePage.goto(candidateUrl, { waitUntil: 'networkidle' });
    await candidatePage.screenshot({ path: join(outDir, 'candidate.png'), fullPage: true });
    const candidateMetrics = await captureMetrics(candidatePage, 'data-d2c-node-id');

    const failures = assertComparableMetrics(baselineMetrics, candidateMetrics);
    await writeFile(join(outDir, 'baseline-metrics.json'), `${JSON.stringify(baselineMetrics, null, 2)}\n`, 'utf8');
    await writeFile(join(outDir, 'candidate-metrics.json'), `${JSON.stringify(candidateMetrics, null, 2)}\n`, 'utf8');
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
```

- [ ] **Step 5: Run the focused Sketch test and verify GREEN**

Run:

```bash
npm test --workspace @skill-collections/sketch-to-component-scripts -- src/__tests__/visual-harness.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add skills/sketch-to-component/scripts/package.json package-lock.json \
  skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts \
  skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts
git commit -m "feat(sketch): add codegen visual harness runner"
```

## Task 5: Run The Harness End To End And Verify The Slice

**Files:**
- No new source files.
- Generated local artifact directory: `/private/tmp/skill-collections-visual-harness/codegen-golden`

- [ ] **Step 1: Start the fixture dev server**

Run:

```bash
npm run dev --prefix fixtures/apps/react-vite -- --host 127.0.0.1 --port 5179 --strictPort
```

Expected: Vite serves `http://127.0.0.1:5179/`. Keep this process running for the next step.

- [ ] **Step 2: Run the visual harness capture**

In another shell, run:

```bash
npm run visual-harness:codegen --workspace @skill-collections/sketch-to-component-scripts -- \
  --candidate-url http://127.0.0.1:5179/visual-harness.html \
  --out /private/tmp/skill-collections-visual-harness/codegen-golden
```

Expected output:

```text
review: /private/tmp/skill-collections-visual-harness/codegen-golden/review.html
baseline: /private/tmp/skill-collections-visual-harness/codegen-golden/baseline.png
candidate: /private/tmp/skill-collections-visual-harness/codegen-golden/candidate.png
```

Expected exit code: `0`.

- [ ] **Step 3: Inspect the review artifact visually**

Open:

```text
/private/tmp/skill-collections-visual-harness/codegen-golden/review.html
```

Expected: side-by-side baseline and candidate screenshots show the same LaunchPanel component without the old fixture app shell.

- [ ] **Step 4: Run focused package checks**

Run:

```bash
npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/generate-content.test.ts
npm run test:sketch
npm run check:fixtures
```

Expected: all commands exit `0`.

- [ ] **Step 5: Run full verification before completion**

Run:

```bash
npm run check:full
```

Expected: exits `0`.

- [ ] **Step 6: Commit verification-only follow-up only if needed**

If formatting changes are produced by verification, commit them separately using the known files from this plan:

```bash
git add packages/d2c-core/src/codegen/react/generate.ts \
  packages/d2c-core/src/codegen/__tests__/generate-content.test.ts \
  fixtures/apps/react-vite/visual-harness.html \
  fixtures/apps/react-vite/src/visual-harness/main.tsx \
  fixtures/apps/react-vite/src/visual-harness/style.css \
  fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js \
  skills/sketch-to-component/scripts/package.json package-lock.json \
  skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts \
  skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts
git commit -m "chore: format visual harness files"
```

If no files changed, do not create a commit.

## Self-Review Checklist

- Spec coverage:
  - Side-by-side artifact: Task 4 and Task 5.
  - Existing `codegen-golden` only: Task 4 fixture path.
  - Stable DOM/layout/style assertions: Task 1, Task 2, and Task 4.
  - No pixel diff: no task commits image baselines or thresholds.
  - No existing fixture shell reuse: Task 3 creates `visual-harness.html`, separate from `src/App.tsx`.
- Placeholder scan:
  - No deferred-work markers or unspecified test commands remain.
- Type consistency:
  - `NodeMetrics`, `renderReviewHtml`, and `assertComparableMetrics` names are used consistently across Task 4 tests and implementation.
