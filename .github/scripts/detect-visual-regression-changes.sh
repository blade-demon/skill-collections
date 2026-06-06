#!/usr/bin/env bash

set -euo pipefail

while IFS= read -r path || [ -n "$path" ]; do
  case "$path" in
    .github/scripts/detect-visual-regression-changes.sh | \
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
      echo true
      exit 0
      ;;
  esac
done

echo false
