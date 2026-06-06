/**
 * Stage 6 — React + TS + BEM target generator (presentational v1).
 *
 * Pure: a component-plan (+ upstream views) in, an in-memory file plan out. No
 * IO, no clock, no randomness; output is deterministic and the file list is
 * sorted by path. v1 covers presentational delivery only — event handlers and
 * data bindings are behavior-stubbed (plan docs/stage-6-codegen-plan.md §3.7).
 */
import type {
  ComponentPlan,
  PlannedComponent,
  PlannedProp,
} from '../../contract/component-plan-schema';
import type { VisualNode } from '../../ir/visual';
import type { SemanticNode } from '../../semantic/schema';
import { stableJson, stableSha256 } from '../../utils/stable-json';
import { resolveCodegenAssets } from '../assets';
import type { CodegenFile, CodegenFilePlan, CodegenInput, TargetGenerator } from '../target';

interface ExportInfo {
  exportName: string;
  kind: 'default' | 'named';
}

interface ReactCodegenContext {
  semanticById: Map<string, SemanticNode>;
  visualById: Map<string, VisualNode>;
  componentBySemanticId: Map<string, PlannedComponent>;
  exportByComponentId: Map<string, ExportInfo>;
  propByComponentAndSemanticId: Map<string, Map<string, PlannedProp>>;
  /** Resolved package asset path per media semantic node (see ../assets). */
  assetOutputPathBySemanticId: Map<string, string>;
}

