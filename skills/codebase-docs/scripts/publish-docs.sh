#!/usr/bin/env bash

# Publish generated documentation for `done` repositories into the docs-root Git
# repository. This script performs deterministic Git orchestration only; it never
# invokes an LLM or Agent CLI.
#
# Human-in-the-loop boundary:
#   - Local branch creation and commits run by default (reversible, local-only).
#   - `git push` and `gh pr create` are outward-facing and run ONLY with --yes.
#
# Intended use (opt-in publish stage of the 8-step loop):
#   1. Run without --yes. The script commits done-repo docs onto a publish branch
#      and prints the exact push / PR commands it WOULD run, then stops.
#   2. A human reviews the plan.
#   3. Re-run the same command with --yes to push and open the pull request.

set -uo pipefail

DOCS_ROOT=""
BRANCH=""
BASE_BRANCH=""
DO_PUSH="false"
ONLY_NAMES=()

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# validator 与本脚本同处一个 skill 的 scripts/，无跨 skill 路径依赖。
VALIDATOR="$SCRIPT_DIR/validate-doc-completion.sh"

LOCK_DIR=""
LOCK_HELD="false"
DOCS_ROOT_ABS=""
ORIGINAL_BRANCH=""

PUBLISHED_NAMES=()
SKIPPED_NAMES=()

usage() {
  cat <<'EOF'
Usage:
  ./scripts/publish-docs.sh --docs-root codebase-docs            # local commit + print plan, then stop
  ./scripts/publish-docs.sh --docs-root codebase-docs --yes      # also push and open a pull request

What this script does:
  - Discovers repo doc directories under docs-root (those with project-overview.md).
  - Re-derives `done` for each through validate-doc-completion.sh.
  - Commits every `done` repo's docs onto one publish branch in the docs-root repo.
  - Without --yes: prints the push / PR commands and stops (human review gate).
  - With --yes: pushes the branch and runs `gh pr create --fill`.

It does NOT invoke an LLM or Agent CLI and never touches source repositories.

Options:
  --docs-root <folder>   Documentation root, which must be a Git repository. Required.
  --only <name>          Publish only this repo doc directory. Repeatable.
  --branch <name>        Publish branch name. Default: docs/codebase-docs-<timestamp>.
  --base <name>          Base branch for the PR. Default: gh infers the default branch.
  --yes                  Perform the outward-facing push and pull-request creation.
  -h, --help             Show help.
EOF
}

log() {
  printf '[publish-docs] %s\n' "$*" >&2
}

warn() {
  printf '[publish-docs][WARN] %s\n' "$*" >&2
}

error() {
  printf '[publish-docs][ERROR] %s\n' "$*" >&2
}

cleanup() {
  if [[ "$LOCK_HELD" == "true" && -n "$LOCK_DIR" && -d "$LOCK_DIR" ]]; then
    rm -rf "$LOCK_DIR"
  fi
}

interrupted() {
  error "Interrupted. Local commits are preserved; nothing was pushed unless --yes already ran."
  exit 130
}

trap interrupted INT TERM HUP
trap cleanup EXIT

require_option_value() {
  if [[ "$2" -lt 2 ]]; then
    error "Missing value for $1"
    usage
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docs-root)
      require_option_value "$1" "$#"
      DOCS_ROOT="$2"
      shift 2
      ;;
    --only)
      require_option_value "$1" "$#"
      ONLY_NAMES+=("$2")
      shift 2
      ;;
    --branch)
      require_option_value "$1" "$#"
      BRANCH="$2"
      shift 2
      ;;
    --base)
      require_option_value "$1" "$#"
      BASE_BRANCH="$2"
      shift 2
      ;;
    --yes)
      DO_PUSH="true"
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

if [[ -z "$DOCS_ROOT" ]]; then
  error "Missing required argument: --docs-root <folder>"
  usage
  exit 2
fi

if [[ ! -d "$DOCS_ROOT" ]]; then
  error "Docs root is not a directory: $DOCS_ROOT"
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

DOCS_ROOT_ABS="$(cd "$DOCS_ROOT" && pwd)"

if ! git -C "$DOCS_ROOT_ABS" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  error "Docs root is not a Git repository: $DOCS_ROOT_ABS"
  error "Initialize it first, e.g.: git -C '$DOCS_ROOT_ABS' init && git -C '$DOCS_ROOT_ABS' remote add origin <url>"
  exit 1
fi

if [[ "$DO_PUSH" == "true" ]] && ! command -v gh >/dev/null 2>&1; then
  warn "gh CLI not found; will push the branch but cannot open a pull request automatically."
fi

if [[ -z "$BRANCH" ]]; then
  BRANCH="docs/codebase-docs-$(date +%Y%m%d-%H%M%S)"
fi

LOCK_DIR="$DOCS_ROOT_ABS/.publish-docs.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  error "Unable to acquire lock: $LOCK_DIR"
  error "Another publish run may be active. Remove a stale lock only after confirming no process is using this docs root."
  exit 1
fi
LOCK_HELD="true"

