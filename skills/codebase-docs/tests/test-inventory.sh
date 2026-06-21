#!/usr/bin/env bash

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

test_inventory() {
  local repo="$TMP_ROOT/repo with spaces"
  local output="$TMP_ROOT/docs with spaces/_analysis/repo-inventory.md"
  local stdout_file="$TMP_ROOT/inventory.stdout"
  local stderr_file="$TMP_ROOT/inventory.stderr"
  local before=""
  local after=""
  local emitted=""
  local listed=""

  init_git_repo "$repo"
  mkdir -p "$repo/src/routes" "$repo/src/services" "$repo/config"
  cat >"$repo/package.json" <<'EOF'
{
  "name": "inventory-fixture",
  "scripts": {
    "start": "node src/routes/index.js",
    "test": "printf test"
  }
}
EOF
  cat >"$repo/Makefile" <<'EOF'
build:
	printf build
EOF
  cat >"$repo/src/routes/index.js" <<'EOF'
router.get("/items", listItems)
EOF
  cat >"$repo/src/services/api.js" <<'EOF'
export function listItems() {}
EOF
  printf 'PORT=3000\n' >"$repo/config/app.yaml"
  git -C "$repo" add package.json Makefile src config
  git -C "$repo" commit -qm "add inventory fixture"

  before="$(git -C "$repo" status --short)"
  run_expect_success "$stdout_file" "$stderr_file" bash "$INVENTORY" \
    --root "$repo" --out "$output"
  after="$(git -C "$repo" status --short)"

  assert_eq "$before" "$after" "inventory must not modify source repo"
  assert_file "$output"
  assert_contains "$output" "## Repository Metadata"
  assert_contains "$output" "## Technology Signals"
  assert_contains "$output" "## Run Command Candidates"
  assert_contains "$output" "## Directory Overview"
  assert_contains "$output" "## File Type Counts"
  assert_contains "$output" "## Entry Route and API Candidates"
  assert_contains "$output" "## Module Candidates"
  assert_contains "$output" "## Configuration Files"
  assert_contains "$output" "## Truncation Notes"
  assert_contains "$output" "inventory-fixture"
  assert_contains "$output" "src/routes/index.js"
  assert_contains "$output" "src/services"
  assert_contains "$stderr_file" "[7/9]"

  emitted="$(sed -n 's/^Module-Candidates-Emitted: //p' "$output")"
  listed="$(awk '
    /^## Module Candidates$/ { in_section=1; next }
    /^## / && in_section { exit }
    in_section && /^- / { count++ }
    END { print count + 0 }
  ' "$output")"
  assert_eq "$emitted" "$listed" "module candidate count must match emitted rows"

  if find "$(dirname "$output")" -name '.repo-inventory.*.tmp' | grep . >/dev/null 2>&1; then
    fail "inventory left temporary files"
  fi

  pass "repo inventory"
}

test_inventory_empty_non_git() {
  local repo="$TMP_ROOT/empty non git"
  local output="$TMP_ROOT/empty docs/inventory.md"

  mkdir -p "$repo"
  run_expect_success "$TMP_ROOT/empty.stdout" "$TMP_ROOT/empty.stderr" \
    bash "$INVENTORY" --root "$repo" --out "$output"
  assert_contains "$output" "Git repository: no"
  assert_contains "$output" "Module-Candidates-Emitted: 0"
  pass "empty non-git inventory"
}

test_inventory
test_inventory_empty_non_git
