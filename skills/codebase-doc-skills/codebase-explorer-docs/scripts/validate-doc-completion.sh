#!/usr/bin/env bash

# Validate the mechanically checkable completion contract for one repository's
# generated documentation. This script is read-only.

set -uo pipefail

DOCS_ROOT=""
FAILURES=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATES_DIR="$SKILL_ROOT/templates"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/validate-doc-completion.sh --docs-root <single-repo-docs-directory>
EOF
}

error() {
  printf '[validate-doc-completion][ERROR] %s\n' "$*" >&2
  FAILURES=$((FAILURES + 1))
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docs-root)
      [[ $# -ge 2 ]] || {
        printf '[validate-doc-completion][ERROR] Missing value for --docs-root\n' >&2
        usage
        exit 2
      }
      DOCS_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '[validate-doc-completion][ERROR] Unknown argument: %s\n' "$1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$DOCS_ROOT" ]]; then
  printf '[validate-doc-completion][ERROR] Missing required argument: --docs-root\n' >&2
  usage
  exit 2
fi

if [[ ! -d "$DOCS_ROOT" ]]; then
  printf '[validate-doc-completion][ERROR] Docs root is not a directory: %s\n' \
    "$DOCS_ROOT" >&2
  exit 1
fi

if [[ ! -d "$TEMPLATES_DIR" ]]; then
  printf '[validate-doc-completion][ERROR] Templates directory not found: %s\n' \
    "$TEMPLATES_DIR" >&2
  exit 1
fi

section_has_body() {
  local document="$1"
  local heading="$2"

  awk -v target="$heading" '
    function heading_level(line, hashes) {
      if (match(line, /^#+/)) {
        hashes=substr(line, RSTART, RLENGTH)
        return length(hashes)
      }
      return 99
    }
    $0 == target {
      found=1
      target_level=heading_level($0)
      next
    }
    found && /^#+[[:space:]]/ {
      current_level=heading_level($0)
      if (current_level <= target_level) exit
    }
    found {
      content=$0
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", content)
      if (content != "") body=1
    }
    END {
      if (!found || !body) exit 1
    }
  ' "$document"
}

validate_document_structure() {
  local template="$1"
  local document="$2"
  local heading=""

  if [[ ! -f "$document" ]]; then
    error "缺失文档：$document"
    return
  fi

  if [[ ! -s "$document" ]]; then
    error "文档为空：$document"
    return
  fi

  while IFS= read -r heading; do
    if ! grep -F -x -- "$heading" "$document" >/dev/null 2>&1; then
      error "缺失必填标题：$(basename "$document") :: $heading"
      continue
    fi

    if ! section_has_body "$document" "$heading"; then
      error "空章节：$(basename "$document") :: $heading"
    fi
  done < <(grep -E '^#{1,2}[[:space:]]' "$template")
}

DOCUMENT_NAMES="
project-overview.md
module-analysis.md
onboarding-guide.md
api-and-data-flow.md
business-flow-summary.md
"

while IFS= read -r document_name; do
  [[ -z "$document_name" ]] && continue
  template="$TEMPLATES_DIR/$document_name"
  document="$DOCS_ROOT/$document_name"

  if [[ ! -f "$template" ]]; then
    error "完成检查模板缺失：$template"
    continue
  fi

  validate_document_structure "$template" "$document"
done <<EOF
$DOCUMENT_NAMES
EOF

INVENTORY="$DOCS_ROOT/_analysis/repo-inventory.md"
MODULE_COUNT=""

if [[ ! -f "$INVENTORY" || ! -s "$INVENTORY" ]]; then
  error "缺失或空 inventory：$INVENTORY"
else
  MODULE_COUNT="$(
    sed -n 's/^Module-Candidates-Emitted:[[:space:]]*\([0-9][0-9]*\)[[:space:]]*$/\1/p' \
      "$INVENTORY" | head -n 1
  )"
  if [[ -z "$MODULE_COUNT" ]]; then
    error "inventory 缺少有效的 Module-Candidates-Emitted: N"
  fi
fi