interface RenderResult {
  lines: string[];
  semanticNodeIds: Set<string>;
  childComponentIds: Set<string>;
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

function buildContext(
  input: CodegenInput,
  assetOutputPathBySemanticId: Map<string, string>,
): ReactCodegenContext {
  const semanticById = new Map<string, SemanticNode>();
  for (const node of input.semanticView.body.nodes) semanticById.set(node.id, node);

  const visualById = new Map<string, VisualNode>();
  const visitVisual = (node: VisualNode): void => {
    visualById.set(node.id, node);
    for (const child of node.children) visitVisual(child);
  };
  visitVisual(input.visualView.body.root);

  const componentBySemanticId = new Map<string, PlannedComponent>();
  for (const component of input.componentPlan.body.components) {
    componentBySemanticId.set(component.semanticNodeId, component);
  }

  const dataModelSourceById = new Map<string, string>();
  for (const dataModel of input.interactionSpec.body.dataModels) {
    dataModelSourceById.set(dataModel.id, dataModel.source);
  }

  const propByComponentAndSemanticId = new Map<string, Map<string, PlannedProp>>();
  for (const component of input.componentPlan.body.components) {
    const props = new Map<string, PlannedProp>();
    for (const prop of component.props) {
      if (prop.interactionRefId === undefined) continue;
      const semanticNodeId = dataModelSourceById.get(prop.interactionRefId);
      if (semanticNodeId !== undefined) props.set(semanticNodeId, prop);
    }
    propByComponentAndSemanticId.set(component.id, props);
  }

  return {
    semanticById,
    visualById,
    componentBySemanticId,
    exportByComponentId: exportsByComponentId(input.componentPlan),
    propByComponentAndSemanticId,
    assetOutputPathBySemanticId,
  };
}

function classNameForSemanticId(semanticNodeId: string): string {
  return `node_${stableSha256(semanticNodeId).slice(0, 12)}`;
}

function styleLookup(className: string): string {
  return `styles['${className}']`;
}

function stringLiteral(value: string): string {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`;
}

function jsxAttrValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function d2cNodeIdAttr(visualNode?: VisualNode): string {
  return visualNode === undefined ? '' : ` data-d2c-node-id="${jsxAttrValue(visualNode.id)}"`;
}

function rootVisualNodeFor(
  component: PlannedComponent,
  context: ReactCodegenContext,
): VisualNode | undefined {
  const rootSemanticNode = context.semanticById.get(component.semanticNodeId);
  return rootSemanticNode === undefined
    ? undefined
    : context.visualById.get(rootSemanticNode.primaryVisualNodeId);
}

function fallbackText(semanticNode: SemanticNode, visualNode: VisualNode | undefined): string {
  return visualNode?.text?.content ?? semanticNode.name;
}

function px(value: number): string {
  return `${formatNumber(value)}px`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function radiusValue(radius: NonNullable<NonNullable<VisualNode['style']>['radius']>): string {
  if (typeof radius === 'number') return px(radius);
  return `${px(radius.topLeft)} ${px(radius.topRight)} ${px(radius.bottomRight)} ${px(radius.bottomLeft)}`;
}

function shouldRenderBoxFill(node: VisualNode): boolean {
  if (typeof node.style?.raw?.compoundSvgPath === 'string') return false;
  if (node.kind === 'text') return false;
  if (node.kind === 'shape') {
    const originalType = node.source.originalType?.toLowerCase();
    if (originalType === 'shapegroup' || originalType === 'shapepath') return false;
  }
  return true;
}

const BORDER_POSITION_INSIDE = 1;

function shouldRenderBorder(
  border: NonNullable<NonNullable<VisualNode['style']>['borders']>[number],
): boolean {
  const hasBorder = border.color !== undefined || border.thickness !== undefined;
  if (!hasBorder) return false;
  const thickness = border.thickness ?? 1;
  if (thickness < 1 && border.position === BORDER_POSITION_INSIDE) return false;
  return true;
}

function visualStyleDeclarations(node: VisualNode): string[] {
  const declarations: string[] = [];
  const style = node.style;
  const fill = style?.fills?.[0];
  if (fill && shouldRenderBoxFill(node)) {
    if (fill.color !== undefined) declarations.push(`background-color: ${fill.color};`);
  }

  const border = style?.borders?.[0];
  if (!node.vector && border && shouldRenderBorder(border)) {
    declarations.push(`border: ${px(border.thickness ?? 1)} solid ${border.color ?? '#000000FF'};`);
  }

  const shadowEffect = style?.effects?.find((effect) => effect.type !== 'layerBlur');
  if (shadowEffect) {
    declarations.push(
      `box-shadow: ${px(shadowEffect.x ?? 0)} ${px(shadowEffect.y ?? 0)} ${px(shadowEffect.blur ?? 0)} ${px(shadowEffect.spread ?? 0)} ${shadowEffect.color ?? '#00000033'};`,
    );
  }

  const layerBlur = style?.effects?.find((effect) => effect.type === 'layerBlur');
  if (layerBlur?.blur) declarations.push(`filter: blur(${px(layerBlur.blur)});`);
  if (style?.radius !== undefined)
    declarations.push(`border-radius: ${radiusValue(style.radius)};`);
  if (style?.opacity !== undefined) declarations.push(`opacity: ${formatNumber(style.opacity)};`);
  if (style?.raw && (style.raw as Record<string, unknown>).maskedContent === true) {
    declarations.push('overflow: hidden;');
  }

  return declarations;
}

function textStyleDeclarations(node: VisualNode): string[] {
  const declarations: string[] = ['overflow: hidden;'];
  if (node.style?.raw?.sketchTextBehaviour === 0) {
    declarations.push('width: max-content;', 'white-space: nowrap;');
  } else {
    declarations.push('white-space: pre-wrap;');
  }

  const textStyle = node.text?.style;
  if (textStyle?.fontFamily !== undefined)
    declarations.push(`font-family: ${cssString(textStyle.fontFamily)};`);
  if (textStyle?.fontSize !== undefined) declarations.push(`font-size: ${px(textStyle.fontSize)};`);
  if (textStyle?.fontWeight !== undefined)
    declarations.push(`font-weight: ${textStyle.fontWeight};`);
  if (textStyle?.lineHeight !== undefined)
    declarations.push(`line-height: ${px(textStyle.lineHeight)};`);
  if (textStyle?.color !== undefined) declarations.push(`color: ${textStyle.color};`);
  declarations.push(`text-align: ${textStyle?.textAlign ?? 'left'};`);

  return declarations;
}

function textExpression(args: {
  component: PlannedComponent;
  semanticNode: SemanticNode;
  visualNode?: VisualNode;
  context: ReactCodegenContext;
}): string {
  const { component, semanticNode, visualNode, context } = args;
  const prop = context.propByComponentAndSemanticId.get(component.id)?.get(semanticNode.id);
  const fallback = stringLiteral(fallbackText(semanticNode, visualNode));
  if (prop === undefined) return `{${fallback}}`;
  return `{${prop.name} ?? ${fallback}}`;
}

function renderSemanticNode(
  semanticNodeId: string,
  component: PlannedComponent,
  context: ReactCodegenContext,
  depth: number,
): RenderResult {
  const semanticNode = context.semanticById.get(semanticNodeId);
  if (semanticNode === undefined) {
    return { lines: [], semanticNodeIds: new Set(), childComponentIds: new Set() };
  }

  const className = classNameForSemanticId(semanticNode.id);
  const classExpr = styleLookup(className);
  const indent = ' '.repeat(depth);
  const childIndent = ' '.repeat(depth + 2);
  const semanticNodeIds = new Set<string>([semanticNode.id]);
  const childComponentIds = new Set<string>();
  const visualNode = context.visualById.get(semanticNode.primaryVisualNodeId);
  const nodeIdAttr = d2cNodeIdAttr(visualNode);

  const plannedChild = context.componentBySemanticId.get(semanticNode.id);
  if (plannedChild !== undefined && plannedChild.id !== component.id) {
    const childExport = context.exportByComponentId.get(plannedChild.id);
    if (childExport !== undefined) {
      childComponentIds.add(plannedChild.id);
      return {
        lines: [
          `${indent}<div className={${classExpr}}${nodeIdAttr}>`,
          `${childIndent}<${childExport.exportName} />`,
          `${indent}</div>`,
        ],
        semanticNodeIds,
        childComponentIds,
      };
    }
  }

  if (semanticNode.kind === 'text' || visualNode?.text !== undefined) {
    return {
      lines: [
        `${indent}<div className={${classExpr}}${nodeIdAttr}>${textExpression({
          component,
          semanticNode,
          visualNode,
          context,
        })}</div>`,
      ],
      semanticNodeIds,
      childComponentIds,
    };
  }

  if (semanticNode.kind === 'media' || visualNode?.kind === 'image') {
    const prop = context.propByComponentAndSemanticId.get(component.id)?.get(semanticNode.id);
    const label = stringLiteral(semanticNode.name);
    const ariaLabel = prop === undefined ? label : `{${prop.name} ?? ${label}}`;
    return {
      lines: [
        `${indent}<div className={${classExpr}}${nodeIdAttr} role="img" aria-label=${ariaLabel} />`,
      ],
      semanticNodeIds,
      childComponentIds,
    };
  }

  const childLines: string[] = [];
  for (const childId of semanticNode.childIds) {
    const rendered = renderSemanticNode(childId, component, context, depth + 2);
    childLines.push(...rendered.lines);
    for (const id of rendered.semanticNodeIds) semanticNodeIds.add(id);
    for (const id of rendered.childComponentIds) childComponentIds.add(id);
  }

  if (childLines.length === 0) {
    return {
      lines: [`${indent}<div className={${classExpr}}${nodeIdAttr} />`],
      semanticNodeIds,
      childComponentIds,
    };
  }

  return {
    lines: [
      `${indent}<div className={${classExpr}}${nodeIdAttr}>`,
      ...childLines,
      `${indent}</div>`,
    ],
    semanticNodeIds,
    childComponentIds,
  };
}

function renderComponentBody(
  component: PlannedComponent,
  context: ReactCodegenContext,
): RenderResult {
  const lines: string[] = [];
  const semanticNodeIds = new Set<string>();
  const childComponentIds = new Set<string>();
  for (const semanticNodeId of component.childSemanticNodeIds) {
    const rendered = renderSemanticNode(semanticNodeId, component, context, 6);
    lines.push(...rendered.lines);
    for (const id of rendered.semanticNodeIds) semanticNodeIds.add(id);
    for (const id of rendered.childComponentIds) childComponentIds.add(id);
  }
  return { lines, semanticNodeIds, childComponentIds };
}

function componentImport(exp: ExportInfo): string {
  if (exp.kind === 'default') return `import ${exp.exportName} from '../${exp.exportName}';`;
  return `import { ${exp.exportName} } from '../${exp.exportName}';`;
}

function componentTsx(
  component: PlannedComponent,
  exp: ExportInfo,
  context: ReactCodegenContext,
): { content: string; renderedSemanticNodeIds: Set<string> } {
  const { exportName: name, kind } = exp;
  const sig = kind === 'default' ? `export default function ${name}` : `export function ${name}`;
  const rendered = renderComponentBody(component, context);
  const rootVisualNode = rootVisualNodeFor(component, context);
  const childImports = [...rendered.childComponentIds]
    .map((componentId) => context.exportByComponentId.get(componentId))
    .filter((childExport): childExport is ExportInfo => childExport !== undefined)
    .sort((a, b) => (a.exportName < b.exportName ? -1 : a.exportName > b.exportName ? 1 : 0))
    .map(componentImport);
  const lines: string[] = [`import styles from './${name}.module.css';`, ...childImports, ''];

  if (component.props.length === 0) {
    lines.push(STUB_HEADER, `${sig}() {`);
  } else {
    lines.push(`export interface ${name}Props {`);
    for (const prop of component.props) {
      lines.push(`  ${prop.name}${prop.required ? '' : '?'}: ${prop.type};`);
    }
    lines.push('}', '', STUB_HEADER);

    const destructure = component.props.map((p) => p.name).join(', ');
    lines.push(`${sig}({ ${destructure} }: ${name}Props) {`);
  }

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
  return { content: lines.join('\n') + '\n', renderedSemanticNodeIds: rendered.semanticNodeIds };
}

function componentCss(
  component: PlannedComponent,
  context: ReactCodegenContext,
  renderedSemanticNodeIds: Set<string>,
): string {
  const rootSemanticNode = context.semanticById.get(component.semanticNodeId);
  const rootVisualNode =
    rootSemanticNode === undefined
      ? undefined
      : context.visualById.get(rootSemanticNode.primaryVisualNodeId);
  const rootWidth = rootVisualNode?.layout.width ?? rootSemanticNode?.bounds.width ?? 0;
  const rootHeight = rootVisualNode?.layout.height ?? rootSemanticNode?.bounds.height ?? 0;
  const lines = [
    '.root {',
    '  display: block;',
    '  position: relative;',
    '  box-sizing: border-box;',
    `  width: ${px(Math.max(rootWidth, 1))};`,
    `  height: ${px(Math.max(rootHeight, 1))};`,
    '  overflow: hidden;',
  ];
  if (rootVisualNode !== undefined)
    lines.push(...visualStyleDeclarations(rootVisualNode).map((d) => `  ${d}`));
  lines.push('}');

  for (const semanticNodeId of [...renderedSemanticNodeIds].sort()) {
    const semanticNode = context.semanticById.get(semanticNodeId);
    if (semanticNode === undefined) continue;
    const visualNode = context.visualById.get(semanticNode.primaryVisualNodeId);
    // Position from the node's own parent-relative frame (visual layout, which
    // the semantic bounds mirror). The rendered DOM parent — the component root
    // for top-level children, else the enclosing rendered node — is exactly the
    // frame these coordinates are relative to, so they map straight to CSS
    // left/top with no rebasing. Mirrors the preview renderer and avoids
    // double-subtracting the parent origin for symbol-instance-local children.
    const rect = visualNode?.layout ?? semanticNode.bounds;
    lines.push(
      '',
      `.${classNameForSemanticId(semanticNode.id)} {`,
      '  position: absolute;',
      '  box-sizing: border-box;',
      `  left: ${px(rect.x)};`,
      `  top: ${px(rect.y)};`,
      `  width: ${px(rect.width)};`,
      `  height: ${px(Math.max(rect.height, 1))};`,
    );
    if (visualNode !== undefined) {
      lines.push(...visualStyleDeclarations(visualNode).map((d) => `  ${d}`));
    }
    if (semanticNode.kind === 'text' || visualNode?.text !== undefined) {
      if (visualNode !== undefined)
        lines.push(...textStyleDeclarations(visualNode).map((d) => `  ${d}`));
    } else if (semanticNode.kind === 'media' || visualNode?.kind === 'image') {
      const assetOutputPath = context.assetOutputPathBySemanticId.get(semanticNode.id);
      if (assetOutputPath !== undefined) {
        // Reference the CLI-copied asset relative to this component's CSS module
        // (src/<Component>/ → ../assets/...). `contain` mirrors the preview
        // renderer; the bytes are copied at the CLI boundary, not here.
        lines.push(
          '  display: block;',
          `  background-image: url("${assetOutputPath.replace(/^src\//, '../')}");`,
          '  background-size: contain;',
          '  background-position: center;',
          '  background-repeat: no-repeat;',
        );
      } else {
        // Optional asset that did not resolve: keep the visible placeholder.
        lines.push(
          '  display: block;',
          '  background: rgba(0, 0, 0, 0.06);',
          '  border: 1px dashed rgba(0, 0, 0, 0.2);',
        );
      }
    } else {
      lines.push('  display: block;');
    }
    lines.push('}');
  }

  return lines.join('\n') + '\n';
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

function packageJson(input: CodegenInput): string {
  const { componentPlan: plan, visualView, semanticView, interactionSpec } = input;
  const pkg = {
    name: kebabCase(rootExportName(plan)),
    version: '0.0.0',
    private: true,
    d2c: {
      mode: plan.mode,
      gate2Level: plan.approval?.level,
      sourceHashes: {
        visualView: stableSha256(stableJson(visualView)),
        semanticView: stableSha256(stableJson(semanticView)),
        interactionSpec: stableSha256(stableJson(interactionSpec)),
        componentPlan: stableSha256(stableJson(plan)),
      },
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
    // Resolve assets first: a required media asset missing its visual-view entry
    // throws here, so generation fails loudly rather than emitting a placeholder.
    const resolvedAssets = resolveCodegenAssets({
      plannedAssets: componentPlan.body.assetPlan,
      visualAssets: input.visualView.body.assets,
    });
    const context = buildContext(input, resolvedAssets.outputPathBySemanticNodeId);
    const exportsMap = context.exportByComponentId;
    const files: CodegenFile[] = [];
    const warnings: string[] = [];

    for (const component of componentPlan.body.components) {
      const exp = exportsMap.get(component.id);
      if (exp === undefined) {
        warnings.push(`react codegen: component ${component.id} has no export; skipped`);
        continue;
      }
      const { exportName, kind } = exp;
      const tsx = componentTsx(component, exp, context);
      files.push({
        path: `src/${exportName}/${exportName}.tsx`,
        content: tsx.content,
      });
      files.push({
        path: `src/${exportName}/${exportName}.module.css`,
        content: componentCss(component, context, tsx.renderedSemanticNodeIds),
      });
      files.push({ path: `src/${exportName}/index.ts`, content: componentIndex(exportName, kind) });
    }

    files.push({ path: 'src/index.ts', content: packageBarrel(componentPlan) });
    files.push({ path: 'package.json', content: packageJson(input) });
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

    return {
      files,
      assets: resolvedAssets.assets,
      warnings: [...resolvedAssets.warnings, ...warnings],
    };
  },
};
