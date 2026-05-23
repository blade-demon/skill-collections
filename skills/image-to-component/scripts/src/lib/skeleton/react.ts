import type {
  SkeletonConfig,
  ComponentNode,
  GeneratedFile,
  StylePlan,
  ComponentStyleRule,
  StyleDeclaration,
} from '../../types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toKebab(name: string): string {
  return name.replace(/([A-Z])/g, (_, c, i) => (i === 0 ? '' : '-') + c.toLowerCase());
}

function toScreamingSnake(name: string): string {
  // Convert camelCase/PascalCase to SCREAMING_SNAKE_CASE
  return name.replace(/([A-Z])/g, (_, c, i) => (i === 0 ? c : '_' + c)).toUpperCase();
}

function cssModuleClassName(node: ComponentNode, isRoot: boolean): string {
  if (isRoot && node.discriminator) return 'root';
  return toKebab(node.name).replace(/-/g, '_') || node.name.toLowerCase();
}

function bemClassName(node: ComponentNode): string {
  return toKebab(node.name);
}

function styleRuleFor(
  stylePlan: StylePlan | undefined,
  component: string,
): ComponentStyleRule | undefined {
  return stylePlan?.rules.find((rule) => rule.component === component);
}

function hasStyleRule(stylePlan: StylePlan | undefined, component: string): boolean {
  const rule = styleRuleFor(stylePlan, component);
  return Boolean(
    rule && ((rule.declarations ?? []).length > 0 || (rule.variants ?? []).length > 0),
  );
}

