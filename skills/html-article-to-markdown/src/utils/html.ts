import { basename } from 'node:path';

export interface HtmlToken {
  type: 'start' | 'end' | 'text';
  tagName?: string;
  attrs?: Record<string, string>;
  text?: string;
  selfClosing?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rawTextRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const rawRe = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  for (let match = rawRe.exec(html); match; match = rawRe.exec(html)) {
    ranges.push([match.index, rawRe.lastIndex]);
  }
  return ranges;
}

function isInsideRange(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index > start && index < end);
}

export function extractElementById(html: string, elementId: string): string {
  const startRe = new RegExp(
    `<(?<tag>[a-zA-Z][\\w:-]*)\\b[^>]*\\bid\\s*=\\s*(["'])${escapeRegExp(elementId)}\\2[^>]*>`,
    'i',
  );
  const match = startRe.exec(html);
  if (!match?.groups?.tag) {
    throw new Error(`Cannot find element#${elementId}`);
  }

  const elementTag = match.groups.tag;
  const tagRe = new RegExp(
    `<${escapeRegExp(elementTag)}\\b[^>]*>|</${escapeRegExp(elementTag)}\\s*>`,
    'gi',
  );
  tagRe.lastIndex = match.index + match[0].length;
  const ignoredRanges = rawTextRanges(html);

  let depth = 1;
  for (let tagMatch = tagRe.exec(html); tagMatch; tagMatch = tagRe.exec(html)) {
    if (isInsideRange(tagMatch.index, ignoredRanges)) {
      continue;
    }
    const token = tagMatch[0].toLowerCase();
    if (token.startsWith(`<${elementTag.toLowerCase()}`) && !/\/\s*>$/.test(token)) {
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        return html.slice(match.index + match[0].length, tagMatch.index);
      }
    }
  }

  throw new Error(`Cannot find closing ${elementTag} for #${elementId}`);
}

export function pick(html: string, pattern: RegExp, defaultValue = ''): string {
  const match = pattern.exec(html);
  if (!match?.[1]) {
    return defaultValue;
  }
  return match[1].replace(/\s+/g, ' ').trim();
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (let match = attrRe.exec(raw); match; match = attrRe.exec(raw)) {
    const [, name, doubleQuoted, singleQuoted, bare] = match;
    attrs[name.toLowerCase()] = decodeHtmlEntities(doubleQuoted ?? singleQuoted ?? bare ?? '');
  }
  return attrs;
}

export function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const lt = html.indexOf('<', cursor);
    if (lt === -1) {
      tokens.push({ type: 'text', text: decodeHtmlEntities(html.slice(cursor)) });
      break;
    }
    if (lt > cursor) {
      tokens.push({ type: 'text', text: decodeHtmlEntities(html.slice(cursor, lt)) });
    }

    if (html.startsWith('<!--', lt)) {
      const endComment = html.indexOf('-->', lt + 4);
      cursor = endComment === -1 ? html.length : endComment + 3;
      continue;
    }

    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) {
      tokens.push({ type: 'text', text: decodeHtmlEntities(html.slice(lt)) });
      break;
    }

    const inside = html.slice(lt + 1, gt).trim();
    cursor = gt + 1;
    if (!inside || inside.startsWith('!') || inside.startsWith('?')) {
      continue;
    }

    if (inside.startsWith('/')) {
      const tagName = inside.slice(1).trim().split(/\s+/)[0]?.toLowerCase();
      if (tagName) {
        tokens.push({ type: 'end', tagName });
      }
      continue;
    }

    const tagName = inside.split(/\s+/, 1)[0].replace(/\/$/, '').toLowerCase();
    const attrSource = inside.slice(tagName.length).replace(/\/\s*$/, '');
    const selfClosing =
      /\/\s*$/.test(inside) || ['br', 'hr', 'img', 'meta', 'link', 'input'].includes(tagName);
    tokens.push({ type: 'start', tagName, attrs: parseAttributes(attrSource), selfClosing });

    if (tagName === 'script' || tagName === 'style') {
      const closeRe = new RegExp(`</${escapeRegExp(tagName)}\\s*>`, 'i');
      const closeMatch = closeRe.exec(html.slice(cursor));
      if (closeMatch) {
        cursor += closeMatch.index + closeMatch[0].length;
        tokens.push({ type: 'end', tagName });
      } else {
        cursor = html.length;
      }
    }
  }

  return tokens;
}

export function titleFallbackFromPath(htmlPath: string): string {
  return basename(htmlPath).replace(/\.[^.]+$/, '') || 'article';
}
