import { describe, expect, it } from 'vitest';

import { deriveVisualView } from '../derive-visual-view';
import { generatePreview } from '../generate-preview';
import { generateVisualReviewReport } from '../visual-review-report';
import { makeDesignIR } from './fixtures';

describe('generateVisualReviewReport', () => {
  it('summarizes artboard, node counts, placeholders, and warnings', () => {
    const derived = deriveVisualView(makeDesignIR());
    const preview = generatePreview(derived.visualView);
    const report = generateVisualReviewReport({
      visualView: derived.visualView,
      warnings: derived.warnings,
      placeholderAssets: preview.assets,
    });

    expect(report).toContain('# Visual Review Report');
    expect(report).toContain('320 x 240');
    expect(report).toContain('Total nodes: 5');
    expect(report).toContain('Text nodes: 1');
    expect(report).toContain('asset-hero');
    expect(report).toContain('Existing normalize warning');
    expect(report).toContain('unmapped-symbol-override');
  });
});
