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

/**
 * Stage 4 预览生成器 - 运行完整的预览管线。
 *
 * 该函数是设计预览管线的入口点，将Design IR转换为可视化HTML预览。
 * 负责协调视图派生、预览生成和审查报告的完整流程。
 *
 * 设计目标：
 * - 生成高保真的静态HTML预览，用于设计审查
 * - 提供详细的保真度审计报告，标识偏差点
 * - 支持增量覆盖机制，允许手动调整预览参数
 * - 确保预览输出的确定性和可重现性
 */
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
