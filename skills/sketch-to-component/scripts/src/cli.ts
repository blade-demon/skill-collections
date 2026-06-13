import { access, copyFile, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  runPreview as runCorePreview,
  runContract as runCoreContract,
  buildContractManifest,
  verifyDesignSpec,
  generateComponentPackage,
  approveComponentPlan,
  ComponentPlanSchema,
  stableJson,
  stableSha256,
  ARTIFACT_FILENAMES,
  MANIFEST_FILENAME,
  type DesignIR,
  type VisualNode,
  type RunContractInput,
  type ComponentPlanMode,
  type DeriveInteractionMode,
  type ComponentPlanSignOff,
  type ContractManifest,
  type CodegenFilePlan,
  type DesignSpecInput,
} from '@skill-collections/d2c-core';

import { loadRealImageAssets } from './assets/load-real-image-assets.js';
import { ExtractError } from './errors.js';
import { extractImageAssets, extractRaw } from './extract-raw.js';
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
  /** Optional dir of real images (extract's <out>/ir/assets) for real rendering. */
  assetsDir?: string;
}

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

/**
 * Confine a pipeline write directory to the folder the CLI runs in. Output must
 * land inside `cwd`: a relative path resolves against it, and any path that
 * escapes — `..` traversal or an absolute path elsewhere — is rejected so
 * written artifacts never drift outside the current folder. Returns the resolved
 * absolute path. `flag` names the offending option in the message (`--out` for
 * the pipeline output dir, `--spec` for `approve`'s in-place rewrite target).
 * Pure: pass `cwd` explicitly in tests.
 */
/**
 * 输出目录约束器：确保所有写入操作限制在当前工作目录内。
 *
 * 该函数解决了"如何防止CLI工具意外写入系统敏感目录"的安全问题。
 * 通过路径解析和相对路径检查，拒绝任何试图逃逸到上级目录的写入操作。
 *
 * 安全边界：
 * - 拒绝绝对路径（除非在cwd内）
 * - 拒绝../ 路径遍历
 * - 所有输出必须在当前工作目录的子树内
 */
export function confineOutDir(outDir: string, cwd: string = process.cwd(), flag = '--out'): string {
  const root = resolve(cwd);
  const resolved = resolve(root, outDir);
  const rel = relative(root, resolved);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(
      `[bad-out-dir] ${flag} must stay inside the current folder (${root}); ` +
        `'${outDir}' resolves to ${resolved}, outside it`,
    );
  }
  return resolved;
}

/**
 * Apply {@link confineOutDir} to the write-target path at `args[key]` in place.
 * On violation, print the message and set exit code 2 (a usage error, like a
 * failed parse), returning false so the caller bails before any disk write.
 */
function confineDirArg<K extends string>(args: Record<K, string>, key: K, flag: string): boolean {
  try {
    args[key] = confineOutDir(args[key], process.cwd(), flag);
    return true;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return false;
  }
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

  const args: PreviewCliArgs = { command, designIrPath, outDir };
  const assetsDir = argValue(argv, '--assets');
  if (assetsDir !== undefined) args.assetsDir = assetsDir;
  return args;
}

export interface ContractCliArgs {
  command: 'contract';
  /** Exactly one input source — a .sketch file (full chain) or an existing design-ir.json. */
  source: { kind: 'file'; filePath: string } | { kind: 'design-ir'; designIrPath: string };
  outDir: string;
  /** Optional artboard selector, only meaningful for the `--file` source. */
  artboard?: string;
  mode: ComponentPlanMode;
  interactionMode: DeriveInteractionMode;
  /** Present only for interactionMode omitted | deferred. */
  approval?: { reason: string; approvedBy: string; approvedAt: string };
}

const COMPONENT_PLAN_MODES: readonly ComponentPlanMode[] = ['presentational', 'interactive'];
const DERIVE_INTERACTION_MODES: readonly DeriveInteractionMode[] = ['draft', 'omitted', 'deferred'];

