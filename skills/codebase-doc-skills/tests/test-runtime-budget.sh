#!/usr/bin/env bash

set -uo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_ROOT="$(cd "$TEST_DIR/.." && pwd)"
EXPLORER_ROOT="$SKILLS_ROOT/codebase-explorer-docs"
BATCH_ROOT="$SKILLS_ROOT/batch-codebase-doc-generator"
INVENTORY="$EXPLORER_ROOT/scripts/repo-inventory.sh"
VALIDATOR="$EXPLORER_ROOT/scripts/validate-doc-completion.sh"
BATCH="$BATCH_ROOT/scripts/batch-generate-docs.sh"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/codebase-doc-tests.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$*"
}

assert_file() {
  [[ -f "$1" ]] || fail "expected file: $1"
}

assert_dir_absent() {
  [[ ! -e "$1" ]] || fail "expected path to be absent: $1"
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  grep -F -- "$pattern" "$file" >/dev/null 2>&1 \
    || fail "expected '$pattern' in $file"
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  if grep -F -- "$pattern" "$file" >/dev/null 2>&1; then
    fail "did not expect '$pattern' in $file"
  fi
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  [[ "$expected" == "$actual" ]] \
    || fail "$message (expected=$expected actual=$actual)"
}

run_expect_success() {
  local stdout_file="$1"
  local stderr_file="$2"
  shift 2

  "$@" >"$stdout_file" 2>"$stderr_file" \
    || fail "command should succeed: $*; stderr=$(cat "$stderr_file")"
}

run_expect_failure() {
  local stdout_file="$1"
  local stderr_file="$2"
  shift 2

  if "$@" >"$stdout_file" 2>"$stderr_file"; then
    fail "command should fail: $*"
  fi
}

init_git_repo() {
  local repo="$1"

  mkdir -p "$repo"
  git init -q "$repo"
  git -C "$repo" config user.email "test@example.com"
  git -C "$repo" config user.name "Test User"
  printf '# fixture\n' >"$repo/README.md"
  git -C "$repo" add README.md
  git -C "$repo" commit -qm "fixture"
}

add_template_bodies() {
  local template="$1"
  local output="$2"

  awk '
    /^#{1,2} / {
      print
      print ""
      print "已填写。判断依据与证据路径：src/example.ts。"
      next
    }
    { print }
  ' "$template" >"$output"
}

write_valid_module_analysis() {
  local output="$1"

  cat >"$output" <<'EOF'
# Module Analysis

已填写。判断依据与证据路径：src/routes/index.ts。

## 业务模块覆盖矩阵

以下矩阵覆盖盘点候选。

| 模块 | 路径 | 入口文件 | 主要职责 | 相关 API/Service | 关键数据流 | Gotcha | 覆盖状态 | 证据来源 |
|---|---|---|---|---|---|---|---|---|
| 路由 | src/routes | src/routes/index.ts | 组织页面入口 | src/services/api.ts | request -> view | 文档提到未分析风险但本行已有证据 | 已覆盖 | src/routes/index.ts |
| 服务 | src/services | src/services/api.ts | API 封装 | /api/items | view -> service | 部分接口需确认 | 部分覆盖 | src/services/api.ts |

## 模块详情

路由与服务模块均有文件级证据。

## Gotcha 清单

部分接口语义需要业务确认。

## 覆盖度自检

| 检查项 | 结果 | 说明 |
|---|---|---|
| 路由模块是否覆盖 | 是，已有证据 | src/routes/index.ts |
| 页面模块是否覆盖 | 不适用 | 仓库没有页面目录，证据：repo-inventory.md |
| API/service 是否覆盖 | 已覆盖 | src/services/api.ts |
| 登录/鉴权/权限是否覆盖 | 不适用 | 未检测到鉴权入口，证据：repo-inventory.md |
| 状态管理是否覆盖 | 不适用 | 未检测到状态库，证据：package.json |
| 错误处理是否覆盖 | 已覆盖 | src/services/api.ts |
| 构建/启动 gotcha 是否覆盖 | 已覆盖 | package.json |
| 核心业务流程是否覆盖 | 部分覆盖并已说明 | src/routes/index.ts |
| 未确认模块是否列出 | 已列出 | 本文 Gotcha 清单 |
| 需要业务确认的问题是否列出 | 已列出 | 本文 TODO |
EOF
}

