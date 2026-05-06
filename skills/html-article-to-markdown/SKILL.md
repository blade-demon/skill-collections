---
name: html-article-to-markdown
description: Use when converting saved HTML articles, especially WeChat or 微信公众号 offline HTML folders, into polished shareable Markdown with cleaned article structure, recovered lazy-loaded images, copied local assets, fixed image paths, and verification that the final article no longer depends on raw capture folders.
---

# HTML Article To Markdown

Turn a saved article HTML package into a clean Markdown article that can be shared directly.

## Workflow

0. Resolve the input.
   - If the user supplied a URL, run the CLI with `--url` to fetch and render the page through Playwright before conversion. Lazy-loaded images, `data-src` attributes, relative URLs, and Shadow DOM content are normalized in-browser, then the captured body is wrapped in `<div id="js_content">` so the rest of the workflow stays unchanged.
   - For login-protected pages, add `--wait-mode` to launch a headed browser and press Enter once the page is ready.
   - If the input is already a saved HTML file, skip this step.

1. Inspect the source.
   - Identify the main `.html` file and sibling resource folder such as `*_files`.
   - Prefer the article body container over full-page conversion. For WeChat articles, use `#js_content`; for other saved pages, pass the id of a `div`, `article`, `main`, or similar content element.
   - Extract title, author, account/source, and publish time from metadata when available.

2. Check rendered appearance when browser tooling works.
   - Use `agent-browser` or the in-app browser to open the local HTML.
   - Capture the first viewport and at least one scrolled section of the article body.
   - Note actual heading levels, separators, image placement, card sections, and footer noise.
   - If browser tooling or network access is unavailable, continue from HTML structure and local resource inspection, then state that limitation in the final answer.

3. Convert only article content.
   - Drop scripts, styles, comments, page chrome, reward dialogs, comment areas, floating controls, and account promo widgets.
   - Preserve paragraphs, headings, lists, blockquotes, horizontal separators, bold/emphasis, code spans, and images.
   - Convert standalone quoted examples into Markdown blockquotes.
   - Keep lists tight: no blank lines between adjacent list items.

4. Fix images and assets.
   - Never keep `data:image/svg+xml` 1px placeholder images.
   - For WeChat lazy-loaded images, prefer `data-src` when `src` is a placeholder.
   - Only localize images whose `src` resolves to a real local relative file such as `./..._files/...` or `..._files/...`; do not map remote `/640?...` URLs to a local `640` by basename.
   - Copy local images into the destination article asset folder with stable filenames and real extensions derived from file bytes, such as `.webp`, `.png`, or `.jpg`.
   - Download remote article images into the destination asset folder by default. Remote URLs are acquisition sources, not final Markdown image references.
   - If direct download fails, use the browser screenshot fallback when available and save the screenshot as a local `.png`.
   - Use simple relative paths such as `assets/article-slug/01-image.webp`.
   - If the user asks to preserve image display size, pass `--preserve-image-size`; this emits HTML `<img>` tags and preserves explicit `width`, `height`, and size-related inline styles from the source `<img>`.
   - Keep a remote image URL in the final Markdown only when the user explicitly allows it with `--allow-remote-images`.
   - Verify every local image reference exists relative to the final `.md`.

5. Place the refined output.
   - Write the polished Markdown into the requested destination, not the raw capture folder.
   - Let the CLI sanitize unsafe title characters in the output `.md` filename while preserving the article title inside the Markdown.
   - Keep raw HTML and original `_files` untouched.
   - Remove stale asset folders only after confirming no Markdown references them.

6. Verify before finishing.
   - Prefer running the CLI with `--verify` so it reports raw dependencies, local image count, remote image count, and missing local image paths.
   - If checking manually, search final Markdown for raw dependencies: `00_raw`, `_files`, `data:image`.
   - Missing local image count must be zero.
   - Remote image count must be zero unless `--allow-remote-images` was explicitly requested.
   - Preview representative sections with `sed` or equivalent to catch list spacing, broken headings, and leftover promo text.

## Reusable CLI

Use the TypeScript CLI for repeatable conversion:

```bash
npm run convert -- \
  --html "path/to/article.html" \
  --out-dir "path/to/destination" \
  --asset-slug "article-slug" \
  --verify
```

For a remote URL:

```bash
npm run convert -- \
  --url "https://example.com/article" \
  --out-dir "path/to/destination" \
  --asset-slug "article-slug" \
  --verify
```

Optional flags:

- `--url <url>` fetches and renders a remote article via Playwright instead of reading a local file. Mutually exclusive with `--html`.
- `--wait-mode` launches a headed Chromium and waits for Enter before capturing — use for login-required pages.
- `--fetch-timeout <ms>` sets the page-load timeout for `--url` mode (default 30000).
- `--body-id js_content` changes the article container id.
- `--drop-footer-promo` removes common WeChat account-card footer fragments.
- `--verify` prints raw dependency and image integrity checks, and exits non-zero if raw dependencies, remote images, or missing local images remain.
- `--allow-remote-images` permits final Markdown to keep remote image URLs when download and screenshot recovery fail.
- `--preserve-image-size` emits HTML `<img>` tags with explicit source image size metadata when available.
- `--no-screenshot-on-download-fail` disables browser screenshot recovery.
- `--image-timeout 20000` changes per-image download and screenshot timeout in milliseconds.

After running the CLI, do one editorial pass. Improve image alt text, remove article-specific promo fragments, and inspect any failed image diagnostics. If a remote image can neither be downloaded nor rendered by the browser, the converter cannot recover the original image and should fail in strict mode.

## Common Pitfalls

- Images exist but do not render: source files may be WebP/JPEG/PNG without extensions, or links may contain parentheses and spaces.
- Image display size is not identical to the original page: normal Markdown image syntax does not preserve dimensions; use `--preserve-image-size`, but note that it only preserves explicit image attributes and size-related inline style, not arbitrary external CSS layout.
- Many repeated identical images: this usually means the converter matched remote `/640?...` URLs to a local `640` file. Only localize real local paths.
- Missing article images: WeChat stores many real image URLs in `data-src` while `src` is a 1px placeholder.
- Bad Markdown rhythm: converter output often inserts blank lines between list items. Tighten lists, but keep blank lines between paragraphs.
- Raw-folder dependency: final Markdown must not point back to `00_raw` or the original capture `_files` folder.
