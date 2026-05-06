#!/usr/bin/env node
// Smoke test — 1 秒级环境验证脚本
//
// 跑最常用路径（today-windvane 金样）：
//   1. validate-contracts — 三份 YAML 互相引用一致
//   2. generate-output    — 生成 contracts + 三份 markdown 到临时目录
//   3. validate-output --strict — 校验产物覆盖 contracts
//
// 任一失败 → 退出码 1 + 报错；全部通过 → 输出 ✅ + 总耗时。
//
// 用途：
// - 装好 design-to-spec 后第一时间验证环境（比 `npm test` 更快、信号更明确）
// - lefthook pre-push / CI 早期阶段做"环境健康检查"
// - 升级到新版本后跑一次确认基础链路没坏

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");

const SAMPLE = "today-windvane";
const SAMPLE_DIR = resolve(ROOT, "examples", SAMPLE);
const CONTRACTS = {
  ui: resolve(SAMPLE_DIR, "contracts/ui-schema.yaml"),
  api: resolve(SAMPLE_DIR, "contracts/api-schema.yaml"),
  mapping: resolve(SAMPLE_DIR, "contracts/mapping-logic.yaml"),
};
const SCRIPTS = {
  validateContracts: resolve(ROOT, "scripts/validate-contracts.js"),
  generate: resolve(ROOT, "scripts/generate-output.js"),
  validateOutput: resolve(ROOT, "scripts/validate-output.js"),
};

function fail(msg, extra) {
  process.stderr.write(`❌ smoke: ${msg}\n`);
  if (extra) process.stderr.write(extra + "\n");
  process.exit(1);
}

function step(label, fn) {
  const t0 = Date.now();
  try {
    fn();
    const ms = Date.now() - t0;
    process.stdout.write(`  ✓ ${label} (${ms}ms)\n`);
  } catch (err) {
    fail(`${label} failed`, err.message ?? String(err));
  }
}

function run(file, args) {
  const result = spawnSync(process.execPath, [file, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const out = (result.stdout ?? "") + (result.stderr ?? "");
    throw new Error(out.trim() || `exit ${result.status}`);
  }
}

// 0. 前置：金样目录存在
for (const [k, p] of Object.entries(CONTRACTS)) {
  if (!existsSync(p)) {
    fail(`golden sample '${SAMPLE}' missing: ${k} = ${p}`);
  }
}
for (const [k, p] of Object.entries(SCRIPTS)) {
  if (!existsSync(p)) {
    fail(`script missing: ${k} = ${p}`);
  }
}

const tmp = mkdtempSync(resolve(tmpdir(), "d2s-smoke-"));
const t0 = Date.now();
process.stdout.write(`design-to-spec smoke (${SAMPLE} → ${tmp})\n`);

try {
  step("validate-contracts", () => {
    run(SCRIPTS.validateContracts, [
      "--ui", CONTRACTS.ui,
      "--api", CONTRACTS.api,
      "--mapping", CONTRACTS.mapping,
    ]);
  });

  step("generate-output", () => {
    run(SCRIPTS.generate, [
      "--ui", CONTRACTS.ui,
      "--api", CONTRACTS.api,
      "--mapping", CONTRACTS.mapping,
      "--out-dir", tmp,
    ]);
  });

  step("validate-output --strict", () => {
    const cap = SAMPLE; // today-windvane capability dir name == sample name
    run(SCRIPTS.validateOutput, [
      "--strict",
      "--ui", resolve(tmp, "contracts/ui-schema.yaml"),
      "--api", resolve(tmp, "contracts/api-schema.yaml"),
      "--mapping", resolve(tmp, "contracts/mapping-logic.yaml"),
      "--notes", resolve(tmp, "notes.md"),
      "--data-fetching", resolve(tmp, "data-fetching.md"),
      "--spec", resolve(tmp, `specs/${cap}/spec.md`),
    ]);
  });

  const ms = Date.now() - t0;
  process.stdout.write(`✅ smoke ok (${ms}ms total)\n`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
