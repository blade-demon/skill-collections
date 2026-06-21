# Shared helpers for codebase-docs tests. Source this from each test-*.sh.

set -uo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_ROOT="$(cd "$TEST_DIR/.." && pwd)"
INVENTORY="$SKILL_ROOT/scripts/repo-inventory.sh"
VALIDATOR="$SKILL_ROOT/scripts/validate-doc-completion.sh"
BATCH="$SKILL_ROOT/scripts/batch-generate-docs.sh"
PUBLISH="$SKILL_ROOT/scripts/publish-docs.sh"

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
  for template in "$SKILL_ROOT"/templates/documents/*.md; do
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
