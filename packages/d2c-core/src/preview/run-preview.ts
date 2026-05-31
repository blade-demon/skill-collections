import type { DesignIR, VisualView } from '../ir';
import { deriveVisualView } from './derive-visual-view';
import {
  generatePreview,
  type GeneratePreviewOptions,
  type PreviewAsset,
} from './generate-preview';
import { generateVisualReviewReport } from './visual-review-report';

export interface RunPreviewResult {
  visualView: VisualView;
  visualViewJson: string;
  html: string;
  css: string;
  report: string;
  assets: PreviewAsset[];
  requiresApproval: 'gate-1';
  stats: {
    overrideApplied: number;
    overrideUnmapped: number;
    overrideUnsupported: number;
    placeholderAssets: number;
    realAssets: number;
  };
}

export function runPreview(
  designIr: DesignIR,
  options: GeneratePreviewOptions = {},
): RunPreviewResult {
  const derived = deriveVisualView(designIr);
  const preview = generatePreview(derived.visualView, options);
  // Placeholder assets are the SVG (string) ones; real bitmaps carry bytes.
  const placeholderAssets = preview.assets.filter((asset) => typeof asset.content === 'string');
  const report = generateVisualReviewReport({
    visualView: derived.visualView,
    warnings: derived.warnings,
    placeholderAssets,
    realAssets: preview.stats.realAssets,
  });

  return {
    visualView: derived.visualView,
    visualViewJson: `${JSON.stringify(derived.visualView, null, 2)}\n`,
    html: preview.html,
    css: preview.css,
    report,
    assets: preview.assets,
    requiresApproval: 'gate-1',
    stats: {
      overrideApplied: derived.stats.overrideApplied,
      overrideUnmapped: derived.stats.overrideUnmapped,
      overrideUnsupported: derived.stats.overrideUnsupported,
      placeholderAssets: preview.stats.placeholderAssets,
      realAssets: preview.stats.realAssets,
    },
  };
}
