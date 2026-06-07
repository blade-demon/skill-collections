import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('visual harness page mounts the generated golden package in a controlled scope', async () => {
  const html = await readFile(new URL('../visual-harness.html', import.meta.url), 'utf8')
  const source = await readFile(new URL('../src/visual-harness/main.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/visual-harness/style.css', import.meta.url), 'utf8')

  assert.match(html, /src="\/src\/visual-harness\/main\.tsx"/)
  assert.match(source, /from ['"]\.\.\/golden\/src['"]/)
  assert.match(source, /data-d2c-harness="candidate"/)
  assert.match(css, /\.visual-harness__hostile-scope/)
  assert.match(css, /text-align: center/)
})

test('layout visual harness page mounts the flex golden package in the same controlled scope', async () => {
  const html = await readFile(new URL('../visual-harness-layout.html', import.meta.url), 'utf8')
  const source = await readFile(
    new URL('../src/visual-harness/main-layout.tsx', import.meta.url),
    'utf8',
  )

  assert.match(html, /src="\/src\/visual-harness\/main-layout\.tsx"/)
  assert.match(source, /from ['"]\.\.\/golden-layout\/src['"]/)
  assert.match(source, /data-d2c-harness="candidate"/)
  assert.match(source, /visual-harness__hostile-scope/)
})

test('the committed golden package references exactly one copied asset', async () => {
  const css = await readFile(
    new URL('../src/golden/src/LaunchPanel/LaunchPanel.module.css', import.meta.url),
    'utf8',
  )
  // Two media nodes reuse one assetRef → one deduped, CSS-referenced file.
  assert.match(css, /background-image: url\("\.\.\/assets\/asset-[0-9a-f]{12}\.png"\)/)

  const entries = await readdir(new URL('../src/golden/src/assets/', import.meta.url))
  const pngs = entries.filter((name) => name.endsWith('.png'))
  assert.equal(pngs.length, 1)
})
