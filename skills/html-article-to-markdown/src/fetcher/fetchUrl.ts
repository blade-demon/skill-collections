import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

export interface FetchUrlOptions {
  waitMode?: boolean;
  timeoutMs?: number;
}

export interface FetchUrlResult {
  htmlPath: string;
  cleanup: () => Promise<void>;
}

interface PlaywrightChromium {
  launch(options: { headless: boolean; channel?: string }): Promise<PlaywrightBrowser>;
}

interface PlaywrightBrowser {
  newPage(options?: { viewport?: { width: number; height: number } }): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

interface PlaywrightPage {
  goto(url: string, options: { waitUntil: string; timeout: number }): Promise<unknown>;
  evaluate<T>(pageFunction: string): Promise<T>;
}

const PREP_AND_CAPTURE_SCRIPT = `(async () => {
  const baseUrl = document.baseURI || location.href;

  function toAbsolute(url) {
    if (!url) return url;
    try { return new URL(url, baseUrl).href; } catch { return url; }
  }

  function materializeShadowDom(root) {
    const elements = Array.from(root.querySelectorAll("*"));
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      const shadow = el.shadowRoot;
      if (!shadow || !shadow.innerHTML) continue;
      if (el.tagName && el.tagName.includes("-")) {
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-shadow-host", el.tagName.toLowerCase());
        wrapper.innerHTML = shadow.innerHTML;
        el.replaceWith(wrapper);
      } else {
        el.innerHTML = shadow.innerHTML;
      }
    }
  }

  async function autoScroll() {
    const stepDelay = 250;
    const maxSteps = 40;
    let lastHeight = 0;
    for (let i = 0; i < maxSteps; i++) {
      window.scrollBy(0, window.innerHeight);
      await new Promise(resolve => setTimeout(resolve, stepDelay));
      const height = document.documentElement.scrollHeight;
      if (height === lastHeight) break;
      lastHeight = height;
    }
    window.scrollTo(0, 0);
  }

  await autoScroll();
  materializeShadowDom(document);

  document.querySelectorAll("img[data-src], video[data-src], audio[data-src], source[data-src]").forEach(el => {
    const ds = el.getAttribute("data-src");
    const src = el.getAttribute("src") || "";
    if (ds && (!src || src.startsWith("data:"))) {
      el.setAttribute("src", ds);
    }
  });

  document.querySelectorAll("a[href]").forEach(el => {
    const v = el.getAttribute("href");
    if (v) el.setAttribute("href", toAbsolute(v));
  });
  document.querySelectorAll("img[src], video[src], audio[src], source[src], iframe[src]").forEach(el => {
    const v = el.getAttribute("src");
    if (v) el.setAttribute("src", toAbsolute(v));
  });
  document.querySelectorAll("video[poster]").forEach(el => {
    const v = el.getAttribute("poster");
    if (v) el.setAttribute("poster", toAbsolute(v));
  });
  document.querySelectorAll("img[srcset], source[srcset]").forEach(el => {
    const s = el.getAttribute("srcset");
    if (!s) return;
    const next = s.split(",").map(p => {
      const t = p.trim();
      if (!t) return "";
      const [url, ...d] = t.split(/\\s+/);
      return d.length ? toAbsolute(url) + " " + d.join(" ") : toAbsolute(url);
    }).filter(Boolean).join(", ");
    el.setAttribute("srcset", next);
  });

  const headHtml = document.head ? document.head.innerHTML : "";
  const bodyInner = document.body ? document.body.innerHTML : "";
  return { headHtml, bodyInner };
})()`;

async function launchBrowser(
  chromium: PlaywrightChromium,
  options: { headless: boolean },
): Promise<PlaywrightBrowser> {
  // Prefer system Chrome to avoid downloading bundled Chromium.
  try {
    return await chromium.launch({ headless: options.headless, channel: "chrome" });
  } catch (chromeError) {
    const fallbackMessage = chromeError instanceof Error ? chromeError.message : String(chromeError);
    try {
      return await chromium.launch({ headless: options.headless });
    } catch (bundledError) {
      const bundledMessage = bundledError instanceof Error ? bundledError.message : String(bundledError);
      throw new Error(
        `Could not launch a browser. System Chrome failed: ${fallbackMessage}. ` +
        `Bundled Chromium failed: ${bundledMessage}. ` +
        "Install Google Chrome, or run `npx playwright install chromium`.",
      );
    }
  }
}

async function loadPlaywright(): Promise<{ chromium: PlaywrightChromium }> {
  const moduleName = "playwright";
  try {
    const mod = (await import(moduleName)) as { chromium?: PlaywrightChromium };
    if (!mod.chromium) {
      throw new Error("Playwright chromium runtime is unavailable");
    }
    return { chromium: mod.chromium };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Playwright is required for --url mode but failed to load: ${message}. ` +
      "Run `npm install` and `npx playwright install chromium`.",
    );
  }
}

async function waitForUserSignal(): Promise<void> {
  console.log("Browser opened. Press Enter when the page is ready to capture...");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.once("line", () => {
      rl.close();
      resolve();
    });
  });
}

function buildSyntheticHtml(headHtml: string, bodyInner: string, sourceUrl: string): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    `<meta name="source-url" content="${sourceUrl.replace(/"/g, "&quot;")}">`,
    headHtml,
    "</head>",
    "<body>",
    `<div id="js_content">${bodyInner}</div>`,
    "</body>",
    "</html>",
  ].join("\n");
}

export async function fetchUrlToHtml(url: string, options: FetchUrlOptions = {}): Promise<FetchUrlResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const waitMode = options.waitMode ?? false;

  const { chromium } = await loadPlaywright();
  const tmpDir = await mkdtemp(join(tmpdir(), "html-article-fetch-"));

  const cleanup = async (): Promise<void> => {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  };

  let browser: PlaywrightBrowser | null = null;
  try {
    browser = await launchBrowser(chromium, { headless: !waitMode });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });

    if (waitMode) {
      await waitForUserSignal();
    }

    const captured = await page.evaluate<{ headHtml: string; bodyInner: string }>(
      PREP_AND_CAPTURE_SCRIPT,
    );

    const html = buildSyntheticHtml(captured.headHtml, captured.bodyInner, url);
    const htmlPath = join(tmpDir, "article.html");
    await writeFile(htmlPath, html, "utf8");
    return { htmlPath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}
