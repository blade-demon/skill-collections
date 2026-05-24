import { describe, expect, it } from 'vitest';
import type { VisualNode, Warning } from '@skill-collections/d2c-core';

import { normalizeSketchRaw } from '../normalize.js';
import {
  applyConstraint,
  applyConstraintAxis,
  decodeResizingConstraint,
  isResized,
} from '../normalize/symbol-scale.js';
import rawFixture from './fixtures/sketch-raw.min.json';

describe('decodeResizingConstraint', () => {
  it('decodes 63 as fully free (the default None)', () => {
    expect(decodeResizingConstraint(63)).toEqual({
      rightFree: true,
      widthFlex: true,
      leftFree: true,
      topFree: true,
      heightFlex: true,
      bottomFree: true,
    });
  });

  it('decodes 41 as left-pin + width-fix + height-fix ("帮你记" case)', () => {
    // 41 = 32 + 8 + 1 → bits 5, 3, 0 set
    expect(decodeResizingConstraint(41)).toEqual({
      rightFree: true, //  bit 0 set
      widthFlex: false, // bit 1 cleared → width fixed
      leftFree: false, //  bit 2 cleared → left pinned
      topFree: true, //   bit 3 set
      heightFlex: false, //bit 4 cleared → height fixed
      bottomFree: true, // bit 5 set
    });
  });

  it('treats undefined / non-number as default 63', () => {
    expect(decodeResizingConstraint(undefined)).toEqual(decodeResizingConstraint(63));
    expect(decodeResizingConstraint('63')).toEqual(decodeResizingConstraint(63));
  });
});

describe('applyConstraintAxis — 8 cases', () => {
  // All use parentOld=100, parentNew=200, start=10, size=20, tail=70.
  const ctx = { M: 100, I: 200, c: 10, s: 20 };

  it('pin+pin+flex stretches by ΔM', () => {
    expect(
      applyConstraintAxis(ctx.M, ctx.I, ctx.c, ctx.s, {
        startPin: true,
        endPin: true,
        sizeFixed: false,
      }),
    ).toEqual({ start: 10, size: 120 });
  });

  it('pin+pin+fix is over-constrained → startPin wins (keeps original)', () => {
    expect(
      applyConstraintAxis(ctx.M, ctx.I, ctx.c, ctx.s, {
        startPin: true,
        endPin: true,
        sizeFixed: true,
      }),
    ).toEqual({ start: 10, size: 20 });
  });

  it('pin+free+flex keeps start, scales size by ratio', () => {
    expect(
      applyConstraintAxis(ctx.M, ctx.I, ctx.c, ctx.s, {
        startPin: true,
        endPin: false,
        sizeFixed: false,
      }),
    ).toEqual({ start: 10, size: 40 });
  });

  it('pin+free+fix keeps start and size', () => {
    expect(
      applyConstraintAxis(ctx.M, ctx.I, ctx.c, ctx.s, {
        startPin: true,
        endPin: false,
        sizeFixed: true,
      }),
    ).toEqual({ start: 10, size: 20 });
  });

  it('free+pin+fix preserves tail margin, keeps size', () => {
    // tail=70; start' = 200 - 70 - 20 = 110
    expect(
      applyConstraintAxis(ctx.M, ctx.I, ctx.c, ctx.s, {
        startPin: false,
        endPin: true,
        sizeFixed: true,
      }),
    ).toEqual({ start: 110, size: 20 });
  });

  it('free+pin+flex scales size, preserves tail margin', () => {
    // newSize = 40; tail = 70; start' = 200 - 70 - 40 = 90
    expect(
      applyConstraintAxis(ctx.M, ctx.I, ctx.c, ctx.s, {
        startPin: false,
        endPin: true,
        sizeFixed: false,
      }),
    ).toEqual({ start: 90, size: 40 });
  });

  it('free+free+flex scales both proportionally (rc=63 default)', () => {
    expect(
      applyConstraintAxis(ctx.M, ctx.I, ctx.c, ctx.s, {
        startPin: false,
        endPin: false,
        sizeFixed: false,
      }),
    ).toEqual({ start: 20, size: 40 });
  });

  it('free+free+fix scales centre proportionally, keeps size (rc=45)', () => {
    // centre = 20; centre' = 40; start' = 40 - 10 = 30
    expect(
      applyConstraintAxis(ctx.M, ctx.I, ctx.c, ctx.s, {
        startPin: false,
        endPin: false,
        sizeFixed: true,
      }),
    ).toEqual({ start: 30, size: 20 });
  });

  it('returns inputs unchanged when parentOld ≤ 0', () => {
    expect(
      applyConstraintAxis(0, 200, 10, 20, { startPin: false, endPin: false, sizeFixed: false }),
    ).toEqual({ start: 10, size: 20 });
  });
});

