import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface VerificationReport {
  rawDependencies: string[];
  localImages: number;
  remoteImages: number;
  remoteImageUrls: string[];
  missingLocalImages: string[];
}

export interface VerificationPolicy {
  allowRemoteImages: boolean;
}

export function markdownImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const imageRe = /!\[[^\]]*]\((<[^>]+>|[^)\n]+)\)/g;
  for (let match = imageRe.exec(markdown); match; match = imageRe.exec(markdown)) {
    urls.push(match[1].trim().replace(/^<|>$/g, ""));
  }
  const htmlImageRe = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (let match = htmlImageRe.exec(markdown); match; match = htmlImageRe.exec(markdown)) {
    urls.push((match[1] ?? match[2] ?? match[3] ?? "").trim());
  }
  return urls;
}

export async function verifyMarkdown(mdPath: string): Promise<VerificationReport> {
  const markdown = await readFile(mdPath, "utf8");
  const rawDependencies: string[] = [];
  for (const match of markdown.matchAll(/00_raw|_files|data:image/g)) {
    const value = match[0];
    if (!rawDependencies.includes(value)) {
      rawDependencies.push(value);
    }
  }

  let localImages = 0;
  const remoteImageUrls: string[] = [];
  const missingLocalImages: string[] = [];

  for (const url of markdownImageUrls(markdown)) {
    if (/^https?:\/\//i.test(url)) {
      remoteImageUrls.push(url);
      continue;
    }
    if (/^data:/i.test(url)) {
      continue;
    }

    const cleanPath = decodeURIComponent(url.split(/[?#]/, 1)[0] ?? "");
    try {
      const info = await stat(join(mdPath, "..", cleanPath));
      if (info.isFile()) {
        localImages += 1;
      } else {
        missingLocalImages.push(url);
      }
    } catch {
      missingLocalImages.push(url);
    }
  }

  return {
    rawDependencies,
    localImages,
    remoteImages: remoteImageUrls.length,
    remoteImageUrls,
    missingLocalImages,
  };
}

export function hasVerificationErrors(report: VerificationReport, policy: VerificationPolicy): boolean {
  return (
    report.rawDependencies.length > 0 ||
    report.missingLocalImages.length > 0 ||
    (!policy.allowRemoteImages && report.remoteImages > 0)
  );
}
