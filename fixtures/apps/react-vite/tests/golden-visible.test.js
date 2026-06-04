import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('renders the generated D2C golden package visibly in the fixture app', async () => {
  const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(appSource, /from ['"]\.\/golden\/src['"]/)

  const section = appSource.match(/<section[^>]*id="d2c-golden"[^>]*>[\s\S]*?<\/section>/)
  assert.ok(section, 'expected App.tsx to expose a d2c-golden section')

  const openingTag = section[0].match(/<section[^>]*>/)?.[0] ?? ''
  assert.doesNotMatch(openingTag, /\shidden(?:[=\s>]|$)/)
  assert.match(section[0], /<GeneratedPackage\s*\/>/)
})
