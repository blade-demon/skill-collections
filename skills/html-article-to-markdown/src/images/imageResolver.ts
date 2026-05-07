import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ImageAttributes, ImageFailure, RemoteDownloader, Screenshotter } from "../types.js";
import { extensionFromBytes } from "./imageType.js";
import { imageLabel, imageStem } from "./imageNaming.js";
import { isDataUrl, isProtocolRelativeUrl, isRemoteUrl, normalizeRemoteUrl, resolveLocalImage } from "./localImageResolver.js";
import { downloadRemoteImage } from "./remoteImageDownloader.js";
import { defaultScreenshotter } from "./screenshotFallback.js";

export interface DefaultImageResolverOptions {
  htmlPath: string;
  assetDir: string;
  assetPrefix: string;
  localizeRemoteImages: boolean;
  screenshotOnDownloadFail: boolean;
  allowRemoteImages: boolean;
  embedImagesBase64: boolean;
  preserveImageSize: boolean;
  timeoutMs: number;
  screenshotter?: Screenshotter;
  remoteDownloader?: RemoteDownloader;
}

export class DefaultImageResolver {
  private readonly failedImages: ImageFailure[] = [];

  constructor(private readonly options: DefaultImageResolverOptions) {}

  failures(): ImageFailure[] {
    return this.failedImages;
  }

  async resolve(attrs: ImageAttributes, index: number): Promise<string> {
    const alt = (attrs.alt ?? "").trim();
    const localSources = this.imageSources(attrs);
    for (const source of localSources) {
      const localPath = await resolveLocalImage(this.options.htmlPath, source);
      if (localPath) {
        return this.copyLocalImage(localPath, attrs, index);
      }
    }

    const remoteUrl = this.remoteCandidates(attrs)[0];
    if (!remoteUrl) {
      return "";
    }

    const stem = imageStem(index, alt);
    let downloadError: string | undefined;

    if (this.options.localizeRemoteImages) {
      const downloader = this.options.remoteDownloader ?? downloadRemoteImage;
      const downloaded = await downloader(remoteUrl, this.options.timeoutMs);
      if (downloaded.ok && downloaded.data) {
        if (this.options.embedImagesBase64) {
          return this.formatImage(attrs, index, dataUrlFromImage(downloaded.data, downloaded.contentType, remoteUrl));
        }
        const ext = extensionFromBytes(downloaded.data, downloaded.contentType, remoteUrl);
        const target = join(this.options.assetDir, `${stem}${ext}`);
        await mkdir(this.options.assetDir, { recursive: true });
        await writeFile(target, downloaded.data);
        return this.formatImage(attrs, index, `${this.options.assetPrefix}/${stem}${ext}`);
      }
      downloadError = downloaded.error ?? "download failed";
    }

    let screenshotError: string | undefined;
    if (this.options.screenshotOnDownloadFail) {
      const screenshotter = this.options.screenshotter ?? defaultScreenshotter;
      if (this.options.embedImagesBase64) {
        const tempDir = await mkdtemp(join(tmpdir(), "html-article-to-md-image-"));
        const target = join(tempDir, `${stem}.png`);
        try {
          const screenshot = await screenshotter({ url: remoteUrl, targetPath: target, timeoutMs: this.options.timeoutMs });
          if (screenshot.ok) {
            try {
              const data = await readFile(target);
              return this.formatImage(attrs, index, dataUrlFromImage(data, "image/png", target));
            } catch (error) {
              screenshotError = `screenshot file unreadable: ${error instanceof Error ? error.message : String(error)}`;
            }
          } else {
            screenshotError = screenshot.error ?? "screenshot failed";
          }
        } finally {
          await rm(tempDir, { recursive: true, force: true });
        }
      } else {
        const target = join(this.options.assetDir, `${stem}.png`);
        await mkdir(this.options.assetDir, { recursive: true });
        const screenshot = await screenshotter({ url: remoteUrl, targetPath: target, timeoutMs: this.options.timeoutMs });
        if (screenshot.ok) {
          return this.formatImage(attrs, index, `${this.options.assetPrefix}/${stem}.png`);
        }
        screenshotError = screenshot.error ?? "screenshot failed";
      }
    }

    this.failedImages.push({ index, url: remoteUrl, alt, downloadError, screenshotError });
    return this.options.allowRemoteImages ? this.formatImage(attrs, index, remoteUrl) : "";
  }

