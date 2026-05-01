#!/usr/bin/env node
// Validate generated design-to-spec output files against the YAML contracts.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadYaml } from "./lib/yaml.js";
import { parseArgs, requireOpts } from "./lib/cli.js";

const EVENT_PATTERN = /[a-z]+(?:-[a-z]+)+/g;
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*$/gm;

function pyRepr(value) {
  if (typeof value === "string") return `'${value}'`;
  if (value === null || value === undefined) return "None";
  return String(value);
}

function readText(path) {
  if (!existsSync(path)) {
    throw new Error(`${path}: file does not exist`);
  }
  return readFileSync(path, "utf8");
}

function collectEndpointUrls(apiDoc) {
  const map = new Map();
  for (const endpoint of apiDoc.api?.endpoints ?? []) {
    if (endpoint.id && endpoint.url) map.set(endpoint.id, endpoint.url);
  }
  return map;
}

function collectEventNames(mappingDoc) {
  const events = new Set();
  for (const binding of mappingDoc.mapping?.bindings ?? []) {
    if (binding.direction !== "ui_to_event") continue;
    for (const text of [binding.target_event ?? "", binding.transform ?? ""]) {
      const matches = String(text).match(EVENT_PATTERN) ?? [];
      for (const m of matches) events.add(m);
    }
  }
  return events;
}

function collectOpenQuestions(apiDoc, mappingDoc) {
  return [
    ...(apiDoc.api?.open_questions ?? []),
    ...(mappingDoc.mapping?.open_questions ?? []),
  ];
}

