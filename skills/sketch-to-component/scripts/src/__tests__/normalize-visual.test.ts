import { describe, expect, it } from 'vitest';
import type { VisualNode, Warning } from '@skill-collections/d2c-core';

import { buildSymbolIndex } from '../normalize/symbols.js';
import { buildVisualBlock } from '../normalize/visual.js';
import { selectArtboard } from '../normalize/select-artboard.js';
import type { SketchNode } from '../normalize/sketch-nodes.js';
import type { SketchRawModel } from '../sketch-raw-model.js';
import rawFixture from './fixtures/sketch-raw.min.json';

const model = rawFixture.payload as unknown as SketchRawModel;

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

  it('indexes foreign library symbols so their instances can expand', () => {
    const warnings: Warning[] = [];
    const foreignMaster = {
      _class: 'symbolMaster',
      do_objectID: 'foreign-master',
      name: 'ForeignClose',
      symbolID: 'foreign-close-symbol',
      frame: { _class: 'rect', x: 0, y: 0, width: 24, height: 24 },
      layers: [
        {
          _class: 'shapePath',
          do_objectID: 'foreign-close-path',
          name: 'ClosePath',
          frame: { _class: 'rect', x: 4, y: 4, width: 16, height: 16 },
          isClosed: false,
          points: [
            { _class: 'curvePoint', point: '{0, 0}' },
            { _class: 'curvePoint', point: '{1, 1}' },
          ],
          style: {
            fills: [
              {
                isEnabled: true,
                fillType: 0,
                color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
              },
            ],
          },
        },
      ],
    } as unknown as SketchNode;
    // Partial mock of FileFormat.ForeignSymbol — production ForeignSymbol
    // requires do_objectID/libraryID/sourceLibraryName/symbolPrivate/originalMaster
    // that the test does not exercise. Cast through `unknown` matches the
    // `asSketchRawModel` boundary convention.
    const foreignModel = {
      ...model,
      document: {
        ...model.document,
        foreignSymbols: [{ _class: 'MSImmutableForeignSymbol', symbolMaster: foreignMaster }],
      },
    } as unknown as SketchRawModel;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'foreign-art',
      name: 'ForeignArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 40, height: 40 },
      layers: [
        {
          _class: 'symbolInstance',
          do_objectID: 'foreign-close-instance',
          name: 'Close',
          symbolID: 'foreign-close-symbol',
          frame: { _class: 'rect', x: 8, y: 8, width: 24, height: 24 },
        },
      ],
    } as unknown as SketchNode;
    const visual = buildVisualBlock({
      model: foreignModel,
      artboard,
      symbols: buildSymbolIndex(foreignModel),
      warnings,
    });
    const closeIcon = findBySourceNodeId(visual.root, 'foreign-close-instance');

    expect(closeIcon?.symbol?.masterId).toBe('foreign-close-symbol');
    expect(closeIcon?.children.length).toBeGreaterThan(0);
    expect(
      warnings.some(
        (w) => w.code === 'missing-symbol-master' && w.sourceNodeId === 'foreign-close-instance',
      ),
    ).toBe(false);
  });

  it('applies nested symbol text and symbolID overrides while expanding masters', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const featureBar = findBySourceNodeId(visual.root, '3A23B2B2-08FB-43C5-9AE4-9EC1E6A2D132');

    expect(collectText(featureBar)).toEqual(['订机票', '订酒店', '一般公务用车', '报销']);
    expect(collectSymbolMasterIds(featureBar)).toEqual(
      expect.arrayContaining([
        '9FE2A3D6-6F0E-43EE-874E-6570409C9160',
        '29CF06C2-9422-4525-9A70-551A869E1FE4',
        'CD56CFDC-6180-4C8D-A97E-3DF6F8137D02',
        '2C2C1B59-FAC3-41CF-8A03-505BAD2511E9',
      ]),
    );
    expect(collectText(featureBar)).not.toEqual(
      expect.arrayContaining(['车险续保', '查保单', '叫代驾', '北大医生']),
    );
  });

  it('applies symbol color overrides to fill and border targets while expanding masters', () => {
    const warnings: Warning[] = [];
    const orange = {
      _class: 'color',
      red: 1,
      green: 0.619607843137255,
      blue: 0,
      alpha: 1,
    };
    const purple = {
      _class: 'color',
      red: 0.5,
      green: 0.25,
      blue: 1,
      alpha: 1,
    };
    const master = {
      _class: 'symbolMaster',
      do_objectID: 'paint-master',
      name: 'PaintedIcon',
      symbolID: 'painted-symbol',
      frame: { _class: 'rect', x: 0, y: 0, width: 24, height: 24 },
      layers: [
        {
          _class: 'group',
          do_objectID: 'tinted-group',
          name: 'TintedGroup',
          frame: { _class: 'rect', x: 0, y: 0, width: 24, height: 12 },
          layers: [
            {
              _class: 'rectangle',
              do_objectID: 'group-fill-target',
              name: 'GroupFillTarget',
              frame: { _class: 'rect', x: 0, y: 0, width: 24, height: 12 },
              style: {
                fills: [
                  {
                    isEnabled: true,
                    fillType: 0,
                    color: { _class: 'color', red: 0, green: 0.55, blue: 1, alpha: 1 },
                  },
                ],
              },
            },
          ],
        },
        {
          _class: 'shapePath',
          do_objectID: 'direct-fill-target',
          name: 'DirectFillTarget',
          frame: { _class: 'rect', x: 0, y: 12, width: 12, height: 12 },
          isClosed: true,
          points: [
            { _class: 'curvePoint', point: '{0, 0}' },
            { _class: 'curvePoint', point: '{1, 0}' },
            { _class: 'curvePoint', point: '{1, 1}' },
            { _class: 'curvePoint', point: '{0, 1}' },
          ],
          style: {
            fills: [
              {
                isEnabled: true,
                fillType: 0,
                color: { _class: 'color', red: 0, green: 0.55, blue: 1, alpha: 1 },
              },
            ],
          },
        },
        {
          _class: 'shapePath',
          do_objectID: 'border-target',
          name: 'BorderTarget',
          frame: { _class: 'rect', x: 12, y: 12, width: 12, height: 12 },
          isClosed: false,
          points: [
            { _class: 'curvePoint', point: '{0, 0}' },
            { _class: 'curvePoint', point: '{1, 1}' },
          ],
          style: {
            borders: [
              {
                isEnabled: true,
                fillType: 0,
                color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
                position: 1,
                thickness: 1,
              },
            ],
          },
        },
      ],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'paint-art',
      name: 'PaintArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 40, height: 40 },
      layers: [
        {
          _class: 'symbolInstance',
          do_objectID: 'paint-instance',
          name: 'PaintedIcon',
          symbolID: 'painted-symbol',
          frame: { _class: 'rect', x: 8, y: 8, width: 24, height: 24 },
          overrideValues: [
            {
              _class: 'overrideValue',
              value: orange,
              overrideName: 'tinted-group_fillColor',
            },
            {
              _class: 'overrideValue',
              value: orange,
              overrideName: 'direct-fill-target_color:fill-0',
            },
            {
              _class: 'overrideValue',
              value: purple,
              overrideName: 'border-target_color:border-0',
            },
          ],
        },
      ],
    } as unknown as SketchNode;

    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: { mastersBySymbolId: new Map([['painted-symbol', master]]) },
      warnings,
    });

    expect(findBySourceNodeId(visual.root, 'group-fill-target')?.style?.fills?.[0]?.color).toBe(
      '#FF9E00FF',
    );
    expect(findBySourceNodeId(visual.root, 'direct-fill-target')?.style?.fills?.[0]?.color).toBe(
      '#FF9E00FF',
    );
    expect(findBySourceNodeId(visual.root, 'border-target')?.style?.borders?.[0]?.color).toBe(
      '#8040FFFF',
    );
  });

  it('lets a nested indexed fill override win over an ancestor fillColor tint', () => {
    /* Regression: 父级 fillColor 通过子树传播时,后代上更具体的 color:fill-N
     * 必须在应用顺序上覆盖 tint。先前实现在父节点 normalize 末尾递归
     * 重写所有后代填充,直接清掉子节点已经写入的具体颜色。 */
    const warnings: Warning[] = [];
    const orange = { _class: 'color', red: 1, green: 0.619607843137255, blue: 0, alpha: 1 };
    const blue = { _class: 'color', red: 0, green: 0.4, blue: 1, alpha: 1 };
    const master = {
      _class: 'symbolMaster',
      do_objectID: 'specificity-master',
      name: 'SpecificityIcon',
      symbolID: 'specificity-symbol',
      frame: { _class: 'rect', x: 0, y: 0, width: 24, height: 24 },
      layers: [
        {
          _class: 'group',
          do_objectID: 'outer-group',
          name: 'OuterGroup',
          frame: { _class: 'rect', x: 0, y: 0, width: 24, height: 24 },
          layers: [
            {
              _class: 'rectangle',
              do_objectID: 'specific-child',
              name: 'SpecificChild',
              frame: { _class: 'rect', x: 0, y: 0, width: 24, height: 24 },
              style: {
                fills: [
                  {
                    isEnabled: true,
                    fillType: 0,
                    color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
                  },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'specificity-art',
      name: 'SpecificityArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 40, height: 40 },
      layers: [
        {
          _class: 'symbolInstance',
          do_objectID: 'specificity-instance',
          name: 'SpecificityIcon',
          symbolID: 'specificity-symbol',
          frame: { _class: 'rect', x: 8, y: 8, width: 24, height: 24 },
          overrideValues: [
            {
              _class: 'overrideValue',
              value: orange,
              overrideName: 'outer-group_fillColor',
            },
            {
              _class: 'overrideValue',
              value: blue,
              overrideName: 'outer-group/specific-child_color:fill-0',
            },
          ],
        },
      ],
    } as unknown as SketchNode;
    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: { mastersBySymbolId: new Map([['specificity-symbol', master]]) },
      warnings,
    });
    expect(findBySourceNodeId(visual.root, 'specific-child')?.style?.fills?.[0]?.color).toBe(
      '#0066FFFF',
    );
  });

  it('tints descendant text color when fillColor cascades through a group', () => {
    /* Sketch tint 同样影响文本颜色,后者存在 text.style.color。 */
    const warnings: Warning[] = [];
    const orange = { _class: 'color', red: 1, green: 0.619607843137255, blue: 0, alpha: 1 };
    const master = {
      _class: 'symbolMaster',
      do_objectID: 'tinted-text-master',
      name: 'TintedTextSymbol',
      symbolID: 'tinted-text-symbol',
      frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 32 },
      layers: [
        {
          _class: 'group',
          do_objectID: 'label-group',
          name: 'LabelGroup',
          frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 32 },
          layers: [
            {
              _class: 'text',
              do_objectID: 'label-text',
              name: 'LabelText',
              frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 32 },
              attributedString: {
                string: 'Hello',
                attributes: [
                  {
                    attributes: {
                      MSAttributedStringColorAttribute: {
                        _class: 'color',
                        red: 0,
                        green: 0,
                        blue: 0,
                        alpha: 1,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'tinted-text-art',
      name: 'TintedTextArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 120, height: 40 },
      layers: [
        {
          _class: 'symbolInstance',
          do_objectID: 'tinted-text-instance',
          name: 'TintedTextSymbol',
          symbolID: 'tinted-text-symbol',
          frame: { _class: 'rect', x: 10, y: 4, width: 100, height: 32 },
          overrideValues: [
            {
              _class: 'overrideValue',
              value: orange,
              overrideName: 'label-group_fillColor',
            },
          ],
        },
      ],
    } as unknown as SketchNode;
    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: { mastersBySymbolId: new Map([['tinted-text-symbol', master]]) },
      warnings,
    });
    expect(findBySourceNodeId(visual.root, 'label-text')?.text?.style?.color).toBe('#FF9E00FF');
  });

  it('applies color overrides targeting the symbol instance itself', () => {
    /* 零段 fillColor 直接落在 symbolInstance 节点:之前的实现仅在常规
     * normalizeNode 中调用 applyColorOverrides,instance 分支会静默丢弃。 */
    const warnings: Warning[] = [];
    const orange = { _class: 'color', red: 1, green: 0.619607843137255, blue: 0, alpha: 1 };
    const masterInner = {
      _class: 'symbolMaster',
      do_objectID: 'inner-master',
      name: 'InnerSymbol',
      symbolID: 'inner-symbol',
      frame: { _class: 'rect', x: 0, y: 0, width: 24, height: 24 },
      layers: [
        {
          _class: 'rectangle',
          do_objectID: 'inner-fill',
          name: 'InnerFill',
          frame: { _class: 'rect', x: 0, y: 0, width: 24, height: 24 },
          style: {
            fills: [
              {
                isEnabled: true,
                fillType: 0,
                color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
              },
            ],
          },
        },
      ],
    } as unknown as SketchNode;
    const masterOuter = {
      _class: 'symbolMaster',
      do_objectID: 'outer-master',
      name: 'OuterSymbol',
      symbolID: 'outer-symbol',
      frame: { _class: 'rect', x: 0, y: 0, width: 40, height: 40 },
      layers: [
        {
          _class: 'symbolInstance',
          do_objectID: 'inner-instance',
          name: 'InnerInstance',
          symbolID: 'inner-symbol',
          frame: { _class: 'rect', x: 8, y: 8, width: 24, height: 24 },
        },
      ],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'instance-tint-art',
      name: 'InstanceTintArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 60, height: 60 },
      layers: [
        {
          _class: 'symbolInstance',
          do_objectID: 'outer-instance',
          name: 'OuterInstance',
          symbolID: 'outer-symbol',
          frame: { _class: 'rect', x: 10, y: 10, width: 40, height: 40 },
          overrideValues: [
            {
              _class: 'overrideValue',
              value: orange,
              overrideName: 'inner-instance_fillColor',
            },
          ],
        },
      ],
    } as unknown as SketchNode;
    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: {
        mastersBySymbolId: new Map([
          ['inner-symbol', masterInner],
          ['outer-symbol', masterOuter],
        ]),
      },
      warnings,
    });
    // fillColor 沿 symbolInstance 进入其 master 展开的子树,
    // 子节点的 fill 被 tint 为橙色。
    expect(findBySourceNodeId(visual.root, 'inner-fill')?.style?.fills?.[0]?.color).toBe(
      '#FF9E00FF',
    );
  });

  it('preserves Sketch auto-width text behavior for overridden single-line labels', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const featureText = findTextByContent(visual.root, '一般公务用车');
    const promptText = findTextByContent(visual.root, '我的出差报销标准是什么');
    const featureChip = findBySourceNodeId(visual.root, 'E664F64D-C3A2-4C0A-BE78-A9D0904C909D');
    const trailingChip = findBySourceNodeId(visual.root, 'AC30CF44-3A16-43E0-A32A-75BF7CD1C3C7');

    expect(featureText?.text?.content).toBe('一般公务用车');
    expect(featureText?.source.nodeId).toBe('637D5F1B-C6FC-4DFC-B52B-A4F45DDC775F');
    expect(featureText?.style?.raw?.sketchTextBehaviour).toBe(0);
    expect(featureText?.layout.width).toBeGreaterThan(36);
    expect(featureChip?.layout.width).toBeGreaterThan(84);
    expect(trailingChip?.layout.x).toBeGreaterThan(288);
    expect(promptText?.text?.content).toBe('我的出差报销标准是什么');
    expect(promptText?.source.nodeId).toBe('E5B9C7D5-CFEA-415F-A74F-F4AACAFCAFCB');
    expect(promptText?.style?.raw?.sketchTextBehaviour).toBe(0);
    expect(promptText?.layout.width).toBeGreaterThan(98);
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

  it('skips styled rectangular clipping masks instead of rendering placeholder blocks', () => {
    const warnings: Warning[] = [];
    const mask = {
      _class: 'rectangle',
      do_objectID: 'styled-rect-mask',
      name: 'StyledMask',
      hasClippingMask: true,
      frame: { _class: 'rect', x: 0, y: 0, width: 20, height: 20 },
      style: {
        fills: [
          {
            isEnabled: true,
            fillType: 0,
            color: { _class: 'color', red: 0.8, green: 0.8, blue: 0.8, alpha: 1 },
          },
        ],
      },
      layers: [],
    } as unknown as SketchNode;
    const clipped = {
      _class: 'rectangle',
      do_objectID: 'clipped-content',
      name: 'ClippedContent',
      frame: { _class: 'rect', x: 0, y: 0, width: 20, height: 20 },
      style: { do_objectID: 'clipped-style' },
      layers: [],
    } as unknown as SketchNode;
    const group = {
      _class: 'group',
      do_objectID: 'styled-mask-group',
      name: 'StyledMaskGroup',
      frame: { _class: 'rect', x: 0, y: 0, width: 20, height: 20 },
      layers: [mask, clipped],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'styled-mask-art',
      name: 'StyledMaskArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 40, height: 40 },
      layers: [group],
    } as unknown as SketchNode;

    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });

    expect(visual.root.children[0]?.children.map((child) => child.source.nodeId)).toEqual([
      'clipped-content',
    ]);
    expect(warnings.some((w) => w.sourceNodeId === 'styled-rect-mask')).toBe(true);
  });

  it('preserves visible clipping-mask vector shapes used as icon artwork', () => {
    const warnings: Warning[] = [];
    const selected = selectArtboard(model);
    const visual = buildVisualBlock({
      model,
      artboard: selected.artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    // 43E42698... is the blue star path inside "icon/首页/星星".
    // Sketch also marks it as hasClippingMask so the highlight oval is clipped
    // into the star shape. Dropping every mask layer removes the icon's main
    // visible artwork and leaves only the highlight/blue dot fragments.
    const starMask = findBySourceNodeId(visual.root, '43E42698-AB02-4D5A-BAA3-96745255D63E');

    expect(starMask?.kind).toBe('shape');
    expect(starMask?.vector).toBeDefined();
    expect(starMask?.style?.fills?.[0]?.color).toBe('#0078FAFF');
    expect(
      warnings.some(
        (w) =>
          w.code === 'clipping-mask-skipped' &&
          w.sourceNodeId === '43E42698-AB02-4D5A-BAA3-96745255D63E',
      ),
    ).toBe(false);
  });

  it('collapses filled shapeGroups into compound SVG artwork instead of child boolean layers', () => {
    const warnings: Warning[] = [];
    const shapeGroup = {
      _class: 'shapeGroup',
      do_objectID: 'compound-group',
      name: 'Compound',
      frame: { _class: 'rect', x: 0, y: 0, width: 20, height: 20 },
      style: {
        fills: [
          {
            isEnabled: true,
            fillType: 0,
            color: { _class: 'color', red: 0, green: 0.5, blue: 1, alpha: 1 },
          },
        ],
      },
      layers: [
        {
          _class: 'shapePath',
          do_objectID: 'compound-red-child',
          name: 'BooleanChild',
          frame: { _class: 'rect', x: 0, y: 0, width: 20, height: 20 },
          isClosed: true,
          points: [
            { _class: 'curvePoint', point: '{0, 0}' },
            { _class: 'curvePoint', point: '{1, 0}' },
            { _class: 'curvePoint', point: '{1, 1}' },
            { _class: 'curvePoint', point: '{0, 1}' },
          ],
          style: {
            fills: [
              {
                isEnabled: true,
                fillType: 0,
                color: { _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 },
              },
            ],
          },
        },
      ],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'compound-art',
      name: 'CompoundArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 40, height: 40 },
      layers: [shapeGroup],
    } as unknown as SketchNode;

    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const node = visual.root.children[0];

    expect(node?.children).toHaveLength(0);
    expect(node?.style?.fills?.[0]?.color).toBe('#0080FFFF');
    expect(node?.style?.raw?.compoundSvgPath).toContain('M 0 0');
  });

  it('keeps compound shapeGroup child coordinates local and applies rectangle rotation', () => {
    const warnings: Warning[] = [];
    const shapeGroup = {
      _class: 'shapeGroup',
      do_objectID: 'plus-group',
      name: 'Plus',
      frame: { _class: 'rect', x: 10, y: 0, width: 6.5, height: 6.5 },
      style: {
        fills: [
          {
            isEnabled: true,
            fillType: 0,
            color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
          },
        ],
      },
      layers: [
        {
          _class: 'rectangle',
          do_objectID: 'vertical-plus-bar',
          name: 'Vertical',
          frame: { _class: 'rect', x: 2.5, y: 0, width: 1.5, height: 6.5 },
          rotation: 0,
        },
        {
          _class: 'rectangle',
          do_objectID: 'horizontal-plus-bar',
          name: 'Horizontal',
          frame: { _class: 'rect', x: 2.5, y: 0, width: 1.5, height: 6.5 },
          rotation: 90,
        },
      ],
    } as unknown as SketchNode;
    const artboard = {
      _class: 'artboard',
      do_objectID: 'plus-art',
      name: 'PlusArt',
      frame: { _class: 'rect', x: 0, y: 0, width: 40, height: 40 },
      layers: [shapeGroup],
    } as unknown as SketchNode;

    const visual = buildVisualBlock({
      model,
      artboard,
      symbols: buildSymbolIndex(model),
      warnings,
    });
    const path = `${visual.root.children[0]?.style?.raw?.compoundSvgPath ?? ''}`;

    expect(path).not.toContain('-');
    expect(path).toContain('M 2.5 0');
    expect(path).toContain('L 0 2.5');
    expect(path).toContain('M 6.5 2.5');
    expect(visual.root.children[0]?.style?.raw?.compoundFillRule).toBeUndefined();
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

function collectText(node: VisualNode | undefined): string[] {
  if (!node) return [];
  const out: string[] = [];
  const walk = (current: VisualNode): void => {
    if (current.text?.content) out.push(current.text.content);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return out;
}

function collectSymbolMasterIds(node: VisualNode | undefined): string[] {
  if (!node) return [];
  const out: string[] = [];
  const walk = (current: VisualNode): void => {
    if (current.symbol?.masterId) out.push(current.symbol.masterId);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return out;
}

function findTextByContent(node: VisualNode, content: string): VisualNode | undefined {
  if (node.text?.content === content) return node;
  for (const child of node.children) {
    const found = findTextByContent(child, content);
    if (found) return found;
  }
  return undefined;
}
