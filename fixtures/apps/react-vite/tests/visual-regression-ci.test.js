import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const workflowUrl = new URL('../../../../.github/workflows/check.yml', import.meta.url)
const detectorPath = fileURLToPath(
  new URL(
    '../../../../.github/scripts/detect-visual-regression-changes.sh',
    import.meta.url,
  ),
)

test('CI exposes a path-aware codegen visual regression gate', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')

  assert.match(workflow, /^  visual-regression:$/m)
  assert.match(workflow, /group: visual-regression-/)
  assert.match(workflow, /cancel-in-progress: true/)
  assert.match(workflow, /fetch-depth: 0/)
  assert.match(workflow, /id: changes/)
  assert.match(workflow, /"\$BASE_SHA\.\.\.\$HEAD_SHA"/)
  assert.match(workflow, /detect-visual-regression-changes\.sh/)
  assert.match(workflow, /npx playwright install --with-deps chromium/)
  assert.match(workflow, /visual-harness\.html/)
  assert.match(workflow, /Prepare visual regression artifacts/)
  assert.match(workflow, /codegen-visual-regression\/changed-files\.txt/)
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

test('visual regression path detector matches representative inputs', () => {
  const relevantPaths = [
    'packages/d2c-core/src/codegen/react/generate.ts',
    'packages/d2c-core/src/preview/generate-preview.ts',
    'fixtures/apps/react-vite/src/golden/src/LaunchPanel/LaunchPanel.tsx',
    'skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts',
    '.github/workflows/check.yml',
  ]

  for (const path of relevantPaths) {
    const result = spawnSync('bash', [detectorPath], {
      encoding: 'utf8',
      input: `${path}\n`,
    })

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), 'true', path)
  }
})

test('visual regression path detector ignores unrelated inputs', () => {
  const result = spawnSync('bash', [detectorPath], {
    encoding: 'utf8',
    input: 'docs/commenting-guide.md\nREADME.md\n',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'false')
})

test('visual regression path detector reads a final line without a newline', () => {
  const result = spawnSync('bash', [detectorPath], {
    encoding: 'utf8',
    input: 'packages/d2c-core/src/codegen/react/generate.ts',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'true')
})