/**
 * Structural parse only — returns `undefined` for a missing/ambiguous source,
 * missing `--out`, or an invalid `--mode` / `--interaction-mode` enum value.
 * Semantic checks (interactive unsupported here, approval required for
 * omitted/deferred) are enforced by `runContractCommand` with specific
 * messages rather than collapsing into the generic usage path.
 */
export function parseContractArgs(argv: string[]): ContractCliArgs | undefined {
  const command = argv[2];
  if (command !== 'contract') return undefined;

  const filePath = argValue(argv, '--file');
  const designIrPath = argValue(argv, '--design-ir');
  /* exactly one source. */
  if ((filePath === undefined) === (designIrPath === undefined)) return undefined;

  const outDir = argValue(argv, '--out');
  if (!outDir) return undefined;

  const mode = argValue(argv, '--mode');
  if (mode === undefined || !COMPONENT_PLAN_MODES.includes(mode as ComponentPlanMode)) {
    return undefined;
  }
  const interactionMode = argValue(argv, '--interaction-mode');
  if (
    interactionMode === undefined ||
    !DERIVE_INTERACTION_MODES.includes(interactionMode as DeriveInteractionMode)
  ) {
    return undefined;
  }

  const source: ContractCliArgs['source'] =
    filePath !== undefined
      ? { kind: 'file', filePath }
      : { kind: 'design-ir', designIrPath: designIrPath! };

  const args: ContractCliArgs = {
    command: 'contract',
    source,
    outDir,
    mode: mode as ComponentPlanMode,
    interactionMode: interactionMode as DeriveInteractionMode,
  };

  const artboard = argValue(argv, '--artboard');
  if (artboard !== undefined) args.artboard = artboard;

  const reason = argValue(argv, '--approval-reason');
  const approvedBy = argValue(argv, '--approved-by');
  const approvedAt = argValue(argv, '--approved-at');
  if (reason !== undefined || approvedBy !== undefined || approvedAt !== undefined) {
    /* partial approval is a structural error — all three or none. */
    if (reason === undefined || approvedBy === undefined || approvedAt === undefined) {
      return undefined;
    }
    args.approval = { reason, approvedBy, approvedAt };
  }

  return args;
}

function printUsage(): void {
  console.error('Usage: npm run extract -- --file <path> --out <dir>');
  console.error('   or: npm run normalize -- --raw <path> --out <dir> [--artboard <id|name>]');
  console.error('   or: npm run preview -- --design-ir <path> --out <dir> [--assets <dir>]');
  console.error(
    '   or: npm run contract -- (--file <path> [--artboard <id|name>] | --design-ir <path>) --out <dir> --mode presentational --interaction-mode <omitted|deferred> --approval-reason <str> --approved-by <str> --approved-at <iso>',
  );
  console.error(
    '   or: npm run codegen -- --spec <design-spec dir> --design-ir <path> [--assets <dir>] --out <pkg dir>',
  );
  console.error(
    '   or: npm run approve -- --spec <design-spec dir> --approved-by <str> --approved-at <iso> [--acknowledge-behavior-stubbed]',
  );
}

async function runExtract(): Promise<void> {
  const args = parseExtractArgs(process.argv);
  if (!args) {
    printUsage();
    process.exitCode = 2;
    return;
  }
  if (!confineDirArg(args, 'outDir', '--out')) return;

  const raw = await extractRaw({ source: 'file', filePath: args.filePath });
  const rawJson = `${JSON.stringify(raw, null, 2)}\n`;
  const outputDir = join(args.outDir, 'ir');
  const outputPath = join(outputDir, 'raw-dsl.json');
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, rawJson, 'utf8');

  /* Mirror the real bitmap bytes alongside the DSL so downstream preview/codegen
   * can render actual images instead of placeholders. File names preserve the
   * Sketch zip basename; design-ir assets map back via basename(originalPath). */
  const images = await extractImageAssets({ source: 'file', filePath: args.filePath });
  const imagesDir = join(outputDir, 'assets');
  if (images.length > 0) {
    await mkdir(imagesDir, { recursive: true });
    for (const image of images) {
      await writeFile(join(imagesDir, image.fileName), image.bytes);
    }
  }

  const payload = raw.payload as SketchRawModel;
  console.log(`提供方: ${raw.提供方}`);
  console.log(`documentId: ${raw.ref.documentId}`);
  console.log(`pages: ${payload.pages.length}`);
  console.log(`assets: ${payload.assets.length}`);
  console.log(`raw-dsl.json: ${outputPath} (${Buffer.byteLength(rawJson, 'utf8')} bytes)`);
  console.log(`images: ${images.length}${images.length > 0 ? ` -> ${imagesDir}` : ''}`);
}

