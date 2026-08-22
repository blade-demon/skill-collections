import { describe, expect, it } from 'vitest';
import type { ImageResult, SignatureObject } from '../types.js';
import { compareSignatures } from '../lib/structural-comparison.js';
import { caseA, caseB, caseC, caseD, caseE } from './fixtures/structural-comparison-cases.js';

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

describe('compareSignatures collection rules', () => {
  it.each([
    ['A', caseA, 'same-component'],
    ['B', caseB, 'different-components'],
    ['C', caseC, 'same-component'],
    ['D', caseD, 'same-component'],
    ['E', caseE, 'different-components'],
  ] as const)('matches golden Case %s', (_name, batch, expected) => {
    expect(compareSignatures(batch.images).decision).toBe(expected);
  });

  it('compares all pairs in stable input order', () => {
    const result = compareSignatures(caseA.images);
    expect(result.pairs.map(({ left, right }) => [left, right])).toEqual([
      ['pending.png', 'used.png'],
      ['pending.png', 'expired.png'],
      ['used.png', 'expired.png'],
    ]);
  });

  it('keeps the Case C modal outside base identity', () => {
    const result = compareSignatures(caseC.images);
    expect(result.decision).toBe('same-component');
    expect(result.overlayGroups).toEqual([
      {
        overlayType: 'modal',
        files: ['confirm-modal.png'],
        skeletons: [
          {
            filename: 'confirm-modal.png',
            skeleton: 'card(_ -> _ -> _ + _)',
          },
        ],
      },
    ]);
  });

  it('requires manual review for four-image mixed additions and replacements', () => {
    const images = [
      image('a.png', { M: 'card(title)', B: 'hint -> action' }),
      image('b.png', { M: 'card(title -> status)', B: 'hint -> action' }),
      image('c.png', { M: 'card(title)', B: 'meta' }),
      image('d.png', { M: 'card(title -> status)', B: 'meta' }),
    ];
    const result = compareSignatures(images);
    expect(result.decision).toBe('manual-review');
    expect(result.reasonCodes).toContain('manual-mixed-large-set');
  });

  it('keeps four images automatic when they repeat one explained change kind', () => {
    const images = [
      image('a.png', { M: 'card(title)' }),
      image('b.png', { M: 'card(title -> status)' }),
      image('c.png', { M: 'card(title -> meta)' }),
      image('d.png', { M: 'card(title -> hint)' }),
    ];
    const result = compareSignatures(images);
    expect(result.decision).toBe('same-component');
    expect(result.reasonCodes).not.toContain('manual-mixed-large-set');
  });

  it('groups matching overlay types and separates different overlay types', () => {
    const images: ImageResult[] = [
      image('base.png', { M: 'card(title)' }),
      {
        ...image('modal.png', { M: 'card(title)', O: 'card(title -> action)' }),
        notes: { overlay_type: 'modal' },
      },
      {
        ...image('drawer.png', { M: 'card(title)', O: 'card(title -> action)' }),
        notes: { overlay_type: 'drawer' },
      },
      {
        ...image('modal-2.png', { M: 'card(title)', O: 'card(title -> action)' }),
        notes: { overlay_type: 'modal' },
      },
    ];
    const result = compareSignatures(images);
    expect(result.overlayGroups.map(({ overlayType, files }) => ({ overlayType, files }))).toEqual([
      { overlayType: 'modal', files: ['modal.png', 'modal-2.png'] },
      { overlayType: 'drawer', files: ['drawer.png'] },
    ]);
  });

  it('promotes one different pair to the overall decision', () => {
    const result = compareSignatures([
      image('small.png', { T: 'title', M: 'meta', B: 'action + hint' }),
      image('medium.png', { T: 'title -> meta', M: 'media -> status', B: 'action + hint' }),
      image('large.png', {
        T: 'title -> meta -> brand',
        M: 'media -> status -> hint',
        B: 'action -> hint -> status',
      }),
    ]);
    expect(result.pairs).toHaveLength(3);
    const differentPairs = result.pairs.filter((pair) => pair.decision === 'different-components');
    expect(differentPairs).toHaveLength(1);
    expect(differentPairs.map(({ left, right }) => [left, right])).toEqual([
      ['small.png', 'large.png'],
    ]);
    expect(result.decision).toBe('different-components');
  });
});
