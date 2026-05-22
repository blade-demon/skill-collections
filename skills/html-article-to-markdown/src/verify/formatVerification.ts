import type { VerificationReport } from './verifyMarkdown.js';

export function formatVerification(report: VerificationReport): string {
  const lines = [
    'verification:',
    `  raw_dependencies: ${report.rawDependencies.length}`,
    `  local_images: ${report.localImages}`,
    `  embedded_images: ${report.embeddedImages}`,
    `  remote_images: ${report.remoteImages}`,
    `  missing_local_images: ${report.missingLocalImages.length}`,
  ];

  if (report.rawDependencies.length > 0) {
    lines.push(`  raw_dependency_values: ${report.rawDependencies.join(', ')}`);
  }
  if (report.remoteImageUrls.length > 0) {
    lines.push('  remote_image_urls:');
    lines.push(...report.remoteImageUrls.map((url) => `    - ${url}`));
  }
  if (report.missingLocalImages.length > 0) {
    lines.push('  missing_local_image_paths:');
    lines.push(...report.missingLocalImages.map((path) => `    - ${path}`));
  }

  return lines.join('\n');
}
