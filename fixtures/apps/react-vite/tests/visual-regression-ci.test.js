import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const workflowUrl = new URL('../../../../.github/workflows/check.yml', import.meta.url)

test('CI exposes a path-aware codegen visual regression gate', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')

  assert.match(workflow, /^  visual-regression:$/m)
  assert.match(workflow, /fetch-depth: 0/)
  assert.match(workflow, /id: changes/)
  assert.match(workflow, /packages\/d2c-core\/src\/codegen\/\*/)
  assert.match(workflow, /fixtures\/apps\/react-vite\/src\/golden\/\*/)
  assert.match(workflow, /codegen-golden\/\*/)
  assert.match(workflow, /npx playwright install --with-deps chromium/)
  assert.match(workflow, /visual-harness\.html/)
  assert.match(
    workflow,
    /mkdir -p "\$RUNNER_TEMP\/codegen-visual-regression"/,
  )
  assert.match(
    workflow,
    /> "\$RUNNER_TEMP\/codegen-visual-regression\/vite\.log" 2>&1 &/,
  )
  assert.match(workflow, /visual-harness:codegen/)
  assert.match(workflow, /actions\/upload-artifact@v4/)
  assert.match(
    workflow,
    /if: always\(\) && steps\.changes\.outputs\.relevant == 'true'/,
  )
})
