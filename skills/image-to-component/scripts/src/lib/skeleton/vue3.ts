import type { SkeletonConfig, ComponentNode, GeneratedFile } from '../../types.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toKebab(name: string): string {
  return name.replace(/([A-Z])/g, (_, c, i) => (i === 0 ? '' : '-') + c.toLowerCase())
}

// ── types.ts ──────────────────────────────────────────────────────────────────

function genTypesTs(node: ComponentNode): string {
  if (!node.discriminator) return ''
  const { type, variants } = node.discriminator
  const union = variants.map(v => `'${v}'`).join(' | ')
  return `export type ${type} = ${union}\n`
}

// ── Root component ────────────────────────────────────────────────────────────

function genRootTsCssModules(node: ComponentNode): string {
  const { name, element, discriminator, props, children } = node

  const lines: string[] = []

  // script setup
  const scriptImports: string[] = []
  if (discriminator) {
    scriptImports.push(`import { computed, useCssModule } from 'vue'`)
    scriptImports.push(`import type { ${discriminator.type} } from './types'`)
  } else {
    scriptImports.push(`import { useCssModule } from 'vue'`)
  }
  for (const child of children) {
    scriptImports.push(`import ${child.name} from './components/${child.name}.vue'`)
  }

  lines.push(`<script setup lang="ts">`)
  for (const imp of scriptImports) {
    lines.push(imp)
  }
  lines.push('')

  // defineProps
  lines.push(`const props = defineProps<{`)
  if (discriminator) {
    lines.push(`  ${discriminator.propName}: ${discriminator.type}`)
  }
  for (const prop of props) {
    const optional = prop.required ? '' : '?'
    lines.push(`  ${prop.name}${optional}: ${prop.type}`)
  }
  lines.push(`}>()`)
  lines.push('')

  // useCssModule + computed discriminator class
  lines.push(`const styles = useCssModule()`)
  if (discriminator) {
    const { propName, variants } = discriminator
    lines.push(`const ${toKebab(propName).replace(/-/g, '_')}Class = computed(() => ({`)
    for (const variant of variants) {
      lines.push(`  ${variant}: styles.${variant},`)
    }
    lines.push(`})[props.${propName}])`)
  }
  lines.push(`</script>`)
  lines.push('')

  // template
  lines.push(`<template>`)
  if (discriminator) {
    const classVar = `${toKebab(discriminator.propName).replace(/-/g, '_')}Class`
    lines.push(`  <${element} :class="[styles.root, ${classVar}]">`)
  } else {
    lines.push(`  <${element} :class="styles.root">`)
  }
  for (const child of children) {
    lines.push(`    <${child.name} />`)
  }
  lines.push(`  </${element}>`)
  lines.push(`</template>`)
  lines.push('')

  // style module
  lines.push(`<style module>`)
  lines.push(`.root {}`)
  if (discriminator) {
    for (const variant of discriminator.variants) {
      lines.push(`.${variant} {}`)
    }
  }
  lines.push(`</style>`)
  lines.push('')

  return lines.join('\n')
}

function genRootTsBem(node: ComponentNode): string {
  const { name, element, discriminator, props, children } = node
  const kebab = toKebab(name)

  const lines: string[] = []

  lines.push(`<script setup lang="ts">`)
  if (discriminator) {
    lines.push(`import type { ${discriminator.type} } from './types'`)
    lines.push('')
  }
  for (const child of children) {
    lines.push(`import ${child.name} from './components/${child.name}.vue'`)
  }
  if (children.length > 0) lines.push('')

  // defineProps
  lines.push(`const props = defineProps<{`)
  if (discriminator) {
    lines.push(`  ${discriminator.propName}: ${discriminator.type}`)
  }
  for (const prop of props) {
    const optional = prop.required ? '' : '?'
    lines.push(`  ${prop.name}${optional}: ${prop.type}`)
  }
  lines.push(`}>()`)
  lines.push(`</script>`)
  lines.push('')

  // template
  lines.push(`<template>`)
  if (discriminator) {
    const { propName } = discriminator
    lines.push(`  <${element} :class="\`${kebab} ${kebab}--\${props.${propName}}\`">`)
  } else {
    lines.push(`  <${element} class="${kebab}">`)
  }
  for (const child of children) {
    lines.push(`    <${child.name} />`)
  }
  lines.push(`  </${element}>`)
  lines.push(`</template>`)
  lines.push('')

  return lines.join('\n')
}

