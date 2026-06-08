import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DefaultImageResolver } from './images/imageResolver.js';
import { HtmlToMarkdownConverter } from './markdown/htmlToMarkdown.js';
import { extractMetadata } from './metadata.js';
import type { ConvertOptions } from './types.js';
import { extractElementById } from './utils/html.js';
import { safeFilename, slugify } from './utils/slug.js';

function removeCommonFooterPromo(markdown: string): string {
  return markdown
    .replace(/\n!\[[^\]]*]\(<http:\/\/mmbiz\.qpic\.cn\/[^>]+\/300\?[^>]+>\)\n/g, '\n')
    .replace(/\n\*\*[^*\n]+?\*\*\n\n一个用心做技术的账号，关注[^。\n]+。.*$/s, '');
}

function formatImageFailures(failures: ReturnType<DefaultImageResolver['failures']>): string {
  return failures
    .map((failure) => {
      const reasons = [
        failure.downloadError && `download: ${failure.downloadError}`,
        failure.screenshotError && `screenshot: ${failure.screenshotError}`,
      ]
        .filter(Boolean)
        .join('; ');
      return `#${failure.index} ${failure.url}${reasons ? ` (${reasons})` : ''}`;
    })
    .join('\n');
}

/**
 * HTML文章到Markdown的核心转换流程。
 *
 * 该函数解决了"如何将微信公众号等富文本HTML清洁地转换为Markdown"的问题。
 * 特别针对中文内容和图片处理进行了优化。
 *
 * 转换策略：
 * - 元数据提取：从HTML中提取标题、作者、发布时间等元信息
 * - 图片本地化：将远程图片下载到本地，支持多种fallback策略
 * - 内容清理：移除公众号推广等垃圾内容
 * - 格式规范：生成符合Markdown标准的输出
 *
 * 设计目标是确保转换结果可以直接用于技术博客、文档等场景。
 */
export async function buildMarkdown(options: ConvertOptions): Promise<string> {
  const bodyId = options.bodyId ?? 'js_content';
  const html = await readFile(options.htmlPath, 'utf8');
  const metadata = extractMetadata(html, options.htmlPath);
  const assetSlug = options.assetSlug || slugify(metadata.title || 'article');
  const assetDir = join(options.outDir, 'assets', assetSlug);
  if (!options.embedImagesBase64) {
    await mkdir(assetDir, { recursive: true });
  }

  const imageResolver = new DefaultImageResolver({
    htmlPath: options.htmlPath,
    assetDir,
    assetPrefix: `assets/${assetSlug}`,
    localizeRemoteImages: options.localizeRemoteImages ?? true,
    screenshotOnDownloadFail: options.screenshotOnDownloadFail ?? true,
    allowRemoteImages: options.allowRemoteImages ?? false,
    embedImagesBase64: options.embedImagesBase64 ?? false,
    preserveImageSize: options.preserveImageSize ?? false,
    timeoutMs: options.imageTimeoutMs ?? 20_000,
    screenshotter: options.screenshotter,
    remoteDownloader: options.remoteDownloader,
  });

  const converter = new HtmlToMarkdownConverter(imageResolver);
  const body = await converter.convert(extractElementById(html, bodyId));
  const failures = imageResolver.failures();
  if (failures.length > 0 && !options.allowRemoteImages) {
    throw new Error(
      `Failed to localize ${failures.length} image(s):\n${formatImageFailures(failures)}`,
    );
  }

  const header = [`# ${metadata.title}`, ''];
  if (metadata.author) {
    header.push(`> 作者：${metadata.author}`);
  }
  if (metadata.account) {
    header.push(`> 来源：${metadata.account}`);
  }
  if (metadata.published) {
    header.push(`> 发布时间：${metadata.published}`);
  }
  header.push('', '---', '');

  let output = `${header.join('\n')}${body}`;
  if (options.dropFooterPromo) {
    output = removeCommonFooterPromo(output);
  }
  output = `${output.replace(/\n{3,}/g, '\n\n').trim()}\n`;

  await mkdir(options.outDir, { recursive: true });
  const outFile = join(options.outDir, `${safeFilename(metadata.title, 'article')}.md`);
  await writeFile(outFile, output, 'utf8');
  return outFile;
}
