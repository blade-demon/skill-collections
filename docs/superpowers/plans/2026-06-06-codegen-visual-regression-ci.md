# Codegen Visual Regression CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stable pull-request CI check that runs the codegen visual harness for relevant changes and completes quickly for unrelated changes.

**Architecture:** Extend the existing `check` workflow with a separate `visual-regression` job. The job always exists on pull requests, detects relevant paths from the PR base/head SHAs, and conditionally installs Chromium, starts the React fixture, runs the harness, and uploads review artifacts.

**Tech Stack:** GitHub Actions, Bash, Node.js, npm workspaces, Vite, Playwright, Node test runner.

---

## File Structure

- Create `fixtures/apps/react-vite/tests/visual-regression-ci.test.js`
  - Statically locks the workflow job name, path detector, browser setup, fixture readiness, harness invocation, and artifact upload contract.
- Modify `.github/workflows/check.yml`
  - Adds the pull-request visual regression job while preserving the existing quality job.

## Task 1: Lock The CI Contract With A Failing Test

**Files:**
- Create: `fixtures/apps/react-vite/tests/visual-regression-ci.test.js`
- Test: `fixtures/apps/react-vite/tests/visual-regression-ci.test.js`

- [ ] **Step 1: Add the workflow contract test**

Create `fixtures/apps/react-vite/tests/visual-regression-ci.test.js`:

```js
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
  assert.match(workflow, /visual-harness:codegen/)
  assert.match(workflow, /actions\/upload-artifact@v4/)
  assert.match(
    workflow,
    /if: always\(\) && steps\.changes\.outputs\.relevant == 'true'/,
  )
})
```

- [ ] **Step 2: Run the fixture test and verify RED**

Run:

```bash
npm run test:fixtures:react
```

Expected: FAIL because `.github/workflows/check.yml` does not contain the
`visual-regression` job.

- [ ] **Step 3: Commit the test only after the workflow implementation is GREEN**

Do not commit the intentionally failing state. Task 1 and Task 2 are committed
together once the test passes.

## Task 2: Add The Path-Aware Visual Regression Job

**Files:**
- Modify: `.github/workflows/check.yml`
- Test: `fixtures/apps/react-vite/tests/visual-regression-ci.test.js`

- [ ] **Step 1: Add the visual regression job**

Append this job under `jobs` in `.github/workflows/check.yml`:

```yaml
  visual-regression:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Detect relevant visual changes
        id: changes
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          git diff --name-only "$BASE_SHA" "$HEAD_SHA" > "$RUNNER_TEMP/visual-changed-files.txt"
          relevant=false
          while IFS= read -r path; do
            case "$path" in
              .github/workflows/check.yml | \
              package-lock.json | \
              packages/d2c-core/src/codegen/* | \
              packages/d2c-core/src/preview/* | \
              fixtures/apps/react-vite/src/golden/* | \
              fixtures/apps/react-vite/src/visual-harness/* | \
              fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js | \
              fixtures/apps/react-vite/tests/visual-regression-ci.test.js | \
              fixtures/apps/react-vite/visual-harness.html | \
              skills/sketch-to-component/scripts/package.json | \
              skills/sketch-to-component/scripts/src/visual-harness/* | \
              skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts | \
              skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/*)
                relevant=true
                break
                ;;
            esac
          done < "$RUNNER_TEMP/visual-changed-files.txt"
          echo "relevant=$relevant" >> "$GITHUB_OUTPUT"

      - name: Setup Node
        if: steps.changes.outputs.relevant == 'true'
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install root workspace dependencies
        if: steps.changes.outputs.relevant == 'true'
        run: npm ci

      - name: Install fixture dependencies
        if: steps.changes.outputs.relevant == 'true'
        run: npm ci --prefix fixtures/apps/react-vite

      - name: Install Playwright Chromium
        if: steps.changes.outputs.relevant == 'true'
        run: npx playwright install --with-deps chromium

      - name: Start visual harness fixture
        if: steps.changes.outputs.relevant == 'true'
        run: |
          npm run dev --prefix fixtures/apps/react-vite -- \
            --host 127.0.0.1 --port 5179 --strictPort \
            > "$RUNNER_TEMP/visual-harness-vite.log" 2>&1 &
          echo $! > "$RUNNER_TEMP/visual-harness-vite.pid"
          for attempt in {1..30}; do
            if curl --fail --silent \
              http://127.0.0.1:5179/visual-harness.html > /dev/null; then
              exit 0
            fi
            sleep 1
          done
          cat "$RUNNER_TEMP/visual-harness-vite.log"
          exit 1

      - name: Run codegen visual regression
        if: steps.changes.outputs.relevant == 'true'
        run: |
          npm run visual-harness:codegen \
            --workspace @skill-collections/sketch-to-component-scripts -- \
            --candidate-url http://127.0.0.1:5179/visual-harness.html \
            --out "$RUNNER_TEMP/codegen-visual-regression"

      - name: Upload visual regression artifacts
        if: always() && steps.changes.outputs.relevant == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: codegen-visual-regression
          path: ${{ runner.temp }}/codegen-visual-regression
          retention-days: 7
          if-no-files-found: error
```