function safeCssComment(comment: string): string {
  return comment.replace(/\*\//g, '* /');
}

function formatDeclarations(declarations: StyleDeclaration[]): string[] {
  return declarations.map((declaration) => {
    const comment = declaration.comment ? ` /* ${safeCssComment(declaration.comment)} */` : '';
    return `  ${declaration.property}: ${declaration.value};${comment}`;
  });
}

function formatCssRule(selector: string, declarations: StyleDeclaration[]): string[] {
  const lines: string[] = [];
  lines.push(`${selector} {`);
  lines.push(...formatDeclarations(declarations));
  lines.push(`}`);
  return lines;
}

function generateCssContent(
  node: ComponentNode,
  stylePlan: StylePlan | undefined,
  options: { modules: boolean; root: boolean },
): string {
  const rule = styleRuleFor(stylePlan, node.name);
  if (!rule) return '';

  const lines: string[] = [];
  const baseSelector = options.modules
    ? `.${cssModuleClassName(node, options.root)}`
    : `.${bemClassName(node)}`;

  lines.push(...formatCssRule(baseSelector, rule.declarations ?? []));

  for (const variant of rule.variants ?? []) {
    if (lines.length > 0) lines.push('');
    const selector = options.modules
      ? `.${variant.name}`
      : `.${bemClassName(node)}--${variant.name}`;
    lines.push(...formatCssRule(selector, variant.declarations));
  }

  return lines.join('\n') + '\n';
}

// ── cn helper ─────────────────────────────────────────────────────────────────

function genCnTs(): string {
  return `export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}
`;
}

function genCnJs(): string {
  return `export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}
`;
}

// ── types.ts ──────────────────────────────────────────────────────────────────

function genTypesTs(node: ComponentNode): string {
  if (!node.discriminator) return '';
  const { type, variants } = node.discriminator;
  const union = variants.map((v) => `'${v}'`).join(' | ');
  return `export type ${type} = ${union}\n`;
}

// ── Root component ────────────────────────────────────────────────────────────

function genRootTsxCssModules(node: ComponentNode): string {
  const { name, element, discriminator, props, children } = node;
  const kebab = toKebab(name);
  const ext = '.module.css';

  const lines: string[] = [];

  // Imports
  lines.push(`import styles from './${name}${ext}'`);
  lines.push(`import { cn } from './utils/cn'`);
  if (discriminator) {
    lines.push(`import type { ${discriminator.type} } from './types'`);
  }
  for (const child of children) {
    lines.push(`import { ${child.name} } from './components/${child.name}'`);
  }
  lines.push('');

  // Interface
  lines.push(`export interface ${name}Props {`);
  if (discriminator) {
    lines.push(`  ${discriminator.propName}: ${discriminator.type}`);
  }
  for (const prop of props) {
    const optional = prop.required ? '' : '?';
    lines.push(`  ${prop.name}${optional}: ${prop.type}`);
  }
  lines.push('}');
  lines.push('');

  // Discriminator class map
  if (discriminator) {
    const { type, propName, variants } = discriminator;
    const mapName = `${toScreamingSnake(propName)}_CLASS`;
    lines.push(`const ${mapName}: Record<${type}, string> = {`);
    for (const variant of variants) {
      lines.push(`  ${variant}: styles.${variant},`);
    }
    lines.push('}');
    lines.push('');
  }

  // Function signature
  const allProps = [
    ...(discriminator ? [discriminator.propName] : []),
    ...props.map((p) => p.name),
  ];
  lines.push(`export function ${name}({ ${allProps.join(', ')} }: ${name}Props) {`);

  // className expression
  let classNameExpr: string;
  if (discriminator) {
    const { propName } = discriminator;
    const mapName = `${toScreamingSnake(propName)}_CLASS`;
    classNameExpr = `cn(styles.root, ${mapName}[${propName}])`;
  } else {
    classNameExpr = `styles.${kebab.replace(/-/g, '_') || 'root'}`;
  }

  lines.push(`  return (`);
  lines.push(`    <${element} className={${classNameExpr}}>`);

  // Render children
  for (const child of children) {
    const childPropsWithValues = child.props.filter((p) => p.required);
    if (childPropsWithValues.length > 0) {
      const propsStr = childPropsWithValues.map((p) => `${p.name}={${p.name}}`).join(' ');
      lines.push(`      <${child.name} ${propsStr} />`);
    } else {
      lines.push(`      <${child.name} />`);
    }
  }

  lines.push(`    </${element}>`);
  lines.push(`  )`);
  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}

function genRootTsxBem(node: ComponentNode, stylePlan?: StylePlan): string {
  const { name, element, discriminator, props, children } = node;
  const kebab = toKebab(name);

  const lines: string[] = [];

  // Imports
  if (hasStyleRule(stylePlan, name)) {
    lines.push(`import './${name}.css'`);
  }
  lines.push(`import { cn } from './utils/cn'`);
  if (discriminator) {
    lines.push(`import type { ${discriminator.type} } from './types'`);
  }
  for (const child of children) {
    lines.push(`import { ${child.name} } from './components/${child.name}'`);
  }
  lines.push('');

  // Interface
  lines.push(`export interface ${name}Props {`);
  if (discriminator) {
    lines.push(`  ${discriminator.propName}: ${discriminator.type}`);
  }
  for (const prop of props) {
    const optional = prop.required ? '' : '?';
    lines.push(`  ${prop.name}${optional}: ${prop.type}`);
  }
  lines.push('}');
  lines.push('');

  // Function signature
  const allProps = [
    ...(discriminator ? [discriminator.propName] : []),
    ...props.map((p) => p.name),
  ];
  lines.push(`export function ${name}({ ${allProps.join(', ')} }: ${name}Props) {`);

  // BEM className
  let classNameExpr: string;
  if (discriminator) {
    const { propName } = discriminator;
    classNameExpr = `cn('${kebab}', \`${kebab}--\${${propName}}\`)`;
  } else {
    classNameExpr = `'${kebab}'`;
  }

  lines.push(`  return (`);
  lines.push(`    <${element} className={${classNameExpr}}>`);

  for (const child of children) {
    const childPropsWithValues = child.props.filter((p) => p.required);
    if (childPropsWithValues.length > 0) {
      const propsStr = childPropsWithValues.map((p) => `${p.name}={${p.name}}`).join(' ');
      lines.push(`      <${child.name} ${propsStr} />`);
    } else {
      lines.push(`      <${child.name} />`);
    }
  }

  lines.push(`    </${element}>`);
  lines.push(`  )`);
  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}

function genRootJsxCssModules(node: ComponentNode): string {
  const { name, element, discriminator, props, children } = node;

  const lines: string[] = [];

  // Imports (no import type)
  lines.push(`import styles from './${name}.module.css'`);
  lines.push(`import { cn } from './utils/cn'`);
  for (const child of children) {
    lines.push(`import { ${child.name} } from './components/${child.name}'`);
  }
  lines.push('');

  // Discriminator class map (no type annotation)
  if (discriminator) {
    const { propName, variants } = discriminator;
    const mapName = `${toScreamingSnake(propName)}_CLASS`;
    lines.push(`const ${mapName} = {`);
    for (const variant of variants) {
      lines.push(`  ${variant}: styles.${variant},`);
    }
    lines.push('}');
    lines.push('');
  }

  // Function signature (no type annotations)
  const allProps = [
    ...(discriminator ? [discriminator.propName] : []),
    ...props.map((p) => p.name),
  ];
  lines.push(`export function ${name}({ ${allProps.join(', ')} }) {`);

  // className expression
  let classNameExpr: string;
  if (discriminator) {
    const { propName } = discriminator;
    const mapName = `${toScreamingSnake(propName)}_CLASS`;
    classNameExpr = `cn(styles.root, ${mapName}[${propName}])`;
  } else {
    classNameExpr = `styles.root`;
  }

  lines.push(`  return (`);
  lines.push(`    <${element} className={${classNameExpr}}>`);

  for (const child of children) {
    const childPropsWithValues = child.props.filter((p) => p.required);
    if (childPropsWithValues.length > 0) {
      const propsStr = childPropsWithValues.map((p) => `${p.name}={${p.name}}`).join(' ');
      lines.push(`      <${child.name} ${propsStr} />`);
    } else {
      lines.push(`      <${child.name} />`);
    }
  }

  lines.push(`    </${element}>`);
  lines.push(`  )`);
  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}

function genRootJsxBem(node: ComponentNode, stylePlan?: StylePlan): string {
  const { name, element, discriminator, props, children } = node;
  const kebab = toKebab(name);

  const lines: string[] = [];

  // Imports
  if (hasStyleRule(stylePlan, name)) {
    lines.push(`import './${name}.css'`);
  }
  lines.push(`import { cn } from './utils/cn'`);
  for (const child of children) {
    lines.push(`import { ${child.name} } from './components/${child.name}'`);
  }
  lines.push('');

  // Function signature (no type annotations)
  const allProps = [
    ...(discriminator ? [discriminator.propName] : []),
    ...props.map((p) => p.name),
  ];
  lines.push(`export function ${name}({ ${allProps.join(', ')} }) {`);

  // BEM className
  let classNameExpr: string;
  if (discriminator) {
    const { propName } = discriminator;
    classNameExpr = `cn('${kebab}', \`${kebab}--\${${propName}}\`)`;
  } else {
    classNameExpr = `'${kebab}'`;
  }

  lines.push(`  return (`);
  lines.push(`    <${element} className={${classNameExpr}}>`);

  for (const child of children) {
    const childPropsWithValues = child.props.filter((p) => p.required);
    if (childPropsWithValues.length > 0) {
      const propsStr = childPropsWithValues.map((p) => `${p.name}={${p.name}}`).join(' ');
      lines.push(`      <${child.name} ${propsStr} />`);
    } else {
      lines.push(`      <${child.name} />`);
    }
  }

  lines.push(`    </${element}>`);
  lines.push(`  )`);
  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}

// ── Child component ───────────────────────────────────────────────────────────

function genChildTsxCssModules(node: ComponentNode): string {
  const { name, element, props } = node;
  const kebab = toKebab(name);
  const lines: string[] = [];

  lines.push(`import styles from './${name}.module.css'`);
  lines.push('');
  lines.push(`interface ${name}Props {`);
  for (const prop of props) {
    const optional = prop.required ? '' : '?';
    lines.push(`  ${prop.name}${optional}: ${prop.type}`);
  }
  lines.push('}');
  lines.push('');

  const allProps = props.map((p) => p.name);
  if (allProps.length > 0) {
    lines.push(`export function ${name}({ ${allProps.join(', ')} }: ${name}Props) {`);
  } else {
    lines.push(`export function ${name}(_: ${name}Props) {`);
  }
  lines.push(`  return (`);
  lines.push(
    `    <${element} className={styles.${kebab.replace(/-/g, '_') || name.toLowerCase()}}>`,
  );
  lines.push(`      {/* TODO */}`);
  lines.push(`    </${element}>`);
  lines.push(`  )`);
  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}

function genChildTsxBem(node: ComponentNode, stylePlan?: StylePlan): string {
  const { name, element, props } = node;
  const kebab = toKebab(name);
  const lines: string[] = [];

  if (hasStyleRule(stylePlan, name)) {
    lines.push(`import './${name}.css'`);
    lines.push('');
  }

  lines.push(`interface ${name}Props {`);
  for (const prop of props) {
    const optional = prop.required ? '' : '?';
    lines.push(`  ${prop.name}${optional}: ${prop.type}`);
  }
  lines.push('}');
  lines.push('');

  const allProps = props.map((p) => p.name);
  if (allProps.length > 0) {
    lines.push(`export function ${name}({ ${allProps.join(', ')} }: ${name}Props) {`);
  } else {
    lines.push(`export function ${name}(_: ${name}Props) {`);
  }
  lines.push(`  return (`);
  lines.push(`    <${element} className="${kebab}">`);
  lines.push(`      {/* TODO */}`);
  lines.push(`    </${element}>`);
  lines.push(`  )`);
  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}

function genChildJsxCssModules(node: ComponentNode): string {
  const { name, element, props } = node;
  const kebab = toKebab(name);
  const lines: string[] = [];

  lines.push(`import styles from './${name}.module.css'`);
  lines.push('');

  const allProps = props.map((p) => p.name);
  if (allProps.length > 0) {
    lines.push(`export function ${name}({ ${allProps.join(', ')} }) {`);
  } else {
    lines.push(`export function ${name}() {`);
  }
  lines.push(`  return (`);
  lines.push(
    `    <${element} className={styles.${kebab.replace(/-/g, '_') || name.toLowerCase()}}>`,
  );
  lines.push(`      {/* TODO */}`);
  lines.push(`    </${element}>`);
  lines.push(`  )`);
  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}

function genChildJsxBem(node: ComponentNode, stylePlan?: StylePlan): string {
  const { name, element, props } = node;
  const kebab = toKebab(name);
  const lines: string[] = [];

  if (hasStyleRule(stylePlan, name)) {
    lines.push(`import './${name}.css'`);
    lines.push('');
  }

  const allProps = props.map((p) => p.name);
  if (allProps.length > 0) {
    lines.push(`export function ${name}({ ${allProps.join(', ')} }) {`);
  } else {
    lines.push(`export function ${name}() {`);
  }
  lines.push(`  return (`);
  lines.push(`    <${element} className="${kebab}">`);
  lines.push(`      {/* TODO */}`);
  lines.push(`    </${element}>`);
  lines.push(`  )`);
  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}

// ── index ─────────────────────────────────────────────────────────────────────

function genIndexTs(node: ComponentNode): string {
  const { name, discriminator } = node;
  const lines: string[] = [];
  lines.push(`export { ${name} } from './${name}'`);
  lines.push(`export type { ${name}Props } from './${name}'`);
  if (discriminator) {
    lines.push(`export type { ${discriminator.type} } from './types'`);
  }
  lines.push('');
  return lines.join('\n');
}

function genIndexJs(node: ComponentNode): string {
  const { name } = node;
  const lines: string[] = [];
  lines.push(`export { ${name} } from './${name}'`);
  lines.push('');
  return lines.join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateReact(config: SkeletonConfig): GeneratedFile[] {
  const { lang, style, rootComponent, stylePlan } = config;
  const isTs = lang === 'ts';
  const isCssModules = style === 'css-modules';
  const ext = isTs ? 'tsx' : 'jsx';
  const files: GeneratedFile[] = [];

  // Root component
  let rootContent: string;
  if (isTs && isCssModules) {
    rootContent = genRootTsxCssModules(rootComponent);
  } else if (isTs && !isCssModules) {
    rootContent = genRootTsxBem(rootComponent, stylePlan);
  } else if (!isTs && isCssModules) {
    rootContent = genRootJsxCssModules(rootComponent);
  } else {
    rootContent = genRootJsxBem(rootComponent, stylePlan);
  }
  files.push({ path: `${rootComponent.name}.${ext}`, content: rootContent });

  // Root CSS module
  if (isCssModules) {
    files.push({
      path: `${rootComponent.name}.module.css`,
      content: generateCssContent(rootComponent, stylePlan, { modules: true, root: true }),
    });
  } else if (hasStyleRule(stylePlan, rootComponent.name)) {
    files.push({
      path: `${rootComponent.name}.css`,
      content: generateCssContent(rootComponent, stylePlan, { modules: false, root: true }),
    });
  }

  // types.ts (TS only, when discriminator present)
  if (isTs && rootComponent.discriminator) {
    const typesContent = genTypesTs(rootComponent);
    files.push({ path: 'types.ts', content: typesContent });
  }

  // utils/cn
  const cnExt = isTs ? 'ts' : 'js';
  const cnContent = isTs ? genCnTs() : genCnJs();
  files.push({ path: `utils/cn.${cnExt}`, content: cnContent });

  // Child components
  for (const child of rootComponent.children) {
    let childContent: string;
    if (isTs && isCssModules) {
      childContent = genChildTsxCssModules(child);
    } else if (isTs && !isCssModules) {
      childContent = genChildTsxBem(child, stylePlan);
    } else if (!isTs && isCssModules) {
      childContent = genChildJsxCssModules(child);
    } else {
      childContent = genChildJsxBem(child, stylePlan);
    }
    files.push({ path: `components/${child.name}.${ext}`, content: childContent });

    if (isCssModules) {
      files.push({
        path: `components/${child.name}.module.css`,
        content: generateCssContent(child, stylePlan, { modules: true, root: false }),
      });
    } else if (hasStyleRule(stylePlan, child.name)) {
      files.push({
        path: `components/${child.name}.css`,
        content: generateCssContent(child, stylePlan, { modules: false, root: false }),
      });
    }
  }

  // index
  const indexExt = isTs ? 'ts' : 'js';
  const indexContent = isTs ? genIndexTs(rootComponent) : genIndexJs(rootComponent);
  files.push({ path: `index.${indexExt}`, content: indexContent });

  return files;
}
