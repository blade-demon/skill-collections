import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildMarkdown } from "../src/index.js";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function createRemoteArticleRoot(body: string): Promise<{ root: string; htmlPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "html-article-images-"));
  const htmlPath = join(root, "article.html");
  await writeFile(
    htmlPath,
    `<html><head><meta property="og:title" content="Remote Images"></head><body><div id="js_content">${body}</div></body></html>`,
    "utf8",
  );
  return { root, htmlPath };
}

test("buildMarkdown downloads remote data-src images into local assets", async () => {
  const { root, htmlPath } = await createRemoteArticleRoot(
    '<img alt="Remote" src="data:image/svg+xml;base64,placeholder" data-src="https://example.com/640?wx_fmt=png">',
  );

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, "out"),
    assetSlug: "remote-images",
    remoteDownloader: async (url) => {
      assert.equal(url, "https://example.com/640?wx_fmt=png");
      return { ok: true, data: pngBytes, contentType: "image/png" };
    },
    screenshotOnDownloadFail: false,
  });

  const markdown = await readFile(outFile, "utf8");
  assert.match(markdown, /!\[Remote]\(assets\/remote-images\/01-remote\.png\)/);
  await readFile(join(root, "out", "assets", "remote-images", "01-remote.png"));
});

test("buildMarkdown can embed downloaded remote images as base64 data URLs", async () => {
  const { root, htmlPath } = await createRemoteArticleRoot(
    '<img alt="Remote" src="data:image/svg+xml;base64,placeholder" data-src="https://example.com/640?wx_fmt=png">',
  );

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, "out"),
    assetSlug: "remote-images",
    embedImagesBase64: true,
    remoteDownloader: async (url) => {
      assert.equal(url, "https://example.com/640?wx_fmt=png");
      return { ok: true, data: pngBytes, contentType: "image/png" };
    },
    screenshotOnDownloadFail: false,
  });

  const markdown = await readFile(outFile, "utf8");
  assert.ok(markdown.includes(`![Remote](data:image/png;base64,${Buffer.from(pngBytes).toString("base64")})`));
  assert.doesNotMatch(markdown, /assets\/remote-images/);
  await assert.rejects(() => readFile(join(root, "out", "assets", "remote-images", "01-remote.png")));
});

test("buildMarkdown screenshots remote images after download failure", async () => {
  const { root, htmlPath } = await createRemoteArticleRoot('<img alt="Blocked" src="https://example.com/blocked.png">');

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, "out"),
    assetSlug: "remote-images",
    remoteDownloader: async () => ({ ok: false, error: "HTTP 403 Forbidden" }),
    screenshotter: async ({ targetPath }) => {
      await writeFile(targetPath, pngBytes);
      return { ok: true };
    },
  });

  const markdown = await readFile(outFile, "utf8");
  assert.match(markdown, /!\[Blocked]\(assets\/remote-images\/01-blocked\.png\)/);
  await readFile(join(root, "out", "assets", "remote-images", "01-blocked.png"));
});

test("buildMarkdown can embed screenshot fallback images as base64 data URLs", async () => {
  const { root, htmlPath } = await createRemoteArticleRoot('<img alt="Blocked" src="https://example.com/blocked.png">');

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, "out"),
    assetSlug: "remote-images",
    embedImagesBase64: true,
    remoteDownloader: async () => ({ ok: false, error: "HTTP 403 Forbidden" }),
    screenshotter: async ({ targetPath }) => {
      await writeFile(targetPath, pngBytes);
      return { ok: true };
    },
  });

  const markdown = await readFile(outFile, "utf8");
  assert.ok(markdown.includes(`![Blocked](data:image/png;base64,${Buffer.from(pngBytes).toString("base64")})`));
  assert.doesNotMatch(markdown, /assets\/remote-images/);
  await assert.rejects(() => readFile(join(root, "out", "assets", "remote-images", "01-blocked.png")));
});

test("buildMarkdown fails when remote image cannot be downloaded or screenshotted", async () => {
  const { root, htmlPath } = await createRemoteArticleRoot('<img alt="Lost" src="https://example.com/lost.png">');

  await assert.rejects(
    () =>
      buildMarkdown({
        htmlPath,
        outDir: join(root, "out"),
        assetSlug: "remote-images",
        remoteDownloader: async () => ({ ok: false, error: "HTTP 404 Not Found" }),
        screenshotter: async () => ({ ok: false, error: "image element never rendered" }),
      }),
    /Failed to localize 1 image/,
  );
});

test("buildMarkdown keeps remote image only when allowRemoteImages is explicit", async () => {
  const { root, htmlPath } = await createRemoteArticleRoot('<img alt="Fallback" src="https://example.com/fallback.png">');

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, "out"),
    assetSlug: "remote-images",
    allowRemoteImages: true,
    screenshotOnDownloadFail: false,
    remoteDownloader: async () => ({ ok: false, error: "HTTP 403 Forbidden" }),
  });

  const markdown = await readFile(outFile, "utf8");
  assert.match(markdown, /!\[Fallback]\(<https:\/\/example\.com\/fallback\.png>\)/);
});
