import { describe, expect, it } from 'vitest';

import { stableJson, stableSha256 } from '../../utils/stable-json';
import { generateComponentPackage } from '../generate';
import type { CodegenFilePlan, CodegenInput } from '../target';
import {
  approvedCodegenInput,
  approvedMixedTextMediaInput,
  approvedNestedRebasingInput,
  approvedStyledCardInput,
  approvedStubPropsInput as codegenInput,
} from './codegen-fixtures';

function fileFor(plan: CodegenFilePlan, path: string): string {
  const file = plan.files.find((f) => f.path === path);
  if (file === undefined) {
    throw new Error(
      `expected generated file '${path}'; got: ${plan.files.map((f) => f.path).join(', ')}`,
    );
  }
  return file.content;
}

function exportNameFor(input: CodegenInput, componentId: string): string {
  const exp = input.componentPlan.body.exports.find((e) => e.plannedComponentId === componentId);
  if (exp === undefined) throw new Error(`no export for component ${componentId}`);
  return exp.exportName;
}

describe('generateComponentPackage — React content', () => {
  it('exports the root component as default and candidates as named', () => {
    const input = codegenInput();
    const plan = generateComponentPackage(input);

    const rootName = exportNameFor(input, input.componentPlan.body.rootComponent.id);
    expect(fileFor(plan, `src/${rootName}/${rootName}.tsx`)).toContain(
      `export default function ${rootName}(`,
    );

    const named = input.componentPlan.body.exports.find((e) => e.kind === 'named');
    expect(named).toBeDefined();
    const n = named!.exportName;
    expect(fileFor(plan, `src/${n}/${n}.tsx`)).toContain(`export function ${n}(`);
  });

  it('re-exports root default and candidates named in the package barrel', () => {
    const input = codegenInput();
    const barrel = fileFor(generateComponentPackage(input), 'src/index.ts');
    for (const exp of input.componentPlan.body.exports) {
      if (exp.kind === 'default') {
        expect(barrel).toContain(`export { default } from './${exp.exportName}';`);
      } else {
        expect(barrel).toContain(`export { ${exp.exportName} } from './${exp.exportName}';`);
      }
    }
  });

  it('declares an optional props interface for presentational-stub props and renders them', () => {
    const input = codegenInput();
    const withProps = input.componentPlan.body.components.find((c) => c.props.length > 0);
    expect(withProps, 'fixture should have a component with stub props').toBeDefined();

    const name = exportNameFor(input, withProps!.id);
    const tsx = fileFor(generateComponentPackage(input), `src/${name}/${name}.tsx`);

    expect(tsx).toContain(`interface ${name}Props`);
    for (const prop of withProps!.props) {
      // presentational-stub props are optional
      expect(tsx).toMatch(new RegExp(`\\b${prop.name}\\?:`));
    }
  });

  it('renders semantic text children instead of an empty root shell', () => {
    const input = approvedCodegenInput();
    const name = exportNameFor(input, input.componentPlan.body.rootComponent.id);
    const filePlan = generateComponentPackage(input);
    const tsx = fileFor(filePlan, `src/${name}/${name}.tsx`);

    expect(tsx).not.toContain('return <div className={styles.root} />;');
    expect(tsx).toContain('Hello 0');

    const composer = input.componentPlan.body.exports.find(
      (exp) => exp.kind === 'named' && exp.exportName === 'ComponentInputComposer',
    );
    expect(composer).toBeDefined();
    const composerTsx = fileFor(filePlan, 'src/ComponentInputComposer/ComponentInputComposer.tsx');
    expect(composerTsx).toContain('Type here');
  });

  it('imports planned child components referenced from generated component bodies', () => {
    const filePlan = generateComponentPackage(approvedCodegenInput());
    const componentFiles = filePlan.files.filter((file) => file.path.endsWith('.tsx'));
    const references = componentFiles.flatMap((file) =>
      [...file.content.matchAll(/<([A-Z][A-Za-z0-9]*) \/>/g)].map((match) => ({
        component: match[1]!,
        file,
      })),
    );

    expect(
      references.length,
      'fixture should render at least one planned child component',
    ).toBeGreaterThan(0);
    for (const { component, file } of references) {
      expect(
        file.content,
        `${file.path} references <${component} /> without importing it`,
      ).toContain(`from '../${component}';`);
    }
  });

  it('uses source text as the fallback for optional presentational-stub props', () => {
    const input = approvedMixedTextMediaInput();
    const name = exportNameFor(input, input.componentPlan.body.rootComponent.id);
    const tsx = fileFor(generateComponentPackage(input), `src/${name}/${name}.tsx`);

    expect(tsx).toContain("textTitle ?? 'Title'");
    expect(tsx).toContain("textSubtitle ?? 'Subtitle'");
    expect(tsx).toContain("textCaption ?? 'Caption'");
  });

  it('emits real media references and a deterministic copy plan', () => {
    const input = approvedMixedTextMediaInput();
    const plan = generateComponentPackage(input);
    const css = plan.files
      .filter((file) => file.path.endsWith('.module.css'))
      .map((file) => file.content)
      .join('\n');

    // Two distinct assetRefs (hero, avatar) → two required copy-plan entries.
    expect(plan.assets).toHaveLength(2);
    expect(plan.assets.every((asset) => asset.required)).toBe(true);
    expect(plan.assets.map((asset) => asset.outputPath)).toEqual(
      [...plan.assets.map((asset) => asset.outputPath)].sort(),
    );

    // Media CSS references the CLI-copied file with preview-equivalent `contain`,
    // and the gray/dashed placeholder is gone.
    expect(css).toMatch(/background-image: url\("\.\.\/assets\/asset-[0-9a-f]{12}\.png"\);/);
    expect(css).toContain('background-size: contain;');
    expect(css).not.toContain('border: 1px dashed rgba(0, 0, 0, 0.2);');

    // The post-v1 "not emitted yet" warning is removed.
    expect(plan.warnings.some((w) => /planned asset.*not emitted/i.test(w))).toBe(false);
  });

  it('throws when a required media asset is missing its visual-view entry', () => {
    const input = approvedMixedTextMediaInput();
    const stripped: CodegenInput = {
      ...input,
      visualView: { ...input.visualView, body: { ...input.visualView.body, assets: [] } },
    };
    expect(() => generateComponentPackage(stripped)).toThrow(/required asset.*asset-/i);
  });

  it('preserves core visual styling for a styled no-asset card', () => {
    const input = approvedStyledCardInput();
    const name = exportNameFor(input, input.componentPlan.body.rootComponent.id);
    const filePlan = generateComponentPackage(input);
    const tsx = fileFor(filePlan, `src/${name}/${name}.tsx`);
    const css = fileFor(filePlan, `src/${name}/${name}.module.css`);

    expect(tsx).toContain('Launch faster');
    expect(tsx).toContain('Start');
    expect(tsx).toContain('data-d2c-node-id="node-root"');
    expect(tsx).toContain('data-d2c-node-id="node-eyebrow"');
    expect(tsx).toContain('data-d2c-node-id="node-title"');
    expect(tsx).toContain('data-d2c-node-id="node-subtitle"');
    expect(tsx).toContain('data-d2c-node-id="node-cta"');
    expect(tsx).toContain('data-d2c-node-id="node-cta-label"');
    expect(css).toContain('width: 390px;');
    expect(css).toContain('height: 260px;');
    expect(css).toContain('background-color: #F8FAFCFF;');
    expect(css).toContain('border: 1px solid #CBD5E1FF;');
    expect(css).toContain('border-radius: 24px;');
    expect(css).toContain('box-shadow: 0px 18px 40px -18px #0F172A33;');
    expect(css).toContain('background-color: #2563EBFF;');
    expect(css).toContain('font-weight: 800;');
    expect(css).toContain('line-height: 38px;');
    expect(css).toContain('text-align: left;');
    expect(css).toContain('text-align: center;');
    expect(css).toContain('left: 14px;');
    expect(css).toContain('top: 12px;');
  });

  it('rebases nested children to their frame-local origin, not the absolute canvas position (real KeyboardInput3 repro)', () => {
    const filePlan = generateComponentPackage(approvedNestedRebasingInput());
    const cssAll = filePlan.files
      .filter((f) => f.path.endsWith('.module.css'))
      .map((f) => f.content)
      .join('\n');

    // `box` sits at frame-local (4,4) inside the 36×36 `panel`. Pre-fix codegen
    // subtracted the already-relative parent origin (295,11) → left:-291 top:-7,
    // rendering the box ~290px outside its frame. Bounds are parent-relative, so
    // the child must keep its local offset.
    expect(cssAll).toContain('left: 4px;');
    expect(cssAll).toContain('top: 4px;');
    expect(cssAll).not.toContain('left: -291px;');
    expect(cssAll).not.toContain('top: -7px;');
  });

  it('records a d2c provenance block (mode + Gate 2 level + upstream hashes) in package.json', () => {
    const input = codegenInput();
    const pkg = JSON.parse(fileFor(generateComponentPackage(input), 'package.json')) as {
      d2c?: {
        mode?: string;
        gate2Level?: string;
        sourceHashes?: {
          visualView?: string;
          semanticView?: string;
          interactionSpec?: string;
          componentPlan?: string;
        };
      };
    };
    expect(pkg.d2c?.mode).toBe('presentational');
    expect(pkg.d2c?.gate2Level).toBe('presentational');
    expect(pkg.d2c?.sourceHashes).toEqual({
      visualView: stableSha256(stableJson(input.visualView)),
      semanticView: stableSha256(stableJson(input.semanticView)),
      interactionSpec: stableSha256(stableJson(input.interactionSpec)),
      componentPlan: stableSha256(stableJson(input.componentPlan)),
    });
  });

  it('includes the presentational behavior-stubbed banner in the README', () => {
    const md = fileFor(generateComponentPackage(codegenInput()), 'README.md');
    expect(md).toMatch(/presentational/i);
    expect(md).toMatch(/behavior|stub/i);
  });

  it('renders the interaction coverage snapshot (one row per axis, with status)', () => {
    const input = codegenInput();
    const md = fileFor(generateComponentPackage(input), 'interaction-coverage.md');
    const coverage = input.componentPlan.body.interactionCoverage;
    for (const axis of ['states', 'events', 'dataBinding', 'stateTransitions'] as const) {
      expect(md).toContain(axis);
      expect(md).toContain(coverage[axis].status);
    }
  });
});
