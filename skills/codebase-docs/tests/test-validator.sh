#!/usr/bin/env bash

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

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

# 证明必需文档集合由 templates/documents/ 数据化推导：往隔离的临时 skill root
# 加一份第七份普通模板，validator 应自动把它纳入必需集合。全程不动工作区 tracked
# 文件，避免异常退出留下脏文件。

test_data_driven_doc_set() {
  local skill_root="$TMP_ROOT/dd-skill"
  local docs_root="$TMP_ROOT/dd-docs"
  local output="$TMP_ROOT/dd.stdout"
  local errors="$TMP_ROOT/dd.stderr"
  local validator="$skill_root/scripts/validate-doc-completion.sh"

  mkdir -p "$skill_root/scripts" "$skill_root/templates/documents"
  cp "$SKILL_ROOT/scripts/validate-doc-completion.sh" "$skill_root/scripts/"
  cp "$SKILL_ROOT"/templates/documents/*.md "$skill_root/templates/documents/"

  # 未加第七份时，含全部现有文档的 docs-root 通过
  make_valid_docs "$docs_root"
  run_expect_success "$output" "$errors" bash "$validator" --docs-root "$docs_root"

  # 加一份普通 H1/H2 模板后，docs-root 仍缺它 -> 失败，证明枚举生效
  cat >"$skill_root/templates/documents/extra-doc.md" <<'EOF'
# Extra Doc

## 概述

占位说明。
EOF
  run_expect_failure "$output" "$errors" bash "$validator" --docs-root "$docs_root"
  assert_contains "$errors" "extra-doc.md"

  pass "data-driven document set"
}

test_validator
test_data_driven_doc_set
