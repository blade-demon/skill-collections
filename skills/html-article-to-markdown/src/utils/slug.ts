export function slugify(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^\w\u4e00-\u9fff-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized.toLowerCase() || 'article';
}

export function safeFilename(value: string, fallback = 'article'): string {
  const filename = value
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[ .-]+|[ .-]+$/g, '');

  return filename || fallback;
}
