import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../src/cli.js';

test('--url and --html are mutually exclusive', () => {
  assert.throws(
    () => parseArgs(['--url', 'https://x.com', '--html', 'a.html', '--out-dir', 'o']),
    /mutually exclusive/i,
  );
});

test('at least one of --url or --html is required', () => {
  assert.throws(() => parseArgs(['--out-dir', 'o']), /required/i);
});

test('--url alone is valid', () => {
  const result = parseArgs(['--url', 'https://example.com', '--out-dir', 'o']);
  assert.equal(result.url, 'https://example.com');
  assert.equal(result.options.htmlPath, '');
  assert.equal(result.options.outDir, 'o');
});

test('--html alone remains valid', () => {
  const result = parseArgs(['--html', 'a.html', '--out-dir', 'o']);
  assert.equal(result.options.htmlPath, 'a.html');
  assert.equal(result.url, undefined);
});

test('--fetch-timeout parses correctly', () => {
  const result = parseArgs([
    '--url',
    'https://x.com',
    '--out-dir',
    'o',
    '--fetch-timeout',
    '60000',
  ]);
  assert.equal(result.fetchTimeoutMs, 60_000);
});

test('--wait-mode flag is captured', () => {
  const result = parseArgs(['--url', 'https://x.com', '--out-dir', 'o', '--wait-mode']);
  assert.equal(result.waitMode, true);
});

test('--embed-images-base64 flag is captured', () => {
  const result = parseArgs(['--url', 'https://x.com', '--out-dir', 'o', '--embed-images-base64']);
  assert.equal(result.options.embedImagesBase64, true);
});

test('invalid --fetch-timeout rejects', () => {
  assert.throws(
    () => parseArgs(['--url', 'https://x.com', '--out-dir', 'o', '--fetch-timeout', 'abc']),
    /Invalid --fetch-timeout/,
  );
});

test('--out-dir is required even with --url', () => {
  assert.throws(() => parseArgs(['--url', 'https://x.com']), /--out-dir is required/);
});

test('--help short-circuits validation', () => {
  const result = parseArgs(['--help']);
  assert.equal(result.help, true);
});
