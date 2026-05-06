import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { formatVerification } from "../src/verify/formatVerification.js";
import { hasVerificationErrors, verifyMarkdown } from "../src/verify/verifyMarkdown.js";

test("verifyMarkdown reports raw dependencies, local images, remote images, and missing paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "html-article-verify-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "assets", "present.png"), "present");
  const mdPath = join(root, "article.md");
  await writeFile(
    mdPath,
    "![ok](assets/present.png)\n" +
      "![missing](assets/missing.png)\n" +
      "![remote](<https://example.com/640?wx_fmt=png>)\n" +
      "raw 00_raw capture and data:image/svg+xml placeholder\n",
    "utf8",
  );

  const report = await verifyMarkdown(mdPath);

  assert.deepEqual(report.rawDependencies, ["00_raw", "data:image"]);
  assert.equal(report.localImages, 1);
  assert.equal(report.remoteImages, 1);
  assert.deepEqual(report.missingLocalImages, ["assets/missing.png"]);
  assert.equal(hasVerificationErrors(report, { allowRemoteImages: false }), true);
  assert.match(formatVerification(report), /remote_images: 1/);
});

test("remote images are verification errors unless explicitly allowed", async () => {
  const root = await mkdtemp(join(tmpdir(), "html-article-verify-"));
  const mdPath = join(root, "article.md");
  await writeFile(mdPath, "![remote](<https://example.com/image.png>)\n", "utf8");

  const report = await verifyMarkdown(mdPath);

  assert.equal(hasVerificationErrors(report, { allowRemoteImages: false }), true);
  assert.equal(hasVerificationErrors(report, { allowRemoteImages: true }), false);
});

test("verifyMarkdown checks HTML img tags emitted for preserved image sizes", async () => {
  const root = await mkdtemp(join(tmpdir(), "html-article-verify-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "assets", "present.png"), "present");
  const mdPath = join(root, "article.md");
  await writeFile(
    mdPath,
    '<img src="assets/present.png" alt="ok" width="320">\n' +
      '<img src="assets/missing.png" alt="missing" width="320">\n' +
      '<img src="https://example.com/remote.png" alt="remote" width="320">\n',
    "utf8",
  );

  const report = await verifyMarkdown(mdPath);

  assert.equal(report.localImages, 1);
  assert.equal(report.remoteImages, 1);
  assert.deepEqual(report.missingLocalImages, ["assets/missing.png"]);
});
