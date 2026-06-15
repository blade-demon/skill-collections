'use strict';

/*
 * git-insights.js 冒烟测试（零依赖，node 直接跑）：
 *   node scripts/tests/git-insights.test.js
 * 在临时目录造一个真实 git 仓库 + 若干提交，断言：
 * ① churn 排序；② 目录热点聚合；③ 贡献者解析；④ CODEOWNERS 检测；
 * ⑤ 近 N 天活跃文件；⑥ 非 git 目录优雅降级；⑦ 已删除文件标注。
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { isGitRepo, countNameOnly, dirChurn, collect, renderMarkdown } = require('../git-insights');

function g(cwd, args) {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'ignore'] });
}
function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// 纯函数单测：countNameOnly / dirChurn 不依赖 git。
const churn = countNameOnly(['a/b.ts', 'a/b.ts', 'a/c.ts', '', 'README.md'].join('\n'));
assert.deepStrictEqual(churn[0], ['a/b.ts', 2], 'countNameOnly 应按次数降序');
const dirs = dirChurn(churn, 2);
assert.ok(dirs.find((d) => d[0] === 'a')[1] === 3, '目录 a 的 churn 应聚合为 3（b.ts*2 + c.ts*1）');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rspd-git-'));
try {
  // ⑥ 非 git 目录 → 优雅降级
  assert.strictEqual(isGitRepo(tmp), false, '空目录不应被判为 git 仓库');

  // 造一个真实 git 仓库
  g(tmp, ['init', '-q']);
  g(tmp, ['config', 'user.email', 'dev@example.com']);
  g(tmp, ['config', 'user.name', 'Dev One']);
  g(tmp, ['config', 'commit.gpgsign', 'false']);

  // hot.ts 改 3 次，cold.ts 改 1 次，造 churn 差异
  write(tmp, 'src/api/hot.ts', 'v1');
  write(tmp, 'src/pages/cold.tsx', 'v1');
  write(tmp, '.github/CODEOWNERS', '* @team');
  g(tmp, ['add', '.']);
  g(tmp, ['commit', '-q', '-m', 'init']);
  write(tmp, 'src/api/hot.ts', 'v2');
  g(tmp, ['commit', '-qam', 'hot v2']);
  write(tmp, 'src/api/hot.ts', 'v3');
  g(tmp, ['commit', '-qam', 'hot v3']);

  assert.strictEqual(isGitRepo(tmp), true, '初始化后应判为 git 仓库');

  const data = collect(tmp, { top: 10, days: 3650 });

  // ① churn 排序：hot.ts 次数最高
  assert.strictEqual(data.topFiles[0].file, 'src/api/hot.ts', 'hot.ts 应为最高 churn');
  assert.ok(data.topFiles[0].commits >= 3, 'hot.ts 至少 3 次改动');

  // ② 目录热点：src/api 应高于 src/pages
  const apiDir = data.topDirs.find((d) => d.dir === 'src/api');
  const pagesDir = data.topDirs.find((d) => d.dir === 'src/pages');
  assert.ok(
    apiDir && pagesDir && apiDir.commits > pagesDir.commits,
    'src/api 热度应高于 src/pages',
  );

  // ③ 贡献者解析
  assert.ok(
    data.contributors.some((c) => c.who.includes('dev@example.com') && c.commits >= 3),
    '应解析出贡献者 Dev One <dev@example.com>',
  );

  // ④ CODEOWNERS 检测
  assert.strictEqual(data.codeowners, '.github/CODEOWNERS', '应检测到 .github/CODEOWNERS');

  // ⑤ 近 N 天活跃文件非空
  assert.ok(data.recentFiles.length > 0, '近 N 天活跃文件应非空');

  // ⑦ 已删除文件标注：删 cold.tsx 后它仍在 churn 里，但 exists=false
  fs.rmSync(path.join(tmp, 'src/pages/cold.tsx'));
  g(tmp, ['commit', '-qam', 'rm cold']);
  const data2 = collect(tmp, { top: 10, days: 3650 });
  const cold = data2.topFiles.find((f) => f.file === 'src/pages/cold.tsx');
  assert.ok(cold && cold.exists === false, '已删除文件应标 exists=false');

  // 渲染冒烟：markdown 含关键段落且不抛错
  const md = renderMarkdown(data2);
  assert.match(md, /高频改动文件/);
  assert.match(md, /CODEOWNERS/);
  assert.match(md, /已删除\/移动/, '已删除文件应在 markdown 标注');

  console.log('✅ git-insights 冒烟测试通过');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
