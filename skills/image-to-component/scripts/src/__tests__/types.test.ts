import { describe, it, expect } from 'vitest'
import { BatchResultSchema, CoarseBatchResultSchema, CoverageEntrySchema, SkeletonConfigSchema } from '../types.js'

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
})
