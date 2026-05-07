import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmpDir = "/private/tmp/html-article-to-markdown-assets";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const palette = {
  ink: "#132238",
  muted: "#5b677a",
  blue: "#2f6df6",
  teal: "#19b6a4",
  amber: "#f5b642",
  red: "#ee5f5b",
  bg: "#f6f8fb",
  panel: "#ffffff",
  line: "#d9e2ef",
  dark: "#101827",
};

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlPage({ width, height, body, title = "asset" }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      margin: 0;
      overflow: hidden;
      background: ${palette.bg};
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: ${palette.ink};
    }
    .asset {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background:
        radial-gradient(circle at 8% 15%, rgba(47,109,246,.22), transparent 28%),
        radial-gradient(circle at 94% 8%, rgba(25,182,164,.18), transparent 30%),
        linear-gradient(135deg, #f9fbff 0%, #eef4fb 100%);
    }
    .band {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(19,34,56,.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(19,34,56,.045) 1px, transparent 1px);
      background-size: 52px 52px;
      mask-image: linear-gradient(90deg, transparent 0%, #000 18%, #000 82%, transparent 100%);
    }
    .content {
      position: relative;
      z-index: 1;
      height: 100%;
      display: grid;
      grid-template-columns: 740px 1fr;
      gap: 56px;
      padding: 74px 88px;
      align-items: center;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      border: 1px solid rgba(47,109,246,.18);
      border-radius: 999px;
      background: rgba(255,255,255,.78);
      color: ${palette.blue};
      font-weight: 700;
      font-size: 24px;
      letter-spacing: 0;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${palette.teal};
      box-shadow: 0 0 0 6px rgba(25,182,164,.14);
    }
    h1 {
      margin: 34px 0 22px;
      font-size: 78px;
      line-height: 1.03;
      letter-spacing: 0;
      max-width: 760px;
    }
    p {
      margin: 0;
      max-width: 660px;
      font-size: 30px;
      line-height: 1.45;
      color: ${palette.muted};
    }
    .mock {
      position: relative;
      min-height: 556px;
    }
    .panel {
      position: absolute;
      border: 1px solid rgba(19,34,56,.1);
      background: rgba(255,255,255,.9);
      border-radius: 20px;
      box-shadow: 0 24px 80px rgba(19,34,56,.14);
      overflow: hidden;
    }
    .panel-head {
      height: 48px;
      border-bottom: 1px solid #e7edf5;
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 0 18px;
      background: #fbfdff;
    }
    .light { width: 12px; height: 12px; border-radius: 50%; background: #c9d5e4; }
    .light:nth-child(1) { background: ${palette.red}; }
    .light:nth-child(2) { background: ${palette.amber}; }
    .light:nth-child(3) { background: ${palette.teal}; }
    .code {
      font-family: "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace;
      font-size: 23px;
      line-height: 1.55;
      color: #24324a;
      white-space: pre;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 42px;
      padding: 0 16px;
      border-radius: 999px;
      background: #edf5ff;
      color: ${palette.blue};
      font-weight: 700;
      font-size: 20px;
    }
    .mini-title {
      font-size: 22px;
      font-weight: 800;
      color: ${palette.ink};
    }
    .caption {
      color: ${palette.muted};
      font-size: 18px;
      line-height: 1.4;
    }
    .arrow {
      position: absolute;
      width: 126px;
      height: 126px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, ${palette.blue}, ${palette.teal});
      color: white;
      font-size: 58px;
      font-weight: 900;
      box-shadow: 0 18px 42px rgba(47,109,246,.28);
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function banner({ title, eyebrow, subtitle, mock }) {
  return htmlPage({
    width: 1864,
    height: 800,
    title,
    body: `<main class="asset">
      <div class="band"></div>
      <section class="content">
        <div>
          <div class="eyebrow"><span class="dot"></span>${esc(eyebrow)}</div>
          <h1>${esc(title)}</h1>
          <p>${esc(subtitle)}</p>
        </div>
        <div class="mock">${mock}</div>
      </section>
    </main>`,
  });
}

function featureMocks() {
  return [
    {
      file: "assets/feature-01-article-extraction.png",
      title: "正文结构提取",
      eyebrow: "清爽 Markdown",
      subtitle:
        "保留文章正文、标题、引用、列表和图片，同时移除页面壳层与推广噪音。",
      mock: `<div class="panel" style="left:10px; top:20px; width:420px; height:470px;">
          <div class="panel-head"><span class="light"></span><span class="light"></span><span class="light"></span></div>
          <div style="padding:26px;">
            <div class="caption" style="margin-bottom:14px;">保存的 HTML</div>
            <div style="height:36px; background:#d9e2ef; border-radius:8px; margin-bottom:14px;"></div>
            <div style="height:18px; background:#edf1f6; border-radius:8px; margin-bottom:10px;"></div>
            <div style="height:18px; background:#edf1f6; border-radius:8px; margin-bottom:28px; width:78%;"></div>
            <div style="height:120px; background:linear-gradient(135deg,#c9d8f4,#e9eef7); border-radius:14px; margin-bottom:24px;"></div>
            <div style="height:18px; background:#edf1f6; border-radius:8px; margin-bottom:10px;"></div>
            <div style="height:18px; background:#edf1f6; border-radius:8px; margin-bottom:10px; width:88%;"></div>
            <div style="height:74px; background:#fff0f0; border:1px solid #ffd4d4; border-radius:12px;"></div>
          </div>
        </div>
        <div class="arrow" style="left:364px; top:216px;">→</div>
        <div class="panel" style="left:520px; top:70px; width:472px; height:420px;">
          <div class="panel-head"><span class="pill">Markdown</span></div>
          <div class="code" style="padding:28px;"># 文章标题

&gt; 来源信息

## 正文小节

清理后的段落文本。

&gt; 重要引用

![image](assets/...)</div>
        </div>`,
    },
    {
      file: "assets/feature-02-local-image-archive.png",
      title: "本地图片归档",
      eyebrow: "自包含输出",
      subtitle:
        "将文章图片复制或下载到稳定的本地资源目录，避免外链失效后图片丢失。",
      mock: `<div class="panel" style="left:20px; top:56px; width:360px; height:390px;">
          <div class="panel-head"><span class="mini-title">远程页面</span></div>
          <div style="padding:26px; display:grid; gap:18px;">
            <div style="height:82px; border-radius:16px; background:#eef3f9;"></div>
            <div style="height:82px; border-radius:16px; background:#eef3f9;"></div>
            <div style="height:82px; border-radius:16px; background:#eef3f9;"></div>
          </div>
        </div>
        <div class="arrow" style="left:335px; top:190px;">↓</div>
        <div class="panel" style="left:496px; top:28px; width:490px; height:480px;">
          <div class="panel-head"><span class="mini-title">assets/example-article</span></div>
          <div style="padding:26px; display:grid; gap:15px;">
            ${[
              "01-cover.webp",
              "02-diagram.png",
              "03-photo.jpg",
              "04-screenshot.png",
            ]
              .map(
                (
                  name,
                  i,
                ) => `<div style="display:flex; align-items:center; gap:16px; height:72px; padding:0 18px; border:1px solid #e4ebf4; border-radius:16px; background:#fbfdff;">
              <div style="width:42px; height:42px; border-radius:10px; background:${i === 3 ? palette.teal : palette.blue}; opacity:.86;"></div>
              <div class="code" style="font-size:21px;">${name}</div>
            </div>`,
              )
              .join("")}
          </div>
        </div>`,
    },
    {
      file: "assets/feature-03-remote-recovery.png",
      title: "下载与截图恢复",
      eyebrow: "图片韧性",
      subtitle:
        "当远程图片无法直接下载时，转换器可在浏览器中渲染图片，并保存本地 PNG 兜底。",
      mock: `<div class="panel" style="left:10px; top:65px; width:380px; height:360px;">
          <div class="panel-head"><span class="mini-title">HTTP 下载</span></div>
          <div style="padding:34px; text-align:center;">
            <div style="font-size:92px; color:${palette.red}; font-weight:900;">403</div>
            <div class="caption">被远程服务器阻止</div>
          </div>
        </div>
        <div class="arrow" style="left:350px; top:178px;">→</div>
        <div class="panel" style="left:512px; top:30px; width:462px; height:455px;">
          <div class="panel-head"><span class="mini-title">浏览器兜底</span></div>
          <div style="padding:26px;">
            <div style="height:245px; border-radius:20px; background:linear-gradient(135deg,#d7ecff,#d7fff6); display:grid; place-items:center;">
              <div style="width:170px; height:120px; border-radius:18px; border:8px solid white; box-shadow:0 18px 45px rgba(19,34,56,.16); background:linear-gradient(135deg,${palette.blue},${palette.teal});"></div>
            </div>
            <div style="margin-top:24px; display:flex; justify-content:space-between; align-items:center;">
              <span class="pill">screenshot.png</span>
              <span style="color:${palette.teal}; font-size:34px; font-weight:900;">✓</span>
            </div>
          </div>
        </div>`,
    },
    {
      file: "assets/feature-06-inline-base64.png",
      title: "图片内联 Base64",
      eyebrow: "单文件 Markdown",
      subtitle:
        "本地 HTML 和远程 URL 都可把恢复后的图片写入 Markdown，无需携带 assets 目录。",
      mock: `<div class="panel" style="left:10px; top:52px; width:372px; height:410px;">
          <div class="panel-head"><span class="mini-title">输入来源</span></div>
          <div style="padding:26px; display:grid; gap:18px;">
            <div style="height:106px; border:1px solid #e4ebf4; border-radius:18px; background:#fbfdff; padding:20px;">
              <div class="pill">--html</div>
              <div class="code" style="font-size:20px; margin-top:14px;">article.html</div>
            </div>
            <div style="height:106px; border:1px solid #e4ebf4; border-radius:18px; background:#fbfdff; padding:20px;">
              <div class="pill" style="background:#e9fbf8; color:${palette.teal};">--url</div>
              <div class="code" style="font-size:20px; margin-top:14px;">https://...</div>
            </div>
            <div style="height:70px; border-radius:16px; background:#fff7e8; color:#9a6817; display:grid; place-items:center; font-weight:900; font-size:22px;">--embed-images-base64</div>
          </div>
        </div>
        <div class="arrow" style="left:348px; top:192px;">→</div>
        <div class="panel" style="left:512px; top:28px; width:508px; height:508px;">
          <div class="panel-head"><span class="mini-title">Article.md</span></div>
          <div class="code" style="padding:28px; font-size:20px; white-space:pre-wrap;"># 文章标题

![cover](data:image/png;base64,
iVBORw0KGgoAAAANSUhEUgAA...)

verification:
  embedded_images: 8
  remote_images: 0</div>
          <div style="position:absolute; right:26px; bottom:24px; width:192px; height:74px; border:2px dashed #d9e2ef; border-radius:18px; color:#94a3b8; display:grid; place-items:center; font-weight:900; font-size:24px; transform:rotate(-2deg);">
            no assets/
            <div style="position:absolute; width:210px; height:5px; border-radius:999px; background:${palette.red}; transform:rotate(-18deg); opacity:.86;"></div>
          </div>
        </div>`,
    },
    {
      file: "assets/feature-04-strict-verification.png",
      title: "严格结果校验",
      eyebrow: "放心分享",
      subtitle:
        "内置检查会在 Markdown 离开本机前报告 raw 目录引用、远程图片链接和缺失的本地资源。",
      mock: `<div class="panel" style="left:48px; top:34px; width:830px; height:480px;">
          <div class="panel-head"><span class="pill">--verify</span></div>
          <div class="code" style="padding:34px; font-size:25px;">verification:
  raw 依赖: 0
  本地图片: 8
  内联图片: 8
  远程图片: 0
  缺失图片: 0</div>
          <div style="position:absolute; right:34px; bottom:34px; display:grid; grid-template-columns:repeat(2, 154px); gap:14px;">
            ${["raw 清理完成", "8 张本地图", "8 张内联图", "0 张缺失图"].map((label) => `<div style="height:58px; border-radius:16px; background:#edfdf9; color:#0a8d7e; display:grid; place-items:center; font-weight:800; font-size:20px;">${label}</div>`).join("")}
          </div>
        </div>`,
    },
    {
      file: "assets/feature-05-size-aware-output.png",
      title: "保留图片尺寸",
      eyebrow: "布局还原",
      subtitle:
        "使用 HTML 图片标签保留原文章中显式声明的宽高和尺寸相关 inline style。",
      mock: `<div class="panel" style="left:12px; top:70px; width:450px; height:400px;">
          <div class="panel-head"><span class="mini-title">原始 HTML</span></div>
          <div style="padding:30px;">
            <div style="width:320px; height:180px; border-radius:20px; background:linear-gradient(135deg,#d6e6ff,#d9fff7); border:8px solid white; box-shadow:0 15px 45px rgba(19,34,56,.13);"></div>
            <div class="code" style="margin-top:26px; font-size:19px;">width="320"
height="180"</div>
          </div>
        </div>
        <div class="arrow" style="left:415px; top:204px;">→</div>
        <div class="panel" style="left:574px; top:64px; width:424px; height:410px;">
          <div class="panel-head"><span class="mini-title">Markdown 输出</span></div>
          <div class="code" style="padding:30px; font-size:21px; white-space:pre-wrap;">&lt;img
  src="assets/01.png"
  alt="Diagram"
  width="320"
  height="180"
  style="max-width: 100%;"&gt;</div>
        </div>`,
    },
  ];
}

function logoHtml() {
  return htmlPage({
    width: 256,
    height: 256,
    title: "logo",
    body: `<main style="width:256px; height:256px; background:linear-gradient(135deg,#10213a,#216cf6 56%,#18b6a4); display:grid; place-items:center;">
      <div style="position:relative; width:196px; height:164px;">
        <div style="position:absolute; left:0; top:18px; width:106px; height:128px; border-radius:28px; background:rgba(255,255,255,.95); box-shadow:0 22px 50px rgba(0,0,0,.22); display:grid; place-items:center;">
          <div style="font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:34px; font-weight:900; color:#132238; letter-spacing:-3px;">&lt;/&gt;</div>
          <div style="position:absolute; left:22px; bottom:24px; width:62px; height:9px; border-radius:999px; background:#f5b642;"></div>
        </div>
        <div style="position:absolute; left:78px; top:59px; width:58px; height:46px; border-radius:23px; background:#132238; display:grid; place-items:center; box-shadow:0 16px 36px rgba(19,34,56,.32); z-index:2;">
          <div style="color:white; font-size:34px; font-weight:900; line-height:1;">→</div>
        </div>
        <div style="position:absolute; right:0; top:18px; width:106px; height:128px; border-radius:28px; background:rgba(255,255,255,.97); box-shadow:0 22px 50px rgba(0,0,0,.22); display:grid; place-items:center;">
          <div style="font-size:58px; font-weight:950; color:#216cf6; line-height:1;">#</div>
          <div style="position:absolute; left:26px; bottom:25px; width:54px; height:9px; border-radius:999px; background:#19b6a4;"></div>
        </div>
      </div>
    </main>`,
  });
}

async function renderPng(relativeOutput, html, width, height) {
  const outputPath = resolve(root, relativeOutput);
  const htmlPath = resolve(
    tmpDir,
    `${relativeOutput.replaceAll("/", "-")}.html`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, html, "utf8");
  await execFileAsync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    `--screenshot=${outputPath}`,
    `file://${htmlPath}`,
  ]);
}

await renderPng("logo.png", logoHtml(), 256, 256);
for (const feature of featureMocks()) {
  await renderPng(feature.file, banner(feature), 1864, 800);
}
