# Changelog

## 0.3.0 - 2026-05-07

### Features
- Add `--embed-images-base64` to embed recovered local, remote, and screenshot fallback images directly in Markdown.
- Add `embedded_images` verification reporting and allow intentional data images when base64 embedding is enabled.

### Documentation
- Document base64 image embedding for both local HTML and remote URL conversion modes.
- Add a feature image for inline base64 output and refresh verification artwork with the new embedded image metric.

## 0.2.0 - 2026-05-06

### Features
- Add `--url <url>` to fetch and convert remote articles via Playwright.
- Add `--wait-mode` for login-required pages (headed browser, press Enter to capture).
- Add `--fetch-timeout <ms>` to control page load timeout (default 30000).

### Documentation
- Document remote URL mode in `SKILL.md` and `README.md`, including Playwright setup requirement.

## 0.1.0 - 2026-05-06

### Features
- Add TypeScript CLI for converting saved HTML article packages into Markdown.
- Localize article images by default through local copy, remote download, and browser screenshot fallback.
- Add strict verification for raw dependencies, remote image references, and missing local images.
- Add `--allow-remote-images` for explicit remote image fallback.
- Add `--preserve-image-size` to emit HTML `<img>` tags with explicit source image size metadata.

### Documentation
- Document installation, conversion, image handling, verification, and release-oriented package usage.
