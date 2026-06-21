#!/usr/bin/env bash

# Prepare multiple repositories for codebase documentation. This script performs
# deterministic orchestration only; it never invokes an LLM or Agent CLI.

set -uo pipefail

REPOS_FILE=""
DOCS_ROOT=""
REPOS_ROOT="_repos"
FAIL_FAST="false"
MAX_REPOS=""
REPO_SPECS=()

PLAN_SPECS=()
PLAN_URLS=()
PLAN_BRANCHES=()
PLAN_NAMES=()
PLAN_SOURCE_PATHS=()
PLAN_DOCS_PATHS=()
USED_NAMES=()

DONE_NAMES=()
CLONED_NAMES=()
CLONED_SOURCE_PATHS=()
CLONED_DOCS_PATHS=()
DEFERRED_NAMES=()
FAILED_NAMES=()

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VALIDATOR="$SKILLS_ROOT/codebase-explorer-docs/scripts/validate-doc-completion.sh"

LOCK_DIR=""
LOCK_HELD="false"
REPORT_TMP=""
CLONE_TEMP=""
ORIGINAL_COMMAND="$0 $*"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/batch-generate-docs.sh --repos repos.txt --docs-root codebase-docs

What this script does:
  - Statically validates and prints the resolved repository plan.
  - Detects completed repositories through validate-doc-completion.sh.
  - Clones or updates unfinished repositories within the activation limit.
  - Writes an atomic batch-report.md snapshot and seeds resumable checklists.

It does NOT invoke an LLM or Agent CLI. One Agent invocation/session should
deeply analyze only one cloned repository.

Options:
  --repos <file>          Repo spec list, one per line.
  --repo <git-url>        Single repo spec. Can be repeated.
  --docs-root <folder>    Documentation root folder. Required.
  --repos-root <folder>   Clone root folder. Default: _repos.
  --max-repos <N>         Activate at most N unfinished repos in this run.
  --fail-fast             Stop further clone/update work after one failure.
  -h, --help              Show help.

Optional branch syntax:
  https://github.com/org/repo-a.git#main
  git@github.com:org/repo-b.git#develop
EOF
}

log() {
  printf '[batch-codebase-doc-generator] %s\n' "$*" >&2
}

warn() {
  printf '[batch-codebase-doc-generator][WARN] %s\n' "$*" >&2
}

error() {
  printf '[batch-codebase-doc-generator][ERROR] %s\n' "$*" >&2
}

cleanup() {
  if [[ -n "$CLONE_TEMP" && -e "$CLONE_TEMP" ]]; then
    rm -rf "$CLONE_TEMP"
  fi
  if [[ -n "$REPORT_TMP" && -f "$REPORT_TMP" ]]; then
    rm -f "$REPORT_TMP"
  fi
  if [[ "$LOCK_HELD" == "true" && -n "$LOCK_DIR" && -d "$LOCK_DIR" ]]; then
    rm -rf "$LOCK_DIR"
  fi
}

interrupted() {
  error "Interrupted. Completed clones and the previous report were preserved."
  error "Run the same command again to continue."
  exit 130
}

trap interrupted INT TERM HUP
trap cleanup EXIT

require_option_value() {
  local option="$1"
  local count="$2"

  if [[ "$count" -lt 2 ]]; then
    error "Missing value for $option"
    usage
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repos)
      require_option_value "$1" "$#"
      REPOS_FILE="$2"
      shift 2
      ;;
    --repo)
      require_option_value "$1" "$#"
      REPO_SPECS+=("$2")
      shift 2
      ;;
    --docs-root)
      require_option_value "$1" "$#"
      DOCS_ROOT="$2"
      shift 2
      ;;
    --repos-root)
      require_option_value "$1" "$#"
      REPOS_ROOT="$2"
      shift 2
      ;;
    --max-repos)
      require_option_value "$1" "$#"
      MAX_REPOS="$2"
      shift 2
      ;;
    --fail-fast)
      FAIL_FAST="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      usage
      exit 2
      ;;
  esac
done

# Static preflight begins here. It must not write directories, reports, or repos.
if [[ -z "$DOCS_ROOT" ]]; then
  error "Missing required argument: --docs-root <folder>"
  usage
  exit 2
