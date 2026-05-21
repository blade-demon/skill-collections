import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DesignIR, VisualNode } from '@skill-collections/d2c-core';

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

function printUsage(): void {
  console.error('Usage: npm run extract -- --file <path> --out <dir>');
  console.error('   or: npm run normalize -- --raw <path> --out <dir> [--artboard <id|name>]');
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

async function main(): Promise<void> {
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
