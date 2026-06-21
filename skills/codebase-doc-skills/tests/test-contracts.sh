#!/usr/bin/env bash

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

test_skill_contracts() {
  assert_contains "$EXPLORER_ROOT/SKILL.md" "## Budget-Aware Execution Mode"
  assert_contains "$EXPLORER_ROOT/SKILL.md" "one invocation/session may deeply explore only one repository"
  assert_contains "$EXPLORER_ROOT/SKILL.md" "Shell cannot snapshot model reasoning"
  assert_contains "$EXPLORER_ROOT/SKILL.md" "business-flow-summary.md"
  assert_contains "$EXPLORER_ROOT/SKILL.md" "architecture.md"
  assert_contains "$EXPLORER_ROOT/templates/documents/architecture.md" "## 模块调用与依赖关系"
  assert_contains "$EXPLORER_ROOT/SKILL.md" "references/document-spec.md"
  assert_contains "$EXPLORER_ROOT/references/document-spec.md" "## 业务模块覆盖矩阵"
  assert_contains "$EXPLORER_ROOT/references/document-spec.md" "## Gotcha 清单"
  assert_contains "$BATCH_ROOT/templates/coverage-checklist.md" "## 进行中模块"
  assert_contains "$BATCH_ROOT/scripts/batch-generate-docs.sh" "CHECKLIST_TEMPLATE"
  assert_contains "$BATCH_ROOT/SKILL.md" "publish-docs.sh"
  assert_contains "$BATCH_ROOT/START_PROMPT.md" "architecture.md"
  assert_contains "$BATCH_ROOT/templates/single-repo-prompt.md" "architecture.md"
  assert_contains "$BATCH_ROOT/SKILL.md" "one Agent invocation/session = one deeply explored repository"
  assert_contains "$BATCH_ROOT/SKILL.md" "does not automatically wake"
  assert_contains "$BATCH_ROOT/SKILL.md" "done"
  assert_contains "$BATCH_ROOT/SKILL.md" "deferred"
  assert_not_contains "$EXPLORER_ROOT/SKILL.md" "Low Capability Model Mode"
  pass "skill execution contracts"
}

test_skill_contracts
