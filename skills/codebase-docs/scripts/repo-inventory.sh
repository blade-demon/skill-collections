#!/usr/bin/env bash

# Build a compact, bounded repository inventory without modifying source files.
# Compatible with the Bash 3.2 shipped by macOS.

set -uo pipefail

ROOT="."
OUT=""
WORK_DIR=""
REPORT_TMP=""

usage() {
  cat <<'EOF'
Usage:
  ./scripts/repo-inventory.sh [--root <source-repository>] [--out <inventory-file>]

Defaults:
  --root .
  --out <current-directory>/docs/_analysis/repo-inventory.md
EOF
}

log() {
  printf '[repo-inventory] %s\n' "$*" >&2
}

error() {
  printf '[repo-inventory][ERROR] %s\n' "$*" >&2
}

cleanup() {
  if [[ -n "$REPORT_TMP" && -f "$REPORT_TMP" ]]; then
    rm -f "$REPORT_TMP"
  fi
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
  fi
}

interrupted() {
  error "Interrupted; the previous inventory was preserved. Run the same command to continue."
  exit 130
}

trap interrupted INT TERM HUP
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || {
        error "Missing value for --root"
        usage
        exit 2
      }
      ROOT="$2"
      shift 2
      ;;
    --out)
      [[ $# -ge 2 ]] || {
        error "Missing value for --out"
        usage
        exit 2
      }
      OUT="$2"
      shift 2
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

if [[ ! -d "$ROOT" ]]; then
  error "Repository root is not a directory: $ROOT"
  exit 1
fi

ROOT="$(cd "$ROOT" && pwd)"
if [[ -z "$OUT" ]]; then
  OUT="$(pwd)/docs/_analysis/repo-inventory.md"
elif [[ "$OUT" != /* ]]; then
  OUT="$(pwd)/$OUT"
fi

OUT_DIR="$(dirname "$OUT")"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/repo-inventory.XXXXXX")" || {
  error "Unable to create temporary work directory."
  exit 1
}

FILES="$WORK_DIR/files"
MANIFESTS="$WORK_DIR/manifests"
COMMANDS="$WORK_DIR/commands"
DIRECTORIES="$WORK_DIR/directories"
EXTENSIONS="$WORK_DIR/extensions"
ENTRY_PATHS="$WORK_DIR/entry-paths"
ALL_MODULES="$WORK_DIR/modules-all"
MODULES="$WORK_DIR/modules"
CONFIGS="$WORK_DIR/configs"
TRUNCATIONS="$WORK_DIR/truncations"

: >"$FILES"
: >"$MANIFESTS"
: >"$COMMANDS"
: >"$DIRECTORIES"
: >"$EXTENSIONS"
: >"$ENTRY_PATHS"
: >"$ALL_MODULES"
: >"$MODULES"
: >"$CONFIGS"
: >"$TRUNCATIONS"

GIT_REPO="no"
BRANCH="未检测到"

if command -v git >/dev/null 2>&1 \
  && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_REPO="yes"
  git -C "$ROOT" ls-files | LC_ALL=C sort >"$FILES"
  branch_value="$(git -C "$ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  if [[ -n "$branch_value" ]]; then
    BRANCH="$branch_value"
  fi
else
  (
    cd "$ROOT" || exit 1
    find . -type f \
      ! -path './.git/*' \
      ! -path './node_modules/*' \
      ! -path './vendor/*' \
      ! -path './dist/*' \
      ! -path './build/*' \
      ! -path './.next/*' \
      ! -path './target/*' \
      | sed 's#^\./##' \
      | LC_ALL=C sort
  ) >"$FILES"
fi

mkdir -p "$OUT_DIR" || {
  error "Unable to create output directory: $OUT_DIR"
  exit 1
}
REPORT_TMP="$OUT_DIR/.repo-inventory.$$.tmp"
: >"$REPORT_TMP" || {
  error "Unable to write temporary inventory: $REPORT_TMP"
  exit 1
}

append_path_list() {
  local source_file="$1"
  local limit="$2"
  local empty_message="$3"
  local total=""

  total="$(awk 'END { print NR + 0 }' "$source_file")"
  if [[ "$total" -eq 0 ]]; then
    printf -- '- %s\n' "$empty_message" >>"$REPORT_TMP"
    return
  fi

  head -n "$limit" "$source_file" | while IFS= read -r path; do
    printf -- '- `%s`\n' "$path"
  done >>"$REPORT_TMP"

  if [[ "$total" -gt "$limit" ]]; then
    printf -- '- 已截断：共 %s 项，仅输出前 %s 项。\n' "$total" "$limit" \
      >>"$TRUNCATIONS"
  fi
}

manifest_project_name() {
  local relative_path="$1"
  local absolute_path="$ROOT/$relative_path"
  local base_name="${relative_path##*/}"
  local value=""

  case "$base_name" in
    package.json|composer.json)
      value="$(
        sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
          "$absolute_path" 2>/dev/null | head -n 1
      )"
      ;;
    pom.xml)
      value="$(
        sed -n 's/.*<artifactId>[[:space:]]*\([^<]*\)[[:space:]]*<\/artifactId>.*/\1/p' \
          "$absolute_path" 2>/dev/null | head -n 1
      )"
      ;;
    go.mod)
      value="$(
        sed -n 's/^module[[:space:]][[:space:]]*\(.*\)$/\1/p' \
          "$absolute_path" 2>/dev/null | head -n 1
      )"
      ;;
    Cargo.toml|pyproject.toml)
      value="$(
        sed -n 's/^[[:space:]]*name[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
          "$absolute_path" 2>/dev/null | head -n 1
      )"
      ;;
    settings.gradle|settings.gradle.kts)
      value="$(
        sed -n "s/^[[:space:]]*rootProject\\.name[[:space:]]*=[[:space:]]*['\"]\\([^'\"]*\\)['\"].*/\\1/p" \
          "$absolute_path" 2>/dev/null | head -n 1
      )"
      ;;
  esac

  if [[ -n "$value" ]]; then
    printf '%s | project: %s\n' "$relative_path" "$value"
  else
    printf '%s\n' "$relative_path"
  fi
}