async function runNormalize(): Promise<void> {
  const args = parseNormalizeArgs(process.argv);
  if (!args) {
    printUsage();
    process.exitCode = 2;
    return;
  }
  if (!confineDirArg(args, 'outDir', '--out')) return;

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
  if (!confineDirArg(args, 'outDir', '--out')) return;

  const designIr = JSON.parse(await readFile(args.designIrPath, 'utf8')) as DesignIR;
  const realAssets = args.assetsDir
    ? await loadRealImageAssets(designIr, args.assetsDir)
    : undefined;
  const preview = runCorePreview(designIr, realAssets ? { realAssets } : {});
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
    // String content (placeholder SVG) writes as utf8; Uint8Array (real bitmap)
    // writes raw — passing no encoding handles both.
    await writeFile(join(previewDir, asset.path), asset.content);
  }

  console.log(`requiresApproval: ${preview.requiresApproval}`);
  console.log(`overrideApplied: ${preview.stats.overrideApplied}`);
  console.log(`overrideUnmapped: ${preview.stats.overrideUnmapped}`);
  console.log(`overrideUnsupported: ${preview.stats.overrideUnsupported}`);
  console.log(`placeholderAssets: ${preview.stats.placeholderAssets}`);
  console.log(`realAssets: ${preview.stats.realAssets}`);
  console.log(
    `visual-view.json: ${visualViewPath} (${Buffer.byteLength(preview.visualViewJson, 'utf8')} bytes)`,
  );
  console.log(`index.html: ${indexPath} (${Buffer.byteLength(preview.html, 'utf8')} bytes)`);
  console.log(`preview.css: ${cssPath} (${Buffer.byteLength(preview.css, 'utf8')} bytes)`);
  console.log(
    `visual-review-report.md: ${reportPath} (${Buffer.byteLength(preview.report, 'utf8')} bytes)`,
  );
}

/* ── contract (Stage 5D) ─────────────────────────────────────────────────── */

export interface ContractArtifactFile {
  /** Path relative to the `--out` directory. */
  relativePath: string;
  content: string;
}

/**
 * Deterministic, sorted-key, pretty JSON with a trailing newline. Stable byte
 * output is what lets the Stage 5D golden assert byte-for-byte equality across
 * runs regardless of object key insertion order.
 */
function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Pure: run the contract chain in core, build the manifest, and serialize the
 * four `design-spec/` artifacts + `manifest.json`. NO disk IO — the caller
 * writes the returned files. This is the seam that keeps writes strictly in
 * the CLI layer.
 */
/**
 * 组件契约文件计划器：纯函数式地规划Stage 5D输出的所有文件。
 *
 * 该函数是整个D2C管线的关键节点，将设计IR转换为完整的组件契约集。
 * 通过确定性的纯函数设计，确保相同输入始终产生字节级相同的输出文件。
 *
 * 契约文件组成：
 * - visual-view.json：视觉层表示（Stage 4输出）
 * - semantic-view.json：语义层表示（Stage 5A输出）
 * - interaction-spec.json：交互规格（Stage 5B输出）
 * - component-plan.json：组件计划（Stage 5C输出）
 * - manifest.json：文件清单与hash校验链
 *
 * 设计原则：IO分离，该函数只规划内容，由调用方负责实际写入
 */
