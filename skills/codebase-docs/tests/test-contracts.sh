#!/usr/bin/env bash

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

test_skill_contracts() {
  local skill="$SKILL_ROOT/SKILL.md"
  local single="$SKILL_ROOT/references/single-repo.md"
  local batch="$SKILL_ROOT/references/batch.md"

  # 单 skill 入口 + mode 分流
  assert_contains "$skill" "name: codebase-docs"
  assert_contains "$skill" "Single mode"
  assert_contains "$skill" "Batch mode"
  assert_contains "$skill" "references/single-repo.md"
  assert_contains "$skill" "references/batch.md"

  # 预算与会话边界（合并后保留的规范表述）
  assert_contains "$skill" "Budget-Aware Execution"
  assert_contains "$skill" "one invocation/session may deeply explore only one repository"
  assert_contains "$skill" "Shell cannot snapshot model reasoning"
  assert_contains "$skill" "business-flow-summary.md"
  assert_contains "$skill" "architecture.md"
  assert_not_contains "$skill" "Low Capability Model Mode"

  # 单仓契约小节在 references/single-repo.md
  assert_contains "$single" "# 新同事上手指南"
  assert_contains "$single" "## 业务模块覆盖矩阵"
  assert_contains "$single" "## Gotcha 清单"
  assert_contains "$single" "## 覆盖度自检"

  # 多仓契约在 references/batch.md
  assert_contains "$batch" "one Agent invocation/session = one deeply explored repository"
  assert_contains "$batch" "does not automatically wake"
  assert_contains "$batch" "done"
  assert_contains "$batch" "deferred"
  assert_contains "$batch" "publish-docs.sh"

  # 模板与启动语
  assert_contains "$SKILL_ROOT/templates/documents/architecture.md" "## 模块调用与依赖关系"
  assert_contains "$SKILL_ROOT/templates/coverage-checklist.md" "## 进行中模块"
  assert_contains "$SKILL_ROOT/scripts/batch-generate-docs.sh" "CHECKLIST_TEMPLATE"
  assert_contains "$SKILL_ROOT/START_PROMPT.md" "architecture.md"

  # D5：脚本同目录引用 validator，无跨 skill 路径依赖
  assert_not_contains "$SKILL_ROOT/scripts/batch-generate-docs.sh" "codebase-explorer-docs"
  assert_not_contains "$SKILL_ROOT/scripts/publish-docs.sh" "codebase-explorer-docs"

  pass "skill execution contracts"
}

test_skill_contracts
