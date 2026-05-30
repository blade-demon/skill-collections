---
name: html-article-to-markdown
description: 将已保存的 HTML 文章（尤其是微信/微信公众号离线 HTML 文件夹）转换为可分享的精炼 Markdown：清理文章结构、恢复懒加载图片、复制本地资源或嵌入 base64 图片、修正图片路径，并验证最终文章不再依赖原始抓取目录。
---

# HTML 文章转 Markdown

将已保存的文章 HTML 包转换为可直接分享的干净 Markdown 文章。

## 工作流

0. 解析输入。
   - 若用户提供 URL，使用 CLI 的 `--url` 通过 Playwright 抓取并渲染页面后再转换。懒加载图片、`data-src` 属性、相对 URL 和 Shadow DOM 内容会在浏览器内规范化，然后将捕获的正文包装在 `<div id="js_content">` 中，使后续流程保持不变。
   - 对于需登录的页面，添加 `--wait-mode` 启动有界面浏览器，页面就绪后按 Enter。
   - 若输入已是本地 HTML 文件，跳过此步。

1. 检查源文件。
   - 识别主 `.html` 文件及同级资源目录（如 `*_files`）。
   - 优先转换文章正文容器，而非整页。微信文章使用 `#js_content`；其他已保存页面可传入 `div`、`article`、`main` 等内容元素的 id。
   - 从元数据中提取标题、作者、账号/来源和发布时间（如有）。

2. 在浏览器工具可用时检查渲染效果。
   - 使用 `agent-browser` 或应用内浏览器打开本地 HTML。
   - 截取首屏视口及至少一处滚动后的正文区域。
   - 记录实际标题层级、分隔线、图片位置、卡片区块和页脚噪声。
   - 若浏览器工具或网络不可用，则基于 HTML 结构和本地资源检查继续，并在最终答复中说明该限制。

3. 仅转换文章内容。
   - 丢弃脚本、样式、注释、页面壳层、赞赏弹窗、评论区、浮层控件和公众号推广组件。
   - 保留段落、标题、列表、引用块、水平分隔线、粗体/强调、行内代码和图片。
   - 将独立引用示例转为 Markdown 引用块。
   - 保持列表紧凑：相邻列表项之间不要空行。

4. 修复图片与资源。
   - 绝不保留 `data:image/svg+xml` 1px 占位图。
   - 微信懒加载图片：当 `src` 为占位图时，优先使用 `data-src`。
   - 仅本地化 `src` 能解析为真实本地相对文件的图片，如 `./..._files/...` 或 `..._files/...`；不要用远程 `/640?...` URL 的 basename 去匹配本地 `640` 文件。
   - 将本地图片复制到目标文章资源目录，使用稳定文件名及由文件字节推断的真实扩展名（如 `.webp`、`.png`、`.jpg`）。
   - 默认将远程文章图片下载到目标资源目录。远程 URL 是获取来源，不是最终 Markdown 图片引用。
   - 若直接下载失败，在可用时使用浏览器截图 fallback，保存为本地 `.png`。
   - 使用简单相对路径，如 `assets/article-slug/01-image.webp`。
   - 若用户要求单文件 Markdown 内联图片，传入 `--embed-images-base64`；本地图片、下载的远程图片和截图 fallback 图片将以 `data:image/...;base64,...` 输出，而非写入 `assets/` 目录。
   - 若用户要求保留图片显示尺寸，传入 `--preserve-image-size`；将输出 HTML `<img>` 标签并保留源 `<img>` 上显式的 `width`、`height` 及尺寸相关 inline style。
   - 仅当用户通过 `--allow-remote-images` 明确允许时，才在最终 Markdown 中保留远程图片 URL。
   - 验证每个本地图片引用相对于最终 `.md` 存在；base64 模式下，验证内嵌图片计入 `embedded_images`。

5. 放置精炼输出。
   - 将精炼 Markdown 写入用户指定的目标位置，而非原始抓取目录。
   - 让 CLI 清理输出 `.md` 文件名中的不安全字符，同时保留 Markdown 内的文章标题原文。
   - 保持原始 HTML 和 `_files` 不动。
   - 仅在确认 Markdown 不再引用后，才删除过时的资源目录。

