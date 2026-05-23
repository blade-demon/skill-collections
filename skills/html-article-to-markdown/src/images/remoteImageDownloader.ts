import type { RemoteDownloadResult } from '../types.js';

export async function downloadRemoteImage(
  url: string,
  timeoutMs: number,
): Promise<RemoteDownloadResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: 'https://mp.weixin.qq.com/',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} ${response.statusText}`.trim() };
    }

    const contentType = response.headers.get('content-type') ?? '';
    const data = new Uint8Array(await response.arrayBuffer());
    if (!contentType.toLowerCase().startsWith('image/') && data.length === 0) {
      return { ok: false, error: 'empty response' };
    }

    return { ok: true, data, contentType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message || 'download failed' };
  } finally {
    clearTimeout(timer);
  }
}