The shell `case` globs intentionally use `*` after directory prefixes. Bash
pattern matching allows `*` to include `/`, so nested files remain covered.

- [ ] **Step 2: Run the fixture test and verify GREEN**

Run:

```bash
npm run test:fixtures:react
```

Expected: all three fixture tests pass.

- [ ] **Step 3: Validate workflow formatting and diff hygiene**

Run:

```bash
./node_modules/.bin/prettier --check \
  .github/workflows/check.yml \
  fixtures/apps/react-vite/tests/visual-regression-ci.test.js
git diff --check
```

Expected: both commands exit `0`.

- [ ] **Step 4: Commit the CI gate**

```bash
git add .github/workflows/check.yml \
  fixtures/apps/react-vite/tests/visual-regression-ci.test.js
git commit -m "ci: add codegen visual regression gate"
```

## Task 3: Verify Both CI Paths And Update The Pull Request

**Files:**
- No new source files.
- Local artifact directory: `/private/tmp/skill-collections-visual-harness/codegen-golden`

- [ ] **Step 1: Simulate path detection for a relevant change**

Run:

```bash
path='packages/d2c-core/src/codegen/react/generate.ts'
case "$path" in
  packages/d2c-core/src/codegen/*) echo relevant ;;
  *) echo unrelated ;;
esac
```

Expected output:

```text
relevant
```

- [ ] **Step 2: Simulate path detection for an unrelated change**

Run:

```bash
path='README.md'
case "$path" in
  packages/d2c-core/src/codegen/*) echo relevant ;;
  *) echo unrelated ;;
esac
```

Expected output:

```text
unrelated
```

- [ ] **Step 3: Run the visual harness locally**

Start the fixture:

```bash
npm run dev --prefix fixtures/apps/react-vite -- \
  --host 127.0.0.1 --port 5179 --strictPort
```

Then run:

```bash
npm run visual-harness:codegen \
  --workspace @skill-collections/sketch-to-component-scripts -- \
  --candidate-url http://127.0.0.1:5179/visual-harness.html \
  --out /private/tmp/skill-collections-visual-harness/codegen-golden
```

Expected: exit `0` and print the review, baseline, and candidate artifact paths.

- [ ] **Step 4: Run repository verification**

Run:

```bash
npm run check:fixtures
npm run check:full
```

Expected: both commands exit `0`.

- [ ] **Step 5: Push and update PR #79**

Run:

```bash
git push
```

Update PR #79 to mention:

- the new `visual-regression` check;
- relevant-path heavy execution and unrelated-path fast success;
- seven-day artifact retention;
- the unchanged preview-vs-generated-React boundary.