function normalizedProbe(text, length = 12) {
  let compact = text.replace(/\s+/g, "");
  compact = compact.replace(/[`"'()（）？?，,。.:：；;、]/g, "");
  return compact.slice(0, length);
}

function findAllHeadings(markdown) {
  // global regex with capture - need to use matchAll
  const re = /^(#{1,6})\s+(.+?)\s*$/gm;
  const matches = [];
  let m;
  while ((m = re.exec(markdown)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, level: m[1].length, title: m[2].trim() });
  }
  return matches;
}

function sectionText(markdown, heading, level = 2) {
  const matches = findAllHeadings(markdown);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.level === level && m.title === heading) {
      const start = m.end;
      let end = markdown.length;
      for (let j = i + 1; j < matches.length; j++) {
        if (matches[j].level <= level) {
          end = matches[j].start;
          break;
        }
      }
      return markdown.slice(start, end).trim();
    }
  }
  return "";
}

function extractNumberedItems(markdownSection) {
  const items = new Map();
  let currentNumber = null;
  let currentLines = [];

  function flush() {
    if (currentNumber !== null) {
      const joined = currentLines.map((l) => l.trim()).join(" ").trim();
      items.set(currentNumber, joined);
    }
  }

  for (const line of markdownSection.split(/\r?\n/)) {
    const m = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (m) {
      flush();
      currentNumber = parseInt(m[1], 10);
      currentLines = [m[2]];
    } else if (currentNumber !== null && (line.startsWith(" ") || line.startsWith("\t"))) {
      currentLines.push(line);
    }
  }
  flush();
  return items;
}

function extractTableRows(markdownSection) {
  const rows = [];
  for (const line of markdownSection.split(/\r?\n/)) {
    const stripped = line.trim();
    if (!stripped.startsWith("|") || !stripped.endsWith("|")) continue;
    const cells = stripped.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

function collectStateIdsFromNotes(notesText) {
  const rows = extractTableRows(sectionText(notesText, "状态枚举"));
  const stateIds = new Set();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const m = /`([^`]+)`/.exec(row[0]);
    if (m) stateIds.add(m[1]);
  }
  return stateIds;
}

function collectTrackingAnchorIds(notesText) {
  const rows = extractTableRows(sectionText(notesText, "埋点锚点"));
  const anchors = new Set();
  for (let i = 1; i < rows.length; i++) {
    for (const cell of rows[i]) {
      const matches = cell.match(EVENT_PATTERN) ?? [];
      for (const m of matches) anchors.add(m);
    }
  }
  return anchors;
}

function collectTraceIds(markdown) {
  const result = new Set();
  const re = /`((?:component|binding|state|request):[^`]+)`/g;
  let m;
  while ((m = re.exec(markdown)) !== null) result.add(m[1]);
  return result;
}

function validateTraceability(uiDoc, mappingDoc, notesText, dataFetchingText, specText) {
  const errors = [];
  const traceSection = sectionText(notesText, "Traceability");
  if (!traceSection) return errors;

  const notesTraceIds = collectTraceIds(traceSection);
  const dataFetchingTraceIds = collectTraceIds(dataFetchingText);
  const specTraceIds = collectTraceIds(specText);

  for (const component of uiDoc.ui?.components ?? []) {
    const id = component.id;
    if (id && !notesTraceIds.has(`component:${id}`)) {
      errors.push(`notes.md Traceability is missing component trace component:${id}`);
    }
  }

  (mappingDoc.mapping?.bindings ?? []).forEach((binding, idx) => {
    const direction = binding.direction;
    const traceId = `binding:${idx + 1}:${direction}`;
    if (direction && !notesTraceIds.has(traceId)) {
      errors.push(`notes.md Traceability is missing binding trace ${traceId}`);
    }
  });

  for (const state of uiDoc.ui?.states ?? []) {
    const id = state.id;
    const traceId = `state:${id}`;
    if (id && !notesTraceIds.has(traceId)) {
      errors.push(`notes.md Traceability is missing state trace ${traceId}`);
    }
    if (state.required === true && id && !specTraceIds.has(traceId)) {
      errors.push(`spec.md is missing required state trace ${traceId}`);
    }
  }

  for (const request of mappingDoc.mapping?.data_fetching?.requests ?? []) {
    const id = request.id;
    const traceId = `request:${id}`;
    if (id && !dataFetchingTraceIds.has(traceId)) {
      errors.push(`data-fetching.md is missing request trace ${traceId}`);
    }
  }

  return errors;
}

function questionNumber(question) {
  const id = String(question.id ?? "");
  const m = /(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : null;
}

function questionIsAnchored(question, numberedQuestions, notesText) {
  const number = questionNumber(question);
  if (number !== null && numberedQuestions.has(number)) return true;

  const content = question.content ?? "";
  const probe = normalizedProbe(content);
  const normalizedNotes = normalizedProbe(notesText, notesText.length);
  if (probe && normalizedNotes.includes(probe)) return true;

  const openQuestionText = [...numberedQuestions.values()].join("\n");
  const tokens = content
    .split(/[`\s"'()（）？?，,。.:：；;、/]+/)
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return false;
  const hits = tokens.reduce((acc, t) => acc + (openQuestionText.includes(t) ? 1 : 0), 0);
  return hits >= Math.min(2, tokens.length);
}

function validateOutputs(uiDoc, apiDoc, mappingDoc, notesText, dataFetchingText, specText) {
  const errors = [];
  const warnings = [];

  let requiredFragments = ["## ADDED Requirements", "### Requirement:", "#### Scenario:", "- WHEN", "- THEN"];
  if (specText.includes("## MODIFIED Requirements")) {
    requiredFragments = ["## MODIFIED Requirements", ...requiredFragments.slice(1)];
  }
  for (const fragment of requiredFragments) {
    if (!specText.includes(fragment)) {
      errors.push(`spec.md is missing OpenSpec fragment ${pyRepr(fragment)}`);
    }
  }

  const notesStateIds = collectStateIdsFromNotes(notesText);
  for (const state of uiDoc.ui?.states ?? []) {
    if (state.required === true) {
      const id = state.id ?? "";
      if (id && !notesStateIds.has(id)) {
        errors.push(`required state ${pyRepr(id)} is not listed in notes.md 状态枚举`);
      }
      if (id && !specText.includes(id)) {
        errors.push(`required state ${pyRepr(id)} is not mentioned in spec.md`);
      }
      const assertion = state.render_assertion ?? "";
      if (assertion && !specText.includes(assertion) && !specText.includes(id)) {
        warnings.push(`required state ${pyRepr(id)} render_assertion is not reflected in spec.md`);
      }
    }
  }

  const endpointUrls = collectEndpointUrls(apiDoc);
  for (const request of mappingDoc.mapping?.data_fetching?.requests ?? []) {
    const endpointId = request.endpoint;
    const endpointUrl = endpointUrls.get(endpointId);
    if (endpointId && endpointUrl && !dataFetchingText.includes(endpointUrl)) {
      errors.push(
        `data-fetching.md does not mention endpoint ${pyRepr(endpointUrl)} for request ${pyRepr(request.id)}`,
      );
    }
  }

  const trackingAnchorIds = collectTrackingAnchorIds(notesText);
  const combinedNotesSpec = notesText + "\n" + specText;
  for (const eventName of collectEventNames(mappingDoc)) {
    if (!trackingAnchorIds.has(eventName) && !combinedNotesSpec.includes(eventName)) {
      errors.push(`event ${pyRepr(eventName)} is not mentioned in notes.md or spec.md`);
    }
  }

  const numberedQuestions = extractNumberedItems(sectionText(notesText, "开放问题"));
  for (const question of collectOpenQuestions(apiDoc, mappingDoc)) {
    const priority = question.priority ?? "";
    if (priority === "P0" && !questionIsAnchored(question, numberedQuestions, notesText)) {
      warnings.push(`P0 open question may be missing from notes.md: ${question.content ?? ""}`);
    }
  }

  if (!dataFetchingText.includes("## 待确认项汇总")) {
    warnings.push("data-fetching.md is missing a 待确认项汇总 section");
  }
  if (!notesText.includes("## 开放问题")) {
    errors.push("notes.md is missing an 开放问题 section");
  }
  if (!notesText.includes("## 埋点锚点")) {
    warnings.push("notes.md is missing an 埋点锚点 section");
  }

  errors.push(...validateTraceability(uiDoc, mappingDoc, notesText, dataFetchingText, specText));

  return { errors, warnings };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), {
      options: ["ui", "api", "mapping", "notes", "data-fetching", "spec"],
      flags: ["strict"],
    });
    requireOpts(args, ["ui", "api", "mapping", "notes", "data-fetching", "spec"]);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  let result;
  try {
    const uiDoc = loadYaml(args.ui);
    const apiDoc = loadYaml(args.api);
    const mappingDoc = loadYaml(args.mapping);
    const notesText = readText(args.notes);
    const dataFetchingText = readText(args["data-fetching"]);
    const specText = readText(args.spec);
    result = validateOutputs(uiDoc, apiDoc, mappingDoc, notesText, dataFetchingText, specText);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  for (const warning of result.warnings) {
    console.error(`WARN: ${warning}`);
  }
  let errors = result.errors;
  if (args.strict) {
    errors = errors.concat(result.warnings);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    return 1;
  }

  console.log("OK: output files are valid");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}

export { validateOutputs, sectionText, extractTableRows, extractNumberedItems, collectTraceIds };
