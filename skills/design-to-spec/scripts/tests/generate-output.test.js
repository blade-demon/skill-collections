import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SAMPLE_DIR,
  generateSample,
  makeTmpDir,
  runNodeScript,
  validateSampleOutput,
} from './helpers.js';

test('generates contracts and valid outputs from the today-windvane sample', () => {
  const outDir = resolve(makeTmpDir(), 'today-windvane');
  const result = generateSample(outDir);
  assert.equal(result.status, 0, result.stderr + result.stdout);

  const generatedUi = resolve(outDir, 'contracts', 'ui-schema.yaml');
  const generatedApi = resolve(outDir, 'contracts', 'api-schema.yaml');
  const generatedMapping = resolve(outDir, 'contracts', 'mapping-logic.yaml');
  const notes = resolve(outDir, 'notes.md');
  const dataFetching = resolve(outDir, 'data-fetching.md');
  const spec = resolve(outDir, 'specs', 'today-windvane', 'spec.md');

  for (const path of [generatedUi, generatedApi, generatedMapping, notes, dataFetching, spec]) {
    assert.ok(existsSync(path), `missing generated file: ${path}`);
  }

  const sourceUi = resolve(SAMPLE_DIR, 'contracts', 'ui-schema.yaml');
  assert.equal(readFileSync(generatedUi, 'utf8'), readFileSync(sourceUi, 'utf8'));
  assert.match(readFileSync(notes, 'utf8'), /## 状态枚举/);
  assert.match(readFileSync(dataFetching, 'utf8'), /GET \/api\/v1\/today\/recommendation/);
  assert.match(readFileSync(spec, 'utf8'), /## ADDED Requirements/);

  const validate = validateSampleOutput(outDir);
  assert.equal(validate.status, 0, validate.stderr + validate.stdout);
});

test('generation is idempotent when contracts already live in output dir', () => {
  const outDir = resolve(makeTmpDir(), 'today-windvane');
  const contractsDir = resolve(outDir, 'contracts');
  mkdirSync(contractsDir, { recursive: true });
  const ui = resolve(contractsDir, 'ui-schema.yaml');
  const api = resolve(contractsDir, 'api-schema.yaml');
  const mapping = resolve(contractsDir, 'mapping-logic.yaml');
  copyFileSync(resolve(SAMPLE_DIR, 'contracts', 'ui-schema.yaml'), ui);
  copyFileSync(resolve(SAMPLE_DIR, 'contracts', 'api-schema.yaml'), api);
  copyFileSync(resolve(SAMPLE_DIR, 'contracts', 'mapping-logic.yaml'), mapping);

  const result = runNodeScript('generate-output.js', [
    '--ui',
    ui,
    '--api',
    api,
    '--mapping',
    mapping,
    '--out-dir',
    outDir,
  ]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.ok(existsSync(resolve(outDir, 'notes.md')));
});
