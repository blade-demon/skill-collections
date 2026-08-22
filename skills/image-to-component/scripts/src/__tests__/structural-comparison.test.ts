import { describe, expect, it } from 'vitest';
import type { ImageResult, SignatureObject } from '../types.js';
import { compareSignatures } from '../lib/structural-comparison.js';

const image = (filename: string, signature: Partial<SignatureObject>): ImageResult => ({
  filename,
  signature: { T: '-', M: '-', B: '-', O: '-', F: '-', ...signature },
  notes: {},
});

describe('compareSignatures pair rules', () => {
  it('treats one added leaf inside the same container topology as a state variant', () => {
    const result = compareSignatures([
      image('idle.png', { M: 'form(form -> action)' }),
      image('error.png', { M: 'form(form -> hint -> action)' }),
    ]);

    expect(result.decision).toBe('same-component');
    expect(result.pairs[0]?.reasonCodes).toContain('leaf-added');
  });

  it('treats leaf-only slot replacement as a state variant', () => {
    const result = compareSignatures([
      image('pending.png', {
        T: 'title',
        M: 'card(meta)',
        B: 'hint -> action + hint',
      }),
      image('used.png', { T: 'title', M: 'card(meta)', B: 'meta' }),
    ]);

    expect(result.decision).toBe('same-component');
    expect(result.pairs[0]?.reasonCodes).toContain('whole-slot-replaced');
  });

  it('treats a container topology change as different components', () => {
    const result = compareSignatures([
      image('list.png', { M: 'list(card(title -> meta))' }),
      image('detail.png', { M: 'title -> meta -> media' }),
    ]);

    expect(result.decision).toBe('different-components');
    expect(result.pairs[0]?.reasonCodes).toContain('container-topology-changed');
  });

  it('keeps F slot changes out of component identity', () => {
    const result = compareSignatures([
      image('base.png', { M: 'card(title)' }),
      image('floating.png', { M: 'card(title)', F: 'action' }),
    ]);

    expect(result.decision).toBe('same-component');
    expect(result.pairs[0]?.reasonCodes).toContain('floating-variant');
  });
});

describe('compareSignatures role and uncertainty boundaries', () => {
  it('does not trip the role threshold at exactly one half', () => {
    const result = compareSignatures([
      image('small.png', { T: 'title', M: 'meta' }),
      image('large.png', { T: 'title -> meta', M: 'media -> status' }),
    ]);

    expect(result.pairs[0]?.reasonCodes).not.toContain('role-count-threshold-exceeded');
  });

  it('trips the role threshold below one half', () => {
    const result = compareSignatures([
      image('small.png', { T: 'title' }),
      image('large.png', { T: 'title -> meta', M: 'media -> status' }),
    ]);

    expect(result.decision).toBe('different-components');
    expect(result.pairs[0]?.reasonCodes).toContain('role-count-threshold-exceeded');
  });

  it('classifies only the question-mark change as uncertain leaf state', () => {
    const result = compareSignatures([
      image('known.png', { M: 'card(title -> meta)' }),
      image('uncertain.png', { M: 'card(title -> meta?)' }),
    ]);

    expect(result.decision).toBe('same-component');
    expect(result.pairs[0]?.reasonCodes).toContain('uncertain-leaf');
  });
});

describe('compareSignatures task boundary', () => {
  it('requires exactly two image signatures during the pair-comparison phase', () => {
    expect(() => compareSignatures([image('only.png', { M: 'card(title)' })])).toThrow(
      'compareSignatures requires exactly two images',
    );
    expect(() =>
      compareSignatures([
        image('first.png', { M: 'card(title)' }),
        image('second.png', { M: 'card(title)' }),
        image('third.png', { M: 'card(title)' }),
      ]),
    ).toThrow('compareSignatures requires exactly two images');
  });
});
