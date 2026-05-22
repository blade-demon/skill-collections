import { describe, it, expect } from 'vitest'
import { BatchResultSchema, CoarseBatchResultSchema, SkeletonConfigSchema } from '../types.js'

describe('BatchResultSchema', () => {
  it('accepts a valid minimal batch result', () => {
    const input = {
      batch: 'batch-1',
      images: [
        {
          filename: 'screen.png',
          signature: { T: 'nav', M: 'list(card)', B: 'action', O: '-', F: '-' },
          notes: { overlay_type: null, float_anchor: null },
        },
      ],
    }
    expect(() => BatchResultSchema.parse(input)).not.toThrow()
  })

  it('rejects when batch field is missing', () => {
    expect(() => BatchResultSchema.parse({ images: [] })).toThrow()
  })
})

describe('CoarseBatchResultSchema', () => {
  it('accepts valid coarse batch', () => {
    const input = {
      batch: 'batch-1',
      images: [
        {
          filename: 'a.png',
          coarse_signature: { T: ['nav'], M: ['card'], B: ['action'] },
          needs_full_signature: true,
          reason: 'slot contains nested container',
        },
      ],
    }
    expect(() => CoarseBatchResultSchema.parse(input)).not.toThrow()
  })
})

describe('SkeletonConfigSchema', () => {
  it('accepts a minimal react config', () => {
    const input = {
      framework: 'react',
      lang: 'ts',
      style: 'css-modules',
      rootComponent: {
        name: 'MyPage',
        element: 'article',
        props: [],
        children: [],
      },
    }
    expect(() => SkeletonConfigSchema.parse(input)).not.toThrow()
  })

  it('accepts a style plan for generated CSS declarations', () => {
    const input = {
      framework: 'react',
      lang: 'ts',
      style: 'bem',
      rootComponent: {
        name: 'MyPage',
        props: [],
        children: [],
      },
      stylePlan: {
        rules: [
          {
            component: 'MyPage',
            declarations: [
              { property: 'display', value: 'flex', source: 'inferred' },
              { property: '--card-gap', value: 'var(--space-md)', source: 'token' },
              { property: '-webkit-line-clamp', value: '2', source: 'hardcoded' },
              { property: 'gap', value: 'var(--space-md)', source: 'token-ledger', comment: 'Confirmed in token-ledger.md' },
            ],
            variants: [
              {
                name: 'high-risk',
                declarations: [{ property: 'box-shadow', value: 'var(--shadow-card)', source: 'provided' }],
              },
            ],
          },
        ],
      },
    }

    const parsed = SkeletonConfigSchema.parse(input)
    const rule = parsed.stylePlan?.rules[0]
    expect(rule).toBeDefined()
    expect(rule!.declarations).toHaveLength(4)
    expect(rule!.variants).toHaveLength(1)
  })

  it('rejects unsafe style plan variant names', () => {
    const input = {
      framework: 'react',
      lang: 'ts',
      style: 'bem',
      rootComponent: {
        name: 'MyPage',
        props: [],
        children: [],
      },
      stylePlan: {
        rules: [
          {
            component: 'MyPage',
            declarations: [],
            variants: [
              {
                name: 'high risk',
                declarations: [{ property: 'display', value: 'grid', source: 'inferred' }],
              },
            ],
          },
        ],
      },
    }

    expect(() => SkeletonConfigSchema.parse(input)).toThrow()
  })
})
