import assert from 'node:assert/strict';
import test from 'node:test';

import { safeFilename, slugify } from '../src/utils/slug.js';

test('slugify preserves Chinese characters and normalizes unsafe runs', () => {
  assert.equal(slugify('  Example Topic：基础 / 入门?  '), 'example-topic-基础-入门');
});

test('safeFilename removes filesystem-unsafe title characters', () => {
  assert.equal(safeFilename('Bad/Title: Draft?'), 'Bad-Title-Draft');
});
