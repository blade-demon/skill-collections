import { describe, expect, it } from 'vitest';
import type { VisualNode, Warning } from '@skill-collections/d2c-core';

import { buildSymbolIndex } from '../normalize/symbols.js';
import { buildVisualBlock } from '../normalize/visual.js';
import { selectArtboard } from '../normalize/select-artboard.js';
import type { SketchNode } from '../normalize/sketch-nodes.js';
import type { SketchRawModel } from '../sketch-raw-model.js';
import rawFixture from './fixtures/sketch-raw.min.json';

const model = rawFixture.payload as SketchRawModel;

describe('buildVisualBlock', () => {
  it('normalizes the selected artboard into a v0.2 visual block', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });

    expect(visual.artboard).toEqual({ width: 375, height: 1173 });
    expect(visual.root.layout).toEqual({ x: 0, y: 0, width: 375, height: 1173 });
    expect(visual.root.source.originalType).toBe('artboard');
    expect(visual.root.children[0]?.source.nodeId).toBe('7969B30E-865F-4FFF-A96B-84A5CD6B9B44');
    expect(visual.assets.some((asset) => asset.kind === 'image')).toBe(true);
  });

  it('expands symbol instances and preserves symbol trace', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const statusBar = visual.root.children.find(
      (node) => node.source.nodeId === 'EE90FF21-9364-43AA-ABE9-86C546BA8629',
    );

    expect(statusBar?.symbol).toMatchObject({
      instanceId: 'EE90FF21-9364-43AA-ABE9-86C546BA8629',
      masterId: 'ED66BEC9-2CC6-4510-A066-27F44B3B070E',
    });
    expect(statusBar?.children.length).toBeGreaterThan(0);
  });

  it('reads per-corner radius from Sketch points[].cornerRadius (chat-bubble case)', () => {
    /* Sketch stores per-corner radius on each curvePoint, not in fixedRadius.
     * A chat-bubble rectangle typically has 3 rounded corners and 1 square
     * corner (where the tail sits). The previous extractor only read
     * fixedRadius=0 and emitted square boxes for every bubble. */
    const warnings: Warning[] = [];
    const bubble = {
      _class: 'rectangle',
      do_objectID: 'bubble-1',
      name: 'Bubble',
      frame: { _class: 'rect', x: 0, y: 0, width: 168, height: 48 },
      fixedRadius: 0,
      points: [
        { _class: 'curvePoint', cornerRadius: 21, point: '{0, 0}' },
        { _class: 'curvePoint', cornerRadius: 21, point: '{1, 0}' },
        { _class: 'curvePoint', cornerRadius: 0, point: '{1, 1}' },
        { _class: 'curvePoint', cornerRadius: 21, point: '{0, 1}' },
      ],
      style: { do_objectID: 'bubble-style' },
      layers: [],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'bubble-art',
      name: 'BubbleArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 100 },
      layers: [bubble],
    } as unknown as SketchNode;
    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    expect(visual.root.children[0]?.style?.radius).toEqual({
      topLeft: 21,
      topRight: 21,
      bottomRight: 0,
      bottomLeft: 21,
    });
  });

  it('reads per-corner radius regardless of points array order', () => {
    /* ShapePath edits and manual point manipulation can reorder the curvePoint
     * array so the canonical TL → TR → BR → BL convention no longer holds.
     * Each curvePoint still carries its `point: '{x, y}'` coord, so the
     * extractor should classify corners by coordinate, not by index. */
    const warnings: Warning[] = [];
    const bubble = {
      _class: 'rectangle',
      do_objectID: 'bubble-reversed',
      name: 'BubbleReversed',
      frame: { _class: 'rect', x: 0, y: 0, width: 168, height: 48 },
      fixedRadius: 0,
      // Same per-corner radii as the chat-bubble case but supplied in
      // reversed BL → BR → TR → TL order to defeat array-order lookup.
      points: [
        { _class: 'curvePoint', cornerRadius: 21, point: '{0, 1}' },
        { _class: 'curvePoint', cornerRadius: 0, point: '{1, 1}' },
        { _class: 'curvePoint', cornerRadius: 21, point: '{1, 0}' },
        { _class: 'curvePoint', cornerRadius: 21, point: '{0, 0}' },
      ],
      style: { do_objectID: 'bubble-reversed-style' },
      layers: [],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'bubble-reversed-art',
      name: 'BubbleReversedArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 100 },
      layers: [bubble],
    } as unknown as SketchNode;
    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    expect(visual.root.children[0]?.style?.radius).toEqual({
      topLeft: 21,
      topRight: 21,
      bottomRight: 0,
      bottomLeft: 21,
    });
    // Coordinate-based resolution should succeed without the fallback warning.
    expect(warnings.some((w) => w.code === 'radius-point-order-ambiguous')).toBe(false);
  });

  it('collapses per-corner radius to a single number when all four corners are equal', () => {
    const warnings: Warning[] = [];
    const card = {
      _class: 'rectangle',
      do_objectID: 'card-1',
      name: 'Card',
      frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 100 },
      fixedRadius: 0,
      points: [
        { _class: 'curvePoint', cornerRadius: 8, point: '{0, 0}' },
        { _class: 'curvePoint', cornerRadius: 8, point: '{1, 0}' },
        { _class: 'curvePoint', cornerRadius: 8, point: '{1, 1}' },
        { _class: 'curvePoint', cornerRadius: 8, point: '{0, 1}' },
      ],
      style: { do_objectID: 'card-style' },
      layers: [],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'card-art',
      name: 'CardArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 200 },
      layers: [card],
    } as unknown as SketchNode;
    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    expect(visual.root.children[0]?.style?.radius).toBe(8);
  });

  it('assigns a unique VisualNode.id to every node when the same symbol master appears twice (Stage 5A graph integrity)', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    // The desensitized fixture instantiates the StatusBar (and other masters)
    // multiple times. Without instance-scoped ids, each duplicated instance
    // would emit master-child ids verbatim and produce duplicates here, which
    // assertSemanticViewIntegrity rejects downstream as
    // `duplicate SemanticNode id`.
    const ids: string[] = [];
    const collect = (n: VisualNode): void => {
      ids.push(n.id);
      for (const c of n.children) collect(c);
    };
    collect(visual.root);
    const seen = new Set<string>();
    const dups = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(dups).toEqual([]);
  });

  it('captures a text layer fill as text colour, never as a box background', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    // 3D03EB9F… is a text layer that carries a layer-level style.fills in the
    // fixture — that fill is the text colour and must not survive as style.fills,
    // or preview/codegen would paint the text node as a solid block.
    const textNode = findBySourceNodeId(visual.root, '3D03EB9F-F0E4-4685-AE5B-88630BBF4E1A');

    expect(textNode?.kind).toBe('text');
    expect(textNode?.style?.fills).toBeUndefined();
    expect(textNode?.text?.style?.color).toBeDefined();
  });

  it('extracts line height and font weight, stripping the weight suffix to a base family', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    // 2E8552AF — PingFangSC-Semibold, fixed line height 14.
    const semibold = findBySourceNodeId(visual.root, '2E8552AF-6957-440D-B210-6DB461A5A230');
    expect(semibold?.text?.style).toMatchObject({
      fontFamily: 'PingFangSC',
      fontWeight: 600,
      lineHeight: 14,
    });
    // D166FABF — PingFangSC-Regular, line height 24.
    const regular = findBySourceNodeId(visual.root, 'D166FABF-63C5-4808-A96A-093647174CAB');
    expect(regular?.text?.style).toMatchObject({
      fontFamily: 'PingFangSC',
      fontWeight: 400,
      lineHeight: 24,
    });
  });

  it('maps Sketch DINAlternate PostScript names to the browser CSS family', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    // 0305E181 — price text "643.08", Sketch font name DINAlternate-Bold.
    // Browser CSS matches the installed macOS family as "DIN Alternate"; using
    // the compact PostScript prefix "DINAlternate" can fall back to a wider
    // font and make the price overlap the trailing "起" label.
    const price = findBySourceNodeId(visual.root, '0305E181-06EB-4560-9918-46C3CE832442');

    expect(price?.text?.style).toMatchObject({
      fontFamily: 'DIN Alternate',
      fontWeight: 700,
    });
  });

  it('leaves an unrecognised font name untouched and assigns no weight', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    // 4292B85E — plain "Helvetica", no known weight suffix.
    const helvetica = findBySourceNodeId(visual.root, '4292B85E-1BAD-4D6A-AFDB-267DCDE4F7C8');
    expect(helvetica?.text?.style?.fontFamily).toBe('Helvetica');
    expect(helvetica?.text?.style?.fontWeight).toBeUndefined();
  });

  it('skips clipping-mask layers and flags the parent for overflow:hidden', () => {
    /* Sketch clipping-mask siblings (hasClippingMask: true) are invisible in
     * Sketch — they define geometry for sibling clipping. Emitting them as
     * ordinary shapes paints a visible box over the clipped sibling. We skip
     * the mask and mark the parent's style.raw.maskedContent so preview/codegen
     * can approximate clipping via overflow:hidden. */
    const warnings: Warning[] = [];
    const mask = {
      _class: 'rectangle',
      do_objectID: 'mask-1',
      name: 'mask',
      hasClippingMask: true,
      frame: { _class: 'rect', x: 0, y: 0, width: 7, height: 21 },
      style: { do_objectID: 'mask-style' },
      layers: [],
    } as unknown as SketchNode;
    const tail = {
      _class: 'rectangle',
      do_objectID: 'tail-1',
      name: 'tail',
      frame: { _class: 'rect', x: -151, y: -27, width: 161, height: 48 },
      style: { do_objectID: 'tail-style' },
      layers: [],
    } as unknown as SketchNode;
    const group = {
      _class: 'group',
      do_objectID: 'group-1',
      name: 'TailGroup',
      frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 50 },
      layers: [mask, tail],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'mask-art',
      name: 'MaskArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 200 },
      layers: [group],
    } as unknown as SketchNode;
    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const groupNode = visual.root.children[0];
    expect(groupNode?.children).toHaveLength(1);
    expect(groupNode?.children[0]?.source.nodeId).toBe('tail-1');
    expect(groupNode?.style?.raw?.maskedContent).toBe(true);
    expect(warnings.some((w) => w.code === 'clipping-mask-skipped')).toBe(true);
  });

  it('preserves every gradient fill’s raw stops per-fill', () => {
    const warnings: Warning[] = [];
    const gradient = (gradientType: number) => ({
      _class: 'gradient',
      gradientType,
      from: '{0, 0}',
      to: '{1, 1}',
      stops: [
        { position: 0, color: { _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 } },
        { position: 1, color: { _class: 'color', red: 0, green: 0, blue: 1, alpha: 1 } },
      ],
    });
    const artboard = {
      _class: 'artboard',
      do_objectID: 'synthetic-artboard',
      name: 'Synthetic',
      frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 100 },
      layers: [
        {
          _class: 'rectangle',
          do_objectID: 'multi-gradient-rect',
          name: 'MultiGradient',
          frame: { _class: 'rect', x: 0, y: 0, width: 50, height: 50 },
          style: {
            fills: [
              {
                isEnabled: true,
                fillType: 1,
                color: { _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 },
                gradient: gradient(0),
              },
              {
                isEnabled: true,
                fillType: 1,
                color: { _class: 'color', red: 0, green: 0, blue: 1, alpha: 1 },
                gradient: gradient(1),
              },
            ],
          },
          layers: [],
        },
      ],
    } as unknown as SketchNode;

    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const fills = visual.root.children[0]?.style?.fills ?? [];

    expect(fills).toHaveLength(2);
    expect(fills.every((fill) => fill.type === 'gradient')).toBe(true);
    expect((fills[0]?.raw?.gradient as Record<string, unknown> | undefined)?.gradientType).toBe(0);
    expect((fills[1]?.raw?.gradient as Record<string, unknown> | undefined)?.gradientType).toBe(1);
    // each fill carries its own raw object — not a shared reference
    expect(fills[0]?.raw).not.toBe(fills[1]?.raw);
  });

  it('keeps a gradient fill on a text node but still drops solid-colour fills', () => {
    /* Pure-colour text fills are captured by text.style.color and must NOT
     * survive as style.fills (regression guard against the Gate-1 solid-block
     * defect). Gradient / image fills, however, cannot be expressed by a single
     * hex on text.style.color — they must round-trip through style.fills so
     * preview can render background-clip:text. See
     * docs/text-gradient-investigation.md. */
    const warnings: Warning[] = [];
    const linearGradient = {
      _class: 'gradient',
      gradientType: 0,
      from: '{0, 0}',
      to: '{1, 0}',
      stops: [
        { position: 0, color: { _class: 'color', red: 0, green: 0.4, blue: 1, alpha: 1 } },
        { position: 1, color: { _class: 'color', red: 0.6, green: 0, blue: 1, alpha: 1 } },
      ],
    };
    const gradientText = {
      _class: 'text',
      do_objectID: 'gradient-text-1',
      name: '推荐理由',
      frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 40 },
      attributedString: { string: '推荐理由：', attributes: [] },
      style: {
        fills: [
          {
            isEnabled: true,
            fillType: 1,
            color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
            gradient: linearGradient,
          },
        ],
      },
      layers: [],
    } as unknown as SketchNode;
    const solidText = {
      _class: 'text',
      do_objectID: 'solid-text-1',
      name: 'Solid',
      frame: { _class: 'rect', x: 0, y: 50, width: 200, height: 40 },
      attributedString: { string: 'Solid', attributes: [] },
      style: {
        fills: [
          {
            isEnabled: true,
            fillType: 0,
            color: { _class: 'color', red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
          },
        ],
      },
      layers: [],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'text-fill-art',
      name: 'TextFillArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 100 },
      layers: [gradientText, solidText],
    } as unknown as SketchNode;

    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });

    const [gradientNode, solidNode] = visual.root.children;
    expect(gradientNode?.kind).toBe('text');
    expect(gradientNode?.style?.fills).toHaveLength(1);
    expect(gradientNode?.style?.fills?.[0]?.type).toBe('gradient');
    expect(
      (gradientNode?.style?.fills?.[0]?.raw?.gradient as Record<string, unknown> | undefined)
        ?.gradientType,
    ).toBe(0);

    expect(solidNode?.kind).toBe('text');
    expect(solidNode?.style?.fills).toBeUndefined();
    expect(solidNode?.text?.style?.color).toBeDefined();
  });

  it('preserves enabled Sketch layer blur as a visual effect', () => {
    const warnings: Warning[] = [];
    const blurredGlow = {
      _class: 'rectangle',
      do_objectID: 'blurred-glow',
      name: 'Soft glow',
      frame: { _class: 'rect', x: 10, y: -20, width: 120, height: 160 },
      style: {
        fills: [
          {
            isEnabled: true,
            fillType: 0,
            color: { _class: 'color', red: 1, green: 0.99, blue: 0.98, alpha: 1 },
          },
        ],
        blur: {
          _class: 'blur',
          isEnabled: true,
          radius: 50,
          type: 0,
        },
      },
      layers: [],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'blur-art',
      name: 'BlurArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 200 },
      layers: [blurredGlow],
    } as unknown as SketchNode;

    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });

    expect(visual.root.children[0]?.style?.effects).toEqual([
      {
        type: 'layerBlur',
        blur: 50,
        raw: { sketchBlurType: 0 },
      },
    ]);
  });

  it('preserves shapePath bezier geometry as a normalized VectorPath', () => {
    /* shapePath curvePoints encode the outline in 0..1 of the layer frame, with
     * curveFrom/curveTo bezier control points gated by hasCurveFrom/To. We keep
     * this geometry so preview/codegen can render the real silhouette (icons,
     * stars, tails) instead of dropping shapePath shapes. */
    const warnings: Warning[] = [];
    const star = {
      _class: 'shapePath',
      do_objectID: 'star-1',
      name: 'Star',
      frame: { _class: 'rect', x: 0, y: 0, width: 20, height: 20 },
      isClosed: true,
      points: [
        { _class: 'curvePoint', point: '{0, 0}', hasCurveFrom: false, hasCurveTo: false },
        {
          _class: 'curvePoint',
          point: '{1, 0}',
          curveFrom: '{0.75, 0}',
          curveTo: '{0.9, 0}',
          hasCurveFrom: true,
          hasCurveTo: false,
        },
        {
          _class: 'curvePoint',
          point: '{0.5, 1}',
          curveTo: '{0.4, 0.8}',
          hasCurveFrom: false,
          hasCurveTo: true,
        },
      ],
      style: { do_objectID: 'star-style' },
      layers: [],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'star-art',
      name: 'StarArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 40, height: 40 },
      layers: [star],
    } as unknown as SketchNode;
    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const node = visual.root.children[0];

    expect(node?.vector?.closed).toBe(true);
    expect(node?.vector?.points).toEqual([
      { x: 0, y: 0 }, // straight anchor — no control points
      { x: 1, y: 0, curveFrom: { x: 0.75, y: 0 } }, // hasCurveFrom only (curveTo dropped)
      { x: 0.5, y: 1, curveTo: { x: 0.4, y: 0.8 } }, // hasCurveTo only
    ]);
  });

  it('does not attach vector geometry to non-shapePath shapes', () => {
    /* A rectangle also carries points[], but its outline is already covered by
     * box-model + radius, so we don't emit a VectorPath for it. */
    const warnings: Warning[] = [];
    const rect = {
      _class: 'rectangle',
      do_objectID: 'plain-rect',
      name: 'Plain',
      frame: { _class: 'rect', x: 0, y: 0, width: 30, height: 30 },
      points: [
        { _class: 'curvePoint', point: '{0, 0}' },
        { _class: 'curvePoint', point: '{1, 0}' },
        { _class: 'curvePoint', point: '{1, 1}' },
        { _class: 'curvePoint', point: '{0, 1}' },
      ],
      style: { do_objectID: 'plain-style' },
      layers: [],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'rect-art',
      name: 'RectArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 40, height: 40 },
      layers: [rect],
    } as unknown as SketchNode;
    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });

    expect(visual.root.children[0]?.vector).toBeUndefined();
  });
});

function findBySourceNodeId(node: VisualNode, nodeId: string): VisualNode | undefined {
  if (node.source.nodeId === nodeId) return node;
  for (const child of node.children) {
    const found = findBySourceNodeId(child, nodeId);
    if (found) return found;
  }
  return undefined;
}
