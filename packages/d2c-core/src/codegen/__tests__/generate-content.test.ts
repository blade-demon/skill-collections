import { describe, expect, it } from 'vitest';

import { stableJson, stableSha256 } from '../../utils/stable-json';
import { generateComponentPackage } from '../generate';
import type { CodegenFilePlan, CodegenInput } from '../target';
import { approvedStubPropsInput as codegenInput } from './codegen-fixtures';

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

  it('records a d2c provenance block (mode + component-plan hash) in package.json', () => {
    const input = codegenInput();
    const pkg = JSON.parse(fileFor(generateComponentPackage(input), 'package.json')) as {
      d2c?: { mode?: string; componentPlanHash?: string };
    };
    expect(pkg.d2c?.mode).toBe('presentational');
    expect(pkg.d2c?.componentPlanHash).toBe(stableSha256(stableJson(input.componentPlan)));
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
