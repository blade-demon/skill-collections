import { describe, it, expect } from 'vitest'
import { generateReact } from '../lib/skeleton/react.js'
import type { SkeletonConfig } from '../types.js'

const baseConfig: SkeletonConfig = {
  framework: 'react',
  lang: 'ts',
  style: 'css-modules',
  rootComponent: {
    name: 'RiskPage',
    element: 'article',
    discriminator: { propName: 'riskLevel', type: 'RiskLevel', variants: ['low', 'medium', 'high'] },
    props: [
      { name: 'title', type: 'string', required: true },
      { name: 'onConfirm', type: '() => void', required: false },
    ],
    children: [
      { name: 'Header', element: 'header', props: [{ name: 'title', type: 'string', required: true }], children: [] },
      { name: 'ActionBar', element: 'footer', props: [], children: [] },
    ],
  },
}

describe('generateReact TSX CSS Modules', () => {
  const files = generateReact(baseConfig)

  it('produces a root component file', () => {
    const root = files.find(f => f.path === 'RiskPage.tsx')
    expect(root).toBeDefined()
    expect(root!.content).toContain("import styles from './RiskPage.module.css'")
    expect(root!.content).toContain('export interface RiskPageProps')
    expect(root!.content).toContain('riskLevel: RiskLevel')
    expect(root!.content).toContain('RISK_LEVEL_CLASS')
    expect(root!.content).toContain('<Header')
    expect(root!.content).toContain('<ActionBar')
  })

  it('produces types.ts with discriminator union', () => {
    const types = files.find(f => f.path === 'types.ts')
    expect(types).toBeDefined()
    expect(types!.content).toContain("export type RiskLevel = 'low' | 'medium' | 'high'")
  })

  it('produces utils/cn.ts', () => {
    const cn = files.find(f => f.path === 'utils/cn.ts')
    expect(cn).toBeDefined()
    expect(cn!.content).toContain('export function cn(')
  })

  it('produces child component files', () => {
    expect(files.find(f => f.path === 'components/Header.tsx')).toBeDefined()
    expect(files.find(f => f.path === 'components/ActionBar.tsx')).toBeDefined()
  })

  it('produces module CSS files', () => {
    expect(files.find(f => f.path === 'RiskPage.module.css')).toBeDefined()
    expect(files.find(f => f.path === 'components/Header.module.css')).toBeDefined()
  })

  it('produces index.ts with re-exports', () => {
    const index = files.find(f => f.path === 'index.ts')
    expect(index).toBeDefined()
    expect(index!.content).toContain('RiskPage')
  })
})

describe('generateReact JSX CSS Modules', () => {
  const jsConfig: SkeletonConfig = { ...baseConfig, lang: 'js' }
  const files = generateReact(jsConfig)

  it('produces .jsx root file', () => {
    expect(files.find(f => f.path === 'RiskPage.jsx')).toBeDefined()
  })

  it('root file has no TypeScript interface or type annotations', () => {
    const root = files.find(f => f.path === 'RiskPage.jsx')
    expect(root!.content).not.toContain('interface ')
    expect(root!.content).not.toContain(': RiskLevel')
  })

  it('does not produce types.ts', () => {
    expect(files.find(f => f.path === 'types.ts')).toBeUndefined()
  })
})

describe('generateReact TSX BEM', () => {
  const bemConfig: SkeletonConfig = { ...baseConfig, style: 'bem' }
  const files = generateReact(bemConfig)

  it('does not produce module CSS files', () => {
    expect(files.find(f => f.path.endsWith('.module.css'))).toBeUndefined()
  })

  it('uses BEM class names in root', () => {
    const root = files.find(f => f.path === 'RiskPage.tsx')
    expect(root!.content).toContain('risk-page')
  })
})

describe('generateReact JSX BEM', () => {
  const jssBemConfig: SkeletonConfig = { ...baseConfig, lang: 'js', style: 'bem' }
  const files = generateReact(jssBemConfig)

  it('produces .jsx root file with BEM classes', () => {
    const root = files.find(f => f.path === 'RiskPage.jsx')
    expect(root).toBeDefined()
    expect(root!.content).toContain('risk-page')
    expect(root!.content).not.toContain('interface ')
  })
})