log "[1/9] collecting repository metadata"
{
  printf '# Repository Inventory\n\n'
  printf '## Repository Metadata\n\n'
  printf -- '- Root: `%s`\n' "$ROOT"
  printf -- '- Git repository: %s\n' "$GIT_REPO"
  printf -- '- Branch: `%s`\n' "$BRANCH"
  printf -- '- Tracked/discovered files: %s\n' "$(awk 'END { print NR + 0 }' "$FILES")"
  printf '\n'
} >>"$REPORT_TMP"

log "[2/9] detecting technology signals"
while IFS= read -r path; do
  case "${path##*/}" in
    package.json|pom.xml|build.gradle|build.gradle.kts|settings.gradle|settings.gradle.kts|go.mod|Cargo.toml|pyproject.toml|requirements.txt|Pipfile|composer.json|Gemfile|mix.exs|pubspec.yaml|Package.swift|*.csproj|*.sln)
      manifest_project_name "$path" >>"$MANIFESTS"
      ;;
  esac
done <"$FILES"
LC_ALL=C sort -u "$MANIFESTS" -o "$MANIFESTS"
{
  printf '## Technology Signals\n\n'
  append_path_list "$MANIFESTS" 40 "未检测到已知 manifest 或 build 文件。"
  printf '\n'
} >>"$REPORT_TMP"

log "[3/9] extracting run command candidates"
while IFS= read -r path; do
  case "${path##*/}" in
    package.json)
      sed -n '/"scripts"[[:space:]]*:[[:space:]]*{/,/^[[:space:]]*}[,[:space:]]*$/p' \
        "$ROOT/$path" 2>/dev/null \
        | sed -n 's/^[[:space:]]*"\([^"]*\)"[[:space:]]*:[[:space:]]*"\([^"]*\)"[,[:space:]]*$/\1 -> \2/p' \
        | while IFS= read -r script; do
            printf '%s :: %s\n' "$path" "$script"
          done >>"$COMMANDS"
      ;;
    Makefile|GNUmakefile)
      awk -F: '
        /^[A-Za-z0-9][A-Za-z0-9_.-]*[[:space:]]*:/ {
          target=$1
          sub(/[[:space:]]+$/, "", target)
          if (target !~ /^\.|%/) print target
        }
      ' "$ROOT/$path" 2>/dev/null \
        | while IFS= read -r target; do
            printf '%s :: make %s\n' "$path" "$target"
          done >>"$COMMANDS"
      ;;
  esac
done <"$FILES"
LC_ALL=C sort -u "$COMMANDS" -o "$COMMANDS"
{
  printf '## Run Command Candidates\n\n'
  append_path_list "$COMMANDS" 50 "未安全提取到运行命令；请按需读取 manifest。"
  printf '\n'
} >>"$REPORT_TMP"

log "[4/9] aggregating directory overview"
awk -F/ '
  NF == 1 { counts["(root)"]++; next }
  {
    counts[$1]++
    if (NF >= 3) counts[$1 "/" $2]++
  }
  END {
    for (path in counts) print counts[path], path
  }
' "$FILES" | LC_ALL=C sort -k1,1nr -k2,2 >"$DIRECTORIES"
{
  printf '## Directory Overview\n\n'
  directory_total="$(awk 'END { print NR + 0 }' "$DIRECTORIES")"
  if [[ "$directory_total" -eq 0 ]]; then
    printf -- '- 未检测到目录。\n'
  else
    head -n 80 "$DIRECTORIES" | while read -r count path; do
      printf -- '- `%s` (%s files)\n' "$path" "$count"
    done
    if [[ "$directory_total" -gt 80 ]]; then
      printf -- '- 已截断：目录聚合共 %s 项，仅输出前 80 项。\n' "$directory_total" \
        >>"$TRUNCATIONS"
    fi
  fi
  printf '\n'
} >>"$REPORT_TMP"

