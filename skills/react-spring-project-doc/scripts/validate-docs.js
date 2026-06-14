#!/usr/bin/env node
'use strict';

/*
 * react-spring-project-doc — P8 确定性校验脚本
 *
 * 用途：自动核对最终文档（docs/*.md）里的文件路径、代码符号、Mermaid 结构与图级
 * Evidence 声明。路径/符号的手工核对易踩三类坑（本脚本规避）：
 *   ① rg -o 多文件时前缀文件名 → 这里逐文件读取，路径 token 不掺文件名；
 *   ② 正则 `js` 抢先匹配 `.json` → 这里抓完整 token 后「按最后一个点的扩展名查集合」，不靠交替顺序；
 *   ③ `class User` 子串误命中 `UserContext` → 符号匹配带词界。
 *
 * 用法：
 *   node validate-docs.js --project <目标项目根> [--docs <docs目录>] [--symbols] [--strict]
 *
 * 退出码：0 = 无硬失败；1 = 存在缺失/结构错误（或 --strict 下的告警）；2 = 用法错误。
 */

const fs = require('fs');
const path = require('path');
const { CODE_EXT, indexProject, buildCodeContentCache } = require('./lib/project-index');

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

/** 抽取 Markdown 中的 Mermaid fence，并报告未闭合 fence。 */
function extractMermaidBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```mermaid\s*$/.test(lines[i])) continue;

    const startLine = i + 1;
    const content = [];
    let closed = false;
    for (i += 1; i < lines.length; i++) {
      if (/^\s*```\s*$/.test(lines[i])) {
        closed = true;
        break;
      }
      content.push(lines[i]);
    }

    if (!closed) {
      errors.push({ line: startLine, reason: `Mermaid fence 未闭合（起始行 ${startLine}）` });
      break;
    }
    blocks.push({ content: content.join('\n'), line: startLine });
  }

  return { blocks, errors };
}

/** 抽取 E-001 形式的 Evidence ID。 */
function extractEvidenceIds(text) {
  return new Set(text.match(/\bE-\d{3}\b/g) || []);
}

/** 路径引用定位：直达 / 后缀匹配 / 未命中。 */
function locatePath(ref, index, root) {
  if (fs.existsSync(path.join(root, ref))) return 'ok';
  for (const rel of index.relPaths) {
    if (rel === ref || rel.endsWith('/' + ref)) return 'ok';
  }
  return 'miss';
}

/**
 * 判定符号在项目里的状态，区分三档以避免「仅被 import/注释/字符串提及」造成的假阳性：
 *   - 'defined'    ：匹配到定义处（class/interface/enum/record/type/function/const/let/var X），强证据；
 *   - 'referenced' ：出现过但未见定义（多为框架/外部类型，或注释里的提及），需人工确认；
 *   - 'absent'     ：全仓代码里压根没出现，极可能是幻觉符号。
 * 只看类名部分（`Class.method` 取 `Class`），与旧实现一致。
 */
function classifySymbol(symbol, cache) {
  const klass = symbol.split('.')[0];
  const esc = klass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const defRe = new RegExp(
    '\\b(?:class|interface|enum|record|type|function|const|let|var)\\s+' + esc + '\\b',
  );
  const refRe = new RegExp('\\b' + esc + '\\b');
  let referenced = false;
  for (const content of cache.values()) {
    if (defRe.test(content)) return 'defined';
    if (!referenced && refRe.test(content)) referenced = true;
  }
  return referenced ? 'referenced' : 'absent';
}

