import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  stableJson,
  stableSha256,
  type CodegenFilePlan,
  type DesignIR,
  type RunContractInput,
  type VisualNode,
} from '@skill-collections/d2c-core';

import {
  parseApproveArgs,
  parseCodegenArgs,
  planApproval,
  planCodegenFiles,
  planContractFiles,
  writeCodegenPackage,
} from '../cli.js';

const APPROVAL = {
  reason: 'visual delivery first',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
} as const;

const SIGN_OFF = {
  approvedBy: 'alice',
  approvedAt: '2026-05-29T00:00:00Z',
  acknowledgedBehaviorStubbed: true,
} as const;

/** Chain-surviving minimal IR (same shape as contract.test.ts). */
function makeDesignIr(): DesignIR {
  const text = (id: string, content: string, layout: VisualNode['layout']): VisualNode => ({
    id: `node-${id}`,
    kind: 'text',
    name: `Text-${id}`,
    source: { nodeId: id, name: id, originalType: 'text', 提供方: 'test' },
    layout,
    text: { content, style: { fontFamily: 'Inter', fontSize: 14, color: '#111111FF' } },
    children: [],
  });
  const root: VisualNode = {
    id: 'node-root',
    kind: 'frame',
    name: 'Root',
    source: { nodeId: 'root', name: 'root', originalType: 'frame', 提供方: 'test' },
    layout: { x: 0, y: 0, width: 320, height: 200 },
    children: [
      text('title', 'Title', { x: 0, y: 0, width: 320, height: 30 }),
      text('body', 'Body', { x: 0, y: 40, width: 320, height: 60 }),
    ],
  };
  return {
    schemaVersion: 'd2c.design-ir/v0.3.0',
    source: {
      提供方: 'test',
      ref: { fileName: 'fixture.sketch', documentId: 'doc-1' },
      rootName: 'Root',
    },
    visual: { artboard: { width: 320, height: 200 }, root, assets: [] },
    semantic: { candidates: [] },
    interaction: { status: 'draft' },
    warnings: [],
  };
}

interface SpecObjects {
  designIr: DesignIR;
  visualView: unknown;
  semanticView: unknown;
  interactionSpec: unknown;
  componentPlan: unknown;
  manifest: unknown;
}

function draftSpec(): SpecObjects {
  const designIr = makeDesignIr();
  const input: RunContractInput = {
    designIr,
    mode: 'presentational',
    interactionMode: 'deferred',
    approval: APPROVAL,
  };
  const files = planContractFiles(input);
  const read = (name: string): unknown =>
    JSON.parse(files.find((f) => f.relativePath === join('design-spec', name))!.content);
  return {
    designIr,
    visualView: read('visual-view.json'),
    semanticView: read('semantic-view.json'),
    interactionSpec: read('interaction-spec.json'),
    componentPlan: read('component-plan.json'),
    manifest: read('manifest.json'),
  };
}

function approvedSpec(): SpecObjects {
  const draft = draftSpec();
  const { componentPlanJson, manifestJson } = planApproval(
    draft.componentPlan,
    draft.manifest,
    SIGN_OFF,
  );
  return {
    ...draft,
    componentPlan: JSON.parse(componentPlanJson),
    manifest: JSON.parse(manifestJson),
  };
}

function codegenArgv(extra: string[]): string[] {
  return ['node', 'cli.ts', 'codegen', ...extra];
}
function approveArgv(extra: string[]): string[] {
  return ['node', 'cli.ts', 'approve', ...extra];
}

describe('parseCodegenArgs', () => {
  it('parses --spec --design-ir --out', () => {
    expect(
      parseCodegenArgs(
        codegenArgv([
          '--spec',
          '/tmp/out/design-spec',
          '--design-ir',
          '/tmp/out/ir/design-ir.json',
          '--out',
          '/tmp/pkg',
        ]),
      ),
    ).toEqual({
      command: 'codegen',
      specDir: '/tmp/out/design-spec',
      designIrPath: '/tmp/out/ir/design-ir.json',
      outDir: '/tmp/pkg',
    });
  });

  it('parses --assets into assetsDir', () => {
    expect(
      parseCodegenArgs(
        codegenArgv([
          '--spec',
          '/tmp/out/design-spec',
          '--design-ir',
          '/tmp/out/ir/design-ir.json',
          '--assets',
          '/tmp/out/ir/assets',
          '--out',
          '/tmp/pkg',
        ]),
      ),
    ).toEqual({
      command: 'codegen',
      specDir: '/tmp/out/design-spec',
      designIrPath: '/tmp/out/ir/design-ir.json',
      assetsDir: '/tmp/out/ir/assets',
      outDir: '/tmp/pkg',
    });
  });

  it('rejects a missing --spec, --design-ir or --out', () => {
    expect(
      parseCodegenArgs(codegenArgv(['--design-ir', '/tmp/ir.json', '--out', '/tmp/pkg'])),
    ).toBeUndefined();
    expect(
      parseCodegenArgs(codegenArgv(['--spec', '/tmp/spec', '--out', '/tmp/pkg'])),
    ).toBeUndefined();
    expect(
      parseCodegenArgs(codegenArgv(['--spec', '/tmp/spec', '--design-ir', '/tmp/ir.json'])),
    ).toBeUndefined();
  });

  it('rejects a --mode flag (codegen mode comes only from the approved plan)', () => {
    expect(
      parseCodegenArgs(
        codegenArgv([
          '--spec',
          '/s',
          '--design-ir',
          '/i.json',
          '--out',
          '/p',
          '--mode',
          'interactive',
        ]),
      ),
    ).toBeUndefined();
  });
});

