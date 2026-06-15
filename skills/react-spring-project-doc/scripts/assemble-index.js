#!/usr/bin/env node
'use strict';

/*
 * react-spring-project-doc — index.json 骨架装配脚本
 *
 * 目的：把 extract-endpoints.js 的结构化种子直接装配成 docs/index.json 的【骨架】，
 * 消除「脚本已结构化 → 逼模型手抄成散文 → 模型再手拼回 index.json」这道双向搬运。
 * 模型只需在骨架上做加法：核对 seed、补 module/service/repository、分配 E-xxx。
 *
 * 确定性预填（无需模型）：
 *   - codeMap：由 seed 文件路径 + 文件名启发式推断（高信号才填，其余留 null）。
 *   - api[]：把后端 mapping 与前端调用按「方法 + 结构化 URL」精确匹配，拼成 matched /
 *     frontend-only / backend-only 条目，method/url/file/line/handler/fn 全部来自 seed。
 *   - openQuestions：把所有 needs-review 的动态 URL 原样登记，避免被悄悄丢掉。
 *
 * 留给模型（骨架里为空数组 / null / 带 seed 标记）：
 *   - 逐条用 Grep 核对 seed 真实存在；删错的、补 module/service/repository。
 *   - 分配 E-xxx 写入 evidence[]，并回填各条目的 evidence 引用。
 *   - 填 symbols[] / flows[] / dataModels[] / channels[]（判断密集，脚本不碰）。
 *   - 完成后删除 _generator 与各条目的 seed/needsReview 标记。
 *
 * 关键性质：本骨架本身就能通过 P8 validate-docs.js（路径真实、evidence[] 为空、无悬空引用），
 * 模型在其上做加法不会打破校验。
 *
 * 用法：
 *   node assemble-index.js --project <项目根> [--out <path>] [--endpoints <extract 输出.json>]
 * 退出码：0 = 正常；2 = 用法错误。
 */

const fs = require('fs');
const path = require('path');
const { indexProject } = require('./lib/project-index');
const { extract } = require('./extract-endpoints');

/** 把 URL 归一化为「结构」用于匹配：去模板变量、数字段、尾斜杠，便于前后端对齐。 */
function normalizeForMatch(url) {
  if (!url) return '';
  let u = url
    .replace(/\$\{[^}]*\}/g, ':p') // ${id}
    .replace(/\{[^}]*\}/g, ':p'); // {id}
  u = u
    .split('/')
    .map((seg) => (/^\d+$/.test(seg) ? ':p' : seg))
    .join('/');
  if (u.length > 1) u = u.replace(/\/+$/, '');
  return u;
}

/** 最长公共目录：给一组相对文件路径,返回它们共同的父目录(用于 controllers/services 等)。 */
function commonDir(relPaths) {
  if (!relPaths.length) return null;
  const dirs = relPaths.map((p) => p.split('/').slice(0, -1));
  let common = dirs[0];
  for (const d of dirs.slice(1)) {
    let i = 0;
    while (i < common.length && i < d.length && common[i] === d[i]) i++;
    common = common.slice(0, i);
  }
  return common.length ? common.join('/') : null;
}

/** 从 byBasename 找首个匹配某后缀模式的文件所在目录(单一来源时才返回,避免误判)。 */
function dirOfBasenameMatching(byBasename, re) {
  const hits = [];
  for (const [name, rels] of byBasename) {
    if (re.test(name)) hits.push(...rels);
  }
  return commonDir(hits);
}

/** 从 byBasename 按优先级挑首个存在的文件名,返回其相对路径。 */
function firstByNames(byBasename, names) {
  for (const n of names) {
    const rels = byBasename.get(n);
    if (rels && rels.length) return rels[0];
  }
  return null;
}

/** 由 seed + 文件索引推断 codeMap。高信号才填,拿不准留 null,交模型核对。 */
function buildCodeMap(seed, index) {
  const { byBasename, relPaths } = index;
  const backendFiles = seed.backend.map((b) => b.file);
  const frontendFiles = seed.frontend.map((f) => f.file);

  // 前端 apiClient：seed 前端调用最集中的文件;否则按常见命名。
  const frontCount = new Map();
  for (const f of frontendFiles) frontCount.set(f, (frontCount.get(f) || 0) + 1);
  let apiClient = null;
  let max = 0;
  for (const [f, c] of frontCount) if (c > max) ((max = c), (apiClient = f));
  if (!apiClient) {
    apiClient = firstByNames(byBasename, [
      'request.ts',
      'request.js',
      'http.ts',
      'http.js',
      'api.ts',
      'api.js',
      'axios.ts',
    ]);
  }

  const migrationsDir = (() => {
    const sql = [...relPaths].filter(
      (p) => /\/db\/migration\//.test(p) || (/resources\/db\//.test(p) && p.endsWith('.sql')),
    );
    return commonDir(sql);
  })();

  return {
    frontend: {
      entry: firstByNames(byBasename, [
        'main.tsx',
        'main.jsx',
        'main.ts',
        'main.js',
        'index.tsx',
        'index.jsx',
      ]),
      routes: firstByNames(byBasename, ['router.tsx', 'router.ts', 'routes.tsx', 'routes.ts']),
      apiClient,
      store: dirOfBasenameMatching(byBasename, /^(store|index)\.(ts|js)$/) || null,
    },
    backend: {
      mainClass: dirOfBasenameMatching(byBasename, /Application\.(java|kt)$/),
      controllers: commonDir(backendFiles),
      services: dirOfBasenameMatching(byBasename, /Service(Impl)?\.(java|kt)$/),
      repositories: dirOfBasenameMatching(byBasename, /(Repository|Mapper)\.(java|kt)$/),
      models: dirOfBasenameMatching(byBasename, /(Entity|DO|PO)\.(java|kt)$/) || null,
      security: firstByNames(byBasename, [
        'SecurityConfig.java',
        'WebSecurityConfig.java',
        'SecurityConfiguration.java',
      ]),
      migrations: migrationsDir,
    },
  };
}

