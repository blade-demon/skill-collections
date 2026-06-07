import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { DesignIR, RunContractInput, VisualNode } from '@skill-collections/d2c-core';

import {
  parseContractArgs,
  planContractFiles,
  validateContractArgs,
  type ContractCliArgs,
} from '../cli.js';

const APPROVAL = {
  reason: 'visual delivery first',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
} as const;

/**
 * A small, chain-surviving DesignIR built inline (mirrors the d2c-core
 * fixture shape). The desensitized sketch-raw.min.json fixture collapses to
 * duplicate semantic-node ids through the full derive chain, so the contract
 * CLI tests use this deterministic minimal IR instead — the goal here is to
 * exercise the CLI's parse / validate / plan / write seams, not to re-test
 * the derive chain (covered by d2c-core's own runContract tests).
 */
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

function contractArgv(extra: string[]): string[] {
  return ['node', 'cli.ts', 'contract', ...extra];
}

describe('parseContractArgs', () => {
  it('parses a --file presentational deferred invocation', () => {
    expect(
      parseContractArgs(
        contractArgv([
          '--file',
          '/tmp/app.sketch',
          '--out',
          '/tmp/out',
          '--mode',
          'presentational',
          '--interaction-mode',
          'deferred',
          '--approval-reason',
          'visual first',
          '--approved-by',
          'alice',
          '--approved-at',
          '2026-05-26T00:00:00Z',
        ]),
      ),
    ).toEqual({
      command: 'contract',
      source: { kind: 'file', filePath: '/tmp/app.sketch' },
      outDir: '/tmp/out',
      mode: 'presentational',
      interactionMode: 'deferred',
      approval: { reason: 'visual first', approvedBy: 'alice', approvedAt: '2026-05-26T00:00:00Z' },
    });
  });

  it('parses a --design-ir invocation with an artboard and no approval', () => {
    expect(
      parseContractArgs(
        contractArgv([
          '--design-ir',
          '/tmp/ir/design-ir.json',
          '--out',
          '/tmp/out',
          '--mode',
          'presentational',
          '--interaction-mode',
          'draft',
          '--artboard',
          'screen-1',
        ]),
      ),
    ).toEqual({
      command: 'contract',
      source: { kind: 'design-ir', designIrPath: '/tmp/ir/design-ir.json' },
      outDir: '/tmp/out',
      mode: 'presentational',
      interactionMode: 'draft',
      artboard: 'screen-1',
    });
  });

  it('rejects when both --file and --design-ir are provided', () => {
    expect(
      parseContractArgs(
        contractArgv([
          '--file',
          '/tmp/app.sketch',
          '--design-ir',
          '/tmp/ir.json',
          '--out',
          '/tmp/out',
          '--mode',
          'presentational',
          '--interaction-mode',
          'draft',
        ]),
      ),
    ).toBeUndefined();
  });

  it('rejects when neither source is provided', () => {
    expect(
      parseContractArgs(
        contractArgv([
          '--out',
          '/tmp/out',
          '--mode',
          'presentational',
          '--interaction-mode',
          'draft',
        ]),
      ),
    ).toBeUndefined();
  });

  it('rejects a missing --out', () => {
    expect(
      parseContractArgs(
        contractArgv([
          '--file',
          '/tmp/app.sketch',
          '--mode',
          'presentational',
          '--interaction-mode',
          'draft',
        ]),
      ),
    ).toBeUndefined();
  });

  it('rejects an invalid --mode', () => {
    expect(
      parseContractArgs(
        contractArgv([
          '--file',
          '/tmp/app.sketch',
          '--out',
          '/tmp/out',
          '--mode',
          'hybrid',
          '--interaction-mode',
          'draft',
        ]),
      ),
    ).toBeUndefined();
  });

  it('rejects an invalid --interaction-mode', () => {
    expect(
      parseContractArgs(
        contractArgv([
          '--file',
          '/tmp/app.sketch',
          '--out',
          '/tmp/out',
          '--mode',
          'presentational',
          '--interaction-mode',
          'approved',
        ]),
      ),
    ).toBeUndefined();
  });

  it('rejects partial approval flags', () => {
    expect(
      parseContractArgs(
        contractArgv([
          '--file',
          '/tmp/app.sketch',
          '--out',
          '/tmp/out',
          '--mode',
          'presentational',
          '--interaction-mode',
          'deferred',
          '--approved-by',
          'alice',
        ]),
      ),
    ).toBeUndefined();
  });
});

