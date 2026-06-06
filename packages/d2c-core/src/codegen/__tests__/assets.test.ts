import { describe, expect, it } from 'vitest';

import { assetSourceFileName } from '../../ir/asset-path';
import { resolveCodegenAssets } from '../assets';

describe('asset source-name parsing', () => {
  it('uses basename(originalPath ?? ref) for the extract source name', () => {
    expect(
      assetSourceFileName({
        id: 'asset-hero',
        kind: 'image',
        ref: 'fallback.png',
        originalPath: 'images/nested/hero.PNG',
      }),
    ).toBe('hero.PNG');
  });

  it('falls back to ref when originalPath is absent', () => {
    expect(
      assetSourceFileName({
        id: 'asset-icon',
        kind: 'image',
        ref: 'images/icon.svg',
      }),
    ).toBe('icon.svg');
  });
});

describe('resolveCodegenAssets', () => {
  it('deduplicates repeated assetRef values and ORs required', () => {
    const result = resolveCodegenAssets({
      plannedAssets: [
        {
          id: 'pa-1',
          semanticNodeId: 's-1',
          assetRef: 'asset-hero',
          usage: 'image',
          required: false,
        },
        {
          id: 'pa-2',
          semanticNodeId: 's-2',
          assetRef: 'asset-hero',
          usage: 'image',
          required: true,
        },
      ],
      visualAssets: [
        {
          id: 'asset-hero',
          kind: 'image',
          ref: 'images/hero.PNG',
          originalPath: 'images/hero.PNG',
        },
      ],
    });

    expect(result.assets).toEqual([
      {
        assetRef: 'asset-hero',
        sourceFileName: 'hero.PNG',
        outputPath: expect.stringMatching(/^src\/assets\/asset-[0-9a-f]{12}\.png$/),
        required: true,
      },
    ]);
    expect(result.outputPathBySemanticNodeId.get('s-1')).toBe(result.assets[0]!.outputPath);
    expect(result.outputPathBySemanticNodeId.get('s-2')).toBe(result.assets[0]!.outputPath);
    expect(result.warnings).toEqual([]);
  });

  it('is deterministic and sorted by outputPath across two distinct assets', () => {
    const input = {
      plannedAssets: [
        {
          id: 'pa-1',
          semanticNodeId: 's-1',
          assetRef: 'asset-b',
          usage: 'image' as const,
          required: true,
        },
        {
          id: 'pa-2',
          semanticNodeId: 's-2',
          assetRef: 'asset-a',
          usage: 'image' as const,
          required: true,
        },
      ],
      visualAssets: [
        { id: 'asset-a', kind: 'image' as const, ref: 'a.png', originalPath: 'a.png' },
        { id: 'asset-b', kind: 'image' as const, ref: 'b.png', originalPath: 'b.png' },
      ],
    };
    const first = resolveCodegenAssets(input);
    const second = resolveCodegenAssets(input);
    expect(first.assets).toEqual(second.assets);
    const paths = first.assets.map((a) => a.outputPath);
    expect([...paths].sort()).toEqual(paths);
  });

  it('rejects a required asset whose metadata or extension is missing', () => {
    expect(() =>
      resolveCodegenAssets({
        plannedAssets: [
          {
            id: 'pa-1',
            semanticNodeId: 's-1',
            assetRef: 'asset-missing',
            usage: 'image',
            required: true,
          },
        ],
        visualAssets: [],
      }),
    ).toThrow(/required asset.*asset-missing/i);
  });

  it('skips an optional unresolved asset with a warning and no lookup entry', () => {
    const result = resolveCodegenAssets({
      plannedAssets: [
        {
          id: 'pa-1',
          semanticNodeId: 's-1',
          assetRef: 'asset-missing',
          usage: 'image',
          required: false,
        },
      ],
      visualAssets: [],
    });
    expect(result.assets).toEqual([]);
    expect(result.outputPathBySemanticNodeId.has('s-1')).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });
});