export function planContractFiles(input: RunContractInput): ContractArtifactFile[] {
  const result = runCoreContract(input);
  const manifest = buildContractManifest(input, result);
  const specDir = 'design-spec';
  return [
    {
      relativePath: join(specDir, ARTIFACT_FILENAMES.visualView),
      content: stableStringify(result.visualView),
    },
    {
      relativePath: join(specDir, ARTIFACT_FILENAMES.semanticView),
      content: stableStringify(result.semanticView),
    },
    {
      relativePath: join(specDir, ARTIFACT_FILENAMES.interactionSpec),
      content: stableStringify(result.interactionSpec),
    },
    {
      relativePath: join(specDir, ARTIFACT_FILENAMES.componentPlan),
      content: stableStringify(result.componentPlan),
    },
    { relativePath: join(specDir, MANIFEST_FILENAME), content: stableStringify(manifest) },
  ];
}

/**
 * Semantic validation beyond structural parsing. Returns an error message
 * when the (structurally valid) args cannot be honored by the derive-only
 * CLI, or `undefined` when they can. Pure — testable without process.argv.
 */
export function validateContractArgs(args: ContractCliArgs): string | undefined {
  if (args.mode === 'interactive') {
    return "[unsupported] --mode interactive is not available from the derive-only contract CLI: the interaction-spec is derived here and is never 'approved', which interactive mode requires. Provide a pre-approved interaction-spec via the reuse-input flow (planned) or use --mode presentational.";
  }
  if (
    (args.interactionMode === 'omitted' || args.interactionMode === 'deferred') &&
    !args.approval
  ) {
    return `[bad-args] --interaction-mode ${args.interactionMode} requires --approval-reason, --approved-by and --approved-at`;
  }
  if (args.interactionMode === 'draft' && args.approval) {
    return '[bad-args] --interaction-mode draft must not carry approval flags';
  }
  return undefined;
}

async function loadContractDesignIr(args: ContractCliArgs): Promise<DesignIR> {
  if (args.source.kind === 'design-ir') {
    return JSON.parse(await readFile(args.source.designIrPath, 'utf8')) as DesignIR;
  }
  const raw = await extractRaw({ source: 'file', filePath: args.source.filePath });
  return normalizeSketchRaw(raw, { artboard: args.artboard });
}

async function runContractCommand(): Promise<void> {
  const args = parseContractArgs(process.argv);
  if (!args) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const validationError = validateContractArgs(args);
  if (validationError !== undefined) {
    console.error(validationError);
    process.exitCode = 2;
    return;
  }
  if (!confineDirArg(args, 'outDir', '--out')) return;

  const designIr = await loadContractDesignIr(args);
  const input: RunContractInput = {
    designIr,
    mode: args.mode,
    interactionMode: args.interactionMode,
    ...(args.approval ? { approval: args.approval } : {}),
  };

  const files = planContractFiles(input);

  await mkdir(join(args.outDir, 'design-spec'), { recursive: true });
  for (const file of files) {
    await writeFile(join(args.outDir, file.relativePath), file.content, 'utf8');
  }
  /* For the --file source, persist the normalized IR so the output dir is a
   * self-contained, re-runnable record (matches `normalize`'s ir/ layout). */
  if (args.source.kind === 'file') {
    const irDir = join(args.outDir, 'ir');
    await mkdir(irDir, { recursive: true });
    await writeFile(join(irDir, ARTIFACT_FILENAMES.designIr), stableStringify(designIr), 'utf8');
  }

  console.log(`mode: ${args.mode}`);
  console.log(`interactionMode: ${args.interactionMode}`);
  for (const file of files) {
    console.log(
      `${file.relativePath}: ${join(args.outDir, file.relativePath)} (${Buffer.byteLength(file.content, 'utf8')} bytes)`,
    );
  }
}

/* ── codegen + approve (Stage 6) ─────────────────────────────────────────── */

export interface CodegenCliArgs {
  command: 'codegen';
  specDir: string;
  designIrPath: string;
  outDir: string;
  /** Extract assets dir (`<out>/ir/assets`); required when the plan emits assets. */
  assetsDir?: string;
}

