#!/usr/bin/env bash

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

# publish-docs.sh 的行为测试（此前盲区）。全程离线、不访问真实 GitHub：
#   - plan-only（无 --yes）：建分支 + 本地 commit + 打印 push/PR 计划后停下，不 push；
#     不完整仓库（repo-b）被跳过、不提交。
#   - --yes：本地 bare repo 作 origin + PATH 假 gh，验证真实本地 push 与 gh pr create
#     参数。断言 bare repo 中出现目标 branch ref。
#   - lock：预置锁目录后再次运行应因无法获取锁而失败。
test_publish() {
  local docs_root="$TMP_ROOT/docs-root"
  local bare="$TMP_ROOT/origin.git"
  local fakebin="$TMP_ROOT/fakebin"
  local ghlog="$TMP_ROOT/gh-args.log"
  local output="$TMP_ROOT/publish.stdout"
  local errors="$TMP_ROOT/publish.stderr"
  local branch="docs/test-publish"
  local oldpath="$PATH"

  # docs-root 是带 identity 的 Git 仓库，seed 一个无关 commit；repo-a 的文档先不提交。
  mkdir -p "$docs_root"
  git init -q "$docs_root"
  git -C "$docs_root" config user.email "test@example.com"
  git -C "$docs_root" config user.name "Test User"
  printf '# docs root\n' >"$docs_root/README.md"
  git -C "$docs_root" add README.md
  git -C "$docs_root" commit -qm "seed"

  make_valid_docs "$docs_root/repo-a"
  # repo-b 文档不完整（删 architecture.md → validator 失败），应被 publish 跳过。
  make_valid_docs "$docs_root/repo-b"
  rm -f "$docs_root/repo-b/architecture.md"

  # --- plan-only：建分支 + commit + 打印计划，不 push；repo-b 被跳过 ---
  run_expect_success "$output" "$errors" \
    bash "$PUBLISH" --docs-root "$docs_root" --branch "$branch"
  assert_contains "$errors" "PUBLISH PLAN"
  assert_contains "$errors" "push -u origin"
  assert_contains "$errors" "gh pr create"
  assert_contains "$errors" "skip (not done): repo-b"
  git -C "$docs_root" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null \
    || fail "plan-only 应已在本地创建发布分支：$branch"
  git -C "$docs_root" ls-files --error-unmatch "repo-a/project-overview.md" >/dev/null 2>&1 \
    || fail "plan-only 应已把 repo-a 文档 commit 到发布分支"
  if git -C "$docs_root" ls-files --error-unmatch "repo-b/project-overview.md" >/dev/null 2>&1; then
    fail "不完整的 repo-b 不应被 commit 到发布分支"
  fi

  # --- --yes：bare origin + 假 gh，真实本地 push + gh pr create 参数 ---
  git init --bare -q "$bare"
  git -C "$docs_root" remote add origin "$bare"
  mkdir -p "$fakebin"
  cat >"$fakebin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$GH_ARGS_LOG"
exit 0
EOF
  chmod +x "$fakebin/gh"
  : >"$ghlog"

  PATH="$fakebin:$PATH"
  GH_ARGS_LOG="$ghlog" run_expect_success "$output" "$errors" \
    bash "$PUBLISH" --docs-root "$docs_root" --branch "$branch" --base main --yes
  PATH="$oldpath"

  git -C "$bare" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null \
    || fail "--yes 应已把分支真实 push 到 bare remote：$branch"
  assert_contains "$ghlog" "pr create"
  assert_contains "$ghlog" "--fill"
  assert_contains "$ghlog" "--base main"
  assert_contains "$ghlog" "$branch"

  # --- lock：预置锁目录后再次运行应因无法获取锁而失败 ---
  mkdir "$docs_root/.publish-docs.lock"
  run_expect_failure "$output" "$errors" \
    bash "$PUBLISH" --docs-root "$docs_root" --branch "$branch"
  assert_contains "$errors" "Unable to acquire lock"
  rmdir "$docs_root/.publish-docs.lock"

  pass "publish docs"
}

test_publish
