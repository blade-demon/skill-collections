'use strict';

/*
 * 共享的项目文件索引工具，供 validate-docs.js 与 extract-endpoints.js 复用。
 * 零依赖，纯文件系统遍历。
 */

const fs = require('fs');
const path = require('path');

// 代码文件扩展名白名单。用集合判断，规避「js|json」这类正则交替顺序坑。
const CODE_EXT = new Set([
  'java',
  'kt',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'vue',
  'json',
  'yml',
  'yaml',
  'xml',
  'properties',
  'gradle',
]);

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.next',
  '.vite',
  'coverage',
  'out',
  '.idea',
  '.gradle',
  '.analysis',
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

/**
 * 预读全部代码文件内容，建 rel→content 缓存。
 * 避免对每个符号都重读一遍全仓代码文件（O(符号数 × 文件数) 次磁盘读）。
 */
function buildCodeContentCache(index, root) {
  const cache = new Map();
  for (const rel of index.relPaths) {
    const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase();
    if (!CODE_EXT.has(ext)) continue;
    try {
      cache.set(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
    } catch {
      /* 不可读文件跳过 */
    }
  }
  return cache;
}

module.exports = { CODE_EXT, IGNORE_DIRS, indexProject, buildCodeContentCache };
