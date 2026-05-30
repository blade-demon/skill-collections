# 变更日志

## 0.3.0 - 2026-05-07

### 新功能

- 新增 `--embed-images-base64`，将恢复的本地、远程及截图 fallback 图片直接嵌入 Markdown。
- 新增 `embedded_images` 验证报告；启用 base64 嵌入时允许故意的 data 图片。

### 文档

- 为本地 HTML 与远程 URL 转换模式补充 base64 图片嵌入文档。
- 新增内联 base64 输出功能图，并更新验证示意图以包含新的内嵌图片指标。

## 0.2.0 - 2026-05-06

### 新功能

- 新增 `--url <url>`，通过 Playwright 抓取并转换远程文章。
- 新增 `--wait-mode`，用于需登录页面（有界面浏览器，按 Enter 后抓取）。
- 新增 `--fetch-timeout <ms>` 控制页面加载超时（默认 30000）。

### 文档

- 在 `SKILL.md` 与 `README.md` 中记录远程 URL 模式，含 Playwright 安装要求。

## 0.1.0 - 2026-05-06

### 新功能

- 新增 TypeScript CLI，将已保存 HTML 文章包转换为 Markdown。
- 默认通过本地复制、远程下载和浏览器截图 fallback 本地化文章图片。
- 新增对 raw 依赖、远程图片引用和缺失本地图片的严格验证。
- 新增 `--allow-remote-images` 用于显式远程图片 fallback。
- 新增 `--preserve-image-size`，输出带显式源图片尺寸元数据的 HTML `<img>` 标签。

### 文档

- 记录安装、转换、图片处理、验证及面向发布的包用法。
