import { describe, it, expect } from 'vitest'
import { validateSlotExpr } from '../lib/slot-parser.js'

describe('validateSlotExpr', () => {
  it('accepts "-"', () => {
    expect(validateSlotExpr('-')).toEqual({ valid: true })
  })

  it('accepts simple leaf: "nav"', () => {
    expect(validateSlotExpr('nav')).toEqual({ valid: true })
  })

  it('accepts sequence: "title -> meta"', () => {
    expect(validateSlotExpr('title -> meta')).toEqual({ valid: true })
  })

  it('accepts juxtaposition: "action + action"', () => {
    expect(validateSlotExpr('action + action')).toEqual({ valid: true })
  })

  it('accepts container: "card(media + title)"', () => {
    expect(validateSlotExpr('card(media + title)')).toEqual({ valid: true })
  })

  it('accepts nested container: "card(media + card(title -> meta) -> status)"', () => {
    expect(validateSlotExpr('card(media + card(title -> meta) -> status)')).toEqual({ valid: true })
  })

  it('accepts optional suffix: "title?"', () => {
    expect(validateSlotExpr('title?')).toEqual({ valid: true })
  })

  it('rejects unknown role word: "section(title)"', () => {
    const result = validateSlotExpr('section(title)')
    expect(result.valid).toBe(false)
  })

  it('rejects bare -> on right side of +: "nav + title -> meta"', () => {
    const result = validateSlotExpr('nav + title -> meta')
    expect(result.valid).toBe(false)
  })

  it('rejects leaf followed by (): "status(error)"', () => {
    const result = validateSlotExpr('status(error)')
    expect(result.valid).toBe(false)
  })

  it('rejects operators without spaces: "title->meta"', () => {
    const result = validateSlotExpr('title->meta')
    expect(result.valid).toBe(false)
  })

  it('rejects forbidden operator: "title | meta"', () => {
    const result = validateSlotExpr('title | meta')
    expect(result.valid).toBe(false)
  })
})