write_valid_architecture() {
  local output="$1"

  cat >"$output" <<'EOF'
# Architecture

## 运行时架构总览

```mermaid
flowchart LR
  %% Evidence: src/routes/index.ts
  Client --> Routes --> Services --> DB[(Store)]
```

## 模块调用与依赖关系

```mermaid
flowchart LR
  %% Evidence: src/services/api.ts
  Routes --> Services
```

## 关键调用链路

Client -> /items -> Routes -> Services。证据：src/routes/index.ts。

## 架构风险与边界

服务层与路由耦合。证据：src/services/api.ts。

## TODO: 需要业务确认

部分接口语义待确认。
EOF
}

make_valid_docs() {
  local docs_root="$1"
  local template=""
  local name=""

  mkdir -p "$docs_root/_analysis"
  for template in "$EXPLORER_ROOT"/templates/*.md; do
    name="$(basename "$template")"
    if [[ "$name" == "module-analysis.md" ]]; then
      write_valid_module_analysis "$docs_root/$name"
    elif [[ "$name" == "architecture.md" ]]; then
      write_valid_architecture "$docs_root/$name"
    else
      add_template_bodies "$template" "$docs_root/$name"
    fi
  done

  cat >"$docs_root/_analysis/repo-inventory.md" <<'EOF'
# Repository Inventory

## Module Candidates

Module-Candidates-Emitted: 2

- src/routes
- src/services
EOF

  cat >"$docs_root/_analysis/coverage-checklist.md" <<'EOF'
# Coverage Checklist

Completion: complete

## 已分析模块

- src/routes
- src/services

## 进行中模块

无。

## 部分覆盖、未确认和未分析模块

部分接口语义待确认。

## 下一批 high-signal 文件

无。

## 待业务确认

接口字段语义。

## 文档状态

全部已生成。
EOF
}

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

test_validator() {
  local docs_root="$TMP_ROOT/valid docs"
  local output="$TMP_ROOT/validator.stdout"
  local errors="$TMP_ROOT/validator.stderr"

  make_valid_docs "$docs_root"
  run_expect_success "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"

  sed -i.bak 's/Completion: complete/Completion: incomplete/' \
    "$docs_root/_analysis/coverage-checklist.md"
  rm -f "$docs_root/_analysis/coverage-checklist.md.bak"
  run_expect_failure "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"
  assert_contains "$errors" "Completion: complete"

  sed -i.bak 's/Completion: incomplete/Completion: complete/' \
    "$docs_root/_analysis/coverage-checklist.md"
  rm -f "$docs_root/_analysis/coverage-checklist.md.bak"
  sed -i.bak 's#| 部分覆盖 | src/services/api.ts |#| 未分析 | src/services/api.ts |#' \
    "$docs_root/module-analysis.md"
  rm -f "$docs_root/module-analysis.md.bak"
  run_expect_failure "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"
  assert_contains "$errors" "未分析"

  write_valid_module_analysis "$docs_root/module-analysis.md"
  sed -i.bak 's#| 部分覆盖 | src/services/api.ts |#| 部分覆盖 |  |#' \
    "$docs_root/module-analysis.md"
  rm -f "$docs_root/module-analysis.md.bak"
  run_expect_failure "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"
  assert_contains "$errors" "证据来源"

  write_valid_module_analysis "$docs_root/module-analysis.md"
  sed -i.bak 's#| 是，已有证据 | src/routes/index.ts |#| 是/部分/否 | src/routes/index.ts |#' \
    "$docs_root/module-analysis.md"
  rm -f "$docs_root/module-analysis.md.bak"
  run_expect_failure "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"
  assert_contains "$errors" "占位值"

  write_valid_module_analysis "$docs_root/module-analysis.md"
  sed -i.bak 's/Module-Candidates-Emitted: 2/Module-Candidates-Emitted: 3/' \
    "$docs_root/_analysis/repo-inventory.md"
  rm -f "$docs_root/_analysis/repo-inventory.md.bak"
  run_expect_failure "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"
  assert_contains "$errors" "少于 inventory"

  sed -i.bak 's/Module-Candidates-Emitted: 3/Module-Candidates-Emitted: 2/' \
    "$docs_root/_analysis/repo-inventory.md"
  rm -f "$docs_root/_analysis/repo-inventory.md.bak"
  awk '
    /^## 项目简介$/ { print; getline; getline; next }
    { print }
  ' "$docs_root/project-overview.md" >"$docs_root/project-overview.md.tmp"
  mv "$docs_root/project-overview.md.tmp" "$docs_root/project-overview.md"
  run_expect_failure "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"
  assert_contains "$errors" "空章节"

  make_valid_docs "$docs_root"
  sed -i.bak 's/| 覆盖状态 | 证据来源 |/| 状态 | 证据来源 |/' \
    "$docs_root/module-analysis.md"
  rm -f "$docs_root/module-analysis.md.bak"
  run_expect_failure "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"
  assert_contains "$errors" "覆盖状态或证据来源列"

  write_valid_module_analysis "$docs_root/module-analysis.md"
  sed -i.bak 's/| 路由模块是否覆盖 |/| 路由是否覆盖 |/' \
    "$docs_root/module-analysis.md"
  rm -f "$docs_root/module-analysis.md.bak"
  run_expect_failure "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"
  assert_contains "$errors" "缺少模板检查项"

  make_valid_docs "$docs_root"
  sed -i.bak '/%% Evidence:/d' "$docs_root/architecture.md"
  rm -f "$docs_root/architecture.md.bak"
  run_expect_failure "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"
  assert_contains "$errors" "Evidence"

  make_valid_docs "$docs_root"
  rm -f "$docs_root/architecture.md"
  run_expect_failure "$output" "$errors" bash "$VALIDATOR" --docs-root "$docs_root"
  assert_contains "$errors" "architecture.md"

  pass "completion validator"
}

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

test_skill_contracts() {
  assert_contains "$EXPLORER_ROOT/SKILL.md" "## Budget-Aware Execution Mode"
  assert_contains "$EXPLORER_ROOT/SKILL.md" "one invocation/session may deeply explore only one repository"
  assert_contains "$EXPLORER_ROOT/SKILL.md" "Shell cannot snapshot model reasoning"
  assert_contains "$EXPLORER_ROOT/SKILL.md" "business-flow-summary.md"
  assert_contains "$EXPLORER_ROOT/SKILL.md" "architecture.md"
  assert_contains "$EXPLORER_ROOT/templates/architecture.md" "## 模块调用与依赖关系"
  assert_contains "$EXPLORER_ROOT/SKILL.md" "references/document-spec.md"
  assert_contains "$EXPLORER_ROOT/references/document-spec.md" "## 业务模块覆盖矩阵"
  assert_contains "$EXPLORER_ROOT/references/document-spec.md" "## Gotcha 清单"
  assert_contains "$BATCH_ROOT/SKILL.md" "publish-docs.sh"
  assert_contains "$BATCH_ROOT/SKILL.md" "one Agent invocation/session = one deeply explored repository"
  assert_contains "$BATCH_ROOT/SKILL.md" "does not automatically wake"
  assert_contains "$BATCH_ROOT/SKILL.md" "done"
  assert_contains "$BATCH_ROOT/SKILL.md" "deferred"
  assert_not_contains "$EXPLORER_ROOT/SKILL.md" "Low Capability Model Mode"
  pass "skill execution contracts"
}

test_inventory
test_inventory_empty_non_git
test_validator
test_batch
test_skill_contracts

printf 'All runtime budget tests passed.\n'