describe('applyConstraint — combined per-axis decoding', () => {
  it('rc=63 scales the whole frame proportionally', () => {
    expect(
      applyConstraint(
        { width: 100, height: 100 },
        { width: 200, height: 50 },
        { x: 10, y: 20, width: 30, height: 40 },
        63,
      ),
    ).toEqual({ x: 20, y: 10, width: 60, height: 20 });
  });

  it('rc=41 left-pins + fixes size on X, centre-scales on Y', () => {
    // X: pin+free+fix → x'=10, w'=30
    // Y: free+free+fix → centre = 20+20=40; centre' = 40 * (50/100) = 20; y' = 20-20=0; h=40
    expect(
      applyConstraint(
        { width: 100, height: 100 },
        { width: 200, height: 50 },
        { x: 10, y: 20, width: 30, height: 40 },
        41,
      ),
    ).toEqual({ x: 10, y: 0, width: 30, height: 40 });
  });
});

describe('isResized', () => {
  it('returns false for identity', () => {
    expect(isResized({ width: 100, height: 50 }, { width: 100, height: 50 })).toBe(false);
  });
  it('returns true for any axis change', () => {
    expect(isResized({ width: 100, height: 50 }, { width: 100.5, height: 50 })).toBe(true);
  });
  it('returns false within float tolerance', () => {
    expect(isResized({ width: 100, height: 50 }, { width: 100 + 1e-9, height: 50 })).toBe(false);
  });
});

describe('normalizeSketchRaw — symbol-instance scale (real fixture)', () => {
  const findById = (node: VisualNode, id: string): VisualNode | undefined => {
    if (node.source.nodeId === id) return node;
    for (const c of node.children) {
      const f = findById(c, id);
      if (f) return f;
    }
    return undefined;
  };

  it('scales children of a uniformly resized icon instance (声音备份 5, 32→16, rc=63)', async () => {
    const ir = await normalizeSketchRaw(rawFixture);
    // icon/其他/声音备份 5: 32x32 master → 16x16 instance, uniform 0.5× scale.
    const icon = findById(ir.visual.root, '447591E0-4BC7-4870-8CCF-05E671E16D30');
    expect(icon?.layout.width).toBe(16);
    expect(icon?.layout.height).toBe(16);
    // Every descendant must fit inside the instance bounds (within float slack
    // and ignoring rotated/flipped descendants — those raise
    // unsupported-symbol-transform warnings).
    const oob: VisualNode[] = [];
    const walk = (n: VisualNode, w: number, h: number): void => {
      for (const c of n.children) {
        if (
          c.layout.x < -1 ||
          c.layout.y < -1 ||
          c.layout.x + c.layout.width > w + 1 ||
          c.layout.y + c.layout.height > h + 1
        ) {
          oob.push(c);
        }
        walk(c, c.layout.width, c.layout.height);
      }
    };
    walk(icon!, 16, 16);
    expect(oob).toEqual([]);
  });

  it('cascades through a nested symbol inside 底部功能推荐 (84→96, rc=41 + rc=63 child)', async () => {
    const ir = await normalizeSketchRaw(rawFixture);
    // outer instance: 84x32 master → 96x32 instance, scale 1.143×1.
    const outer = findById(ir.visual.root, '4DF0E89C-27CA-4CCF-8F9D-FD0A80AE0BB4');
    expect(outer?.layout.width).toBe(96);
    expect(outer?.layout.height).toBe(32);
    // Master root child "编组 16备份 2" is a group (0,0,84,32) rc=63 → fills the
    // new instance (0,0,96,32).
    const group = outer?.children[0];
    expect(group?.layout).toMatchObject({ x: 0, y: 0, width: 96, height: 32 });
    // "帮你记" text inside has rc=41 → left-pinned, width-fixed → x stays 34, w stays 36.
    const label = group?.children.find((c) => c.kind === 'text');
    expect(label?.layout.x).toBe(34);
    expect(label?.layout.width).toBe(36);
    // Nested AI星星 symbol instance — its X scales with the outer 1.143× ratio.
    const nested = group?.children.find((c) => Boolean(c.symbol));
    expect(nested).toBeDefined();
    if (nested) {
      // master child position 10, scale 1.143 → ~11.43 (allow float tolerance)
      expect(nested.layout.x).toBeCloseTo(10 * (96 / 84), 4);
      expect(nested.layout.width).toBeCloseTo(20 * (96 / 84), 4);
    }
  });

  it('emits unsupported-symbol-transform warnings for rotated/flipped descendants of resized instances', async () => {
    const ir = await normalizeSketchRaw(rawFixture);
    const warns = ir.warnings.filter((w: Warning) => w.code === 'unsupported-symbol-transform');
    // The fixture's resized subtrees include rotated/flipped layers; we should
    // see warnings rather than silent geometry drift.
    expect(warns.length).toBeGreaterThan(0);
  });

  it('determinism: same fixture normalises byte-identically with the new transform', async () => {
    const first = JSON.stringify(await normalizeSketchRaw(rawFixture), null, 2);
    const second = JSON.stringify(await normalizeSketchRaw(rawFixture), null, 2);
    expect(second).toBe(first);
  });
});
