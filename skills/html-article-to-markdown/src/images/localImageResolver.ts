import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isProtocolRelativeUrl(value: string): boolean {
  return /^\/\//.test(value);
}

export function isDataUrl(value: string): boolean {
  return /^data:/i.test(value);
}

export function normalizeRemoteUrl(value: string): string {
  return isProtocolRelativeUrl(value) ? `https:${value}` : value;
}

export async function resolveLocalImage(htmlPath: string, source: string): Promise<string | null> {
  if (
    !source ||
    isDataUrl(source) ||
    isRemoteUrl(source) ||
    isProtocolRelativeUrl(source) ||
    source.startsWith('/')
  ) {
    return null;
  }

  const imagePath = decodeURIComponent(source.split(/[?#]/, 1)[0] ?? '').replace(/^\.\//, '');
  const localPath = join(dirname(htmlPath), imagePath);
  try {
    const info = await stat(localPath);
    return info.isFile() ? localPath : null;
  } catch {
    return null;
  }
}
