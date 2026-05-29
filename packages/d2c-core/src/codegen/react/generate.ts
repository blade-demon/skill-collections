/**
 * Stage 6 — React + TS + BEM target generator (presentational v1).
 *
 * Pure: a component-plan (+ upstream views) in, an in-memory file plan out. No
 * IO, no clock, no randomness; output is deterministic and the file list is
 * sorted by path. v1 covers presentational delivery only — event handlers and
 * data bindings are behavior-stubbed (plan docs/stage-6-codegen-plan.md §3.7).
 */
import type { ComponentPlan, PlannedComponent } from '../../contract/component-plan-schema';
import { stableJson, stableSha256 } from '../../utils/stable-json';
import type { CodegenFile, CodegenFilePlan, CodegenInput, TargetGenerator } from '../target';

interface ExportInfo {
  exportName: string;
  kind: 'default' | 'named';
}

const STUB_HEADER = [
  '/**',
  ' * Presentational component — behavior is stubbed (event handlers and data',
  ' * bindings are placeholders). See ../../interaction-coverage.md.',
  ' */',
].join('\n');

function exportsByComponentId(plan: ComponentPlan): Map<string, ExportInfo> {
  const map = new Map<string, ExportInfo>();
  for (const exp of plan.body.exports) {
    map.set(exp.plannedComponentId, { exportName: exp.exportName, kind: exp.kind });
  }
  return map;
}

function kebabCase(pascal: string): string {
  return pascal.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function componentTsx(component: PlannedComponent, exp: ExportInfo): string {
  const { exportName: name, kind } = exp;
  const sig = kind === 'default' ? `export default function ${name}` : `export function ${name}`;
  const lines: string[] = [`import styles from './${name}.module.css';`, ''];

  if (component.props.length === 0) {
    lines.push(STUB_HEADER, `${sig}() {`, `  return <div className={styles.root} />;`, '}');
    return lines.join('\n') + '\n';
  }

  lines.push(`export interface ${name}Props {`);
  for (const prop of component.props) {
    lines.push(`  ${prop.name}${prop.required ? '' : '?'}: ${prop.type};`);
  }
  lines.push('}', '', STUB_HEADER);

  const destructure = component.props.map((p) => p.name).join(', ');
  lines.push(
    `${sig}({ ${destructure} }: ${name}Props) {`,
    '  return (',
    `    <div className={styles.root}>`,
  );
  for (const prop of component.props) {
    lines.push(`      {${prop.name}}`);
  }
  lines.push('    </div>', '  );', '}');
  return lines.join('\n') + '\n';
}

function componentCss(): string {
  return ['.root {', '  display: block;', '}'].join('\n') + '\n';
}

function componentIndex(name: string, kind: 'default' | 'named'): string {
  const line =
    kind === 'default'
      ? `export { default } from './${name}';`
      : `export { ${name} } from './${name}';`;
  return line + '\n';
}

function packageBarrel(plan: ComponentPlan): string {
  const lines = [...plan.body.exports]
    .sort((a, b) => (a.exportName < b.exportName ? -1 : a.exportName > b.exportName ? 1 : 0))
    .map((exp) =>
      exp.kind === 'default'
        ? `export { default } from './${exp.exportName}';`
        : `export { ${exp.exportName} } from './${exp.exportName}';`,
    );
  return lines.join('\n') + '\n';
}

function rootExportName(plan: ComponentPlan): string {
  const root = plan.body.exports.find((exp) => exp.kind === 'default');
  return root?.exportName ?? 'Component';
}

function packageJson(plan: ComponentPlan): string {
  const pkg = {
    name: kebabCase(rootExportName(plan)),
    version: '0.0.0',
    private: true,
    d2c: {
      mode: plan.mode,
      componentPlanHash: stableSha256(stableJson(plan)),
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

function readme(plan: ComponentPlan): string {
  return (
    [
      `# ${rootExportName(plan)}`,
      '',
      '> **This package is presentational / behavior-stubbed.** Interaction handlers',
      '> and data bindings are placeholders. Do not import into business code without',
      '> upgrading via the interactive Gate 2 flow.',
      '',
      'See [`interaction-coverage.md`](./interaction-coverage.md) for the behavior gaps.',
    ].join('\n') + '\n'
  );
}

function coverageMarkdown(plan: ComponentPlan): string {
  const coverage = plan.body.interactionCoverage;
  const axes = ['states', 'events', 'dataBinding', 'stateTransitions'] as const;
  const rows = axes.map((axis) => {
    const entry = coverage[axis];
    return `| ${axis} | ${entry.status} | ${entry.notes ?? ''} |`;
  });
  return (
    [
      '# Interaction coverage',
      '',
      'Generated from the approved component-plan coverage snapshot; never re-classified.',
      '',
      '| Axis | Status | Notes |',
      '| --- | --- | --- |',
      ...rows,
    ].join('\n') + '\n'
  );
}

export const reactGenerator: TargetGenerator = {
  framework: 'react',
  generate(input: CodegenInput): CodegenFilePlan {
    const { componentPlan } = input;
    if (componentPlan.mode !== 'presentational') {
      throw new Error(
        `react codegen: v1 generates presentational plans only; '${componentPlan.mode}' is not yet implemented`,
      );
    }
    const exportsMap = exportsByComponentId(componentPlan);
    const files: CodegenFile[] = [];
    const warnings: string[] = [];

    for (const component of componentPlan.body.components) {
      const exp = exportsMap.get(component.id);
      if (exp === undefined) {
        warnings.push(`react codegen: component ${component.id} has no export; skipped`);
        continue;
      }
      const { exportName, kind } = exp;
      files.push({
        path: `src/${exportName}/${exportName}.tsx`,
        content: componentTsx(component, exp),
      });
      files.push({ path: `src/${exportName}/${exportName}.module.css`, content: componentCss() });
      files.push({ path: `src/${exportName}/index.ts`, content: componentIndex(exportName, kind) });
    }

    if (componentPlan.body.assetPlan.length > 0) {
      warnings.push(
        `react codegen: ${componentPlan.body.assetPlan.length} planned asset(s) are not emitted yet (asset generation is post-v1)`,
      );
    }

    files.push({ path: 'src/index.ts', content: packageBarrel(componentPlan) });
    files.push({ path: 'package.json', content: packageJson(componentPlan) });
    files.push({ path: 'README.md', content: readme(componentPlan) });
    files.push({ path: 'interaction-coverage.md', content: coverageMarkdown(componentPlan) });

    // Deterministic order, then guard against case-insensitive path collisions
    // (macOS / Windows filesystems) that PascalCase export uniqueness misses.
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const seen = new Set<string>();
    for (const file of files) {
      const key = file.path.toLowerCase();
      if (seen.has(key)) {
        throw new Error(`react codegen: duplicate output path (case-insensitive): ${file.path}`);
      }
      seen.add(key);
    }

    return { files, warnings };
  },
};