describe('parseApproveArgs', () => {
  it('parses --spec --approved-by --approved-at with the behavior-stub ack', () => {
    expect(
      parseApproveArgs(
        approveArgv([
          '--spec',
          '/tmp/out/design-spec',
          '--approved-by',
          'alice',
          '--approved-at',
          '2026-05-29T00:00:00Z',
          '--acknowledge-behavior-stubbed',
        ]),
      ),
    ).toEqual({
      command: 'approve',
      specDir: '/tmp/out/design-spec',
      approvedBy: 'alice',
      approvedAt: '2026-05-29T00:00:00Z',
      acknowledgedBehaviorStubbed: true,
    });
  });

  it('defaults the ack flag to false when absent', () => {
    const args = parseApproveArgs(
      approveArgv([
        '--spec',
        '/s',
        '--approved-by',
        'alice',
        '--approved-at',
        '2026-05-29T00:00:00Z',
      ]),
    );
    expect(args?.acknowledgedBehaviorStubbed).toBe(false);
  });

  it('rejects missing --spec / --approved-by / --approved-at', () => {
    expect(
      parseApproveArgs(approveArgv(['--approved-by', 'alice', '--approved-at', 'x'])),
    ).toBeUndefined();
    expect(parseApproveArgs(approveArgv(['--spec', '/s', '--approved-at', 'x']))).toBeUndefined();
    expect(
      parseApproveArgs(approveArgv(['--spec', '/s', '--approved-by', 'alice'])),
    ).toBeUndefined();
  });
});

describe('planApproval', () => {
  it('promotes the plan to approved and rewrites only the component-plan manifest hash', () => {
    const draft = draftSpec();
    const { componentPlanJson, manifestJson } = planApproval(
      draft.componentPlan,
      draft.manifest,
      SIGN_OFF,
    );

    const approved = JSON.parse(componentPlanJson) as { status: string };
    expect(approved.status).toBe('approved');

    const newManifest = JSON.parse(manifestJson) as {
      artifacts: { filename: string; hash: string }[];
    };
    const planEntry = newManifest.artifacts.find((e) => e.filename === 'component-plan.json')!;
    expect(planEntry.hash).toBe(stableSha256(stableJson(approved)));

    // sibling artifacts' hashes are untouched
    const draftManifest = draft.manifest as { artifacts: { filename: string; hash: string }[] };
    for (const name of ['visual-view.json', 'semantic-view.json', 'interaction-spec.json']) {
      expect(newManifest.artifacts.find((e) => e.filename === name)!.hash).toBe(
        draftManifest.artifacts.find((e) => e.filename === name)!.hash,
      );
    }
  });

  it('refuses a presentational plan without the behavior-stub acknowledgement', () => {
    const draft = draftSpec();
    expect(() =>
      planApproval(draft.componentPlan, draft.manifest, {
        approvedBy: 'alice',
        approvedAt: '2026-05-29T00:00:00Z',
      }),
    ).toThrow(/acknowledge/i);
  });
});

describe('planCodegenFiles (Gate 2 + generate)', () => {
  it('rejects a design-spec whose component-plan is still draft', () => {
    expect(() => planCodegenFiles(draftSpec())).toThrow(/approved/i);
  });

  it('generates a package from an approved design-spec', () => {
    const plan = planCodegenFiles(approvedSpec());
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('src/index.ts');
    expect(paths.some((p) => p.endsWith('.tsx'))).toBe(true);
  });

  it('is deterministic across runs', () => {
    expect(planCodegenFiles(approvedSpec())).toEqual(planCodegenFiles(approvedSpec()));
  });
});

