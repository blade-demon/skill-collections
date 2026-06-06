import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