log "[5/9] counting file types"
awk '
  {
    path=$0
    n=split(path, parts, "/")
    name=parts[n]
    if (name !~ /\./ || name ~ /^\.[^.]+$/) {
      ext="[no extension]"
    } else {
      sub(/^.*\./, "", name)
      ext="." tolower(name)
    }
    counts[ext]++
  }
  END {
    for (ext in counts) print counts[ext], ext
  }
' "$FILES" | LC_ALL=C sort -k1,1nr -k2,2 >"$EXTENSIONS"
{
  printf '## File Type Counts\n\n'
  extension_total="$(awk 'END { print NR + 0 }' "$EXTENSIONS")"
  if [[ "$extension_total" -eq 0 ]]; then
    printf -- '- 未检测到文件类型。\n'
  else
    printf '| Extension | Files |\n'
    printf '|---|---:|\n'
    head -n 30 "$EXTENSIONS" | while read -r count extension; do
      printf '| `%s` | %s |\n' "$extension" "$count"
    done
    if [[ "$extension_total" -gt 30 ]]; then
      printf -- '- 已截断：文件类型共 %s 项，仅输出前 30 项。\n' "$extension_total" \
        >>"$TRUNCATIONS"
    fi
  fi
  printf '\n'
} >>"$REPORT_TMP"

log "[6/9] scanning entry, route, and API candidates"
while IFS= read -r path; do
  case "$path" in
    *.js|*.jsx|*.ts|*.tsx|*.vue|*.py|*.java|*.kt|*.kts|*.go|*.rb|*.php|*.cs)
      if grep -E -q \
        'createRouter|<Route|@RestController|@Controller|@RequestMapping|@(Get|Post|Put|Delete|Patch)Mapping|app\.(get|post|put|delete|patch)|router\.(get|post|put|delete|patch)|urlpatterns|path\(|re_path\(|http\.HandleFunc|Route::(get|post|put|delete|patch)' \
        "$ROOT/$path" 2>/dev/null; then
        printf '%s\n' "$path" >>"$ENTRY_PATHS"
      fi
      ;;
  esac
done <"$FILES"
LC_ALL=C sort -u "$ENTRY_PATHS" -o "$ENTRY_PATHS"
{
  printf '## Entry Route and API Candidates\n\n'
  append_path_list "$ENTRY_PATHS" 80 "未检测到常见入口、路由或 API 模式。"
  printf '\n'
} >>"$REPORT_TMP"

log "[7/9] deriving module candidates"
awk -F/ '
  {
    candidate=""
    for (i=1; i<=NF; i++) {
      lower=tolower($i)
      if (lower ~ /^(routes?|pages?|controllers?|services?|apis?|state|stores?|domains?|features?|modules?|business|usecases?|use-cases)$/) {
        candidate=$1
        for (j=2; j<=i; j++) candidate=candidate "/" $j
        print candidate
        break
      }
    }
  }
' "$FILES" | LC_ALL=C sort -u >"$ALL_MODULES"
module_total="$(awk 'END { print NR + 0 }' "$ALL_MODULES")"
head -n 80 "$ALL_MODULES" >"$MODULES"
module_count="$(awk 'END { print NR + 0 }' "$MODULES")"
if [[ "$module_total" -gt 80 ]]; then
  printf -- '- 已截断：模块候选共 %s 项，仅输出前 80 项。\n' "$module_total" \
    >>"$TRUNCATIONS"
fi
{
  printf '## Module Candidates\n\n'
  printf 'Module-Candidates-Emitted: %s\n\n' "$module_count"
  append_path_list "$MODULES" 80 "未检测到 high-signal 模块路径。"
  printf '\n'
} >>"$REPORT_TMP"

log "[8/9] listing configuration files"
while IFS= read -r path; do
  base="${path##*/}"
  case "$base" in
    .env|.env.*|*.config.js|*.config.cjs|*.config.mjs|*.config.ts|*.yaml|*.yml|*.toml|*.ini|*.properties|Dockerfile|docker-compose.yml|docker-compose.yaml|compose.yml|compose.yaml|Makefile|GNUmakefile|tsconfig*.json|vite.config.*|webpack.config.*|next.config.*|nuxt.config.*)
      printf '%s\n' "$path" >>"$CONFIGS"
      ;;
  esac
done <"$FILES"
LC_ALL=C sort -u "$CONFIGS" -o "$CONFIGS"
{
  printf '## Configuration Files\n\n'
  append_path_list "$CONFIGS" 80 "未检测到常见配置文件。"
  printf '\n'
} >>"$REPORT_TMP"

log "[9/9] writing truncation notes"
{
  printf '## Truncation Notes\n\n'
  if [[ ! -s "$TRUNCATIONS" ]]; then
    printf -- '- 本次输出未触发章节上限。\n'
  else
    cat "$TRUNCATIONS"
  fi
  printf '\n'
} >>"$REPORT_TMP"

mv "$REPORT_TMP" "$OUT" || {
  error "Unable to replace inventory: $OUT"
  exit 1
}
REPORT_TMP=""

log "inventory complete: $OUT"