MODULE_DOC="$DOCS_ROOT/module-analysis.md"
if [[ -f "$MODULE_DOC" && -s "$MODULE_DOC" && -n "$MODULE_COUNT" ]]; then
  if ! awk -v minimum="$MODULE_COUNT" '
    function trim(value) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      return value
    }
    function parse_row(line, cells, count, i) {
      count=split(line, raw, "|")
      parsed=0
      for (i=1; i<=count; i++) {
        value=trim(raw[i])
        if (i == 1 && value == "") continue
        if (i == count && value == "") continue
        parsed++
        cells[parsed]=value
      }
      return parsed
    }
    function separator_row(line, value) {
      value=line
      gsub(/[|:[:space:]-]/, "", value)
      return value == ""
    }
    $0 == "## 业务模块覆盖矩阵" {
      in_matrix=1
      next
    }
    in_matrix && /^#{1,2}[[:space:]]/ {
      in_matrix=0
    }
    !in_matrix || $0 !~ /^[[:space:]]*\|/ {
      next
    }
    {
      delete cells
      count=parse_row($0, cells)
      if (!header_found) {
        for (i=1; i<=count; i++) {
          if (cells[i] == "覆盖状态") status_column=i
          if (cells[i] == "证据来源") evidence_column=i
        }
        if (status_column && evidence_column) header_found=1
        next
      }
      if (separator_row($0)) next

      rows++
      status=trim(cells[status_column])
      evidence=trim(cells[evidence_column])
      if (status == "未分析") {
        print "覆盖矩阵第 " rows " 行状态仍为精确占位值 未分析" > "/dev/stderr"
        failed=1
      }
      if (evidence == "") {
        print "覆盖矩阵第 " rows " 行证据来源为空" > "/dev/stderr"
        failed=1
      }
    }
    END {
      if (!header_found) {
        print "业务模块覆盖矩阵缺少覆盖状态或证据来源列" > "/dev/stderr"
        failed=1
      }
      if (rows < 1) {
        print "业务模块覆盖矩阵没有数据行" > "/dev/stderr"
        failed=1
      }
      if (rows < minimum) {
        print "业务模块覆盖矩阵数据行数 " rows " 少于 inventory 模块候选数 " minimum > "/dev/stderr"
        failed=1
      }
      exit failed ? 1 : 0
    }
  ' "$MODULE_DOC"; then
    FAILURES=$((FAILURES + 1))
  fi

  if ! awk '
    function trim(value) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      return value
    }
    function parse_row(line, cells, count, i) {
      count=split(line, raw, "|")
      parsed=0
      for (i=1; i<=count; i++) {
        value=trim(raw[i])
        if (i == 1 && value == "") continue
        if (i == count && value == "") continue
        parsed++
        cells[parsed]=value
      }
      return parsed
    }
    function separator_row(line, value) {
      value=line
      gsub(/[|:[:space:]-]/, "", value)
      return value == ""
    }
    FNR == NR {
      if ($0 == "## 覆盖度自检") {
        in_template=1
        next
      }
      if (in_template && /^#{1,2}[[:space:]]/) in_template=0
      if (!in_template || $0 !~ /^[[:space:]]*\|/) next

      delete cells
      count=parse_row($0, cells)
      if (cells[1] == "检查项") {
        template_header=1
        next
      }
      if (!template_header || separator_row($0)) next
      if (cells[1] != "") expected[cells[1]]=1
      next
    }
    {
      if ($0 == "## 覆盖度自检") {
        in_target=1
        next
      }
      if (in_target && /^#{1,2}[[:space:]]/) in_target=0
      if (!in_target || $0 !~ /^[[:space:]]*\|/) next

      delete cells
      count=parse_row($0, cells)
      if (!target_header) {
        for (i=1; i<=count; i++) {
          if (cells[i] == "检查项") item_column=i
          if (cells[i] == "结果") result_column=i
          if (cells[i] == "说明") explanation_column=i
        }
        if (item_column && result_column && explanation_column) target_header=1
        next
      }
      if (separator_row($0)) next

      item=trim(cells[item_column])
      result=trim(cells[result_column])
      explanation=trim(cells[explanation_column])
      if (item == "") next
      seen[item]=1

      if (result == "") {
        print "覆盖度自检结果为空：" item > "/dev/stderr"
        failed=1
      }
      if (result == "是" || result == "部分" || result == "否" \
          || result == "是/部分/否" || result == "是/否") {
        print "覆盖度自检仍使用精确占位值：" item " -> " result > "/dev/stderr"
        failed=1
      }
      if (explanation == "") {
        print "覆盖度自检说明为空：" item > "/dev/stderr"
        failed=1
      }
    }
    END {
      if (!target_header) {
        print "覆盖度自检缺少检查项、结果或说明列" > "/dev/stderr"
        failed=1
      }
      for (item in expected) {
        if (!seen[item]) {
          print "覆盖度自检缺少模板检查项：" item > "/dev/stderr"
          failed=1
        }
      }
      exit failed ? 1 : 0
    }
  ' "$TEMPLATES_DIR/module-analysis.md" "$MODULE_DOC"; then
    FAILURES=$((FAILURES + 1))
  fi
fi

CHECKLIST="$DOCS_ROOT/_analysis/coverage-checklist.md"
if [[ ! -f "$CHECKLIST" || ! -s "$CHECKLIST" ]]; then
  error "缺失或空 coverage checklist：$CHECKLIST"
elif ! grep -E -x '[[:space:]]*Completion: complete[[:space:]]*' \
  "$CHECKLIST" >/dev/null 2>&1; then
  error "coverage checklist 缺少独占一行的 Completion: complete"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  printf '[validate-doc-completion] incomplete: %s check group(s) failed\n' \
    "$FAILURES" >&2
  exit 1
fi

printf '[validate-doc-completion] complete: %s\n' "$DOCS_ROOT"
