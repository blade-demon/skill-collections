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

  it('writes style plan declarations into CSS module files', () => {
    const styledConfig: SkeletonConfig = {
      ...baseConfig,
      stylePlan: {
        rules: [
          {
            component: 'RiskPage',
            declarations: [
              { property: 'display', value: 'grid', source: 'inferred' },
              { property: 'gap', value: 'var(--space-md)', source: 'token-ledger', comment: 'Confirmed spacing token' },
            ],
            variants: [
              {
                name: 'high',
                declarations: [
                  { property: 'box-shadow', value: 'var(--shadow-card)', source: 'token-ledger' },
                ],
              },
            ],
          },
          {
            component: 'Header',
            declarations: [
              { property: 'padding', value: 'var(--space-sm)', source: 'token-ledger' },
            ],
          },
        ],
      },
    }
    const styledFiles = generateReact(styledConfig)

    const rootCss = styledFiles.find(f => f.path === 'RiskPage.module.css')
    const headerCss = styledFiles.find(f => f.path === 'components/Header.module.css')

    expect(rootCss!.content).toContain('.root {')
    expect(rootCss!.content).toContain('display: grid;')
    expect(rootCss!.content).toContain('gap: var(--space-md); /* Confirmed spacing token */')
    expect(rootCss!.content).toContain('.high {')
    expect(rootCss!.content).toContain('box-shadow: var(--shadow-card);')
    expect(headerCss!.content).toContain('.header {')
    expect(headerCss!.content).toContain('padding: var(--space-sm);')
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

  it('generates and imports BEM CSS files from style plan declarations', () => {
    const styledConfig: SkeletonConfig = {
      ...baseConfig,
      style: 'bem',
      stylePlan: {
        rules: [
          {
            component: 'RiskPage',
            declarations: [
              { property: 'display', value: 'flex', source: 'inferred' },
            ],
          },
          {
            component: 'ActionBar',
            declarations: [
              { property: 'justify-content', value: 'flex-end', source: 'inferred' },
            ],
          },
        ],
      },
    }
    const styledFiles = generateReact(styledConfig)
    const root = styledFiles.find(f => f.path === 'RiskPage.tsx')
    const action = styledFiles.find(f => f.path === 'components/ActionBar.tsx')
    const rootCss = styledFiles.find(f => f.path === 'RiskPage.css')
    const actionCss = styledFiles.find(f => f.path === 'components/ActionBar.css')

    expect(root!.content).toContain("import './RiskPage.css'")
    expect(action!.content).toContain("import './ActionBar.css'")
    expect(rootCss!.content).toContain('.risk-page {')
    expect(rootCss!.content).toContain('display: flex;')
    expect(actionCss!.content).toContain('.action-bar {')
    expect(actionCss!.content).toContain('justify-content: flex-end;')
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