function genRootJsCssModules(node: ComponentNode): string {
  const { name, element, discriminator, props, children } = node

  const lines: string[] = []

  lines.push(`<script setup>`)
  if (discriminator) {
    lines.push(`import { computed, useCssModule } from 'vue'`)
  } else {
    lines.push(`import { useCssModule } from 'vue'`)
  }
  for (const child of children) {
    lines.push(`import ${child.name} from './components/${child.name}.vue'`)
  }
  lines.push('')

  // defineProps
  const allPropNames = [
    ...(discriminator ? [discriminator.propName] : []),
    ...props.map(p => p.name),
  ]
  lines.push(`const props = defineProps([${allPropNames.map(p => `'${p}'`).join(', ')}])`)
  lines.push('')

  lines.push(`const styles = useCssModule()`)
  if (discriminator) {
    const { propName, variants } = discriminator
    const classVar = `${toKebab(propName).replace(/-/g, '_')}Class`
    lines.push(`const ${classVar} = computed(() => ({`)
    for (const variant of variants) {
      lines.push(`  ${variant}: styles.${variant},`)
    }
    lines.push(`})[props.${propName}])`)
  }
  lines.push(`</script>`)
  lines.push('')

  // template
  lines.push(`<template>`)
  if (discriminator) {
    const classVar = `${toKebab(discriminator.propName).replace(/-/g, '_')}Class`
    lines.push(`  <${element} :class="[styles.root, ${classVar}]">`)
  } else {
    lines.push(`  <${element} :class="styles.root">`)
  }
  for (const child of children) {
    lines.push(`    <${child.name} />`)
  }
  lines.push(`  </${element}>`)
  lines.push(`</template>`)
  lines.push('')

  // style module
  lines.push(`<style module>`)
  lines.push(`.root {}`)
  if (discriminator) {
    for (const variant of discriminator.variants) {
      lines.push(`.${variant} {}`)
    }
  }
  lines.push(`</style>`)
  lines.push('')

  return lines.join('\n')
}

function genRootJsBem(node: ComponentNode): string {
  const { name, element, discriminator, props, children } = node
  const kebab = toKebab(name)

  const lines: string[] = []

  lines.push(`<script setup>`)
  for (const child of children) {
    lines.push(`import ${child.name} from './components/${child.name}.vue'`)
  }
  if (children.length > 0) lines.push('')

  const allPropNames = [
    ...(discriminator ? [discriminator.propName] : []),
    ...props.map(p => p.name),
  ]
  lines.push(`const props = defineProps([${allPropNames.map(p => `'${p}'`).join(', ')}])`)
  lines.push(`</script>`)
  lines.push('')

  // template
  lines.push(`<template>`)
  if (discriminator) {
    const { propName } = discriminator
    lines.push(`  <${element} :class="\`${kebab} ${kebab}--\${props.${propName}}\`">`)
  } else {
    lines.push(`  <${element} class="${kebab}">`)
  }
  for (const child of children) {
    lines.push(`    <${child.name} />`)
  }
  lines.push(`  </${element}>`)
  lines.push(`</template>`)
  lines.push('')

  return lines.join('\n')
}

// ── Child component ───────────────────────────────────────────────────────────

function genChildTsCssModules(node: ComponentNode): string {
  const { name, element, props } = node
  const kebab = toKebab(name)
  const lines: string[] = []

  lines.push(`<script setup lang="ts">`)
  lines.push(`import { useCssModule } from 'vue'`)
  lines.push('')
  if (props.length > 0) {
    lines.push(`defineProps<{`)
    for (const prop of props) {
      const optional = prop.required ? '' : '?'
      lines.push(`  ${prop.name}${optional}: ${prop.type}`)
    }
    lines.push(`}>()`)
    lines.push('')
  }
  lines.push(`const styles = useCssModule()`)
  lines.push(`</script>`)
  lines.push('')
  lines.push(`<template>`)
  lines.push(`  <${element} :class="styles.${toKebab(name).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) || name.toLowerCase()}">`)
  lines.push(`    <!-- TODO -->`)
  lines.push(`  </${element}>`)
  lines.push(`</template>`)
  lines.push('')
  lines.push(`<style module>`)
  lines.push(`.${kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) || name.toLowerCase()} {}`)
  lines.push(`</style>`)
  lines.push('')

  return lines.join('\n')
}

