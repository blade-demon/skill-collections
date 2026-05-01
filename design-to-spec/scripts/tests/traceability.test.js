import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateSample, makeTmpDir, validateSampleOutput } from "./helpers.js";

test("generated output contains machine trace anchors", () => {
  const outDir = resolve(makeTmpDir(), "today-windvane");
  assert.equal(generateSample(outDir).status, 0);

  const notes = readFileSync(resolve(outDir, "notes.md"), "utf8");
  const dataFetching = readFileSync(resolve(outDir, "data-fetching.md"), "utf8");
  const spec = readFileSync(resolve(outDir, "specs", "today-windvane", "spec.md"), "utf8");

  assert.match(notes, /## Traceability/);
  assert.ok(notes.includes("`component:cardContainer`"));
  assert.ok(notes.includes("`binding:1:api_to_ui`"));
  assert.ok(dataFetching.includes("`request:todayRecommendationRequest`"));
  assert.ok(spec.includes("`state:loading`"));

  const validate = validateSampleOutput(outDir);
  assert.equal(validate.status, 0, validate.stderr + validate.stdout);
});

test("strict validation rejects missing required state trace", () => {
  const outDir = resolve(makeTmpDir(), "today-windvane");
  assert.equal(generateSample(outDir).status, 0);
  const specPath = resolve(outDir, "specs", "today-windvane", "spec.md");
  const tampered = readFileSync(specPath, "utf8").replace(/`state:loading`/g, "`state:tampered`");
  writeFileSync(specPath, tampered, "utf8");

  const validate = validateSampleOutput(outDir);
  assert.notEqual(validate.status, 0, validate.stderr + validate.stdout);
  assert.match(validate.stderr + validate.stdout, /state trace/);
});
