#!/usr/bin/env node
'use strict';

/*
 * react-spring-project-doc — 接口抽取脚本（P2/P3/P4 的【种子】）
 *
 * 正则 best-effort 抽取：
 *   - 后端 Java：@RestController/@Controller 的类级 @RequestMapping 前缀 + 方法级
 *     @GetMapping/@PostMapping/@PutMapping/@DeleteMapping/@PatchMapping/@RequestMapping，
 *     拼出 HTTP 方法 + 完整 URL + Controller.method + file:line。
 *   - 前端 TS/JS：axios.<method>(...)、自建实例 <ident>.<method>(...)、fetch(...)、axios({...})，
 *     抓 URL 字符串原文 + HTTP 方法 + file:line。
 *
 * 这是【种子】不是事实：P2/P3 须逐条用 Grep 核对真实存在后再登记证据账本；
 * 动态 URL（模板变量、SpEL ${...}、运行时拼接）标 confidence: "needs-review"，绝不猜。
 * 输出结构对齐 schemas/index-json.md 的 api/symbols 思路，便于 P7 装配 index.json。
 *
 * 用法：
 *   node extract-endpoints.js --project <项目根> [--out <path>]
 * 退出码：0 = 正常；2 = 用法错误。
 */

const fs = require('fs');
const path = require('path');
const { indexProject } = require('./lib/project-index');

const JAVA_EXT = new Set(['java', 'kt']);
const FRONT_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']);
// 常见非 HTTP 的 .get/.set 调用对象，降噪用。
const FRONT_DENY = new Set([
  'localStorage',
  'sessionStorage',
  'params',
  'searchParams',
  'formData',
  'headers',
  'cache',
  'map',
  'store',
  'state',
  'query',
  'cookies',
  'Object',
  'Reflect',
]);

const HTTP_BY_ANNOTATION = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  DeleteMapping: 'DELETE',
  PatchMapping: 'PATCH',
};

function isTestPath(rel) {
  return (
    /(?:^|\/)(?:test|tests|__tests__|__mocks__)\//.test(rel) ||
    /\.(?:test|spec)\.[tj]sx?$/.test(rel) ||
    /\.d\.ts$/.test(rel) ||
    /\/src\/test\//.test(rel)
  );
}

/** 把类前缀与方法路径拼成规范 URL。 */
function joinUrl(base, p) {
  const a = (base || '').trim();
  const b = (p || '').trim();
  let url = `${a}/${b}`.replace(/\/{2,}/g, '/');
  if (url.length > 1) url = url.replace(/\/$/, '');
  if (!url.startsWith('/')) url = '/' + url;
  return url || '/';
}

/** 从注解括号内的参数里抽第一个字符串字面量路径；返回 { path, dynamic }。 */
function extractMappingPath(args) {
  if (args == null) return { path: '', dynamic: false }; // 无参 → 用类前缀
  const trimmed = args.trim();
  if (trimmed === '') return { path: '', dynamic: false };
  const str = trimmed.match(/"([^"]*)"/);
  if (!str) {
    // 只有 method= 之类、无字符串 → 路径用类前缀；否则是常量/变量 → 动态
    if (/^\s*method\s*=/.test(trimmed)) return { path: '', dynamic: false };
    return { path: '', dynamic: true };
  }
  const value = str[1];
  return { path: value, dynamic: value.includes('${') };
}

/** @RequestMapping 的 HTTP 方法：单个 → 该方法；多个/缺省 → ANY（needs-review）。 */
function requestMappingMethod(args) {
  const methods = [...(args || '').matchAll(/RequestMethod\.(\w+)/g)].map((m) => m[1]);
  if (methods.length === 1) return methods[0];
  return 'ANY';
}

/** 从注解处向后找方法名：去掉注解 token 后取第一个 `name(`。 */
function findMethodName(lines, idx) {
  const window = lines
    .slice(idx, idx + 8)
    .join(' ')
    .replace(/@\w+\s*\([^)]*\)/g, ' ')
    .replace(/@\w+/g, ' ');
  const m = window.match(/(\w+)\s*\(/);
  return m ? m[1] : null;
}

/** 抽取单个 Java 文件里的接口。 */
function parseJavaFile(rel, content) {
  if (!/@RestController|@Controller\b/.test(content)) return [];
  const lines = content.split(/\r?\n/);

  const classIdx = lines.findIndex((l) => /\bclass\s+\w+/.test(l));
  if (classIdx < 0) return [];
  const className = lines[classIdx].match(/\bclass\s+(\w+)/)[1];

  // 类级 @RequestMapping 前缀（class 声明之前）。
  let base = '';
  let baseDynamic = false;
  for (let i = 0; i <= classIdx; i++) {
    const m = lines[i].match(/@RequestMapping\s*\(([^)]*)\)/);
    if (m) {
      const r = extractMappingPath(m[1]);
      base = r.path;
      baseDynamic = r.dynamic;
      break;
    }
  }

  const out = [];
  const mappingRe =
    /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\b\s*(?:\(([^)]*)\))?/;
  for (let i = classIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(mappingRe);
    if (!m) continue;
    const annotation = m[1];
    const args = m[2];

    let method;
    let needsReview = baseDynamic;
    let reason = baseDynamic ? '类级路径为常量/变量,无法静态确定' : '';

    if (annotation === 'RequestMapping') {
      method = requestMappingMethod(args);
      if (method === 'ANY') {
        needsReview = true;
        reason = reason || '@RequestMapping 未指定单一 HTTP 方法';
      }
    } else {
      method = HTTP_BY_ANNOTATION[annotation];
    }

    const { path: mPath, dynamic } = extractMappingPath(args);
    if (dynamic) {
      needsReview = true;
      reason = reason || '方法级路径为常量/变量或含 ${...}';
    }

    const methodName = findMethodName(lines, i);
    if (!methodName) continue;

    out.push({
      handler: `${className}.${methodName}`,
      method,
      url: joinUrl(base, mPath),
      file: rel,
      line: i + 1,
      confidence: needsReview ? 'needs-review' : 'high',
      ...(needsReview ? { reason } : {}),
    });
  }
  return out;
}

