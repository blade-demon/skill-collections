# Codegen Visual Regression CI Design

## Goal

Integrate the existing codegen visual harness into GitHub Actions as a required,
reviewable visual regression gate without paying the Playwright setup cost for
unrelated pull requests.

## Scope

The change extends `.github/workflows/check.yml` with a separate
`visual-regression` job. It does not add pixel diffing, replace `check:full`, or
change the current preview-vs-generated-React comparison contract.

## Trigger Contract

The workflow continues to run for every pull request. The
`visual-regression` job also exists for every pull request so branch protection
can require a stable check name.

The job first computes the changed paths using GitHub's pull request base and
head SHAs. Heavy visual verification runs only when at least one changed file
matches:

- `packages/d2c-core/src/codegen/**`
- `packages/d2c-core/src/preview/**`
- `fixtures/apps/react-vite/src/golden/**`
- `fixtures/apps/react-vite/src/visual-harness/**`
- `fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js`
- `fixtures/apps/react-vite/visual-harness.html`
- `skills/sketch-to-component/scripts/src/visual-harness/**`
- `skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts`
- `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/**`
- `skills/sketch-to-component/scripts/package.json`
- `package-lock.json`

An unrelated pull request keeps the job present but completes after path
detection without installing Chromium or starting Vite.

## CI Execution

For a relevant pull request, the job:

1. Checks out the repository with full Git history for reliable path detection.
2. Sets up the repository Node version with npm caching.
3. Installs root workspace and React fixture dependencies.
4. Installs Playwright Chromium with Linux system dependencies.
5. Starts the React fixture Vite server on `127.0.0.1:5179`.
6. Waits until `visual-harness.html` responds successfully.
7. Runs `visual-harness:codegen` against that URL.
8. Uses the harness exit code as the visual regression gate result.

The Vite process is local to the CI job and is cleaned up automatically when
the job finishes.

## Artifacts

For every relevant run, including failures, CI uploads one artifact containing:

- `baseline.png`
- `candidate.png`
- `baseline-metrics.json`
- `candidate-metrics.json`
- `baseline-preview.html`
- `baseline-preview.css`
- `review.html`

The artifact is retained for seven days. This gives reviewers enough evidence
to inspect a failure without committing screenshot baselines to the repository.

## Failure Behavior

The job fails when:

- dependency or browser installation fails;
- the fixture server does not become ready;
- expected visual nodes are missing;
- layout, relative position, text, or visual style metrics differ;
- the harness cannot produce its review artifacts.

An unrelated pull request is a successful no-op, not a skipped job, preserving
a stable required-check contract.

## Verification

Repository-level tests will statically verify that the workflow contains:

- the stable `visual-regression` job;
- changed-path detection;
- conditional Playwright installation and harness execution;
- fixture server readiness checking;
- unconditional artifact upload for relevant runs.

Local verification will also rerun the visual harness, `check:fixtures`, and
`check:full`.

## Known Boundary

The gate compares the D2C preview against generated React. It proves that
codegen remains visually aligned with preview, but it does not yet compare
either output against an original Sketch screenshot.