6. 完成前验证。
   - 优先使用 CLI 的 `--verify`，报告 raw 依赖、本地图片数、远程图片数和缺失的本地图片路径。
   - 若手动检查，在最终 Markdown 中搜索 raw 依赖：`00_raw`、`_files` 及非预期的 `data:image` 占位内容。使用 `--embed-images-base64` 时，不要将故意的 `data:image/...;base64,...` 图片引用视为 raw 依赖。
   - 缺失本地图片数必须为 0。
   - 仅在使用 `--embed-images-base64` 时，`embedded_images` 才可为非零。
   - 除非明确请求 `--allow-remote-images`，远程图片数必须为 0。
   - 用 `sed` 或等效工具预览代表性段落，检查列表间距、标题断裂和残留推广文案。

## 可复用 CLI

使用 TypeScript CLI 进行可重复转换：

```bash
npm run convert -- \
  --html "path/to/article.html" \
  --out-dir "path/to/destination" \
  --asset-slug "article-slug" \
  --verify
```

远程 URL：

```bash
npm run convert -- \
  --url "https://example.com/article" \
  --out-dir "path/to/destination" \
  --asset-slug "article-slug" \
  --verify
```

若要将图片直接嵌入 Markdown 而非写入 `assets/` 目录，在本地或 URL 模式下添加相同 flag：

```bash
npm run convert -- \
  --html "path/to/article.html" \
  --out-dir "path/to/destination" \
  --asset-slug "article-slug" \
  --embed-images-base64 \
  --verify
```

可选 flag：

- `--url <url>` 通过 Playwright 抓取并渲染远程文章，而非读取本地文件。与 `--html` 互斥。
- `--wait-mode` 启动有界面 Chromium，按 Enter 前等待 —— 用于需登录页面。
- `--fetch-timeout <ms>` 设置 `--url` 模式的页面加载超时（默认 30000）。
- `--body-id js_content` 更改文章容器 id。
- `--drop-footer-promo` 移除常见微信公众号账号卡片页脚片段。
- `--verify` 打印 raw 依赖与图片完整性检查；若仍有 raw 依赖、远程图片或缺失本地图片则以非零退出。
- `--allow-remote-images` 在下载与截图恢复均失败时，允许最终 Markdown 保留远程图片 URL。
- `--embed-images-base64` 将恢复的图片写为内联 `data:image/...;base64,...` URL，而非 `assets/` 下的文件。
- `--preserve-image-size` 在可用时输出带显式源图片尺寸元数据的 HTML `<img>` 标签。
- `--no-screenshot-on-download-fail` 禁用浏览器截图恢复。
- `--image-timeout 20000` 更改每张图片的下载与截图超时（毫秒）。

运行 CLI 后，再做一次编辑 pass：改进图片 alt 文本、移除文章特定推广片段、检查失败的图片诊断。若远程图片既无法下载也无法被浏览器渲染，转换器无法恢复原始图片，严格模式下应失败。

## 常见陷阱

- 图片存在但不渲染：源文件可能是无扩展名的 WebP/JPEG/PNG，或链接含括号和空格。
- 图片显示尺寸与原页不完全一致：普通 Markdown 图片语法不保留尺寸；使用 `--preserve-image-size`，但仅保留显式图片属性及尺寸相关 inline style，而非任意外部 CSS 布局。
- 大量重复相同图片：通常表示转换器将远程 `/640?...` URL 匹配到了本地 `640` 文件。仅本地化真实本地路径。
- 文章图片缺失：微信将许多真实图片 URL 存在 `data-src` 中，而 `src` 是 1px 占位图。
- Markdown 节奏不佳：转换器输出常在列表项之间插入空行。压紧列表，但段落之间保留空行。
- 依赖 raw 目录：最终 Markdown 不得指向 `00_raw` 或原始抓取 `_files` 目录。