/** 把后端 mapping 与前端调用按「方法 + 结构化 URL」精确匹配,拼成 api[] 骨架。 */
function assembleApi(seed) {
  const keyOf = (e) => `${(e.method || '').toUpperCase()} ${normalizeForMatch(e.url)}`;
  const frontByKey = new Map();
  for (const f of seed.frontend) {
    const k = keyOf(f);
    if (!frontByKey.has(k)) frontByKey.set(k, []);
    frontByKey.get(k).push(f);
  }

  const api = [];
  const usedFront = new Set();
  let n = 0;
  const nextId = () => `API-${String(++n).padStart(3, '0')}`;
  const frontNode = (f) => ({ fn: f.call, file: f.file, line: f.line });
  const backNode = (b) => ({
    handler: b.handler,
    file: b.file,
    line: b.line,
    service: null, // 模型补
    repository: null, // 模型补
  });

  // 后端为主键，匹配前端调用。
  for (const b of seed.backend) {
    const k = keyOf(b);
    const fronts = frontByKey.get(k) || [];
    const front = fronts.find((f) => !usedFront.has(f));
    if (front) usedFront.add(front);
    const needsReview =
      b.confidence === 'needs-review' || (front && front.confidence === 'needs-review');
    api.push({
      id: nextId(),
      module: null, // 模型补
      method: (b.method || '').toUpperCase(),
      url: b.url,
      frontend: front ? frontNode(front) : null,
      backend: backNode(b),
      status: front ? 'matched' : 'backend-only',
      seed: true, // 模型核对后删除
      ...(needsReview ? { needsReview: true } : {}),
    });
  }

  // 剩余未匹配的前端调用 → frontend-only。
  for (const f of seed.frontend) {
    if (usedFront.has(f)) continue;
    api.push({
      id: nextId(),
      module: null,
      method: (f.method || '').toUpperCase(),
      url: f.url,
      frontend: frontNode(f),
      backend: null,
      status: 'frontend-only',
      seed: true,
      ...(f.confidence === 'needs-review' ? { needsReview: true } : {}),
    });
  }

  return api;
}

/** 装配 index.json 骨架。 */
function assemble(root, seed, index) {
  const api = assembleApi(seed);
  const openQuestions = [];
  for (const e of [...seed.backend, ...seed.frontend]) {
    if (e.confidence === 'needs-review') {
      openQuestions.push(
        `[seed:needs-review] ${(e.method || '').toUpperCase()} ${e.url} @ ${e.file}:${e.line}${e.reason ? `（${e.reason}）` : ''}`,
      );
    }
  }

  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString().slice(0, 10),
    commit: 'unknown',
    _generator: {
      tool: 'assemble-index.js',
      note: '种子骨架:codeMap/api 由脚本预填,均【未经证据核对】。模型须:①逐条 Grep 核对 seed 真实存在,删错的;②补 module/service/repository 与 codeMap 的 null 项;③分配 E-xxx 写入 evidence[] 并回填各条目 evidence 引用;④填 symbols/flows/dataModels/channels;⑤完成后删除本 _generator 及各条目的 seed/needsReview 标记。',
    },
    project: { name: path.basename(root), stack: { frontend: null, backend: null, db: null } },
    codeMap: buildCodeMap(seed, index),
    symbols: [],
    api,
    flows: [],
    dataModels: [],
    channels: [],
    evidence: [],
    openQuestions,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--endpoints') args.endpoints = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error(
      '用法: node assemble-index.js --project <项目根> [--out <path>] [--endpoints <extract 输出.json>]',
    );
    process.exit(2);
  }
  const root = path.resolve(args.project);
  const seed = args.endpoints ? JSON.parse(fs.readFileSync(args.endpoints, 'utf8')) : extract(root);
  const index = indexProject(root);
  const skeleton = assemble(root, seed, index);
  const json = JSON.stringify(skeleton, null, 2);

  if (args.out) {
    fs.writeFileSync(args.out, json + '\n');
    const matched = skeleton.api.filter((a) => a.status === 'matched').length;
    console.log(
      `已写入 ${args.out}（api ${skeleton.api.length} 条:matched ${matched} / 待确认 ${skeleton.openQuestions.length}）。这是骨架,须按 _generator 说明在其上核对补全。`,
    );
  } else {
    console.log(json);
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = { normalizeForMatch, commonDir, buildCodeMap, assembleApi, assemble };