/** 抽取单个前端文件里的 HTTP 调用。 */
function parseFrontFile(rel, content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  const seen = new Set();

  const looksLikeUrl = (s) => s.startsWith('/') || s.includes('/');
  const add = (item) => {
    const key = `${item.file}:${item.line}:${item.method}:${item.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ① <ident>.<method>('url' | `url`)
    const callRe = /(\b[\w$]+)\.(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`]*)\3/g;
    let m;
    while ((m = callRe.exec(line)) !== null) {
      const [, obj, method, quote, url] = m;
      if (FRONT_DENY.has(obj)) continue;
      if (!looksLikeUrl(url)) continue;
      const dynamic = quote === '`' ? /\$\{/.test(url) : /\$\{/.test(url);
      add({
        call: `${obj}.${method}`,
        method: method.toUpperCase(),
        url,
        file: rel,
        line: i + 1,
        confidence: dynamic ? 'needs-review' : 'high',
        ...(dynamic ? { reason: 'URL 含模板变量 ${...}，运行时拼接' } : {}),
      });
    }

    // ② fetch('url', { method })
    const fetchRe = /\bfetch\s*\(\s*(['"`])([^'"`]*)\1/g;
    while ((m = fetchRe.exec(line)) !== null) {
      const url = m[2];
      if (!looksLikeUrl(url)) continue;
      const lookahead = lines.slice(i, i + 3).join(' ');
      const mm = lookahead.match(/method\s*:\s*['"](\w+)['"]/);
      const dynamic = /\$\{/.test(url);
      add({
        call: 'fetch',
        method: mm ? mm[1].toUpperCase() : 'GET',
        url,
        file: rel,
        line: i + 1,
        confidence: dynamic ? 'needs-review' : 'high',
        ...(dynamic ? { reason: 'URL 含模板变量 ${...}，运行时拼接' } : {}),
      });
    }

    // ③ axios({ url, method })
    if (/\baxios\s*\(\s*\{/.test(line)) {
      const lookahead = lines.slice(i, i + 6).join(' ');
      const urlM = lookahead.match(/url\s*:\s*(['"`])([^'"`]*)\1/);
      if (urlM && looksLikeUrl(urlM[2])) {
        const methodM = lookahead.match(/method\s*:\s*['"](\w+)['"]/);
        const dynamic = /\$\{/.test(urlM[2]);
        add({
          call: 'axios',
          method: methodM ? methodM[1].toUpperCase() : 'GET',
          url: urlM[2],
          file: rel,
          line: i + 1,
          confidence: dynamic ? 'needs-review' : 'high',
          ...(dynamic ? { reason: 'URL 含模板变量 ${...}，运行时拼接' } : {}),
        });
      }
    }
  }
  return out;
}

/** 遍历项目，抽取前后端接口种子。 */
function extract(root) {
  const index = indexProject(root);
  const backend = [];
  const frontend = [];
  for (const rel of index.relPaths) {
    if (isTestPath(rel)) continue;
    const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase();
    if (!JAVA_EXT.has(ext) && !FRONT_EXT.has(ext)) continue;
    let content;
    try {
      content = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (JAVA_EXT.has(ext)) backend.push(...parseJavaFile(rel, content));
    else frontend.push(...parseFrontFile(rel, content));
  }
  const needsReview =
    backend.filter((x) => x.confidence === 'needs-review').length +
    frontend.filter((x) => x.confidence === 'needs-review').length;
  return {
    tool: 'extract-endpoints.js',
    generatedAt: new Date().toISOString().slice(0, 10),
    note: '种子(seed):正则 best-effort 抽取。P2/P3 须逐条 Grep 核对真实存在后再登记证据账本；needs-review 项须人工确认,不可当事实。',
    summary: { backend: backend.length, frontend: frontend.length, needsReview },
    backend,
    frontend,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = argv[++i];
    else if (a === '--out') args.out = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error('用法: node extract-endpoints.js --project <项目根> [--out <path>]');
    process.exit(2);
  }
  const data = extract(path.resolve(args.project));
  const json = JSON.stringify(data, null, 2);
  if (args.out) {
    fs.writeFileSync(args.out, json + '\n');
    console.log(
      `已写入 ${args.out}（后端 ${data.summary.backend} 条 / 前端 ${data.summary.frontend} 条 / 待确认 ${data.summary.needsReview} 条）`,
    );
  } else {
    console.log(json);
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  isTestPath,
  joinUrl,
  extractMappingPath,
  requestMappingMethod,
  findMethodName,
  parseJavaFile,
  parseFrontFile,
  extract,
};