export interface ApproveCliArgs {
  command: 'approve';
  specDir: string;
  approvedBy: string;
  approvedAt: string;
  acknowledgedBehaviorStubbed: boolean;
}

/**
 * Structural parse only. `--mode` is rejected: codegen mode is a property of
 * the approved component-plan, never a runtime override (plan §3.2).
 */
export function parseCodegenArgs(argv: string[]): CodegenCliArgs | undefined {
  if (argv[2] !== 'codegen') return undefined;
  if (argv.includes('--mode')) return undefined;
  const specDir = argValue(argv, '--spec');
  const designIrPath = argValue(argv, '--design-ir');
  const outDir = argValue(argv, '--out');
  if (!specDir || !designIrPath || !outDir) return undefined;
  const args: CodegenCliArgs = { command: 'codegen', specDir, designIrPath, outDir };
  const assetsDir = argValue(argv, '--assets');
  if (assetsDir !== undefined) args.assetsDir = assetsDir;
  return args;
}

export function parseApproveArgs(argv: string[]): ApproveCliArgs | undefined {
  if (argv[2] !== 'approve') return undefined;
  const specDir = argValue(argv, '--spec');
  const approvedBy = argValue(argv, '--approved-by');
  const approvedAt = argValue(argv, '--approved-at');
  if (!specDir || !approvedBy || !approvedAt) return undefined;
  return {
    command: 'approve',
    specDir,
    approvedBy,
    approvedAt,
    acknowledgedBehaviorStubbed: argv.includes('--acknowledge-behavior-stubbed'),
  };
}

/**
 * Pure Gate 2 + generate seam: validate the on-disk design-spec, then produce
 * the in-memory package file plan. NO disk IO — the caller writes the files.
 * Throws when the component-plan is not approved or the hash chain is broken.
 */
export function planCodegenFiles(input: DesignSpecInput): CodegenFilePlan {
  const verified = verifyDesignSpec(input);
  return generateComponentPackage({
    componentPlan: verified.componentPlan,
    visualView: verified.visualView,
    semanticView: verified.semanticView,
    interactionSpec: verified.interactionSpec,
  });
}

/**
 * Pure sign-off seam: promote the component-plan to approved and rewrite only
 * its manifest hash entry (approval lives in the artifact, so its whole-artifact
 * hash changes — plan §3.4 Option A). Returns the two files to persist; NO IO.
 */
export function planApproval(
  componentPlanInput: unknown,
  manifestInput: unknown,
  signOff: ComponentPlanSignOff,
): { componentPlanJson: string; manifestJson: string } {
  const approved = approveComponentPlan(ComponentPlanSchema.parse(componentPlanInput), signOff);
  const hash = stableSha256(stableJson(approved));

  const manifest = manifestInput as ContractManifest;
  if (!manifest || !Array.isArray(manifest.artifacts)) {
    throw new Error('approve: manifest.json must contain an artifacts array');
  }
  if (!manifest.artifacts.some((entry) => entry.filename === ARTIFACT_FILENAMES.componentPlan)) {
    throw new Error(
      `approve: manifest has no '${ARTIFACT_FILENAMES.componentPlan}' entry to update`,
    );
  }
  const updated: ContractManifest = {
    ...manifest,
    artifacts: manifest.artifacts.map((entry) =>
      entry.filename === ARTIFACT_FILENAMES.componentPlan ? { ...entry, hash } : entry,
    ),
  };
  return { componentPlanJson: stableStringify(approved), manifestJson: stableStringify(updated) };
}

/**
 * Write a generated package to `outDir` with in-place rewrite semantics: the
 * managed `src/` tree is removed first so a re-run with a different plan leaves
 * no orphaned component files (plan §2 — same output dir, overwrite in place).
 * Managed root files (package.json / README.md / interaction-coverage.md) are
 * overwritten by the plan. Unmanaged sibling files are left untouched.
 */
