#!/usr/bin/env node
'use strict';

/*
 * react-spring-project-doc — P8 确定性校验脚本
 *
 * 用途：自动核对最终文档（docs/*.md）里引用的「文件路径」与「代码符号」是否真实存在，
 * 替代手工 Grep。手工核对易踩三类坑（本脚本规避）：
 *   ① rg -o 多文件时前缀文件名 → 这里逐文件读取，路径 token 不掺文件名；
 *   ② 正则 `js` 抢先匹配 `.json` → 这里抓完整 token 后「按最后一个点的扩展名查集合」，不靠交替顺序；
 *   ③ `class User` 子串误命中 `UserContext` → 符号匹配带词界。
 *
 * 用法：
 *   node validate-docs.js --project <目标项目根> [--docs <docs目录>] [--symbols] [--strict]
 *
 * 退出码：0 = 无硬失败；1 = 存在缺失（带 `/` 的路径定位失败，或 --strict 下的告警）；2 = 用法错误。
 */

const fs = require('fs');
const path = require('path');

// 代码文件扩展名白名单。用集合判断，规避「js|json」这类正则交替顺序坑。
const CODE_EXT = new Set([
  'java', 'kt', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue',
  'json', 'yml', 'yaml', 'xml', 'properties', 'gradle',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', '.next', '.vite',
  'coverage', 'out', '.idea', '.gradle', '.analysis',
]);

/** 递归索引项目下所有文件，返回 { relPaths:Set, byBasename:Map<name,relPath[]> }。 */
function indexProject(root) {
  const relPaths = new Set();
  const byBasename = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name)) walk(path.join(dir, e.name));
      } else if (e.isFile()) {
        const abs = path.join(dir, e.name);
        const rel = path.relative(root, abs).split(path.sep).join('/');
        relPaths.add(rel);
        const list = byBasename.get(e.name) || [];
        list.push(rel);
        byBasename.set(e.name, list);
      }
    }
  };
  walk(root);
  return { relPaths, byBasename };
}

/** 从文本抽取候选路径 token：连续的 [\w./-]，以 .<已知扩展名> 结尾。 */
function extractPathRefs(text) {
  const out = new Set();
  const re = /[A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z0-9]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const token = m[0];
    // 跳过 glob 写法（如 `*Request.java` 指代一组 DTO），它不是字面文件名。
    if (text[m.index - 1] === '*') continue;
    const ext = token.slice(token.lastIndexOf('.') + 1).toLowerCase();
    if (CODE_EXT.has(ext)) out.add(token);
  }
  return out;
}

/** 从文本抽取反引号包裹的符号：`Class` 或 `Class.method`（仅大写开头，降噪）。 */
function extractSymbolRefs(text) {
  const out = new Set();
  const re = /`([A-Z][A-Za-z0-9_]+(?:\.[A-Za-z_][A-Za-z0-9_]+)?)`/g;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return out;
}

/** 路径引用定位：直达 / 后缀匹配 / 未命中。 */
function locatePath(ref, index, root) {
  if (fs.existsSync(path.join(root, ref))) return 'ok';
  for (const rel of index.relPaths) {
    if (rel === ref || rel.endsWith('/' + ref)) return 'ok';
  }
  return 'miss';
}

/** 符号存在性：按词界在源文件内容里搜，命中即返回 true（短路）。 */
function symbolExists(symbol, index, root) {
  const klass = symbol.split('.')[0];
  const re = new RegExp('\\b' + klass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  for (const rel of index.relPaths) {
    const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase();
    if (!CODE_EXT.has(ext)) continue;
    let content;
    try {
      content = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (re.test(content)) return true;
  }
  return false;
}

function collectMdFiles(docsDir) {
  let entries;
  try {
    entries = fs.readdirSync(docsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => path.join(docsDir, e.name));
}

function parseArgs(argv) {
  const args = { symbols: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = argv[++i];
    else if (a === '--docs') args.docs = argv[++i];
    else if (a === '--symbols') args.symbols = true;
    else if (a === '--strict') args.strict = true;
  }
  return args;
}

/** 核心：返回 { hardMiss, softMiss, symbolMiss, checked }。 */
function validate({ project, docs, symbols }) {
  const root = path.resolve(project);
  const docsDir = docs ? path.resolve(docs) : path.join(root, 'docs');
  const index = indexProject(root);
  const mdFiles = collectMdFiles(docsDir);

  const hardMiss = []; // 带 '/' 的路径未定位
  const softMiss = []; // 裸文件名未定位（歧义，告警）
  const symbolMiss = []; // 符号未找到（告警）
  let checkedPaths = 0;
  let checkedSymbols = 0;

  for (const file of mdFiles) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');

    for (const ref of extractPathRefs(text)) {
      checkedPaths++;
      const status = locatePath(ref, index, root);
      if (status === 'miss') {
        (ref.includes('/') ? hardMiss : softMiss).push({ doc: rel, ref });
      }
    }

    if (symbols) {
      for (const sym of extractSymbolRefs(text)) {
        checkedSymbols++;
        if (!symbolExists(sym, index, root)) symbolMiss.push({ doc: rel, ref: sym });
      }
    }
  }

  return { root, docsDir, mdCount: mdFiles.length, hardMiss, softMiss, symbolMiss, checkedPaths, checkedSymbols };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error('用法: node validate-docs.js --project <目标项目根> [--docs <docs目录>] [--symbols] [--strict]');
    process.exit(2);
  }
  const r = validate(args);

  console.log(`项目: ${r.root}`);
  console.log(`文档目录: ${r.docsDir}（${r.mdCount} 份 .md）`);
  console.log(`核对路径引用: ${r.checkedPaths}${args.symbols ? `，符号引用: ${r.checkedSymbols}` : ''}`);

  const print = (title, list) => {
    if (!list.length) return;
    console.log(`\n${title}（${list.length}）:`);
    for (const { doc, ref } of list) console.log(`  ✗ [${doc}] ${ref}`);
  };

  print('❌ 缺失路径（带目录，硬失败）', r.hardMiss);
  print('⚠️ 裸文件名未定位（需人工确认）', r.softMiss);
  if (args.symbols) print('⚠️ 符号未找到（需人工确认，可能为泛型/工具误差）', r.symbolMiss);

  const hardFail = r.hardMiss.length > 0 || (args.strict && (r.softMiss.length > 0 || r.symbolMiss.length > 0));
  if (!hardFail && !r.softMiss.length && !r.symbolMiss.length) {
    console.log('\n✅ 全部通过：文档引用的路径均可定位。');
  } else if (!hardFail) {
    console.log('\n✅ 无硬失败（仅告警，见上；如需将告警视为失败请加 --strict）。');
  } else {
    console.log('\n❌ 校验未通过。按 templates/08-validation.md 的失败处理规则修正文档或移入待确认。');
  }
  process.exit(hardFail ? 1 : 0);
}

if (require.main === module) main();

module.exports = {
  indexProject,
  extractPathRefs,
  extractSymbolRefs,
  locatePath,
  symbolExists,
  validate,
};
