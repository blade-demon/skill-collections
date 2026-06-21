#!/usr/bin/env bash

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

test_batch() {
  local origins="$TMP_ROOT/origins"
  local repo_a="$origins/repo-a"
  local repo_b="$origins/repo-b"
  local repo_c="$origins/repo-c"
  local repos_root="$TMP_ROOT/clones"
  local docs_root="$TMP_ROOT/batch docs"
  local report="$docs_root/batch-report.md"
  local stdout_file="$TMP_ROOT/batch.stdout"
  local stderr_file="$TMP_ROOT/batch.stderr"

  init_git_repo "$repo_a"
  init_git_repo "$repo_b"
  init_git_repo "$repo_c"

  run_expect_failure "$stdout_file" "$stderr_file" bash "$BATCH" \
    --repo "$repo_a" \
    --docs-root "$TMP_ROOT/preflight docs" \
    --repos-root "$TMP_ROOT/preflight repos" \
    --max-repos invalid
  assert_dir_absent "$TMP_ROOT/preflight docs"
  assert_dir_absent "$TMP_ROOT/preflight repos"

  make_valid_docs "$docs_root/repo-a"

  run_expect_success "$stdout_file" "$stderr_file" bash "$BATCH" \
    --repo "$repo_a" \
    --repo "$repo_b" \
    --repo "$repo_c" \
    --docs-root "$docs_root" \
    --repos-root "$repos_root" \
    --max-repos 1

  assert_file "$report"
  assert_contains "$stderr_file" "Input Spec | Repo Name | Branch | Source Path | Docs Path"
  assert_contains "$stderr_file" "repo-a"
  assert_contains "$report" "| repo-a |"
  assert_contains "$report" "| done |"
  assert_contains "$report" "| repo-b |"
  assert_contains "$report" "| cloned |"
  assert_contains "$report" "| repo-c |"
  assert_contains "$report" "| deferred |"
  assert_contains "$report" "- Done: 1"
  assert_contains "$report" "- Cloned (ready for docs): 1"
  assert_contains "$report" "- Deferred: 1"
  assert_dir_absent "$repos_root/repo-a"
  assert_file "$docs_root/repo-b/_analysis/coverage-checklist.md"
  assert_contains "$docs_root/repo-b/_analysis/coverage-checklist.md" "Completion: incomplete"
  assert_contains "$docs_root/repo-b/_analysis/coverage-checklist.md" "## 进行中模块"
  assert_dir_absent "$repos_root/repo-c"
  assert_dir_absent "$docs_root/repo-c"
  assert_contains "$report" "## 待办清单"
  assert_not_contains "$report" "success"
  assert_not_contains "$report" "partial"
  assert_not_contains "$report" "skipped"
  assert_not_contains "$report" "[validate-doc-completion][ERROR]"
  assert_contains "$report" "completion pending: documentation output is not initialized"
  assert_dir_absent "$docs_root/.batch-generate-docs.lock"
  if find "$docs_root" -name '.batch-report.*.tmp' | grep . >/dev/null 2>&1; then
    fail "batch left temporary report files"
  fi
  if find "$repos_root" -name '*.clone.*.tmp' | grep . >/dev/null 2>&1; then
    fail "batch left temporary clone paths"
  fi

  run_expect_failure "$stdout_file" "$stderr_file" bash "$BATCH" \
    --repo "$repo_a" --docs-root "$docs_root" --repos-root "$repos_root" \
    --max-repos 0
  assert_contains "$stderr_file" "--max-repos"

  run_expect_failure "$stdout_file" "$stderr_file" bash "$BATCH" \
    --repo "$repo_a" --docs-root "$docs_root" --repos-root "$repos_root" \
    --dry-run
  assert_contains "$stderr_file" "Unknown argument"

  mkdir -p "$docs_root/.batch-generate-docs.lock"
  printf 'unchanged\n' >"$report"
  run_expect_failure "$stdout_file" "$stderr_file" bash "$BATCH" \
    --repo "$repo_b" --docs-root "$docs_root" --repos-root "$repos_root" \
    --max-repos 1
  assert_contains "$stderr_file" "lock"
  assert_eq "unchanged" "$(cat "$report")" "lock failure must preserve report"
  rm -rf "$docs_root/.batch-generate-docs.lock"

  failed_docs_root="$TMP_ROOT/failed quota docs"
  failed_repos_root="$TMP_ROOT/failed quota clones"
  run_expect_failure "$stdout_file" "$stderr_file" bash "$BATCH" \
    --repo "$TMP_ROOT/missing-origin" \
    --repo "$repo_c" \
    --docs-root "$failed_docs_root" \
    --repos-root "$failed_repos_root" \
    --max-repos 1
  assert_contains "$failed_docs_root/batch-report.md" "| missing-origin |"
  assert_contains "$failed_docs_root/batch-report.md" "| failed |"
  assert_contains "$failed_docs_root/batch-report.md" "| repo-c |"
  assert_contains "$failed_docs_root/batch-report.md" "| deferred |"
  assert_contains "$failed_docs_root/batch-report.md" "- Cloned (ready for docs): 0"
  assert_dir_absent "$failed_repos_root/repo-c"

  make_valid_docs "$docs_root/repo-b"
  run_expect_success "$stdout_file" "$stderr_file" bash "$BATCH" \
    --repo "$repo_a" \
    --repo "$repo_b" \
    --repo "$repo_c" \
    --docs-root "$docs_root" \
    --repos-root "$repos_root" \
    --max-repos 1
  assert_contains "$report" "- Done: 2"
  assert_contains "$report" "- Cloned (ready for docs): 1"
  assert_contains "$report" "- Deferred: 0"
  assert_file "$repos_root/repo-c/.git/HEAD"

  pass "batch resume and limits"
}

test_batch