# Discover repo doc directories and filter to `done` repositories.
name_requested() {
  local name="$1"
  [[ ${#ONLY_NAMES[@]} -eq 0 ]] && return 0
  local wanted=""
  for wanted in "${ONLY_NAMES[@]}"; do
    [[ "$wanted" == "$name" ]] && return 0
  done
  return 1
}

DONE_NAMES=()
for entry in "$DOCS_ROOT_ABS"/*/; do
  [[ -d "$entry" ]] || continue
  name="$(basename "$entry")"
  case "$name" in
    .*) continue ;;
  esac
  [[ -f "$entry/project-overview.md" ]] || continue
  name_requested "$name" || continue

  if bash "$VALIDATOR" --docs-root "$entry" >/dev/null 2>&1; then
    DONE_NAMES+=("$name")
  else
    SKIPPED_NAMES+=("$name")
    log "skip (not done): $name"
  fi
done

if [[ ${#DONE_NAMES[@]} -eq 0 ]]; then
  log "No \`done\` repository documentation to publish under: $DOCS_ROOT_ABS"
  if [[ ${#SKIPPED_NAMES[@]} -gt 0 ]]; then
    log "Incomplete docs (run the generation loop until validate-doc-completion.sh passes): ${SKIPPED_NAMES[*]}"
  fi
  exit 0
fi

ORIGINAL_BRANCH="$(git -C "$DOCS_ROOT_ABS" symbolic-ref --quiet --short HEAD 2>/dev/null || printf 'DETACHED')"

# Create or reuse the publish branch.
if git -C "$DOCS_ROOT_ABS" rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null 2>&1; then
  log "reusing existing branch: $BRANCH"
  git -C "$DOCS_ROOT_ABS" checkout "$BRANCH" || { error "Unable to checkout branch: $BRANCH"; exit 1; }
else
  log "creating branch: $BRANCH (from $ORIGINAL_BRANCH)"
  git -C "$DOCS_ROOT_ABS" checkout -b "$BRANCH" || { error "Unable to create branch: $BRANCH"; exit 1; }
fi

# Commit each done repo's docs as its own scoped commit.
for name in "${DONE_NAMES[@]}"; do
  git -C "$DOCS_ROOT_ABS" add -- "$name"
  if git -C "$DOCS_ROOT_ABS" diff --cached --quiet -- "$name"; then
    log "no changes to commit for: $name"
    continue
  fi
  git -C "$DOCS_ROOT_ABS" commit -m "docs($name): add generated onboarding documentation" \
    -m "Generated by codebase-docs (read-only source analysis)." \
    >/dev/null || { error "Commit failed for: $name"; exit 1; }
  PUBLISHED_NAMES+=("$name")
  log "committed docs for: $name"
done

if [[ ${#PUBLISHED_NAMES[@]} -eq 0 ]]; then
  log "Branch $BRANCH already up to date; no new commits."
fi

# Outward-facing actions are gated behind --yes (human-in-the-loop).
PUSH_CMD="git -C '$DOCS_ROOT_ABS' push -u origin '$BRANCH'"
if [[ -n "$BASE_BRANCH" ]]; then
  PR_CMD="gh pr create --fill --head '$BRANCH' --base '$BASE_BRANCH'"
else
  PR_CMD="gh pr create --fill --head '$BRANCH'"
fi

if [[ "$DO_PUSH" != "true" ]]; then
  {
    printf '\n===== PUBLISH PLAN (no push performed) =====\n'
    printf 'Docs root : %s\n' "$DOCS_ROOT_ABS"
    printf 'Branch    : %s\n' "$BRANCH"
    printf 'Committed : %s\n' "${PUBLISHED_NAMES[*]:-<none, branch already current>}"
    printf 'Skipped   : %s\n' "${SKIPPED_NAMES[*]:-<none>}"
    printf '\nTo push and open the pull request after review, re-run with --yes:\n'
    printf '  %s\n' "$PUSH_CMD"
    printf '  %s\n' "$PR_CMD"
    printf '============================================\n'
  } >&2
  log "Stopped before push. This is the human-in-the-loop review gate."
  exit 0
fi

log "pushing branch: $BRANCH"
if ! git -C "$DOCS_ROOT_ABS" push -u origin "$BRANCH"; then
  error "git push failed. Confirm the 'origin' remote and your credentials."
  exit 1
fi

if command -v gh >/dev/null 2>&1; then
  log "opening pull request via gh"
  if [[ -n "$BASE_BRANCH" ]]; then
    ( cd "$DOCS_ROOT_ABS" && gh pr create --fill --head "$BRANCH" --base "$BASE_BRANCH" )
  else
    ( cd "$DOCS_ROOT_ABS" && gh pr create --fill --head "$BRANCH" )
  fi
else
  warn "gh CLI unavailable. Branch is pushed; open the pull request manually for branch: $BRANCH"
fi

log "Publish finished. Branch: $BRANCH  Published: ${PUBLISHED_NAMES[*]:-<none>}"
exit 0
