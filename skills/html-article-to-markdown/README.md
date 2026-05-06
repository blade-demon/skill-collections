# html-article-to-markdown

把离线保存的 HTML 文章整理成可分享的 Markdown 文档，重点处理微信公众号文章这类 `html + *_files` 离线包。

这个目录同时包含几类内容：

- `SKILL.md`：给 agent 读取的操作流程。
- `src/`：TypeScript 主实现，负责抽正文、修图片、生成 Markdown 和验证产物。
- `bin/html-article-to-markdown.ts`：CLI 入口。
- `tests/`：Node test runner 测试。

## 解决的问题

直接把网页另存为 HTML 后，文章内容通常不能直接分享：

- 页面里混有大量脚本、样式、评论区、赞赏弹窗、浮层和公众号卡片。
- 正文图片经常是懒加载，`src` 是 1px 占位图，真实图片在 `data-src`。
- 离线包里的图片常常没有扩展名，例如 `640`、`640(1)`，Markdown 渲染器容易识别失败。
- 资源路径如果仍指向 `00_raw` 或原始 `_files` 目录，成品文档移动后图片会断。
- 自动转换后的列表和段落经常空行混乱，不适合直接阅读。

这个 skill 的目标是生成“精加工产物”：正文清爽、图片可渲染、路径自包含，后续可以直接分享或继续编辑。

## 核心原理

### 1. 只抽正文容器

微信公众号文章的正文通常在：

```html
<div id="js_content">...</div>
```

TypeScript CLI 会优先抽取这个容器，而不是转换整个页面。这样可以避开微信页面壳层、评论区、弹窗和底部工具栏。

如果不是微信公众号文章，可以用 `--body-id` 指定其他正文容器。CLI 按 id 提取元素，不要求它一定是 `div`，也可以是 `article`、`main` 等标签。

### 2. 用轻量 HTML tokenizer 做结构化转换

TypeScript 实现用项目内的轻量 tokenizer 把常见 HTML 结构映射成 Markdown：

- `h1` - `h6` 转成 Markdown 标题。
- `p`、`section`、`div` 转成段落边界。
- `ul`、`ol`、`li` 转成列表。
- `blockquote` 转成 Markdown 引用块。
- `strong`、`em`、`code` 保留为 Markdown 内联样式。
- `hr` 转成 `---`。
- `img` 进入图片修复逻辑。

转换后会再做一次后处理，压紧连续列表项之间的多余空行。

### 3. 图片按来源分流

图片处理是这个 skill 最关键的部分。

本地图片：

- 只有当 `src` 明确解析为本地相对文件时才本地化，例如 `./..._files/...` 或 `..._files/...`。
- 复制到输出目录下的 `assets/<asset-slug>/`。
- 通过文件头识别真实类型，并补上 `.webp`、`.png`、`.jpg` 等扩展名。
- Markdown 使用相对路径，例如：

```markdown
![01-image](assets/harness-engineering/01-image.webp)
```

懒加载远程图片：

- 如果 `src` 是 `data:image/svg+xml` 这类 1px 占位图，则读取 `data-src`。
- 如果本地离线包没有真实图片副本，则把远程 URL 当作获取源，先用 HTTP 下载。
- 如果直接下载失败，则使用浏览器截图 fallback，把可渲染的图片保存成 `.png`。
- 只有显式传 `--allow-remote-images` 时，最终 Markdown 才允许保留远程 URL。保留时远程 URL 会用尖括号包住，避免 query string、括号等字符破坏 Markdown：

```markdown
![图 4](https://example.com/image/640?wx_fmt=png&from=appmsg)
```

重要规则：

- 不要用远程 URL 的 basename 去匹配本地文件。例如微信图片常以 `/640?...` 结尾，但这不代表它就是离线目录里的 `640`。
- 否则很容易把很多不同远程图都错误替换成同一张本地图。

### 4. 成品与 raw 解耦

最终 Markdown 不应该引用：

- `00_raw`
- 原始 `*_files`
- `data:image`

可分享文章应该只引用：

- 输出目录内的 `assets/<asset-slug>/...`
- 或在显式 `--allow-remote-images` 下保留的远程图片 URL

CLI 会清理标题中的路径非法字符，只把安全化后的标题用于 `.md` 文件名；Markdown 内部的文章标题保持原文。

## 使用方式

首次使用先安装依赖：

```bash
npm install
npx playwright install chromium
```

截图 fallback 使用 Playwright。它只会在远程图片直接下载失败时启动浏览器。

基础命令：

```bash
npm run convert -- \
  --html "raw/articles/example-article.html" \
  --out-dir "output/articles" \
  --asset-slug "example-article" \
  --verify
```

