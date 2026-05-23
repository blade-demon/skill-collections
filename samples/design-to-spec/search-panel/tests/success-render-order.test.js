import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('stores the successful response before entering success render state', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  const assignmentIndex = source.indexOf('window.__lastSearchResponse = response');
  const successStateIndex = source.search(/setState\(['"]success['"]\)/);

  assert.notEqual(assignmentIndex, -1);
  assert.notEqual(successStateIndex, -1);
  assert.ok(
    assignmentIndex < successStateIndex,
    'success render reads window.__lastSearchResponse, so the response must be stored before setState("success") calls render()',
  );
});
