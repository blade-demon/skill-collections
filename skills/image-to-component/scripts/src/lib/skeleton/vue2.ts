import type { SkeletonConfig, ComponentNode, GeneratedFile } from '../../types.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toKebab(name: string): string {
  return name.replace(/([A-Z])/g, (_, c, i) => (i === 0 ? '' : '-') + c.toLowerCase())
}

// ── Root component ────────────────────────────────────────────────────────────

function genRootCssModules(node: ComponentNode): string {
  const { name, element, discriminator, props, children } = node

  const lines: string[] = []

  lines.push(`<script>`)
  lines.push(`export default {`)
  lines.push(`  name: '${name}',`)

  // props
  lines.push(`  props: {`)
  if (discriminator) {
    lines.push(`    ${discriminator.propName}: { type: String, required: true },`)
  }
  for (const prop of props) {
    const tsTypeToVue2 = (t: string): string => {
      if (t === 'string') return 'String'
      if (t === 'number') return 'Number'
      if (t === 'boolean') return 'Boolean'
      if (t.endsWith('[]') || t.startsWith('Array')) return 'Array'
      if (t === 'object' || t.startsWith('{')) return 'Object'
      return 'undefined'
    }
    const vueType = tsTypeToVue2(prop.type)
    if (vueType === 'undefined') {
      lines.push(`    ${prop.name}: { required: ${prop.required} },`)
    } else {
      lines.push(`    ${prop.name}: { type: ${vueType}, required: ${prop.required} },`)
    }
  }
  lines.push(`  },`)

  // components
  if (children.length > 0) {
    lines.push(`  components: {`)
    for (const child of children) {
      lines.push(`    ${child.name},`)
    }
    lines.push(`  },`)
  }

  lines.push(`}`)
  lines.push(`</script>`)
  lines.push('')

  // template
  lines.push(`<template>`)
  if (discriminator) {
    const { propName } = discriminator
    lines.push(`  <${element} :class="[$style.root, $style[${propName}]]">`)
  } else {
    lines.push(`  <${element} :class="[$style.root]">`)
  }
  for (const child of children) {
    lines.push(`    <${child.name} />`)
  }
  lines.push(`    <!-- TODO -->`)
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

function genRootBem(node: ComponentNode): string {
  const { name, element, discriminator, props, children } = node
  const kebab = toKebab(name)

  const lines: string[] = []

  lines.push(`<script>`)
  lines.push(`export default {`)
  lines.push(`  name: '${name}',`)

  // props
  lines.push(`  props: {`)
  if (discriminator) {
    lines.push(`    ${discriminator.propName}: { type: String, required: true },`)
  }
  for (const prop of props) {
    const tsTypeToVue2 = (t: string): string => {
      if (t === 'string') return 'String'
      if (t === 'number') return 'Number'
      if (t === 'boolean') return 'Boolean'
      if (t.endsWith('[]') || t.startsWith('Array')) return 'Array'
      if (t === 'object' || t.startsWith('{')) return 'Object'
      return 'undefined'
    }
    const vueType = tsTypeToVue2(prop.type)
    if (vueType === 'undefined') {
      lines.push(`    ${prop.name}: { required: ${prop.required} },`)
    } else {
      lines.push(`    ${prop.name}: { type: ${vueType}, required: ${prop.required} },`)
    }
  }
  lines.push(`  },`)

  // components
  if (children.length > 0) {
    lines.push(`  components: {`)
    for (const child of children) {
      lines.push(`    ${child.name},`)
    }
    lines.push(`  },`)
  }

  // computed
  lines.push(`  computed: {`)
  if (discriminator) {
    const { propName } = discriminator
    lines.push(`    rootClass() {`)
    lines.push(`      return \`${kebab} ${kebab}--\${this.${propName}}\``)
    lines.push(`    },`)
  } else {
    lines.push(`    rootClass() {`)
    lines.push(`      return '${kebab}'`)
    lines.push(`    },`)
  }
  lines.push(`  },`)

  lines.push(`}`)
  lines.push(`</script>`)
  lines.push('')

  // template
  lines.push(`<template>`)
  lines.push(`  <${element} :class="rootClass">`)
  for (const child of children) {
    lines.push(`    <${child.name} />`)
  }
  lines.push(`    <!-- TODO -->`)
  lines.push(`  </${element}>`)
  lines.push(`</template>`)
  lines.push('')

  return lines.join('\n')
}

// ── Child component ───────────────────────────────────────────────────────────

function genChildCssModules(node: ComponentNode): string {
  const { name, element, props } = node

  const lines: string[] = []

  lines.push(`<script>`)
  lines.push(`export default {`)
  lines.push(`  name: '${name}',`)
  if (props.length > 0) {
    lines.push(`  props: {`)
    for (const prop of props) {
      const tsTypeToVue2 = (t: string): string => {
        if (t === 'string') return 'String'
        if (t === 'number') return 'Number'
        if (t === 'boolean') return 'Boolean'
        if (t.endsWith('[]') || t.startsWith('Array')) return 'Array'
        if (t === 'object' || t.startsWith('{')) return 'Object'
        return 'undefined'
      }
      const vueType = tsTypeToVue2(prop.type)
      if (vueType === 'undefined') {
        lines.push(`    ${prop.name}: { required: ${prop.required} },`)
      } else {
        lines.push(`    ${prop.name}: { type: ${vueType}, required: ${prop.required} },`)
      }
    }
    lines.push(`  },`)
  }
  lines.push(`}`)
  lines.push(`</script>`)
  lines.push('')

  lines.push(`<template>`)
  lines.push(`  <${element} :class="[$style.root]">`)
  lines.push(`    <!-- TODO -->`)
  lines.push(`  </${element}>`)
  lines.push(`</template>`)
  lines.push('')

  lines.push(`<style module>`)
  lines.push(`.root {}`)
  lines.push(`</style>`)
  lines.push('')

  return lines.join('\n')
}

function genChildBem(node: ComponentNode): string {
  const { name, element, props } = node
  const kebab = toKebab(name)

  const lines: string[] = []

  lines.push(`<script>`)
  lines.push(`export default {`)
  lines.push(`  name: '${name}',`)
  if (props.length > 0) {
    lines.push(`  props: {`)
    for (const prop of props) {
      const tsTypeToVue2 = (t: string): string => {
        if (t === 'string') return 'String'
        if (t === 'number') return 'Number'
        if (t === 'boolean') return 'Boolean'
        if (t.endsWith('[]') || t.startsWith('Array')) return 'Array'
        if (t === 'object' || t.startsWith('{')) return 'Object'
        return 'undefined'
      }
      const vueType = tsTypeToVue2(prop.type)
      if (vueType === 'undefined') {
        lines.push(`    ${prop.name}: { required: ${prop.required} },`)
      } else {
        lines.push(`    ${prop.name}: { type: ${vueType}, required: ${prop.required} },`)
      }
    }
    lines.push(`  },`)
  }
  lines.push(`}`)
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

function genIndex(node: ComponentNode): string {
  const { name } = node
  const lines: string[] = []
  lines.push(`export { default as ${name} } from './${name}.vue'`)
  lines.push('')
  return lines.join('\n')
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateVue2(config: SkeletonConfig): GeneratedFile[] {
  const { style, rootComponent } = config
  // Vue 2 always uses plain JS options API (TS support is messy)
  const isCssModules = style === 'css-modules'
  const files: GeneratedFile[] = []

  // Root component
  const rootContent = isCssModules
    ? genRootCssModules(rootComponent)
    : genRootBem(rootComponent)
  files.push({ path: `${rootComponent.name}.vue`, content: rootContent })

  // Child components
  for (const child of rootComponent.children) {
    const childContent = isCssModules
      ? genChildCssModules(child)
      : genChildBem(child)
    files.push({ path: `components/${child.name}.vue`, content: childContent })
  }

  // index
  files.push({ path: 'index.js', content: genIndex(rootComponent) })

  return files
}