describe('codegen writes to disk (writer boundary)', () => {
  it('writes a package that is byte-identical on re-run', async () => {
    const spec = approvedSpec();

    const writeOnce = async (): Promise<string> => {
      const dir = await mkdtemp(join(tmpdir(), 'codegen-'));
      const plan = planCodegenFiles(spec);
      for (const file of plan.files) {
        await mkdir(dirname(join(dir, file.path)), { recursive: true });
        await writeFile(join(dir, file.path), file.content, 'utf8');
      }
      return dir;
    };

    const dirA = await writeOnce();
    const dirB = await writeOnce();
    try {
      const pkgA = await readFile(join(dirA, 'package.json'), 'utf8');
      const pkgB = await readFile(join(dirB, 'package.json'), 'utf8');
      expect(pkgA).toBe(pkgB);
      expect(JSON.parse(pkgA).d2c.mode).toBe('presentational');
    } finally {
      await rm(dirA, { recursive: true, force: true });
      await rm(dirB, { recursive: true, force: true });
    }
  });

  it('removes stale files left by a previous run (in-place rewrite)', async () => {
    const spec = approvedSpec();
    const dir = await mkdtemp(join(tmpdir(), 'codegen-'));
    try {
      // simulate a prior generation leaving an orphan component
      await mkdir(join(dir, 'src', 'StaleComponent'), { recursive: true });
      await writeFile(join(dir, 'src', 'StaleComponent', 'StaleComponent.tsx'), 'stale', 'utf8');

      await writeCodegenPackage(dir, planCodegenFiles(spec));

      await expect(
        readFile(join(dir, 'src', 'StaleComponent', 'StaleComponent.tsx'), 'utf8'),
      ).rejects.toThrow();
      // freshly generated files are present
      await expect(readFile(join(dir, 'package.json'), 'utf8')).resolves.toContain('"d2c"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('codegen asset copying (writer boundary)', () => {
  const OUTPUT_PATH = 'src/assets/asset-abc123def456.png';
  const planWithAsset = (): CodegenFilePlan => ({
    files: [{ path: 'src/index.ts', content: 'export {};\n' }],
    assets: [
      { assetRef: 'asset-x', sourceFileName: 'x.png', outputPath: OUTPUT_PATH, required: true },
    ],
    warnings: [],
  });

  it('requires --assets when the plan carries asset references', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codegen-'));
    try {
      await expect(writeCodegenPackage(dir, planWithAsset())).rejects.toThrow(/--assets/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('copies exact source bytes into the package and is byte-stable on re-run', async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), 'src-'));
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    await writeFile(join(assetsDir, 'x.png'), bytes);

    const writeOnce = async (): Promise<Buffer> => {
      const dir = await mkdtemp(join(tmpdir(), 'codegen-'));
      await writeCodegenPackage(dir, planWithAsset(), { assetsDir });
      const out = await readFile(join(dir, OUTPUT_PATH));
      await rm(dir, { recursive: true, force: true });
      return out;
    };

    try {
      const a = await writeOnce();
      const b = await writeOnce();
      expect(a.equals(bytes)).toBe(true);
      expect(a.equals(b)).toBe(true);
    } finally {
      await rm(assetsDir, { recursive: true, force: true });
    }
  });

  it('preflights sources before touching outDir (no half-written package)', async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), 'src-')); // source x.png intentionally absent
    const dir = await mkdtemp(join(tmpdir(), 'codegen-'));
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'sentinel.txt'), 'keep', 'utf8');

      await expect(writeCodegenPackage(dir, planWithAsset(), { assetsDir })).rejects.toThrow(
        /asset source missing/i,
      );

      // Preflight failed before rm(src): the prior tree is untouched.
      await expect(readFile(join(dir, 'src', 'sentinel.txt'), 'utf8')).resolves.toBe('keep');
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(assetsDir, { recursive: true, force: true });
    }
  });

  it('removes stale src/assets from a previous run', async () => {
    const assetsDir = await mkdtemp(join(tmpdir(), 'src-'));
    await writeFile(join(assetsDir, 'x.png'), Buffer.from([1, 2, 3]));
    const dir = await mkdtemp(join(tmpdir(), 'codegen-'));
    try {
      await mkdir(join(dir, 'src', 'assets'), { recursive: true });
      await writeFile(join(dir, 'src', 'assets', 'old.png'), Buffer.from([9, 9, 9]));

      await writeCodegenPackage(dir, planWithAsset(), { assetsDir });

      await expect(readFile(join(dir, 'src', 'assets', 'old.png'))).rejects.toThrow();
      await expect(readFile(join(dir, OUTPUT_PATH))).resolves.toHaveLength(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(assetsDir, { recursive: true, force: true });
    }
  });
});