export async function writeCodegenPackage(
  outDir: string,
  plan: CodegenFilePlan,
  options: { assetsDir?: string } = {},
): Promise<void> {
  // Preflight every referenced asset source BEFORE mutating outDir, so a missing
  // or unreadable asset fails the run without leaving a half-written package.
  if (plan.assets.length > 0 && options.assetsDir === undefined) {
    throw new Error('codegen: --assets <dir> is required for generated asset references');
  }
  const assetCopies: { source: string; outputPath: string }[] = [];
  for (const asset of plan.assets) {
    const source = join(options.assetsDir!, asset.sourceFileName);
    try {
      await access(source, constants.R_OK);
    } catch {
      throw new Error(
        `codegen: asset source missing or unreadable for ${asset.assetRef}: ${source}`,
      );
    }
    const stats = await lstat(source);
    if (!stats.isFile()) {
      throw new Error(`codegen: asset source is not a file for ${asset.assetRef}: ${source}`);
    }
    assetCopies.push({ source, outputPath: asset.outputPath });
  }

  // Mutations only after preflight passes. `rm(src)` also clears stale assets,
  // since copied bytes live under `src/assets/`.
  await rm(join(outDir, 'src'), { recursive: true, force: true });
  for (const file of plan.files) {
    const dest = join(outDir, file.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, file.content, 'utf8');
  }
  for (const { source, outputPath } of assetCopies) {
    const dest = join(outDir, outputPath);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(source, dest);
  }
}

async function runCodegenCommand(): Promise<void> {
  const args = parseCodegenArgs(process.argv);
  if (!args) {
    printUsage();
    process.exitCode = 2;
    return;
  }
  if (!confineDirArg(args, 'outDir', '--out')) return;

  const readJson = async (path: string): Promise<unknown> =>
    JSON.parse(await readFile(path, 'utf8')) as unknown;
  const specFile = (name: string): string => join(args.specDir, name);

  const plan = planCodegenFiles({
    designIr: await readJson(args.designIrPath),
    visualView: await readJson(specFile(ARTIFACT_FILENAMES.visualView)),
    semanticView: await readJson(specFile(ARTIFACT_FILENAMES.semanticView)),
    interactionSpec: await readJson(specFile(ARTIFACT_FILENAMES.interactionSpec)),
    componentPlan: await readJson(specFile(ARTIFACT_FILENAMES.componentPlan)),
    manifest: await readJson(specFile(MANIFEST_FILENAME)),
  });

  await writeCodegenPackage(args.outDir, plan, { assetsDir: args.assetsDir });

  console.log(`out: ${args.outDir}`);
  console.log(`files: ${plan.files.length}`);
  console.log(`assets: ${plan.assets.length}`);
  for (const warning of plan.warnings) console.log(`warning: ${warning}`);
}

async function runApproveCommand(): Promise<void> {
  const args = parseApproveArgs(process.argv);
  if (!args) {
    printUsage();
    process.exitCode = 2;
    return;
  }
  /* approve rewrites component-plan.json + manifest.json in place, so --spec is
   * a write target here (unlike codegen, where --spec is a read-only input). */
  if (!confineDirArg(args, 'specDir', '--spec')) return;

  const planPath = join(args.specDir, ARTIFACT_FILENAMES.componentPlan);
  const manifestPath = join(args.specDir, MANIFEST_FILENAME);
  const { componentPlanJson, manifestJson } = planApproval(
    JSON.parse(await readFile(planPath, 'utf8')) as unknown,
    JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
    {
      approvedBy: args.approvedBy,
      approvedAt: args.approvedAt,
      acknowledgedBehaviorStubbed: args.acknowledgedBehaviorStubbed,
    },
  );

  await writeFile(planPath, componentPlanJson, 'utf8');
  await writeFile(manifestPath, manifestJson, 'utf8');

  console.log(`approved: ${planPath}`);
  console.log(`manifest: ${manifestPath}`);
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
  if (process.argv[2] === 'contract') {
    await runContractCommand();
    return;
  }
  if (process.argv[2] === 'codegen') {
    await runCodegenCommand();
    return;
  }
  if (process.argv[2] === 'approve') {
    await runApproveCommand();
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
