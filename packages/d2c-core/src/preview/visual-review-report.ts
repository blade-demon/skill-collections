import type { VisualNode, VisualView, Warning } from '../ir';
import type { PreviewAsset } from './generate-preview';

export interface GenerateVisualReviewReportInput {
  visualView: VisualView;
  warnings: Warning[];
  placeholderAssets: PreviewAsset[];
  /** Count of image nodes rendered with a real bitmap (not a placeholder). */
  realAssets?: number;
}

export function generateVisualReviewReport(input: GenerateVisualReviewReportInput): string {
  const counts = countNodes(input.visualView.body.root);
  const realAssets = input.realAssets ?? 0;
  const lines = [
    '# Visual Review Report',
    '',
    `Artboard: ${formatNumber(input.visualView.body.artboard.width)} x ${formatNumber(input.visualView.body.artboard.height)}`,
    `Total nodes: ${counts.total}`,
    `Text nodes: ${counts.text}`,
    `Placeholder assets: ${input.placeholderAssets.length}`,
    `Real image assets: ${realAssets}`,
    '',
    '## Placeholder Assets',
    '',
  ];

  if (input.placeholderAssets.length === 0) {
    lines.push('- None');
  } else {
    for (const asset of input.placeholderAssets) {
      lines.push(`- ${asset.assetId} -> ${asset.path}`);
    }
  }

  lines.push('', '## Warnings', '');
  if (input.warnings.length === 0) {
    lines.push('- None');
  } else {
    for (const warning of input.warnings) {
      const source = warning.sourceNodeId ? ` (${warning.sourceNodeId})` : '';
      lines.push(`- [${warning.severity}] ${warning.code}${source}: ${warning.message}`);
    }
  }

  lines.push('', '## Known Limitations', '');
  lines.push(
    '- Image nodes render real bitmaps when the asset is provided; otherwise a deterministic placeholder is used.',
  );
  lines.push('- Automated screenshot diff is not run in Stage 4.');
  lines.push('');

  return lines.join('\n');
}

function countNodes(root: VisualNode): { total: number; text: number } {
  let total = 0;
  let text = 0;
  const visit = (node: VisualNode): void => {
    total += 1;
    if (node.kind === 'text') text += 1;
    for (const child of node.children) visit(child);
  };
  visit(root);
  return { total, text };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}
