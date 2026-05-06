import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { safeFilename } from "../utils/slug.js";

export interface FetchViaApiOptions {
  outDir: string;
  timeoutMs?: number;
  endpoint?: (url: string) => string;
  fetchImpl?: typeof fetch;
}

export interface FetchViaApiResult {
  outFile: string;
  title: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ENDPOINT = (url: string) => `https://defuddle.md/${url}`;

function extractTitle(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");

  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fmMatch) {
    const titleLine = fmMatch[1].split("\n").find((line) => /^title:\s*/i.test(line));
    if (titleLine) {
      const raw = titleLine.replace(/^title:\s*/i, "").trim();
      const unquoted = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      if (unquoted) return unquoted;
    }
  }

  const headingMatch = normalized.match(/^#\s+(.+)$/m);
  return headingMatch?.[1]?.trim() ?? "";
}

export async function fetchMarkdownViaApi(
  url: string,
  options: FetchViaApiOptions,
): Promise<FetchViaApiResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const buildEndpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const doFetch = options.fetchImpl ?? fetch;

  const apiUrl = buildEndpoint(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await doFetch(apiUrl, {
      headers: { accept: "text/markdown,text/plain;q=0.9,*/*;q=0.1" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Reader API returned ${response.status} ${response.statusText} for ${apiUrl}`);
  }

  const markdown = (await response.text()).replace(/\r\n/g, "\n").trim();
  if (!markdown) {
    throw new Error(`Reader API returned empty markdown for ${apiUrl}`);
  }

  const title = extractTitle(markdown) || "article";
  await mkdir(options.outDir, { recursive: true });
  const outFile = join(options.outDir, `${safeFilename(title, "article")}.md`);
  await writeFile(outFile, `${markdown}\n`, "utf8");
  return { outFile, title };
}

export { extractTitle as extractTitleFromMarkdown };
