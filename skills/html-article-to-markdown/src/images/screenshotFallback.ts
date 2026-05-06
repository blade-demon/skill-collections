import type { ScreenshotRequest, ScreenshotResult } from "../types.js";

export async function defaultScreenshotter(request: ScreenshotRequest): Promise<ScreenshotResult> {
  try {
    const moduleName = "playwright";
    const playwright = (await import(moduleName)) as {
      chromium?: {
        launch(options: { headless: boolean }): Promise<{
          newPage(options: { viewport: { width: number; height: number } }): Promise<{
            goto(url: string, options: { waitUntil: string; timeout: number }): Promise<unknown>;
            locator(selector: string): {
              count(): Promise<number>;
              first(): { screenshot(options: { path: string; timeout: number }): Promise<unknown> };
            };
            screenshot(options: { path: string; fullPage: boolean; timeout: number }): Promise<unknown>;
          }>;
          close(): Promise<void>;
        }>;
      };
    };
    if (!playwright.chromium) {
      return { ok: false, error: "Playwright chromium is unavailable" };
    }

    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(request.url, { waitUntil: "networkidle", timeout: request.timeoutMs });
      const image = page.locator("img");
      if ((await image.count()) > 0) {
        await image.first().screenshot({ path: request.targetPath, timeout: request.timeoutMs });
      } else {
        await page.screenshot({ path: request.targetPath, fullPage: true, timeout: request.timeoutMs });
      }
      return { ok: true };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
