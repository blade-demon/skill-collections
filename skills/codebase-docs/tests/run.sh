#!/usr/bin/env bash

# Run all codebase-docs tests. Each test-*.sh sources lib.sh, owns its own
# temp root, and exits non-zero on the first failure.

set -uo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"

SUITES="
test-inventory.sh
test-validator.sh
test-batch.sh
test-publish.sh
test-contracts.sh
"

failed=0
while IFS= read -r suite; do
  [[ -z "$suite" ]] && continue
  printf '\n### %s\n' "$suite"
  if ! bash "$TEST_DIR/$suite"; then
    printf 'SUITE FAILED: %s\n' "$suite" >&2
    failed=1
  fi
done <<EOF
$SUITES
EOF

if [[ "$failed" -ne 0 ]]; then
  printf '\nSome suites failed.\n' >&2
  exit 1
fi

printf '\nAll codebase-docs test suites passed.\n'
