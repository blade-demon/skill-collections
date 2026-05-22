import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { glob } from 'node:fs/promises';
import { SKILL_DIR } from './helpers.js';

const REPO_DIR = dirname(SKILL_DIR);

test('agent metadata references existing assets', () => {
  const metadataPath = resolve(SKILL_DIR, 'agents', 'openai.yaml');
  const text = readFileSync(metadataPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const stripped = line.trim();
    if (!stripped.startsWith('icon_small:') && !stripped.startsWith('icon_large:')) continue;
    const asset = stripped
      .split(':')
      .slice(1)
      .join(':')
      .trim()
      .replace(/^["']|["']$/g, '');
    assert.ok(existsSync(resolve(SKILL_DIR, asset)), `missing metadata asset: ${asset}`);
  }
});

test('stack hints reference notes.md not design.md', async () => {
  const dir = resolve(SKILL_DIR, 'references', 'stack-hints');
  for await (const entry of glob('*.md', { cwd: dir })) {
    const text = readFileSync(resolve(dir, entry), 'utf8');
    assert.ok(!text.includes('design.md'), `${entry} should refer to notes.md`);
  }
});

test('no tracked .DS_Store files exist', () => {
  const result = spawnSync('git', ['ls-files', '*DS_Store'], {
    cwd: REPO_DIR,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const existing = result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((p) => p && existsSync(resolve(REPO_DIR, p)));
  assert.deepEqual(existing, [], `tracked .DS_Store files still exist:\n${existing}`);
});

test('stage-one confirmation requires ASCII preview only', () => {
  const skillText = readFileSync(resolve(SKILL_DIR, 'SKILL.md'), 'utf8');
  assert.match(skillText, /ASCII 图表/);
  assert.match(skillText, /components\[\]\.parent_id/);
  assert.ok(!skillText.includes('```mermaid'));
  assert.ok(!skillText.includes('graph TD'));
});
