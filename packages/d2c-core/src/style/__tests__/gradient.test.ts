import { describe, expect, it } from 'vitest';

import type { Fill } from '../../ir';
import { linearGradientCss } from '../gradient';

function makeGradientFill(overrides: Record<string, unknown> = {}): Fill {
  return {
    type: 'gradient',
    raw: {
      gradient: {
        gradientType: 0,
        from: '{0, 0}',
        to: '{0, 1}',
        stops: [
          {
            position: 0,
            color: { alpha: 1, red: 1, green: 0, blue: 0 },
          },
          {
            position: 1,
            color: { alpha: 1, red: 0, green: 0, blue: 1 },
          },
        ],
        ...overrides,
      },
    },
  };
}

describe('linearGradientCss', () => {
  it('renders a vertical two-stop linear gradient', () => {
    expect(linearGradientCss(makeGradientFill())).toBe(
      'linear-gradient(180deg, #FF0000FF 0%, #0000FFFF 100%)',
    );
  });

  it('sorts stops by numeric position', () => {
    const fill = makeGradientFill({
      stops: [
        {
          position: 1,
          color: { alpha: 1, red: 0, green: 0, blue: 1 },
        },
        {
          position: 0,
          color: { alpha: 1, red: 1, green: 0, blue: 0 },
        },
      ],
    });

    expect(linearGradientCss(fill)).toBe('linear-gradient(180deg, #FF0000FF 0%, #0000FFFF 100%)');
  });

  it('returns undefined for radial gradients', () => {
    expect(linearGradientCss(makeGradientFill({ gradientType: 1 }))).toBeUndefined();
  });

  it.each([
    ['missing raw data', { type: 'gradient' } satisfies Fill],
    ['malformed raw data', { type: 'gradient', raw: { gradient: 'invalid' } } satisfies Fill],
    ['empty stops', makeGradientFill({ stops: [] })],
    ['coincident endpoints', makeGradientFill({ from: '{0.5, 0.5}', to: '{0.5, 0.5}' })],
  ])('returns undefined for %s', (_name, fill) => {
    expect(linearGradientCss(fill)).toBeUndefined();
  });
});
