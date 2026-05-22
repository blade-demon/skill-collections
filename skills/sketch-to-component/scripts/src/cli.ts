import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runPreview as runCorePreview, type DesignIR, type VisualNode } from '@skill-collections/d2c-core';

import { ExtractError } from './errors.js';
import { extractRaw } from './extract-raw.js';
import { normalizeSketchRaw } from './normalize.js';
import type { SketchRawModel } from './sketch-raw-model.js';

export interface ExtractCliArgs {
  command: 'extract';
  filePath: string;
  outDir: string;
}

export interface NormalizeCliArgs {
  command: 'normalize';
  rawPath: string;
  outDir: string;
  artboard?: string;
}

export interface PreviewCliArgs {
  command: 'preview';
  designIrPath: string;
  outDir: string;
}

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

export function parseExtractArgs(argv: string[]): ExtractCliArgs | undefined {
  const command = argv[2];
  if (command !== 'extract') return undefined;

  const filePath = argValue(argv, '--file');
  const outDir = argValue(argv, '--out');
  if (!filePath || !outDir) return undefined;

  return { command, filePath, outDir };
}

export function parseNormalizeArgs(argv: string[]): NormalizeCliArgs | undefined {
  const command = argv[2];
  if (command !== 'normalize') return undefined;

  const rawPath = argValue(argv, '--raw');
  const outDir = argValue(argv, '--out');
  const artboard = argValue(argv, '--artboard');
  if (!rawPath || !outDir) return undefined;

  return { command, rawPath, outDir, artboard };
}

export function parsePreviewArgs(argv: string[]): PreviewCliArgs | undefined {
  const command = argv[2];
  if (command !== 'preview') return undefined;

  const designIrPath = argValue(argv, '--design-ir');
  const outDir = argValue(argv, '--out');
  if (!designIrPath || !outDir) return undefined;

  return { command, designIrPath, outDir };
}

function printUsage(): void {
  console.error('Usage: npm run extract -- --file <path> --out <dir>');
  console.error('   or: npm run normalize -- --raw <path> --out <dir> [--artboard <id|name>]');
  console.error('   or: npm run preview -- --design-ir <path> --out <dir>');
}

async function runExtract(): Promise<void> {
  const args = parseExtractArgs(process.argv);
  if (!args) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const raw = await extractRaw({ source: 'file', filePath: args.filePath });
  const rawJson = `${JSON.stringify(raw, null, 2)}\n`;
  const outputDir = join(args.outDir, 'ir');
  const outputPath = join(outputDir, 'raw-dsl.json');
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, rawJson, 'utf8');

  const payload = raw.payload as SketchRawModel;
  console.log(`provider: ${raw.provider}`);
  console.log(`documentId: ${raw.ref.documentId}`);
  console.log(`pages: ${payload.pages.length}`);
  console.log(`assets: ${payload.assets.length}`);
  console.log(`raw-dsl.json: ${outputPath} (${Buffer.byteLength(rawJson, 'utf8')} bytes)`);
}

async function runNormalize(): Promise<void> {
  const args = parseNormalizeArgs(process.argv);
  if (!args) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const raw = JSON.parse(await readFile(args.rawPath, 'utf8')) as unknown;
  const ir = await normalizeSketchRaw(raw, { artboard: args.artboard });
  const irJson = `${JSON.stringify(ir, null, 2)}\n`;
  const outputDir = join(args.outDir, 'ir');
  const outputPath = join(outputDir, 'design-ir.json');
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, irJson, 'utf8');

  console.log(`schemaVersion: ${ir.schemaVersion}`);
  console.log(`rootName: ${ir.source.rootName ?? ''}`);
  console.log(`nodes: ${countNodes(ir)}`);
  console.log(`warnings: ${ir.warnings.length}`);
  console.log(`design-ir.json: ${outputPath} (${Buffer.byteLength(irJson, 'utf8')} bytes)`);
}

async function runPreview(): Promise<void> {
  const args = parsePreviewArgs(process.argv);
  if (!args) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const designIr = JSON.parse(await readFile(args.designIrPath, 'utf8')) as DesignIR;
  const preview = runCorePreview(designIr);
  const previewDir = join(args.outDir, 'preview');
  const assetsDir = join(previewDir, 'assets');
  const viewsDir = join(args.outDir, 'ir', 'views');
  const indexPath = join(previewDir, 'index.html');
  const cssPath = join(previewDir, 'preview.css');
  const reportPath = join(previewDir, 'visual-review-report.md');
  const visualViewPath = join(viewsDir, 'visual-view.json');

  await mkdir(assetsDir, { recursive: true });
  await mkdir(viewsDir, { recursive: true });
  await writeFile(indexPath, preview.html, 'utf8');
  await writeFile(cssPath, preview.css, 'utf8');
  await writeFile(reportPath, preview.report, 'utf8');
  await writeFile(visualViewPath, preview.visualViewJson, 'utf8');
  for (const asset of preview.assets) {
    await writeFile(join(previewDir, asset.path), asset.content, 'utf8');
  }

  console.log(`requiresApproval: ${preview.requiresApproval}`);
  console.log(`overrideApplied: ${preview.stats.overrideApplied}`);
  console.log(`overrideUnmapped: ${preview.stats.overrideUnmapped}`);
  console.log(`overrideUnsupported: ${preview.stats.overrideUnsupported}`);
  console.log(`placeholderAssets: ${preview.stats.placeholderAssets}`);
  console.log(`visual-view.json: ${visualViewPath} (${Buffer.byteLength(preview.visualViewJson, 'utf8')} bytes)`);
  console.log(`index.html: ${indexPath} (${Buffer.byteLength(preview.html, 'utf8')} bytes)`);
  console.log(`preview.css: ${cssPath} (${Buffer.byteLength(preview.css, 'utf8')} bytes)`);
  console.log(`visual-review-report.md: ${reportPath} (${Buffer.byteLength(preview.report, 'utf8')} bytes)`);
}

async function main(): Promise<void> {
  if (process.argv[2] === 'preview') {
    await runPreview();
    return;
  }
  if (process.argv[2] === 'normalize') {
    await runNormalize();
    return;
  }
  await runExtract();
}

function countNodes(ir: DesignIR): number {
  let count = 0;
  const visit = (node: VisualNode): void => {
    count += 1;
    for (const child of node.children) visit(child);
  };
  visit(ir.visual.root);
  return count;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    if (error instanceof ExtractError) {
      console.error(`[${error.code}] ${error.message}`);
    } else if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exitCode = 1;
  });
}
