import { describe, it, expect } from 'vitest';
import { ColorSchema, RectSchema } from '../schema.js';

describe('IR primitives', () => {
  it('parses a hex8 color', () => {
    expect(ColorSchema.parse('#FA5900FF')).toBe('#FA5900FF');
  });
  it('rejects malformed colors', () => {
    expect(() => ColorSchema.parse('FA5900')).toThrow();
  });
  it('parses a rect', () => {
    expect(RectSchema.parse({ x: 0, y: 0, width: 375, height: 1173 })).toEqual({
      x: 0, y: 0, width: 375, height: 1173,
    });
  });
});
