export type ImageMethod = 'local-copy' | 'remote-download' | 'screenshot' | 'remote-link';

export interface ConvertOptions {
  htmlPath: string;
  outDir: string;
  assetSlug?: string;
  bodyId?: string;
  dropFooterPromo?: boolean;
  localizeRemoteImages?: boolean;
  screenshotOnDownloadFail?: boolean;
  allowRemoteImages?: boolean;
  embedImagesBase64?: boolean;
  preserveImageSize?: boolean;
  imageTimeoutMs?: number;
  screenshotter?: Screenshotter;
  remoteDownloader?: RemoteDownloader;
}

export interface ArticleMetadata {
  title: string;
  author: string;
  account: string;
  published: string;
}

export interface ImageAttributes {
  [name: string]: string;
}

export interface ImageFailure {
  index: number;
  url: string;
  alt: string;
  downloadError?: string;
  screenshotError?: string;
}

export interface ImageResolver {
  resolve(attrs: ImageAttributes, index: number): Promise<string>;
  failures(): ImageFailure[];
}

export interface ScreenshotRequest {
  url: string;
  targetPath: string;
  timeoutMs: number;
}

export interface ScreenshotResult {
  ok: boolean;
  error?: string;
}

export type Screenshotter = (request: ScreenshotRequest) => Promise<ScreenshotResult>;

export interface RemoteDownloadResult {
  ok: boolean;
  data?: Uint8Array;
  contentType?: string;
  error?: string;
}

export type RemoteDownloader = (url: string, timeoutMs: number) => Promise<RemoteDownloadResult>;
