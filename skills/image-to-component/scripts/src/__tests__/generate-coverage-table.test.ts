import { describe, it, expect } from 'vitest'
import { generateCoverageTable } from '../generate-coverage-table.js'

describe('generateCoverageTable', () => {
  it('produces a markdown table with header and separator', () => {
    const result = generateCoverageTable({ entries: [] })
    expect(result).toContain('| Signature path | Covering file(s) | Component(s) | Status |')
    expect(result).toContain('|---|---|---|---|')
  })

  it('includes covered entries', () => {
    const result = generateCoverageTable({
      entries: [
        { signaturePath: 'T', files: ['Header.tsx'], components: ['Header'], status: 'covered' },
      ],
    })
    expect(result).toContain('| T | Header.tsx | Header | covered |')
  })

  it('formats multiple files with commas', () => {
    const result = generateCoverageTable({
      entries: [
        { signaturePath: 'M.card', files: ['A.tsx', 'B.tsx'], components: ['A', 'B'], status: 'reused' },
      ],
    })
    expect(result).toContain('A.tsx, B.tsx')
    expect(result).toContain('A, B')
  })

  it('appends note for pending entries', () => {
    const result = generateCoverageTable({
      entries: [
        { signaturePath: 'O.modal', files: [], components: [], status: 'pending', note: 'out of scope for this sprint' },
      ],
    })
    expect(result).toContain('O.modal')
    expect(result).toContain('pending')
    expect(result).toContain('out of scope for this sprint')
  })

  it('outputs entries in input order', () => {
    const result = generateCoverageTable({
      entries: [
        { signaturePath: 'T', files: ['H.tsx'], components: ['H'], status: 'covered' },
        { signaturePath: 'B', files: ['F.tsx'], components: ['F'], status: 'covered' },
      ],
    })
    const tIdx = result.indexOf('| T |')
    const bIdx = result.indexOf('| B |')
    expect(tIdx).toBeLessThan(bIdx)
  })
})
