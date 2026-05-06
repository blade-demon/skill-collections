// Regression test for the price-card golden sample (props-only mode).
//
// What this test pins down:
// - The full pipeline (validate-contracts -> generate-output -> validate-output
//   --strict) succeeds end-to-end on a contract trio with empty
//   api.endpoints / mapping.bindings / mapping.requests.
// - Generated markdown contains the props-only signal phrases that operator
//   guide §4 promises ("无直接请求", "数据由父组件...").
// - All four required states (success / discount / partial / disabled) get
//   Scenarios in spec.md.
// - Trace anchors for components and required states are emitted.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeTmpDir, runNodeScript, SKILL_DIR } from "./helpers.js";

const SAMPLE_DIR = resolve(SKILL_DIR, "examples", "price-card");

function generate(outDir) {
  return runNodeScript("generate-output.js", [
    "--ui",
    resolve(SAMPLE_DIR, "contracts", "ui-schema.yaml"),
    "--api",
    resolve(SAMPLE_DIR, "contracts", "api-schema.yaml"),
    "--mapping",
    resolve(SAMPLE_DIR, "contracts", "mapping-logic.yaml"),
    "--out-dir",
    outDir,
  ]);
}

function validateContracts() {
  return runNodeScript("validate-contracts.js", [
    "--ui",
    resolve(SAMPLE_DIR, "contracts", "ui-schema.yaml"),
    "--api",
    resolve(SAMPLE_DIR, "contracts", "api-schema.yaml"),
    "--mapping",
    resolve(SAMPLE_DIR, "contracts", "mapping-logic.yaml"),
  ]);
}

function validateOutputStrict(outDir) {
  return runNodeScript("validate-output.js", [
    "--strict",
    "--ui",
    resolve(outDir, "contracts", "ui-schema.yaml"),
    "--api",
    resolve(outDir, "contracts", "api-schema.yaml"),
    "--mapping",
    resolve(outDir, "contracts", "mapping-logic.yaml"),
    "--notes",
    resolve(outDir, "notes.md"),
    "--data-fetching",
    resolve(outDir, "data-fetching.md"),
    "--spec",
    resolve(outDir, "specs", "price-card", "spec.md"),
  ]);
}

test("price-card: contracts validate cleanly (props-only mode)", () => {
  const result = validateContracts();
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test("price-card: full pipeline produces strictly-valid outputs", () => {
  const outDir = resolve(makeTmpDir(), "price-card");
  const generateResult = generate(outDir);
  assert.equal(generateResult.status, 0, generateResult.stderr + generateResult.stdout);

  for (const path of [
    resolve(outDir, "contracts", "ui-schema.yaml"),
    resolve(outDir, "contracts", "api-schema.yaml"),
    resolve(outDir, "contracts", "mapping-logic.yaml"),
    resolve(outDir, "notes.md"),
    resolve(outDir, "data-fetching.md"),
    resolve(outDir, "specs", "price-card", "spec.md"),
  ]) {
    assert.ok(existsSync(path), `missing generated file: ${path}`);
  }

  const validateResult = validateOutputStrict(outDir);
  assert.equal(validateResult.status, 0, validateResult.stderr + validateResult.stdout);
});

test("price-card: notes and data-fetching reflect props-only mode", () => {
  const outDir = resolve(makeTmpDir(), "price-card");
  generate(outDir);

  const notes = readFileSync(resolve(outDir, "notes.md"), "utf8");
  const dataFetching = readFileSync(resolve(outDir, "data-fetching.md"), "utf8");

  // operator-guide §4 promises this signal phrase for props-only mode.
  assert.match(
    dataFetching,
    /无直接请求/,
    "data-fetching.md should mark the props-only mode explicitly",
  );
  assert.match(
    notes,
    /数据由父组件或宿主上下文传入/,
    "notes.md should describe parent-driven data flow",
  );

  // Schema-gap open question must surface so the next maintainer knows about it.
  assert.match(
    notes,
    /props_to_ui direction|props 字典节/,
    "notes.md should carry the props-to-UI schema gap as an open question",
  );
});

test("price-card: spec.md covers all four required states", () => {
  const outDir = resolve(makeTmpDir(), "price-card");
  generate(outDir);

  const spec = readFileSync(resolve(outDir, "specs", "price-card", "spec.md"), "utf8");

  for (const stateId of ["success", "discount", "partial", "disabled"]) {
    assert.match(
      spec,
      new RegExp(`trace id .state:${stateId}.`),
      `spec.md should include trace id state:${stateId}`,
    );
  }
});

test("price-card: trace anchors cover every component", () => {
  const outDir = resolve(makeTmpDir(), "price-card");
  generate(outDir);

  const notes = readFileSync(resolve(outDir, "notes.md"), "utf8");

  for (const componentId of [
    "cardContainer",
    "amountText",
    "currencySymbol",
    "originalPriceText",
    "discountBadge",
    "stockOutOverlay",
  ]) {
    assert.match(
      notes,
      new RegExp(`component:${componentId}`),
      `notes.md should include trace anchor component:${componentId}`,
    );
  }
});
