import { buildMarkdown } from "./index.js";
import { fetchUrlToHtml } from "./fetcher/fetchUrl.js";
import { fetchMarkdownViaApi } from "./fetcher/fetchViaApi.js";
import type { ConvertOptions } from "./types.js";
import { formatVerification } from "./verify/formatVerification.js";
import { hasVerificationErrors, verifyMarkdown } from "./verify/verifyMarkdown.js";

interface ParsedArgs {
  options: ConvertOptions;
  verify: boolean;
  help: boolean;
  url?: string;
  waitMode: boolean;
  fetchTimeoutMs?: number;
  remoteApi: boolean;
  remoteApiEndpoint?: string;
}

function usage(): string {
  return [
    "Usage: html-article-to-markdown (--html <file> | --url <url>) --out-dir <dir> [options]",
    "",
    "Input (choose one):",
    "  --html <file>                        Local saved HTML article",
    "  --url <url>                          Remote article URL (uses Playwright)",
    "",
    "Options:",
    "  --out-dir <dir>                      Required",
    "  --asset-slug <slug>",
    "  --body-id <id>                       Default: js_content",
    "  --drop-footer-promo",
    "  --verify",
    "  --allow-remote-images               Allow final Markdown to keep remote image URLs",
    "  --embed-images-base64               Embed recovered images as base64 data URLs in Markdown",
    "  --preserve-image-size               Emit HTML img tags with explicit size metadata",
    "  --no-localize-remote-images          Skip HTTP downloads for remote images",
    "  --no-screenshot-on-download-fail     Skip browser screenshot fallback",
    "  --image-timeout <ms>                 Default: 20000",
    "",
    "URL mode options:",
    "  --wait-mode                          Open headed browser, press Enter to capture (login pages)",
    "  --fetch-timeout <ms>                 Page load timeout (default: 30000)",
    "  --remote-api                         Use the defuddle.md reader API instead of a local browser",
    "  --remote-api-endpoint <template>     Custom reader API URL template, e.g. 'https://r.jina.ai/{url}'",
    "",
    "  --help",
  ].join("\n");
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const options: ConvertOptions = {
    htmlPath: "",
    outDir: "",
  };
  let verify = false;
  let help = false;
  let url: string | undefined;
  let waitMode = false;
  let fetchTimeoutMs: number | undefined;
  let remoteApi = false;
  let remoteApiEndpoint: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--html") {
      options.htmlPath = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--url") {
      url = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--wait-mode") {
      waitMode = true;
    } else if (arg === "--remote-api") {
      remoteApi = true;
    } else if (arg === "--remote-api-endpoint") {
      remoteApiEndpoint = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--fetch-timeout") {
      const raw = requireValue(argv, index, arg);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --fetch-timeout value: ${raw}`);
      }
      fetchTimeoutMs = parsed;
      index += 1;
    } else if (arg === "--out-dir") {
      options.outDir = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--asset-slug") {
      options.assetSlug = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--body-id") {
      options.bodyId = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--drop-footer-promo") {
      options.dropFooterPromo = true;
    } else if (arg === "--verify") {
      verify = true;
    } else if (arg === "--allow-remote-images") {
      options.allowRemoteImages = true;
    } else if (arg === "--embed-images-base64") {
      options.embedImagesBase64 = true;
    } else if (arg === "--preserve-image-size") {
      options.preserveImageSize = true;
    } else if (arg === "--no-localize-remote-images") {
      options.localizeRemoteImages = false;
    } else if (arg === "--no-screenshot-on-download-fail") {
      options.screenshotOnDownloadFail = false;
    } else if (arg === "--image-timeout") {
      const raw = requireValue(argv, index, arg);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --image-timeout value: ${raw}`);
      }
      options.imageTimeoutMs = parsed;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (help) {
    return { options, verify, help, url, waitMode, fetchTimeoutMs, remoteApi, remoteApiEndpoint };
  }

  if (url && options.htmlPath) {
    throw new Error("--url and --html are mutually exclusive; choose one");
  }
  if (!url && !options.htmlPath) {
    throw new Error("Either --url or --html is required");
  }
  if (!options.outDir) {
    throw new Error("--out-dir is required");
  }
  if (remoteApi && !url) {
    throw new Error("--remote-api requires --url");
  }
  if (remoteApiEndpoint && !remoteApi) {
    throw new Error("--remote-api-endpoint requires --remote-api");
  }
  if (remoteApiEndpoint && !remoteApiEndpoint.includes("{url}")) {
    throw new Error("--remote-api-endpoint must contain '{url}' placeholder");
  }

  return { options, verify, help, url, waitMode, fetchTimeoutMs, remoteApi, remoteApiEndpoint };
}

export async function runCli(argv: string[]): Promise<number> {
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const parsed = parseArgs(argv);
    if (parsed.help) {
      console.log(usage());
      return 0;
    }

    if (parsed.url) {
      const fetched = await fetchUrlToHtml(parsed.url, {
        waitMode: parsed.waitMode,
        timeoutMs: parsed.fetchTimeoutMs,
      });
      parsed.options.htmlPath = fetched.htmlPath;
      cleanup = fetched.cleanup;
    }

    const outFile = await buildMarkdown(parsed.options);
    console.log(outFile);

    if (parsed.verify) {
      const report = await verifyMarkdown(outFile);
      console.log(formatVerification(report));
      if (
        hasVerificationErrors(report, {
          allowRemoteImages: parsed.options.allowRemoteImages ?? false,
          allowDataImages: parsed.options.embedImagesBase64 ?? false,
        })
      ) {
        return 1;
      }
    }

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
}