function genChildTsBem(node: ComponentNode): string {
  const { name, element, props } = node
  const kebab = toKebab(name)
  const lines: string[] = []

  lines.push(`<script setup lang="ts">`)
  if (props.length > 0) {
    lines.push(`defineProps<{`)
    for (const prop of props) {
      const optional = prop.required ? '' : '?'
      lines.push(`  ${prop.name}${optional}: ${prop.type}`)
    }
    lines.push(`}>()`)
  }
  lines.push(`</script>`)
  lines.push('')
  lines.push(`<template>`)
  lines.push(`  <${element} class="${kebab}">`)
  lines.push(`    <!-- TODO -->`)
  lines.push(`  </${element}>`)
  lines.push(`</template>`)
  lines.push('')

  return lines.join('\n')
}

function genChildJsCssModules(node: ComponentNode): string {
  const { name, element, props } = node
  const kebab = toKebab(name)
  const camel = kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  const lines: string[] = []

  lines.push(`<script setup>`)
  lines.push(`import { useCssModule } from 'vue'`)
  lines.push('')
  if (props.length > 0) {
    const propNames = props.map(p => `'${p.name}'`).join(', ')
    lines.push(`defineProps([${propNames}])`)
    lines.push('')
  }
  lines.push(`const styles = useCssModule()`)
  lines.push(`</script>`)
  lines.push('')
  lines.push(`<template>`)
  lines.push(`  <${element} :class="styles.${camel || name.toLowerCase()}">`)
  lines.push(`    <!-- TODO -->`)
  lines.push(`  </${element}>`)
  lines.push(`</template>`)
  lines.push('')
  lines.push(`<style module>`)
  lines.push(`.${camel || name.toLowerCase()} {}`)
  lines.push(`</style>`)
  lines.push('')

  return lines.join('\n')
}

function genChildJsBem(node: ComponentNode): string {
  const { name, element, props } = node
  const kebab = toKebab(name)
  const lines: string[] = []

  lines.push(`<script setup>`)
  if (props.length > 0) {
    const propNames = props.map(p => `'${p.name}'`).join(', ')
    lines.push(`defineProps([${propNames}])`)
  }
  lines.push(`</script>`)
  lines.push('')
  lines.push(`<template>`)
  lines.push(`  <${element} class="${kebab}">`)
  lines.push(`    <!-- TODO -->`)
  lines.push(`  </${element}>`)
  lines.push(`</template>`)
  lines.push('')

  return lines.join('\n')
}

// ── index ─────────────────────────────────────────────────────────────────────

function genIndexTs(node: ComponentNode): string {
  const { name, discriminator } = node
  const lines: string[] = []
  lines.push(`export { default as ${name} } from './${name}.vue'`)
  if (discriminator) {
    lines.push(`export type { ${discriminator.type} } from './types'`)
  }
  lines.push('')
  return lines.join('\n')
}

function genIndexJs(node: ComponentNode): string {
  const { name } = node
  const lines: string[] = []
  lines.push(`export { default as ${name} } from './${name}.vue'`)
  lines.push('')
  return lines.join('\n')
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateVue3(config: SkeletonConfig): GeneratedFile[] {
  const { lang, style, rootComponent } = config
  const isTs = lang === 'ts'
  const isCssModules = style === 'css-modules'
  const files: GeneratedFile[] = []

  // Root component
  let rootContent: string
  if (isTs && isCssModules) {
    rootContent = genRootTsCssModules(rootComponent)
  } else if (isTs && !isCssModules) {
    rootContent = genRootTsBem(rootComponent)
  } else if (!isTs && isCssModules) {
    rootContent = genRootJsCssModules(rootComponent)
  } else {
    rootContent = genRootJsBem(rootComponent)
  }
  files.push({ path: `${rootComponent.name}.vue`, content: rootContent })

  // types.ts (TS only, when discriminator present)
  if (isTs && rootComponent.discriminator) {
    const typesContent = genTypesTs(rootComponent)
    files.push({ path: 'types.ts', content: typesContent })
  }

  // Child components
  for (const child of rootComponent.children) {
    let childContent: string
    if (isTs && isCssModules) {
      childContent = genChildTsCssModules(child)
    } else if (isTs && !isCssModules) {
      childContent = genChildTsBem(child)
    } else if (!isTs && isCssModules) {
      childContent = genChildJsCssModules(child)
    } else {
      childContent = genChildJsBem(child)
    }
    files.push({ path: `components/${child.name}.vue`, content: childContent })
  }

  // index
  const indexExt = isTs ? 'ts' : 'js'
  const indexContent = isTs ? genIndexTs(rootComponent) : genIndexJs(rootComponent)
  files.push({ path: `index.${indexExt}`, content: indexContent })

  return files
}