describe('validateContractArgs', () => {
  const base: ContractCliArgs = {
    command: 'contract',
    source: { kind: 'file', filePath: '/tmp/app.sketch' },
    outDir: '/tmp/out',
    mode: 'presentational',
    interactionMode: 'deferred',
    approval: APPROVAL,
  };

  it('accepts a presentational + deferred + approval invocation', () => {
    expect(validateContractArgs(base)).toBeUndefined();
  });

  it('rejects interactive (derive-only CLI cannot produce an approved spec)', () => {
    expect(validateContractArgs({ ...base, mode: 'interactive' })).toMatch(
      /--mode interactive is not available/,
    );
  });

  it('rejects omitted/deferred without approval', () => {
    const noApproval: ContractCliArgs = {
      command: 'contract',
      source: base.source,
      outDir: base.outDir,
      mode: 'presentational',
      interactionMode: 'omitted',
    };
    expect(validateContractArgs(noApproval)).toMatch(/requires --approval-reason/);
  });

  it('rejects draft carrying approval flags', () => {
    expect(validateContractArgs({ ...base, interactionMode: 'draft' })).toMatch(
      /draft must not carry approval/,
    );
  });
});

describe('planContractFiles', () => {
  it('emits the four design-spec artifacts + manifest (design-ir.json excluded)', async () => {
    const designIr = makeDesignIr();
    const input: RunContractInput = {
      designIr,
      mode: 'presentational',
      interactionMode: 'deferred',
      approval: APPROVAL,
    };
    const files = planContractFiles(input);
    expect(files.map((f) => f.relativePath).sort()).toEqual(
      [
        join('design-spec', 'component-plan.json'),
        join('design-spec', 'interaction-spec.json'),
        join('design-spec', 'manifest.json'),
        join('design-spec', 'semantic-view.json'),
        join('design-spec', 'visual-view.json'),
      ].sort(),
    );
    expect(files.some((f) => f.relativePath.includes('design-ir.json'))).toBe(false);
    for (const file of files) {
      expect(file.content.endsWith('\n')).toBe(true);
      expect(() => JSON.parse(file.content)).not.toThrow();
    }
  });

  it('is deterministic across runs', async () => {
    const designIr = makeDesignIr();
    const input: RunContractInput = {
      designIr,
      mode: 'presentational',
      interactionMode: 'omitted',
      approval: APPROVAL,
    };
    expect(planContractFiles(input)).toEqual(planContractFiles(input));
  });
});

describe('contract artifacts write to disk (writer boundary)', () => {
  it('writes design-spec artifacts that are byte-identical on re-run', async () => {
    const designIr = makeDesignIr();
    const input: RunContractInput = {
      designIr,
      mode: 'presentational',
      interactionMode: 'deferred',
      approval: APPROVAL,
    };

    const writeOnce = async (): Promise<string> => {
      const dir = await mkdtemp(join(tmpdir(), 'contract-'));
      const files = planContractFiles(input);
      await mkdir(join(dir, 'design-spec'), { recursive: true });
      for (const file of files) {
        await writeFile(join(dir, file.relativePath), file.content, 'utf8');
      }
      return dir;
    };

    const dirA = await writeOnce();
    const dirB = await writeOnce();
    try {
      for (const name of [
        'visual-view.json',
        'semantic-view.json',
        'interaction-spec.json',
        'component-plan.json',
        'manifest.json',
      ]) {
        const a = await readFile(join(dirA, 'design-spec', name), 'utf8');
        const b = await readFile(join(dirB, 'design-spec', name), 'utf8');
        expect(a).toBe(b);
      }
      /* manifest records four entries with provenance + hash. */
      const manifest = JSON.parse(
        await readFile(join(dirA, 'design-spec', 'manifest.json'), 'utf8'),
      );
      expect(manifest.artifacts).toHaveLength(4);
      for (const entry of manifest.artifacts) {
        expect(entry.origin).toBe('derived');
        expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
      }
    } finally {
      await rm(dirA, { recursive: true, force: true });
      await rm(dirB, { recursive: true, force: true });
    }
  });
});
