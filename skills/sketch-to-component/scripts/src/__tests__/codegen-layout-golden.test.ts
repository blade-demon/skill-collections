import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { stableSha256 } from '@skill-collections/d2c-core';

import { planCodegenFiles, writeCodegenPackage } from '../cli.js';

const inputDir = fileURLToPath(new URL('./fixtures/codegen-layout-golden', import.meta.url));
const expectedDir = fileURLToPath(
  new URL('../../../../../fixtures/apps/react-vite/src/golden-layout', import.meta.url),
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function goldenInput() {
  return {
    designIr: readJson(`${inputDir}/design-ir.json`),
    visualView: readJson(`${inputDir}/design-spec/visual-view.json`),
    semanticView: readJson(`${inputDir}/design-spec/semantic-view.json`),
    interactionSpec: readJson(`${inputDir}/design-spec/interaction-spec.json`),
    componentPlan: readJson(`${inputDir}/design-spec/component-plan.json`),
    manifest: readJson(`${inputDir}/design-spec/manifest.json`),
  };
}

function committedPaths(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...committedPaths(`${dir}/${entry.name}`, rel));
    else out.push(rel);
  }
  return out.sort();
}

function generatedFile(plan: ReturnType<typeof planCodegenFiles>, path: string): string {
  const file = plan.files.find((entry) => entry.path === path);
  if (file === undefined) throw new Error(`missing generated file ${path}`);
  return file.content;
}

function classNameForSemanticId(semanticNodeId: string): string {
  return `node_${stableSha256(semanticNodeId).slice(0, 12)}`;
}

describe('codegen layout golden — approved stack/inline design-spec → React flex package', () => {
  it('materializes byte-identical committed text files', async () => {
    const input = goldenInput();
    const componentPlan = input.componentPlan as {
      body: {
        components: { name: string; semanticNodeId: string }[];
        layoutPlan: { semanticNodeId: string; strategy: string }[];
      };
    };
    const semanticView = input.semanticView as {
      body: {
        nodes: { id: string; primaryVisualNodeId: string }[];
      };
    };
    const semanticIdForVisual = (visualNodeId: string): string => {
      const node = semanticView.body.nodes.find(
        (entry) => entry.primaryVisualNodeId === visualNodeId,
      );
      if (node === undefined) throw new Error(`missing semantic node for ${visualNodeId}`);
      return node.id;
    };
    const stackSemanticNodeId = semanticIdForVisual('node-stack-component');
    const inlineSemanticNodeId = semanticIdForVisual('node-inline-container');

    expect(
      componentPlan.body.components.some(
        (component) => component.semanticNodeId === stackSemanticNodeId,
      ),
    ).toBe(true);
    expect(
      componentPlan.body.components.some(
        (component) => component.semanticNodeId === inlineSemanticNodeId,
      ),
    ).toBe(false);
    expect(
      componentPlan.body.layoutPlan.find((layout) => layout.semanticNodeId === stackSemanticNodeId)
        ?.strategy,
    ).toBe('stack');
    expect(
      componentPlan.body.layoutPlan.find((layout) => layout.semanticNodeId === inlineSemanticNodeId)
        ?.strategy,
    ).toBe('inline');

    const plan = planCodegenFiles(input);
    expect(plan.assets).toEqual([]);
    expect(plan.warnings).toEqual([]);

    const stackCss = generatedFile(plan, 'src/StackCard/StackCard.module.css');
    expect(stackCss).toContain('display: flex;');
    expect(stackCss).toContain('flex-direction: column;');
    expect(stackCss.match(/position: relative;/g)).toHaveLength(4);

    const rootCss = generatedFile(plan, 'src/LayoutScreen/LayoutScreen.module.css');
    expect(rootCss).toContain('.root {\n  display: block;\n  position: relative;');
    expect(rootCss).toContain(
      `.${classNameForSemanticId(inlineSemanticNodeId)} {\n  position: absolute;`,
    );
    expect(rootCss).toContain('flex-direction: row;');
    for (const item of ['a', 'b', 'c']) {
      const itemId = semanticIdForVisual(`node-inline-item-${item}`);
      const nestedId = semanticIdForVisual(`node-inline-nested-${item}`);
      expect(rootCss).toContain(`.${classNameForSemanticId(itemId)} {\n  position: relative;`);
      expect(rootCss).toContain(`.${classNameForSemanticId(nestedId)} {\n  position: absolute;`);
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'codegen-layout-golden-'));
    try {
      await writeCodegenPackage(tempDir, plan);
      const committed = committedPaths(expectedDir);
      expect(committedPaths(tempDir)).toEqual(committed);
      for (const rel of committed) {
        expect(readFileSync(join(tempDir, rel), 'utf8'), `content drift in ${rel}`).toBe(
          readFileSync(join(expectedDir, rel), 'utf8'),
        );
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('is deterministic with no assets or warnings', () => {
    const first = planCodegenFiles(goldenInput());
    const second = planCodegenFiles(goldenInput());
    expect(first).toEqual(second);
    expect(first.assets).toEqual([]);
    expect(first.warnings).toEqual([]);
  });
});