微信公众号文章建议加上：

```bash
--drop-footer-promo
```

完整示例：

```bash
npm run convert -- \
  --html "raw/articles/example-article.html" \
  --out-dir "output/articles" \
  --asset-slug "example-article" \
  --drop-footer-promo \
  --verify
```

### 远程 URL 模式

除了本地离线包，也可以直接传一个 URL，CLI 会用 Playwright 启动 Chromium 渲染页面、自动滚动触发懒加载、把 `data-src` 提升为 `src`、把相对 URL 转成绝对 URL，然后展开 Shadow DOM。最终把渲染后的 `<body>` 内容包装到 `<div id="js_content">` 里写到一个临时 HTML 文件，再走和本地 HTML 完全一致的转换流程。

基础命令：

```bash
npm run convert -- \
  --url "https://example.com/article" \
  --out-dir "output/articles" \
  --asset-slug "example-article" \
  --verify
```

需要登录才能访问的页面：

```bash
npm run convert -- \
  --url "https://example.com/private-article" \
  --out-dir "output/articles" \
  --asset-slug "private-article" \
  --wait-mode
```

`--wait-mode` 会启动一个有界面的 Chromium，加载完页面后 CLI 在终端等你确认；登录或滚动到合适位置后回车，再开始抓取。

URL 模式下的额外选项：

- `--wait-mode`：headed 浏览器 + 等回车，用于登录页或需要手动操作的页面。
- `--fetch-timeout <ms>`：页面加载超时，默认 30000。

**依赖说明**：`--url` 模式下 Playwright 是必需依赖，首次使用前要执行：

```bash
npm install
npx playwright install chromium
```

`--url` 与 `--html` 互斥，必须二选一。

如果正文容器不是 `js_content`：

```bash
npm run convert -- \
  --html "path/to/article.html" \
  --out-dir "path/to/output" \
  --asset-slug "article-name" \
  --body-id "article" \
  --verify
```

## 输出结构

CLI 会生成：

```text
output/articles/
├── Article Title.md
└── assets/
    └── example-article/
        ├── 01-image.webp
        ├── 02-image.webp
        └── ...
```

输出的 Markdown 顶部会尽量包含：

```markdown
# 标题

> 作者：...
> 来源：...
> 发布时间：...
```

## 验证方式

生成时建议加 `--verify`。CLI 会输出类似报告：

```text
verification:
  raw_dependencies: 0
  local_images: 8
  remote_images: 0
  missing_local_images: 0
```

如果仍有 `00_raw`、`_files`、`data:image`、远程图片或缺失本地图片，`--verify` 会以非零状态退出。只有显式传 `--allow-remote-images` 时，远程图片才不会让验证失败。

图片相关选项：

```bash
--allow-remote-images
--preserve-image-size
--no-localize-remote-images
--no-screenshot-on-download-fail
--image-timeout 20000
```

默认策略是归档优先：最终展示图片应保存到本地。如果远程图既不能下载，也不能被浏览器渲染截图，CLI 会失败并报告具体 URL 和失败原因。

如果需要尽量保持原 HTML 里的图片显示尺寸，使用：

```bash
--preserve-image-size
```

开启后，图片会从 Markdown 图片语法切换为 HTML `<img>` 标签，并保留原 `<img>` 上显式写出的 `width`、`height`，以及 `width`、`height`、`max-width`、`max-height` 等尺寸相关 inline style。它不计算任意外部 CSS 布局，所以无法保证所有 Markdown 渲染器中的视觉尺寸都和原网页完全一致。

需要人工复核时，再执行以下检查。

检查是否还依赖 raw 目录或占位图：

```bash
rg -n "00_raw|_files|data:image|https?://" "output/articles/Article Title.md"
```

检查本地图片是否存在：优先使用生成时的 `--verify` 报告，它会同时检查 Markdown 图片和 HTML `<img>`。

检查文章格式：

```bash
sed -n '1,140p' "output/articles/Article Title.md"
```

重点看：

- 列表项之间是否有异常空行。
- 标题层级是否合理。
- 是否残留“公众号”“赞赏”“评论”等页面壳层内容。
- 图片 alt 是否需要人工优化。

## 和 SKILL.md 的关系

`SKILL.md` 是给 agent 使用的精简流程说明。它强调什么时候触发、怎么处理、怎么验证。

`README.md` 是给人 onboarding 的说明。它解释实现原理、CLI 参数、输出结构和排错方式。

维护时优先保证二者一致：

- 流程变了，更新 `SKILL.md`。
- 参数或 CLI 行为变了，更新 `README.md` 的使用示例。
- 新增常见坑，两个文件都可以补充，但 `SKILL.md` 要保持简洁。
