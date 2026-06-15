#!/usr/bin/env node
'use strict';

/*
 * react-spring-project-doc — Git 历史洞察脚本
 *
 * 产出纯确定性的 git 信号，喂 P1 探索 / P7 onboarding & troubleshooting：
 * 高频改动文件、目录热点、主要贡献者、CODEOWNERS、近 N 天活跃文件。
 *
 * 用法：
 *   node git-insights.js --project <项目根> [--top N] [--days N] [--json] [--out <path>]
 *
 * 退出码：0 = 正常（含「git 不可用」这一非错误情形）；2 = 用法错误。
 *
 * 诚实边界：git 数据是事实（高置信度）；「热点≈坑」是经验推断，消费方须按置信度规则标注。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/** 跑一条 git 命令，返回 stdout 文本；失败抛错（由调用方决定降级）。 */
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function isGitRepo(root) {
  try {
    return git(root, ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch {
    return false;
  }
}

function isShallow(root) {
  try {
    return git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true';
  } catch {
    return false;
  }
}

/** 把若干 `--name-only` 日志输出聚合成 [ [file, count], ... ]，按次数降序。 */
function countNameOnly(out) {
  const counts = new Map();
  for (const line of out.split(/\r?\n/)) {
    const f = line.trim();
    if (!f) continue;
    counts.set(f, (counts.get(f) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** 全历史文件改动次数（churn）。 */
function fileChurn(root) {
  return countNameOnly(git(root, ['log', '--no-merges', '--pretty=format:', '--name-only']));
}

/** 由文件 churn 聚合成目录热点；depth 控制取前几段路径。 */
function dirChurn(churn, depth) {
  const counts = new Map();
  for (const [file, n] of churn) {
    const parts = file.split('/');
    const dir =
      parts.length <= 1 ? '(根)' : parts.slice(0, Math.min(depth, parts.length - 1)).join('/');
    counts.set(dir, (counts.get(dir) || 0) + n);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** 主要贡献者：解析 `git shortlog -sne` 的「次数\t名字 <邮箱>」。 */
function contributors(root) {
  const out = git(root, ['shortlog', '-sne', '--no-merges', 'HEAD']);
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d+)\s+(.*)$/);
      return m ? { commits: Number(m[1]), who: m[2] } : null;
    })
    .filter(Boolean);
}

/** 近 days 天活跃文件。 */
function recentFiles(root, days) {
  const out = git(root, [
    'log',
    `--since=${days} days ago`,
    '--no-merges',
    '--pretty=format:',
    '--name-only',
  ]);
  return countNameOnly(out);
}

const CODEOWNERS_PATHS = [
  'CODEOWNERS',
  '.github/CODEOWNERS',
  'docs/CODEOWNERS',
  '.gitlab/CODEOWNERS',
];
function findCodeowners(root) {
  for (const rel of CODEOWNERS_PATHS) {
    if (fs.existsSync(path.join(root, rel))) return rel;
  }
  return null;
}

/** 汇总全部信号。调用方需先确认 isGitRepo(root)。 */
function collect(root, { top = 15, days = 90 } = {}) {
  const churn = fileChurn(root);
  return {
    shallow: isShallow(root),
    topFiles: churn.slice(0, top).map(([file, commits]) => ({
      file,
      commits,
      exists: fs.existsSync(path.join(root, file)),
    })),
    topDirs: dirChurn(churn, 2)
      .slice(0, top)
      .map(([dir, commits]) => ({ dir, commits })),
    contributors: contributors(root).slice(0, top),
    codeowners: findCodeowners(root),
    recentFiles: recentFiles(root, days)
      .slice(0, top)
      .map(([file, commits]) => ({ file, commits })),
    days,
  };
}

function renderMarkdown(data) {
  const lines = [];
  lines.push('# Git 历史洞察');
  lines.push('');
  lines.push('> git 数据为事实（高置信度）；「热点≈坑」是经验推断，进文档时按置信度规则标注。');
  if (data.shallow) {
    lines.push('>');
    lines.push('> ⚠️ 浅克隆（shallow）：churn 与贡献者统计仅覆盖现有历史，可能不完整。');
  }
  lines.push('');

  lines.push(`## 高频改动文件 Top ${data.topFiles.length}`);
  lines.push('');
  for (const { file, commits, exists } of data.topFiles) {
    lines.push(`- \`${file}\` — ${commits} 次${exists ? '' : '（已删除/移动）'}`);
  }
  lines.push('');

  lines.push(`## 目录热点 Top ${data.topDirs.length}`);
  lines.push('');
  for (const { dir, commits } of data.topDirs) lines.push(`- \`${dir}\` — ${commits} 次`);
  lines.push('');

  lines.push(`## 主要贡献者 Top ${data.contributors.length}`);
  lines.push('');
  for (const { commits, who } of data.contributors) lines.push(`- ${who} — ${commits} 次提交`);
  lines.push('');

  lines.push('## CODEOWNERS');
  lines.push('');
  lines.push(data.codeowners ? `- \`${data.codeowners}\`` : '- 未发现');
  lines.push('');

  lines.push(`## 近 ${data.days} 天活跃文件 Top ${data.recentFiles.length}`);
  lines.push('');
  if (data.recentFiles.length === 0) lines.push('- 无（近期无提交或历史不足）');
  for (const { file, commits } of data.recentFiles) lines.push(`- \`${file}\` — ${commits} 次`);
  lines.push('');

  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { top: 15, days: 90, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = argv[++i];
    else if (a === '--top') args.top = Number(argv[++i]);
    else if (a === '--days') args.days = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--json') args.json = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error(
      '用法: node git-insights.js --project <项目根> [--top N] [--days N] [--json] [--out <path>]',
    );
    process.exit(2);
  }
  const root = path.resolve(args.project);

  if (!isGitRepo(root)) {
    const msg =
      'git 信息不可用：非 git 仓库，或本机未安装 git。本节在文档里标「git 信息不可用」即可，不阻塞流程。';
    if (args.out) fs.writeFileSync(args.out, `# Git 历史洞察\n\n> ${msg}\n`);
    console.log(msg);
    process.exit(0);
  }

  const data = collect(root, { top: args.top, days: args.days });
  const output = args.json ? JSON.stringify(data, null, 2) : renderMarkdown(data);
  if (args.out) {
    fs.writeFileSync(args.out, output + (args.json ? '\n' : ''));
    console.log(`已写入 ${args.out}`);
  } else {
    console.log(output);
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  isGitRepo,
  isShallow,
  countNameOnly,
  fileChurn,
  dirChurn,
  contributors,
  recentFiles,
  findCodeowners,
  collect,
  renderMarkdown,
};