fi

if [[ -n "$MAX_REPOS" && ! "$MAX_REPOS" =~ ^[1-9][0-9]*$ ]]; then
  error "--max-repos must be a positive decimal integer."
  exit 2
fi

if [[ -n "$REPOS_FILE" ]]; then
  if [[ ! -f "$REPOS_FILE" || ! -r "$REPOS_FILE" ]]; then
    error "Repos file is not readable: $REPOS_FILE"
    exit 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -z "$line" ]] && continue
    [[ "$line" == \#* ]] && continue
    REPO_SPECS+=("$line")
  done <"$REPOS_FILE"
fi

if [[ ${#REPO_SPECS[@]} -eq 0 ]]; then
  error "No repositories provided. Use --repos <file> or --repo <git-url>."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  error "git command not found."
  exit 1
fi

if [[ ! -f "$VALIDATOR" || ! -r "$VALIDATOR" ]]; then
  error "Completion validator is not readable: $VALIDATOR"
  exit 1
fi

absolute_path() {
  local path="$1"

  if [[ "$path" == /* ]]; then
    printf '%s' "${path%/}"
  else
    path="${path#./}"
    printf '%s/%s' "$(pwd)" "${path%/}"
  fi
}

derive_repo_name() {
  local spec="$1"
  local url="${spec%%#*}"
  local clean="${url%/}"
  local last_part=""

  if [[ "$clean" == git@*:* ]]; then
    last_part="${clean##*:}"
  else
    last_part="${clean##*/}"
  fi

  last_part="${last_part%.git}"
  printf '%s' "$last_part" \
    | sed 's/[^a-zA-Z0-9._-]/-/g' \
    | sed 's/^-*//;s/-*$//'
}

repo_url_without_branch() {
  printf '%s' "${1%%#*}"
}

repo_branch_or_empty() {
  if [[ "$1" == *"#"* ]]; then
    printf '%s' "${1#*#}"
  else
    printf ''
  fi
}

name_exists() {
  local name="$1"
  local existing=""

  for existing in ${USED_NAMES[@]+"${USED_NAMES[@]}"}; do
    if [[ "$existing" == "$name" ]]; then
      return 0
    fi
  done
  return 1
}

unique_repo_name() {
  local base="$1"
  local candidate="$base"
  local index=2

  [[ -n "$candidate" ]] || candidate="repo"
  while name_exists "$candidate"; do
    candidate="${base:-repo}-${index}"
    index=$((index + 1))
  done
  USED_NAMES+=("$candidate")
  printf '%s' "$candidate"
}

REPOS_ROOT_ABS="$(absolute_path "$REPOS_ROOT")"
DOCS_ROOT_ABS="$(absolute_path "$DOCS_ROOT")"

index=0
for spec in "${REPO_SPECS[@]}"; do
  repo_url="$(repo_url_without_branch "$spec")"
  branch="$(repo_branch_or_empty "$spec")"

  if [[ -z "$repo_url" ]]; then
    error "Repository spec has an empty URL: $spec"
    exit 2
  fi
  if [[ "$spec" == *"#"* && -z "$branch" ]]; then
    error "Repository spec has an empty branch: $spec"
    exit 2
  fi

  base_name="$(derive_repo_name "$spec")"
  repo_name="$(unique_repo_name "$base_name")"
  source_path="$REPOS_ROOT_ABS/$repo_name"
  docs_path="$DOCS_ROOT_ABS/$repo_name"

  PLAN_SPECS[$index]="$spec"
  PLAN_URLS[$index]="$repo_url"
  PLAN_BRANCHES[$index]="$branch"
  PLAN_NAMES[$index]="$repo_name"
  PLAN_SOURCE_PATHS[$index]="$source_path"
  PLAN_DOCS_PATHS[$index]="$docs_path"
  index=$((index + 1))
done

printf 'Input Spec | Repo Name | Branch | Source Path | Docs Path\n' >&2
printf '%s\n' '---|---|---|---|---' >&2
index=0
while [[ "$index" -lt "${#PLAN_NAMES[@]}" ]]; do
  printf '%s | %s | %s | %s | %s\n' \
    "${PLAN_SPECS[$index]}" \
    "${PLAN_NAMES[$index]}" \
    "${PLAN_BRANCHES[$index]:-default}" \
    "${PLAN_SOURCE_PATHS[$index]}" \
    "${PLAN_DOCS_PATHS[$index]}" >&2
  index=$((index + 1))
done

# Static preflight and zero-side-effect plan preview are complete.
mkdir -p "$REPOS_ROOT_ABS" "$DOCS_ROOT_ABS" || {
  error "Unable to create repos/docs root."
  exit 1
}

LOCK_DIR="$DOCS_ROOT_ABS/.batch-generate-docs.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  error "Unable to acquire lock: $LOCK_DIR"
  error "Another run may be active. Remove a stale lock only after confirming no process is using this docs root."
  exit 1
fi
LOCK_HELD="true"
printf '%s\n' "$$" >"$LOCK_DIR/pid"
printf '%s\n' "$ORIGINAL_COMMAND" >"$LOCK_DIR/command"

REPORT_FILE="$DOCS_ROOT_ABS/batch-report.md"
REPORT_TMP="$DOCS_ROOT_ABS/.batch-report.$$.tmp"

escape_md_cell() {
  printf '%s' "$1" | sed 's/|/\\|/g' | tr '\n' ' '
}

append_report_header() {
  cat >"$REPORT_TMP" <<'EOF'
# Batch Codebase Documentation Report

> 本报告是当前文件系统状态的完整快照。脚本只负责仓库准备和完成判定，
> 不调用任何大模型或 Agent CLI。`done` 必须通过六文档完成检查。

| Repo | Git URL | Branch | Source Path | Docs Path | Status | Notes |
|---|---|---|---|---|---|---|
EOF
}

append_report_row() {
  local repo_name="$1"
  local repo_url="$2"
  local branch="$3"
  local source_path="$4"
  local docs_path="$5"
  local status="$6"
  local notes="$7"

  printf '| %s | %s | %s | %s | %s | %s | %s |\n' \
    "$(escape_md_cell "$repo_name")" \
    "$(escape_md_cell "$repo_url")" \
    "$(escape_md_cell "${branch:-default}")" \
    "$(escape_md_cell "$source_path")" \
    "$(escape_md_cell "$docs_path")" \
    "$(escape_md_cell "$status")" \
    "$(escape_md_cell "$notes")" >>"$REPORT_TMP"
}

compact_validation_reason() {
  local output="$1"
  local first_line=""

  first_line="$(printf '%s\n' "$output" | sed -n '1p')"
  case "$first_line" in
    *"Docs root is not a directory:"*)
      first_line="documentation output is not initialized"
      ;;
    "")
      first_line="completion validation did not pass"
      ;;
    *)
      first_line="$(
        printf '%s' "$first_line" \
          | sed 's/^\[validate-doc-completion\]\[ERROR\][[:space:]]*//'
      )"
      ;;
  esac
  printf '%s' "$first_line" | cut -c 1-300
}

clone_or_update_repo() {
  local repo_url="$1"
  local branch="$2"
  local source_path="$3"

  if [[ -d "$source_path/.git" ]]; then
    log "fetching existing repo: $source_path"
    if ! git -C "$source_path" fetch --all --prune; then
      warn "git fetch failed; continuing with existing checkout: $source_path"
    fi

    if [[ -n "$branch" ]] && ! git -C "$source_path" checkout "$branch"; then
      error "Failed to checkout branch '$branch' in $source_path"
      return 1
    fi
    return 0
  fi

  if [[ -e "$source_path" ]]; then
    error "Path exists but is not a Git repository: $source_path"
    return 1
  fi

  CLONE_TEMP="${source_path}.clone.$$.tmp"
  if [[ -e "$CLONE_TEMP" ]]; then
    error "Clone temporary path already exists: $CLONE_TEMP"
    return 1
  fi

  log "cloning into temporary path: $CLONE_TEMP"
  if [[ -n "$branch" ]]; then
    git clone --branch "$branch" "$repo_url" "$CLONE_TEMP"
  else
    git clone "$repo_url" "$CLONE_TEMP"
  fi
  clone_status=$?

  if [[ "$clone_status" -ne 0 ]]; then
    rm -rf "$CLONE_TEMP"
    CLONE_TEMP=""
    return "$clone_status"
  fi

  if ! mv "$CLONE_TEMP" "$source_path"; then
    rm -rf "$CLONE_TEMP"
    CLONE_TEMP=""
    error "Unable to move completed clone into place: $source_path"
    return 1
  fi
  CLONE_TEMP=""
  return 0
}

seed_coverage_checklist() {
  local docs_path="$1"
  local checklist="$docs_path/_analysis/coverage-checklist.md"

  mkdir -p "$docs_path/_analysis" || return 1
  if [[ -e "$checklist" ]]; then
    return 0
  fi

  cat >"$checklist" <<'EOF'
# Coverage Checklist

Completion: incomplete

## 已分析模块

## 进行中模块

## 部分覆盖、未确认和未分析模块

## 下一批 high-signal 文件

## 待业务确认

## 文档状态
EOF
}

append_report_header

TOTAL="${#PLAN_NAMES[@]}"
DONE=0
CLONED=0
DEFERRED=0
FAILED=0
ACTIVATED=0
STOP_ACTIVATION="false"

index=0
while [[ "$index" -lt "$TOTAL" ]]; do
  spec="${PLAN_SPECS[$index]}"
  repo_url="${PLAN_URLS[$index]}"
  branch="${PLAN_BRANCHES[$index]}"
  repo_name="${PLAN_NAMES[$index]}"
  source_path="${PLAN_SOURCE_PATHS[$index]}"
  docs_path="${PLAN_DOCS_PATHS[$index]}"
  ordinal=$((index + 1))

  log "[$ordinal/$TOTAL] repo=$repo_name action=checking-completion counts Done=$DONE Cloned=$CLONED Deferred=$DEFERRED Failed=$FAILED"

  validation_output="$(bash "$VALIDATOR" --docs-root "$docs_path" 2>&1)"
  validation_status=$?
  if [[ "$validation_status" -eq 0 ]]; then
    DONE=$((DONE + 1))
    DONE_NAMES+=("$repo_name")
    append_report_row "$repo_name" "$repo_url" "$branch" "$source_path" \
      "$docs_path" "done" "six-document completion validation passed"
    log "[$ordinal/$TOTAL] repo=$repo_name action=done counts Done=$DONE Cloned=$CLONED Deferred=$DEFERRED Failed=$FAILED"
    index=$((index + 1))
    continue
  fi

  validation_reason="$(compact_validation_reason "$validation_output")"
  if [[ "$STOP_ACTIVATION" == "true" ]] \
    || { [[ -n "$MAX_REPOS" ]] && [[ "$ACTIVATED" -ge "$MAX_REPOS" ]]; }; then
    DEFERRED=$((DEFERRED + 1))
    DEFERRED_NAMES+=("$repo_name")
    if [[ "$STOP_ACTIVATION" == "true" ]]; then
      defer_reason="deferred by --fail-fast after an earlier failure"
    else
      defer_reason="activation limit reached; run the same command again"
    fi
    append_report_row "$repo_name" "$repo_url" "$branch" "$source_path" \
      "$docs_path" "deferred" "$defer_reason; completion pending: $validation_reason"
    log "[$ordinal/$TOTAL] repo=$repo_name action=deferred counts Done=$DONE Cloned=$CLONED Deferred=$DEFERRED Failed=$FAILED"
    index=$((index + 1))
    continue
  fi

  ACTIVATED=$((ACTIVATED + 1))
  log "[$ordinal/$TOTAL] repo=$repo_name action=clone-or-update activation=$ACTIVATED${MAX_REPOS:+/$MAX_REPOS}"

  if ! clone_or_update_repo "$repo_url" "$branch" "$source_path"; then
    FAILED=$((FAILED + 1))
    FAILED_NAMES+=("$repo_name")
    append_report_row "$repo_name" "$repo_url" "$branch" "$source_path" \
      "$docs_path" "failed" "clone or checkout failed; rerun retries this repo; completion pending: $validation_reason"
    if [[ "$FAIL_FAST" == "true" ]]; then
      STOP_ACTIVATION="true"
    fi
    log "[$ordinal/$TOTAL] repo=$repo_name action=failed counts Done=$DONE Cloned=$CLONED Deferred=$DEFERRED Failed=$FAILED"
    index=$((index + 1))
    continue
  fi

  if ! seed_coverage_checklist "$docs_path"; then
    FAILED=$((FAILED + 1))
    FAILED_NAMES+=("$repo_name")
    append_report_row "$repo_name" "$repo_url" "$branch" "$source_path" \
      "$docs_path" "failed" "repo prepared but coverage checklist scaffold failed; completion pending: $validation_reason"
    if [[ "$FAIL_FAST" == "true" ]]; then
      STOP_ACTIVATION="true"
    fi
    log "[$ordinal/$TOTAL] repo=$repo_name action=failed-scaffold counts Done=$DONE Cloned=$CLONED Deferred=$DEFERRED Failed=$FAILED"
    index=$((index + 1))
    continue
  fi

  CLONED=$((CLONED + 1))
  CLONED_NAMES+=("$repo_name")
  CLONED_SOURCE_PATHS+=("$source_path")
  CLONED_DOCS_PATHS+=("$docs_path")
  append_report_row "$repo_name" "$repo_url" "$branch" "$source_path" \
    "$docs_path" "cloned" "ready for one-repo Agent session; completion pending: $validation_reason"
  log "[$ordinal/$TOTAL] repo=$repo_name action=cloned counts Done=$DONE Cloned=$CLONED Deferred=$DEFERRED Failed=$FAILED"

  index=$((index + 1))
done

{
  printf '\n## Summary\n\n'
  printf -- '- Total: %s\n' "$TOTAL"
  printf -- '- Done: %s\n' "$DONE"
  printf -- '- Cloned (ready for docs): %s\n' "$CLONED"
  printf -- '- Deferred: %s\n' "$DEFERRED"
  printf -- '- Failed: %s\n' "$FAILED"
  printf -- '- Docs root: `%s`\n' "$DOCS_ROOT_ABS"
  printf -- '- Repos root: `%s`\n' "$REPOS_ROOT_ABS"

  printf '\n## 待办清单\n\n'
  if [[ "$CLONED" -eq 0 ]]; then
    printf -- '- 无。本次没有新激活的仓库。\n'
  else
    index=0
    while [[ "$index" -lt "$CLONED" ]]; do
      printf '%s. `%s`\n' "$((index + 1))" "${CLONED_NAMES[$index]}"
      printf '   - Source Path: `%s`\n' "${CLONED_SOURCE_PATHS[$index]}"
      printf '   - Docs Path: `%s`\n' "${CLONED_DOCS_PATHS[$index]}"
      printf '   - 当前 Agent 会话只选择其中一个仓库深挖。\n'
      index=$((index + 1))
    done
  fi

  printf '\n## Done\n\n'
  if [[ "$DONE" -eq 0 ]]; then
    printf -- '- 无。\n'
  else
    for repo_name in "${DONE_NAMES[@]}"; do
      printf -- '- `%s`\n' "$repo_name"
    done
  fi

  printf '\n## Deferred\n\n'
  if [[ "$DEFERRED" -eq 0 ]]; then
    printf -- '- 无。\n'
  else
    for repo_name in "${DEFERRED_NAMES[@]}"; do
      printf -- '- `%s`：再次运行同一命令即可继续。\n' "$repo_name"
    done
  fi

  printf '\n## Failed\n\n'
  if [[ "$FAILED" -eq 0 ]]; then
    printf -- '- 无。\n'
  else
    for repo_name in "${FAILED_NAMES[@]}"; do
      printf -- '- `%s`：下次运行会重新消耗配额并重试。\n' "$repo_name"
    done
  fi
} >>"$REPORT_TMP"

if ! mv "$REPORT_TMP" "$REPORT_FILE"; then
  error "Unable to atomically replace report: $REPORT_FILE"
  exit 1
fi
REPORT_TMP=""

log "Batch finished. Report: $REPORT_FILE"
log "Shell preparation may run longer than 30 minutes; no model request budget is consumed here."

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi

exit 0