/** 兼容旧导出：符号是否在项目中出现（定义或引用均算存在）。 */
function symbolExists(symbol, index, root) {
  const cache = index.codeContents || buildCodeContentCache(index, root);
  return classifySymbol(symbol, cache) !== 'absent';
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

function validateMermaidDocument({ file, rel, text, ledgerEvidence }) {
  const basename = path.basename(file);
  const { blocks, errors: extractionErrors } = extractMermaidBlocks(text);
  const mermaidErrors = extractionErrors.map((error) => ({ doc: rel, reason: error.reason }));
  const evidenceMiss = [];
  let checkedEvidenceRefs = 0;

  if (basename === 'architecture.md' && blocks.length !== 1) {
    mermaidErrors.push({
      doc: rel,
      reason: `architecture.md 必须恰好 1 张 Mermaid，实际 ${blocks.length} 张`,
    });
  }

  if (basename === 'business-flows.md') {
    const flowCount = (text.match(/^##\s+F-\d+\b/gm) || []).length;
    if (blocks.length !== flowCount) {
      mermaidErrors.push({
        doc: rel,
        reason: `Mermaid 图数量 ${blocks.length} 与核心链路数量 ${flowCount} 不一致`,
      });
    }
  }

  for (const block of blocks) {
    const statements = block.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('%%'));
    if (!statements[0] || !/^flowchart\s+(?:TB|TD|BT|RL|LR)\b/.test(statements[0])) {
      mermaidErrors.push({
        doc: rel,
        reason: `第 ${block.line} 行 Mermaid 首个有效语句必须是 flowchart + 方向`,
      });
    }

    const evidenceLine = block.content
      .split(/\r?\n/)
      .find((line) => /^\s*%%\s*Evidence\s*:/.test(line));
    const evidenceRefs = evidenceLine ? [...extractEvidenceIds(evidenceLine)] : [];
    if (!evidenceRefs.length) {
      mermaidErrors.push({
        doc: rel,
        reason: `第 ${block.line} 行 Mermaid 缺少 %% Evidence: E-xxx 声明`,
      });
      continue;
    }

    for (const ref of evidenceRefs) {
      checkedEvidenceRefs++;
      if (!ledgerEvidence.has(ref)) evidenceMiss.push({ doc: rel, ref });
    }
  }

  return {
    blocks,
    mermaidErrors,
    evidenceMiss,
    checkedEvidenceRefs,
  };
}

/**
 * 校验 docs/index.json（存在才校验，缺失返回 absent 不算失败）：
 * 结构必填键、所有 file 路径存在、Evidence 与 ledger 一致且引用闭合、id 引用完整性、
 * 以及 --symbols 下符号定义存在。任何 error 都视为硬失败。
 */
function validateIndexJson({ docsDir, index, root, ledgerEvidence, symbols }) {
  const file = path.join(docsDir, 'index.json');
  if (!fs.existsSync(file))
    return { status: 'absent', errors: [], checkedPaths: 0, checkedRefs: 0 };

  const rel = path.relative(root, file).split(path.sep).join('/');
  const errors = [];
  const push = (reason) => errors.push({ doc: rel, reason });
  const arr = (v) => (Array.isArray(v) ? v : []);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    push(`JSON 解析失败：${e.message}`);
    return { status: 'error', errors, checkedPaths: 0, checkedRefs: 0 };
  }

  for (const key of ['schemaVersion', 'generatedAt', 'codeMap', 'api', 'evidence']) {
    if (!(key in data)) push(`缺少必填顶层键 "${key}"`);
  }

  const symbolsArr = arr(data.symbols);
  const apiArr = arr(data.api);
  const flowsArr = arr(data.flows);
  const modelsArr = arr(data.dataModels);
  const channelsArr = arr(data.channels); // 可选：非 REST 通道（MQ/WS/SSE/GraphQL/gRPC）
  const evidenceArr = arr(data.evidence);

  // 1) 路径存在性：汇总所有 file 字段。
  const paths = [];
  const cm = data.codeMap || {};
  for (const side of ['frontend', 'backend']) {
    for (const v of Object.values(cm[side] || {})) if (typeof v === 'string' && v) paths.push(v);
  }
  for (const s of symbolsArr) if (s && s.file) paths.push(s.file);
  for (const a of apiArr) {
    if (a && a.frontend && a.frontend.file) paths.push(a.frontend.file);
    if (a && a.backend && a.backend.file) paths.push(a.backend.file);
  }
  for (const f of flowsArr) for (const st of arr(f.steps)) if (st && st.file) paths.push(st.file);
  for (const m of modelsArr) if (m && m.file) paths.push(m.file);
  for (const c of channelsArr) if (c && c.file) paths.push(c.file);
  for (const e of evidenceArr) if (e && e.file) paths.push(e.file);

  let checkedPaths = 0;
  for (const p of paths) {
    checkedPaths++;
    if (locatePath(p, index, root) === 'miss') push(`路径不存在：${p}`);
  }

  // 2) Evidence：本文件 evidence[].id 必须在 ledger；各处 evidence 引用必须落在本文件 evidence[] 内。
  const definedEvidence = new Set(evidenceArr.map((e) => e && e.id).filter(Boolean));
  let checkedRefs = 0;
  for (const e of evidenceArr) {
    if (!e || !e.id) {
      push('evidence[] 存在缺少 id 的条目');
      continue;
    }
    checkedRefs++;
    if (!ledgerEvidence.has(e.id)) push(`evidence ${e.id} 未在 evidence-ledger.md 中定位`);
  }
  const refSites = [
    ...symbolsArr.map((s) => s && s.evidence),
    ...apiArr.map((a) => a && a.evidence),
    ...flowsArr.map((f) => f && f.evidence),
    ...modelsArr.map((m) => m && m.evidence),
    ...channelsArr.map((c) => c && c.evidence),
  ].filter(Boolean);
  for (const ref of refSites) {
    if (!definedEvidence.has(ref)) push(`evidence 引用 ${ref} 不在 index.json 的 evidence[] 内`);
  }

  // 3) 引用完整性：dataModels.usedByApi/usedByFlow 指向真实 id。
  const apiIds = new Set(apiArr.map((a) => a && a.id).filter(Boolean));
  const flowIds = new Set(flowsArr.map((f) => f && f.id).filter(Boolean));
  for (const m of modelsArr) {
    for (const ref of arr(m.usedByApi)) {
      if (!apiIds.has(ref)) push(`dataModel ${m.id || '?'} 的 usedByApi 指向不存在的 ${ref}`);
    }
    for (const ref of arr(m.usedByFlow)) {
      if (!flowIds.has(ref)) push(`dataModel ${m.id || '?'} 的 usedByFlow 指向不存在的 ${ref}`);
    }
  }

  // 4) 符号定义（--symbols）：symbols[].name 与 api[].backend.handler 的类应有定义。
  if (symbols && index.codeContents) {
    const names = [
      ...symbolsArr.map((s) => s && s.name),
      ...apiArr.map((a) => a && a.backend && a.backend.handler),
      ...channelsArr.map((c) => c && c.handler),
    ].filter(Boolean);
    for (const n of names) {
      if (classifySymbol(n, index.codeContents) === 'absent') {
        push(`符号在代码里完全未出现：${n}`);
      }
    }
  }

  return { status: errors.length ? 'error' : 'ok', errors, checkedPaths, checkedRefs };
}

/** 核心：返回路径、符号、Mermaid 与 Evidence 校验结果。 */
function validate({ project, docs, symbols }) {
  const root = path.resolve(project);
  const docsDir = docs ? path.resolve(docs) : path.join(root, 'docs');
  const index = indexProject(root);
  if (symbols) index.codeContents = buildCodeContentCache(index, root);
  const mdFiles = collectMdFiles(docsDir);
  const ledgerPath = path.join(docsDir, '.analysis', 'evidence-ledger.md');
  const ledgerText = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : '';
  const ledgerEvidence = extractEvidenceIds(ledgerText);

  const hardMiss = []; // 带 '/' 的路径未定位
  const softMiss = []; // 裸文件名未定位（歧义，告警）
  const symbolMiss = []; // 符号在全仓代码里完全不存在（疑似幻觉；告警，--strict 下硬失败）
  const symbolRefOnly = []; // 符号被引用但未见定义（多为框架/外部类型；仅告警，不硬失败）
  const mermaidErrors = []; // Mermaid fence、声明、数量错误（硬失败）
  const evidenceMiss = []; // 图级 Evidence 未在 ledger 定位（硬失败）
  let checkedPaths = 0;
  let checkedSymbols = 0;
  let checkedMermaidBlocks = 0;
  let checkedEvidenceRefs = 0;

  const mdBasenames = new Set(mdFiles.map((file) => path.basename(file)));
  for (const required of ['architecture.md', 'business-flows.md']) {
    if (!mdBasenames.has(required)) {
      mermaidErrors.push({
        doc: path.relative(root, path.join(docsDir, required)).split(path.sep).join('/'),
        reason: `缺少 ${required}，无法校验必需的 Mermaid 图`,
      });
    }
  }

  for (const file of mdFiles) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    const mermaid = validateMermaidDocument({ file, rel, text, ledgerEvidence });
    checkedMermaidBlocks += mermaid.blocks.length;
    checkedEvidenceRefs += mermaid.checkedEvidenceRefs;
    mermaidErrors.push(...mermaid.mermaidErrors);
    evidenceMiss.push(...mermaid.evidenceMiss);

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
        const status = classifySymbol(sym, index.codeContents);
        if (status === 'absent') symbolMiss.push({ doc: rel, ref: sym });
        else if (status === 'referenced') symbolRefOnly.push({ doc: rel, ref: sym });
      }
    }
  }

  const indexJson = validateIndexJson({ docsDir, index, root, ledgerEvidence, symbols });

  return {
    root,
    docsDir,
    mdCount: mdFiles.length,
    hardMiss,
    softMiss,
    symbolMiss,
    symbolRefOnly,
    mermaidErrors,
    evidenceMiss,
    indexJson,
    checkedPaths,
    checkedSymbols,
    checkedMermaidBlocks,
    checkedEvidenceRefs,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error(
      '用法: node validate-docs.js --project <目标项目根> [--docs <docs目录>] [--symbols] [--strict]',
    );
    process.exit(2);
  }
  const r = validate(args);

  console.log(`项目: ${r.root}`);
  console.log(`文档目录: ${r.docsDir}（${r.mdCount} 份 .md）`);
  console.log(
    `核对路径引用: ${r.checkedPaths}${args.symbols ? `，符号引用: ${r.checkedSymbols}` : ''}`,
  );
  console.log(
    `核对 Mermaid 图: ${r.checkedMermaidBlocks}，图级 Evidence 引用: ${r.checkedEvidenceRefs}`,
  );

  const print = (title, list) => {
    if (!list.length) return;
    console.log(`\n${title}（${list.length}）:`);
    for (const { doc, ref } of list) console.log(`  ✗ [${doc}] ${ref}`);
  };

  print('❌ 缺失路径（带目录，硬失败）', r.hardMiss);
  print('⚠️ 裸文件名未定位（需人工确认）', r.softMiss);
  if (args.symbols) {
    print('⚠️ 符号在代码里完全未出现（疑似幻觉，--strict 下视为失败）', r.symbolMiss);
    print('⚠️ 符号被引用但未见定义（多为框架/外部类型，需人工确认）', r.symbolRefOnly);
  }
  print('❌ 图级 Evidence 未定位（硬失败）', r.evidenceMiss);
  if (r.mermaidErrors.length) {
    console.log(`\n❌ Mermaid 结构错误（${r.mermaidErrors.length}）:`);
    for (const { doc, reason } of r.mermaidErrors) console.log(`  ✗ [${doc}] ${reason}`);
  }

  if (r.indexJson.status === 'absent') {
    console.log('\nℹ️ 未发现 docs/index.json（P7 应生成；如尚未到 P7 可忽略）。');
  } else if (r.indexJson.errors.length) {
    console.log(`\n❌ index.json 校验错误（${r.indexJson.errors.length}）:`);
    for (const { doc, reason } of r.indexJson.errors) console.log(`  ✗ [${doc}] ${reason}`);
  } else {
    console.log(
      `\n✅ index.json 通过：核对路径 ${r.indexJson.checkedPaths}，Evidence ${r.indexJson.checkedRefs}。`,
    );
  }

  const hardFail =
    r.hardMiss.length > 0 ||
    r.mermaidErrors.length > 0 ||
    r.evidenceMiss.length > 0 ||
    r.indexJson.errors.length > 0 ||
    (args.strict && (r.softMiss.length > 0 || r.symbolMiss.length > 0));
  const hasWarnings = r.softMiss.length || r.symbolMiss.length || r.symbolRefOnly.length;
  if (!hardFail && !hasWarnings) {
    console.log('\n✅ 全部通过：路径、符号、Mermaid 与 Evidence 均可定位。');
  } else if (!hardFail) {
    console.log('\n✅ 无硬失败（仅告警，见上；如需将告警视为失败请加 --strict）。');
  } else {
    console.log(
      '\n❌ 校验未通过。按 templates/08-validation.md 的失败处理规则修正文档或移入待确认。',
    );
  }
  process.exit(hardFail ? 1 : 0);
}

if (require.main === module) main();

module.exports = {
  indexProject,
  extractPathRefs,
  extractSymbolRefs,
  extractMermaidBlocks,
  extractEvidenceIds,
  locatePath,
  buildCodeContentCache,
  classifySymbol,
  symbolExists,
  validateMermaidDocument,
  validateIndexJson,
  validate,
};
