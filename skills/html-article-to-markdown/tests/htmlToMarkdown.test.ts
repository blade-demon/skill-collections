import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildMarkdown } from '../src/index.js';

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'html-article-to-md-'));
}

async function writeArticle(root: string, body: string, title = 'Sample'): Promise<string> {
  const htmlPath = join(root, 'article.html');
  await writeFile(
    htmlPath,
    `<html><head><meta property="og:title" content="${title}"></head><body><div id="js_content">${body}</div></body></html>`,
    'utf8',
  );
  return htmlPath;
}

test('buildMarkdown converts the target article body to Markdown', async () => {
  const root = await createTempRoot();
  const htmlPath = await writeArticle(
    root,
    '<p>Before</p><blockquote><p>Quoted text</p></blockquote>',
  );

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, 'out'),
    assetSlug: 'sample',
    bodyId: 'js_content',
    dropFooterPromo: false,
  });

  const markdown = await readFile(outFile, 'utf8');
  assert.match(markdown, /^# Sample/m);
  assert.match(markdown, /\n> Quoted text\n/);
});

test('buildMarkdown accepts non-div article containers by id', async () => {
  const root = await createTempRoot();
  const htmlPath = join(root, 'article.html');
  await writeFile(
    htmlPath,
    '<html><head><title>Article Body</title></head><body><article id="story"><p>Story text</p></article></body></html>',
    'utf8',
  );

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, 'out'),
    assetSlug: 'story',
    bodyId: 'story',
    dropFooterPromo: false,
  });

  const markdown = await readFile(outFile, 'utf8');
  assert.match(markdown, /Story text/);
});

test('buildMarkdown ignores script-like strings without dropping following article text', async () => {
  const root = await createTempRoot();
  const htmlPath = await writeArticle(
    root,
    '<script>const template = "<script><div>";</script><p>Visible article text</p>',
  );

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, 'out'),
    assetSlug: 'sample',
    bodyId: 'js_content',
    dropFooterPromo: false,
  });

  const markdown = await readFile(outFile, 'utf8');
  assert.match(markdown, /Visible article text/);
});

test('buildMarkdown copies local images with byte-derived extensions', async () => {
  const root = await createTempRoot();
  const assetRoot = join(root, 'article_files');
  await mkdir(assetRoot);
  await writeFile(
    join(assetRoot, 'image'),
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(16)]),
  );
  const htmlPath = await writeArticle(root, '<img alt="Diagram" src="article_files/image">');

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, 'out'),
    assetSlug: 'sample',
    bodyId: 'js_content',
    dropFooterPromo: false,
  });

  const markdown = await readFile(outFile, 'utf8');
  assert.match(markdown, /!\[Diagram]\(assets\/sample\/01-diagram\.png\)/);
  await readFile(join(root, 'out', 'assets', 'sample', '01-diagram.png'));
});

test('buildMarkdown can embed local images as base64 data URLs', async () => {
  const root = await createTempRoot();
  const assetRoot = join(root, 'article_files');
  const imageData = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(16)]);
  await mkdir(assetRoot);
  await writeFile(join(assetRoot, 'image'), imageData);
  const htmlPath = await writeArticle(root, '<img alt="Diagram" src="article_files/image">');

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, 'out'),
    assetSlug: 'sample',
    bodyId: 'js_content',
    dropFooterPromo: false,
    embedImagesBase64: true,
  });

  const markdown = await readFile(outFile, 'utf8');
  assert.ok(markdown.includes(`![Diagram](data:image/png;base64,${imageData.toString('base64')})`));
  assert.doesNotMatch(markdown, /assets\/sample/);
  await assert.rejects(() => readFile(join(root, 'out', 'assets', 'sample', '01-diagram.png')));
});

test('buildMarkdown can preserve explicit image display size with HTML img output', async () => {
  const root = await createTempRoot();
  const assetRoot = join(root, 'article_files');
  await mkdir(assetRoot);
  await writeFile(
    join(assetRoot, 'image'),
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(16)]),
  );
  const htmlPath = await writeArticle(
    root,
    '<img alt="Sized Diagram" src="article_files/image" width="320" height="180" style="width: 320px; max-width: 100%; border: 1px solid red;">',
  );

  const outFile = await buildMarkdown({
    htmlPath,
    outDir: join(root, 'out'),
    assetSlug: 'sample',
    bodyId: 'js_content',
    dropFooterPromo: false,
    preserveImageSize: true,
  });

  const markdown = await readFile(outFile, 'utf8');
  assert.match(
    markdown,
    /<img src="assets\/sample\/01-sized-diagram\.png" alt="Sized Diagram" width="320" height="180" style="width: 320px; max-width: 100%;">/,
  );
  await readFile(join(root, 'out', 'assets', 'sample', '01-sized-diagram.png'));
});
