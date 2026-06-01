import { describe, expect, it } from 'vitest';

import {
  INVALID_CLASS_SENTINEL,
  INVALID_ID_SENTINEL,
  MISSING_CLASS_SENTINEL,
  MISSING_ID_SENTINEL,
  asAnyLayer,
  getLayerClass,
  getLayerId,
  isCorruptClass,
  isArtboard,
  isGroup,
  isSymbolInstance,
  isSymbolMaster,
  isText,
} from '../normalize/sketch-types.js';

describe('asAnyLayer', () => {
  it('returns the object for a plain object input', () => {
    const node = { _class: 'rectangle', do_objectID: 'abc' };
    expect(asAnyLayer(node)).toBe(node);
  });

  it('returns undefined for null, primitives, and arrays', () => {
    expect(asAnyLayer(null)).toBeUndefined();
    expect(asAnyLayer(undefined)).toBeUndefined();
    expect(asAnyLayer(42)).toBeUndefined();
    expect(asAnyLayer('hello')).toBeUndefined();
    expect(asAnyLayer([1, 2, 3])).toBeUndefined();
  });

  it('does not require _class to be present', () => {
    // Boundary entry must accept "layer-shaped" objects even when _class
    // is absent — getLayerClass then surfaces the missing-class sentinel.
    expect(asAnyLayer({ foo: 'bar' })).toEqual({ foo: 'bar' });
  });
});

describe('getLayerClass', () => {
  it('returns the real _class string when present', () => {
    expect(getLayerClass({ _class: 'symbolInstance' })).toBe('symbolInstance');
  });

  it('preserves unknown _class strings unchanged (no sentinel substitution)', () => {
    // Sketch ships new node types from time to time. We must NOT collapse
    // "new but real" classes into a sentinel — downstream code emits
    // unknown-node-class warnings with the actual string.
    expect(getLayerClass({ _class: 'someBrandNewSketchClass' })).toBe('someBrandNewSketchClass');
  });

  it('returns MISSING_CLASS_SENTINEL when _class is absent', () => {
    expect(getLayerClass({ do_objectID: 'x' })).toBe(MISSING_CLASS_SENTINEL);
  });

  it('returns MISSING_CLASS_SENTINEL for non-object inputs', () => {
    expect(getLayerClass(null)).toBe(MISSING_CLASS_SENTINEL);
    expect(getLayerClass(42)).toBe(MISSING_CLASS_SENTINEL);
    expect(getLayerClass([{ _class: 'rectangle' }])).toBe(MISSING_CLASS_SENTINEL);
  });

  it('returns INVALID_CLASS_SENTINEL when _class is not a string', () => {
    expect(getLayerClass({ _class: 42 })).toBe(INVALID_CLASS_SENTINEL);
    expect(getLayerClass({ _class: null })).toBe(INVALID_CLASS_SENTINEL);
    expect(getLayerClass({ _class: {} })).toBe(INVALID_CLASS_SENTINEL);
  });

  it('isCorruptClass distinguishes the two corrupt cases from unknown-but-real', () => {
    expect(isCorruptClass(MISSING_CLASS_SENTINEL)).toBe(true);
    expect(isCorruptClass(INVALID_CLASS_SENTINEL)).toBe(true);
    expect(isCorruptClass('someBrandNewSketchClass')).toBe(false);
    expect(isCorruptClass('symbolInstance')).toBe(false);
  });
});

describe('getLayerId', () => {
  it('returns the real do_objectID when present and non-empty', () => {
    expect(getLayerId({ do_objectID: 'AB12CD34' })).toBe('AB12CD34');
  });

  it('returns MISSING_ID_SENTINEL when the field is absent', () => {
    expect(getLayerId({ _class: 'rectangle' })).toBe(MISSING_ID_SENTINEL);
  });

  it('returns MISSING_ID_SENTINEL for non-object inputs', () => {
    expect(getLayerId(null)).toBe(MISSING_ID_SENTINEL);
    expect(getLayerId('id')).toBe(MISSING_ID_SENTINEL);
  });

  it('returns INVALID_ID_SENTINEL for non-string or empty-string id', () => {
    expect(getLayerId({ do_objectID: '' })).toBe(INVALID_ID_SENTINEL);
    expect(getLayerId({ do_objectID: 42 })).toBe(INVALID_ID_SENTINEL);
    expect(getLayerId({ do_objectID: null })).toBe(INVALID_ID_SENTINEL);
  });
});

describe('type guards', () => {
  it('narrow to the matching FileFormat union member based on _class', () => {
    // We exercise the runtime predicate; the type-narrowing side is
    // checked by the typecheck step elsewhere.
    const cases: Array<[string, (l: { _class?: string }) => boolean]> = [
      ['symbolMaster', isSymbolMaster],
      ['symbolInstance', isSymbolInstance],
      ['artboard', isArtboard],
      ['group', isGroup],
      ['text', isText],
    ];
    for (const [klass, guard] of cases) {
      expect(guard({ _class: klass })).toBe(true);
    }
  });

  it('reject unknown _class strings (do not silently widen to true)', () => {
    expect(isSymbolInstance({ _class: 'someBrandNewSketchClass' })).toBe(false);
    expect(isArtboard({ _class: 'page' })).toBe(false);
    expect(isText({ _class: 'shapePath' })).toBe(false);
  });

  it('reject objects with missing or non-string _class', () => {
    expect(isSymbolInstance({})).toBe(false);
    expect(isText({ _class: 42 as unknown as string })).toBe(false);
  });
});