  private async copyLocalImage(localPath: string, attrs: ImageAttributes, index: number): Promise<string> {
    const alt = (attrs.alt ?? "").trim();
    const data = await readFile(localPath);
    if (this.options.embedImagesBase64) {
      return this.formatImage(attrs, index, dataUrlFromImage(data, "", localPath));
    }
    const ext = extensionFromBytes(data, "", localPath);
    const stem = imageStem(index, alt);
    const targetName = `${stem}${ext}`;
    await mkdir(this.options.assetDir, { recursive: true });
    await copyFile(localPath, join(this.options.assetDir, targetName));
    return this.formatImage(attrs, index, `${this.options.assetPrefix}/${targetName}`);
  }

  private formatImage(attrs: ImageAttributes, index: number, src: string): string {
    const alt = (attrs.alt ?? "").trim();
    const label = alt && alt !== "Image" ? alt : imageLabel(index, alt);
    if (!this.options.preserveImageSize) {
      return isRemoteUrl(src) ? `![${label}](<${src}>)` : `![${label}](${src})`;
    }

    const attributes = [`src="${escapeHtmlAttribute(src)}"`, `alt="${escapeHtmlAttribute(label)}"`];
    const width = cleanLengthAttribute(attrs.width);
    const height = cleanLengthAttribute(attrs.height);
    const style = extractSizeStyle(attrs.style ?? "");
    if (width) {
      attributes.push(`width="${escapeHtmlAttribute(width)}"`);
    }
    if (height) {
      attributes.push(`height="${escapeHtmlAttribute(height)}"`);
    }
    if (style) {
      attributes.push(`style="${escapeHtmlAttribute(style)}"`);
    }
    return `<img ${attributes.join(" ")}>`;
  }

  private imageSources(attrs: ImageAttributes): string[] {
    return [attrs.src, attrs["data-src"], attrs["data-original"], attrs["data-backsrc"], attrs["data-lazy-src"]]
      .map((value) => (value ?? "").trim())
      .filter(Boolean);
  }

  private remoteCandidates(attrs: ImageAttributes): string[] {
    const src = (attrs.src ?? "").trim();
    const dataCandidates = [attrs["data-src"], attrs["data-original"], attrs["data-backsrc"], attrs["data-lazy-src"]]
      .map((value) => (value ?? "").trim())
      .filter(Boolean);
    const ordered = isDataUrl(src) ? [...dataCandidates, src] : [src, ...dataCandidates];
    const unique = new Set<string>();
    for (const candidate of ordered) {
      const normalized = normalizeRemoteUrl(candidate);
      if (isRemoteUrl(normalized) || isProtocolRelativeUrl(candidate)) {
        unique.add(normalized);
      }
    }
    return [...unique];
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanLengthAttribute(value: string | undefined): string {
  const candidate = (value ?? "").trim();
  return /^[0-9]+(?:\.[0-9]+)?$/.test(candidate) ? candidate : "";
}

function extractSizeStyle(style: string): string {
  const sizeProperties = new Set([
    "width",
    "height",
    "max-width",
    "min-width",
    "max-height",
    "min-height",
    "aspect-ratio",
    "object-fit",
    "object-position",
  ]);
  const declarations = style
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(":");
      if (separator === -1) {
        return "";
      }
      const property = part.slice(0, separator).trim().toLowerCase();
      const value = part.slice(separator + 1).trim();
      if (!sizeProperties.has(property) || /[<>"'`]/.test(value)) {
        return "";
      }
      return `${property}: ${value}`;
    })
    .filter(Boolean);

  return declarations.length > 0 ? `${declarations.join("; ")};` : "";
}

function dataUrlFromImage(data: Uint8Array, contentType: string | undefined, source: string): string {
  return `data:${mimeTypeForImage(data, contentType ?? "", source)};base64,${Buffer.from(data).toString("base64")}`;
}

function mimeTypeForImage(data: Uint8Array, contentType: string, source: string): string {
  const normalizedContentType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (normalizedContentType === "image/jpg") {
    return "image/jpeg";
  }
  if (/^image\/[a-z0-9.+-]+$/i.test(normalizedContentType)) {
    return normalizedContentType;
  }

  const ext = extensionFromBytes(data, contentType, source);
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
