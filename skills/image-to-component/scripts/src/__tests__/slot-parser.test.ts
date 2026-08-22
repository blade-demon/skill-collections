import { describe, it, expect } from 'vitest';
import { parseSlotExpr, validateSlotExpr } from '../lib/slot-parser.js';

describe('validateSlotExpr', () => {
  it('accepts "-"', () => {
    expect(validateSlotExpr('-')).toEqual({ valid: true });
  });

  it('accepts simple leaf: "nav"', () => {
    expect(validateSlotExpr('nav')).toEqual({ valid: true });
  });

  it('accepts sequence: "title -> meta"', () => {
    expect(validateSlotExpr('title -> meta')).toEqual({ valid: true });
  });

  it('accepts juxtaposition: "action + action"', () => {
    expect(validateSlotExpr('action + action')).toEqual({ valid: true });
  });

  it('accepts container: "card(media + title)"', () => {
    expect(validateSlotExpr('card(media + title)')).toEqual({ valid: true });
  });

  it('accepts nested container: "card(media + card(title -> meta) -> status)"', () => {
    expect(validateSlotExpr('card(media + card(title -> meta) -> status)')).toEqual({
      valid: true,
    });
  });

  it('accepts optional suffix: "title?"', () => {
    expect(validateSlotExpr('title?')).toEqual({ valid: true });
  });

  it('rejects unknown role word: "section(title)"', () => {
    const result = validateSlotExpr('section(title)');
    expect(result.valid).toBe(false);
  });

  it('rejects bare -> on right side of +: "nav + title -> meta"', () => {
    const result = validateSlotExpr('nav + title -> meta');
    expect(result.valid).toBe(false);
  });

  it('rejects leaf followed by (): "status(error)"', () => {
    const result = validateSlotExpr('status(error)');
    expect(result.valid).toBe(false);
  });

  it('rejects operators without spaces: "title->meta"', () => {
    const result = validateSlotExpr('title->meta');
    expect(result.valid).toBe(false);
  });

  it('rejects forbidden operator: "title | meta"', () => {
    const result = validateSlotExpr('title | meta');
    expect(result.valid).toBe(false);
  });
});

describe('parseSlotExpr', () => {
  it('parses missing slot into a missing node', () => {
    expect(parseSlotExpr('-')).toEqual({ valid: true, ast: { kind: 'missing' } });
  });

  it('parses nested sequence and row topology into AST', () => {
    expect(parseSlotExpr('card(media + card(title -> meta?) -> status)')).toEqual({
      valid: true,
      ast: {
        kind: 'sequence',
        rows: [
          {
            kind: 'row',
            atoms: [
              {
                kind: 'container',
                role: 'card',
                child: {
                  kind: 'sequence',
                  rows: [
                    {
                      kind: 'row',
                      atoms: [
                        { kind: 'leaf', role: 'media', uncertain: false },
                        {
                          kind: 'container',
                          role: 'card',
                          child: {
                            kind: 'sequence',
                            rows: [
                              {
                                kind: 'row',
                                atoms: [{ kind: 'leaf', role: 'title', uncertain: false }],
                              },
                              {
                                kind: 'row',
                                atoms: [{ kind: 'leaf', role: 'meta', uncertain: true }],
                              },
                            ],
                          },
                        },
                      ],
                    },
                    {
                      kind: 'row',
                      atoms: [{ kind: 'leaf', role: 'status', uncertain: false }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
  });

  it('returns the same syntax error through parse and validate APIs', () => {
    const parsed = parseSlotExpr('status(error)');
    const validated = validateSlotExpr('status(error)');
    expect(parsed.valid).toBe(false);
    expect(validated).toEqual(parsed.valid ? { valid: true } : parsed);
  });
});
