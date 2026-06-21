---
name: codebase-explorer-docs
description: Explore an existing codebase read-only and generate onboarding documentation for a single repository — project overview, module analysis, onboarding guide, API/data-flow, business-flow summary, and an architecture/call-graph doc with Mermaid diagrams — without modifying any source files. Use this whenever the user wants to understand, document, map, or onboard onto one repo, e.g. "帮我看懂这个项目", "这个代码库是怎么组织的", "generate docs for this repo", "write an architecture overview", "onboarding guide for new devs", "analyze the business modules / data flow", or "整理一份新人上手文档". Trigger even when the user never says the word "documentation" but clearly needs a structured explanation of how a codebase works. For several repositories at once, use batch-codebase-doc-generator instead.
---

# Codebase Explorer Docs Skill

## Purpose

Use this skill when the user wants an agent to deeply explore an existing codebase and generate documentation that explains the project structure, technical architecture, business modules, data flow, code-reading path, and maintenance gotchas.

This skill is documentation-only.

It must not modify source files, add inline comments, refactor code, change business logic, rename anything, introduce dependencies, or reformat files.

## Core Goal

Help new developers quickly understand a repository by generating clear Markdown documentation based on code exploration.

The final output should explain:

1. What this project does.
2. How the repository is organized.
3. What the main business modules are.
4. How pages, routes, APIs, state, backend services, persistence, and data flow are connected.
5. How a new developer should read the code.
6. Where to start when modifying common requirements.
7. Which areas are risky, legacy, unclear, or require business confirmation.
8. Which business modules and gotchas are covered, partially covered, or not confirmed.

## Documentation Output Directory

Default output directory:

```text
docs/
```

If the user provides an explicit documentation output directory, write all generated Markdown documentation into that directory instead of the repository-local `docs/` directory.

Examples:

```text
docs/
../codebase-docs/repo-a/
/absolute/path/to/codebase-docs/repo-a/
```

When an external output directory is provided:

1. Treat the source repository as read-only.
2. Do not create or update `docs/` inside the source repository unless the user explicitly asks.
3. Write all final and intermediate Markdown files under the provided output directory.
4. Preserve evidence paths relative to the source repository where possible.

## Strict Write Boundary

Allowed to create or update only Markdown files under the selected documentation output directory.

Do not modify:

1. source files
2. configuration files
3. package files
4. lockfiles
5. build scripts
6. test files
7. generated files
8. vendor files
9. assets
10. formatting-only changes

If the output directory does not exist, create it.

If documentation already exists, update only the relevant Markdown files and preserve useful existing content.

## Non-Goals

Do not do the following unless the user explicitly asks:

1. Do not add comments to source code.
2. Do not refactor code.
3. Do not optimize code.
4. Do not fix bugs.
5. Do not rename files, functions, classes, variables, APIs, routes, state fields, DTOs, or database fields.
6. Do not introduce new dependencies.
7. Do not change lockfiles.
8. Do not reformat unrelated files.
9. Do not run migrations.
10. Do not invent business meaning when the code is unclear.

## Operating Principles

Follow these principles throughout the task:

1. Read before writing.
2. Treat the codebase as read-only.
3. Generate documentation from evidence found in the repository.
4. Separate confirmed facts from inferred conclusions.
5. Mark uncertain business meaning with `TODO: 需要业务确认`.
6. Prefer structured Markdown documentation over long, scattered notes.
7. Avoid vague summaries. Every module explanation should point to concrete paths and files.
8. Keep the final diff limited to the selected documentation output directory.
9. Do not over-document trivial files.
10. Focus on onboarding value for new developers.
11. Do not claim full coverage unless the coverage matrix supports that claim.

## 8-Step Loop Overview

This skill is the per-repository body of an 8-step loop. Deterministic steps are
owned by scripts; reasoning steps are owned by the Agent. Source repositories are
read-only at every step.

| Step                         | What                                                           | Owner                    |
| ---------------------------- | -------------------------------------------------------------- | ------------------------ |
| 1. clone repo                | clone/update into repos-root                                   | `batch-generate-docs.sh` |
| 2. explore structure         | `repo-inventory.sh` + high-signal reads                        | script + Agent           |
| 3. identify tech stack       | from inventory + manifests                                     | Agent                    |
| 4. module docs               | overview / module / onboarding / api-data-flow / business docs | Agent                    |
| 5. architecture & call graph | `architecture.md` with required Mermaid                        | Agent                    |
| 6. verify coverage           | `validate-doc-completion.sh` (deterministic grader)            | script                   |
| 7. supplement if failing     | route failures back, fix, re-validate (bounded)                | Agent                    |
| 8. commit / PR (opt-in)      | `../batch-codebase-doc-generator/scripts/publish-docs.sh`      | script + human gate      |

Steps 6 and 7 form the inner verify→supplement loop: keep
`Completion: incomplete` until the validator passes, fixing only the reported
gaps each round instead of rewriting everything. Step 8 runs only when the user
opts into publishing and never touches source repositories.

## Required Workflow

### Phase 1: Repository Exploration

Before reading source files one by one, run the deterministic inventory script:

```bash
./scripts/repo-inventory.sh \
  --root <source-repository> \
  --out <文档输出目录>/_analysis/repo-inventory.md
```

Read `_analysis/repo-inventory.md` once and use it as the exploration map.
Only deep-read high-signal files selected from the inventory and later evidence.
The script may run longer than 30 minutes; it has no model-budget timeout and
must not modify source files.

Identify:

1. Technology stack:
   - frontend framework
   - backend framework
   - build tools
   - routing solution
   - state management solution
   - API request layer
   - persistence layer
   - test tools
   - lint/typecheck tools

2. Repository structure:
   - top-level directories
   - important second-level directories
   - application entry files
   - route definitions
   - page/module locations
   - shared components
   - API/service layers
   - backend controllers/services/repositories, if any
   - configuration files

3. Runtime commands:
   - install command, if obvious
   - dev/start command
   - build command
   - test command
   - lint command
   - typecheck command

4. Core business modules:
   - module name
   - path
   - responsibility
   - key files
   - major dependencies
   - related APIs or backend services
   - business risk level

5. Data flow:
   - how user interactions enter the system
   - how routes map to pages or controllers
   - how APIs are called
   - how data is transformed
   - how state is stored or passed
   - how errors are handled
   - how authentication and authorization work

Do not modify any source file during Phase 1.

### Phase 2: Documentation Plan

After exploration, produce a documentation plan before writing files.

The plan must include:

1. Documentation files to create or update.
2. Purpose of each document.
3. Main sections of each document.
4. Key modules to analyze.
5. Unclear areas that require deeper reading.
6. Files/directories that must not be modified.
7. The selected documentation output directory.

The plan must explicitly confirm:

```text
Only Markdown documents under the selected documentation output directory will be created or updated.
No source files will be modified.
```

### Phase 3: Generate Documentation

Create the output directory if it does not exist, then generate or update these
six documents. Read `references/document-spec.md` before writing — it defines the
required sections and content for each file, plus the exact contract headings for
the onboarding section, coverage matrix, and gotcha inventory.

| File                       | Purpose                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `project-overview.md`      | Project intro, tech stack, structure, entry files, commands, modules, reading order |
| `module-analysis.md`       | Per-module breakdown + `## 业务模块覆盖矩阵`                                        |
| `onboarding-guide.md`      | `# 新同事上手指南`: setup, reading path, where-to-start, debug path                 |
| `api-and-data-flow.md`     | API wrapper, call chains, state, auth, error handling, DTO mapping                  |
| `business-flow-summary.md` | Domains, user journeys, states, `## Gotcha 清单`                                    |
| `architecture.md`          | Runtime + module-dependency Mermaid diagrams with `%% Evidence:`                    |

`api-and-data-flow.md` and `business-flow-summary.md` are always generated; when
something genuinely does not apply, write `不适用` with reasoning and evidence
paths rather than omitting the file — a reviewer cannot distinguish "absent
because irrelevant" from "absent because skipped".

`architecture.md` must contain at least two Mermaid code blocks and at least two
`%% Evidence:` declarations; `validate-doc-completion.sh` enforces this.

## Contract Sections

Three sections are checked by `validate-doc-completion.sh` and must use these
exact headings. `references/document-spec.md` carries the full content
requirements for each.

- `# 新同事上手指南` in `onboarding-guide.md` — what to know first, how to run the
  project, a concrete reading path, where to start for common changes (new page,
  new/changed API, state, auth), and a debug path from page → route → component →
  API → backend.
- `## 业务模块覆盖矩阵` in `module-analysis.md` — one row per discovered module
  with columns 模块 / 路径 / 入口文件 / 主要职责 / 相关 API/Service / 关键数据流 /
  Gotcha / 覆盖状态 / 证据来源. `覆盖状态` ∈ {已覆盖, 部分覆盖, 未确认, 未分析,
  疑似非业务模块}. The matrix exists to keep coverage honest: do not claim `已覆盖`
  without tracing concrete files, and every row needs evidence paths.
- `## Gotcha 清单` in `business-flow-summary.md` or `module-analysis.md` — the
  non-obvious behaviors, hidden dependencies, environment requirements, and risky
  maintenance points that bite new developers, each with evidence and a
  confidence level.

## Evidence and Uncertainty Handling

Documentation should distinguish between:

1. Confirmed from code.
2. Inferred from naming or call chain.
3. Unclear and requiring business confirmation.

Use labels where appropriate:

```markdown
- Confirmed:
- Inferred:
- TODO: 需要业务确认:
```

Do not invent business meaning.

If the code suggests multiple possible meanings, document the ambiguity instead of choosing one arbitrarily.

## Budget-Aware Execution Mode

Assume an operating budget of about 130k context tokens and about 200 model
requests per 30 minutes. These are operator/runtime limits, not values the Agent
can measure precisely. One assistant turn is approximately one model request;
multiple independent tool calls issued in the same turn do not add model
requests, so batch independent reads and searches when the tool environment
supports parallel calls.

The Shell inventory can run for a long time. The Agent boundary is different:
one invocation/session may deeply explore only one repository. Even if the
current repository finishes early, do not begin a second repository in the same
session.

All six final documents are mandatory:

```text
project-overview.md
module-analysis.md
onboarding-guide.md
api-and-data-flow.md
business-flow-summary.md
architecture.md
```

Budget pressure may leave drafts incomplete, but it never reduces the completion
contract to a subset of documents.

### Intermediate Analysis Files

To avoid losing context, create intermediate analysis notes under:

```text
_analysis/
```

Allowed intermediate files:

```text
_analysis/repo-inventory.md
_analysis/module-discovery.md
_analysis/route-map.md
_analysis/api-map.md
_analysis/state-map.md
_analysis/gotcha-candidates.md
_analysis/coverage-checklist.md
```

These files should record evidence, paths, and unresolved questions.

### Incremental Workflow

1. Safety boundary check.
2. Run `repo-inventory.sh` and read the compact inventory.
3. Build a high-signal queue in this priority order: entry files, routes,
   manifests/configuration, API/service, top-level business modules.
4. Read no more than 5 to 10 independent or closely related files per round;
   issue independent reads/searches in parallel within one assistant turn.
5. After every stable evidence group, immediately update `_analysis` notes and
   `_analysis/coverage-checklist.md`.
6. Assemble or update all six documents.
7. Run the coverage self-check and completion validator.

`_analysis/coverage-checklist.md` is the resume anchor. It must contain:

```text
Completion: incomplete

## 已分析模块
## 进行中模块
## 部分覆盖、未确认和未分析模块
## 下一批 high-signal 文件
## 待业务确认
## 文档状态
```

For `进行中模块`, record the current module, files already read, unresolved
questions, and the next files to inspect. Shell cannot snapshot model reasoning
and does not automatically wake or restore an Agent. A later operator/runtime
invocation resumes by reading this checklist and continuing the in-progress
module.

### Context Checkpoint

Context pressure is the highest-priority observable stop signal. When the
platform reports context pressure or compaction, or continued reading would
crowd out document generation:

1. Stop expanding exploration.
2. Update the checklist, especially `进行中模块` and the next-file queue.
3. Write confirmed conclusions and coverage status into the existing documents.
4. Keep `Completion: incomplete`.
5. End the current single-repository session.

Never fabricate missing conclusions to reach `complete`. The next session should
resume the unfinished repository before selecting a new one.

## Required Coverage Self-Check

Generate a section named:

```markdown
## 覆盖度自检
```

Include:

```markdown
| 检查项                     | 结果       | 说明 |
| -------------------------- | ---------- | ---- |
| 路由模块是否覆盖           | 是/部分/否 |      |
| 页面模块是否覆盖           | 是/部分/否 |      |
| API/service 是否覆盖       | 是/部分/否 |      |
| 登录/鉴权/权限是否覆盖     | 是/部分/否 |      |
| 状态管理是否覆盖           | 是/部分/否 |      |
| 错误处理是否覆盖           | 是/部分/否 |      |
| 构建/启动 gotcha 是否覆盖  | 是/部分/否 |      |
| 核心业务流程是否覆盖       | 是/部分/否 |      |
| 未确认模块是否列出         | 是/否      |      |
| 需要业务确认的问题是否列出 | 是/否      |      |
```

Important:

Do not write “all modules are covered” unless the coverage matrix supports that claim.

If coverage is incomplete, explicitly list:

1. modules not analyzed
2. files not inspected
3. business flows not confirmed
4. questions requiring human confirmation

## Completion Contract

Completion requires all six documents, every template H1/H2 section with
non-empty content, a populated coverage matrix, completed coverage self-check,
the inventory module-count proxy, evidence paths, and:

```text
Completion: complete
```

in `_analysis/coverage-checklist.md`.

Use one completion path:

1. Finish the six documents and perform the semantic self-check.
2. Change the checklist declaration to `Completion: complete`.
3. Run:

```bash
./scripts/validate-doc-completion.sh --docs-root <文档输出目录>
```

4. If validation fails, restore `Completion: incomplete`, fix the reported
   structural gaps, and retry.

The validator only checks mechanically observable structure. Evidence truth and
whether an `不适用` conclusion is credible remain the Agent's responsibility.
Template H1/H2 headings, the coverage-matrix and self-check section titles,
their column names, and the template self-check item labels are all validation
contract. Changing any of them is a breaking change for previously generated
documents.

## Publishing (Opt-In, Step 8)

Generating documents never commits or pushes anything. Publishing is a separate,
opt-in step handled by the Batch skill's deterministic script:

```bash
../batch-codebase-doc-generator/scripts/publish-docs.sh --docs-root <docs-root>
```

It only acts on repositories whose docs already pass
`validate-doc-completion.sh`, commits each repo's docs into the **docs-root** Git
repository on a publish branch, and then stops. Pushing the branch and opening
the pull request happen only when it is re-run with `--yes`, after a human has
reviewed the printed plan. The Agent still writes Markdown only; it never edits
source repositories, and the script never touches the cloned source repositories.

## Lightweight Verification and Diff Review

This task is documentation-only, so verification is about proving the source repo
is untouched and the docs pass the validator — not about running the project:

1. Run `validate-doc-completion.sh` before declaring completion.
2. Run `git status` and confirm no source files changed (both inventory and doc
   generation must leave source unchanged). If the docs live inside the source
   repo, `git diff -- <doc-output-dir>`; if outside, verify the files exist there
   and check the source repo's `git status`.

Skip expensive commands — full builds, the test suite, integration/e2e tests,
anything needing external services, and migrations — they cost budget without
adding onboarding value. A fast doc-lint command (`npm run lint:docs` and
friends) may be run if one exists; otherwise just note that none was found.

## Final Delivery Summary

At the end, provide a final summary with:

1. Documentation files added.
2. Documentation files updated.
3. Documentation output directory.
4. Purpose of each document.
5. Main modules analyzed.
6. Important business flows documented.
7. Areas that still require business confirmation.
8. Verification commands executed.
9. Confirmation that no source files were modified.
10. Suggested next review steps for the human maintainer.

## Acceptance Criteria

The final result must satisfy:

1. Only Markdown files under the selected documentation output directory are created or updated.
2. No source files are modified.
3. No dependencies are added.
4. No lockfiles are changed.
5. No business logic is changed.
6. Documentation explains:
   - project purpose
   - technology stack
   - repository structure
   - main modules
   - API/data flow
   - business flow
   - code-reading path
   - onboarding path
7. Unclear business assumptions are marked with `TODO: 需要业务确认`.
8. All six template documents exist; `不适用` sections include reasoning and evidence.
9. `validate-doc-completion.sh` succeeds.
10. Final result is documentation-only and easy to review.

## Suggested First Response When Activated

When this skill is activated, start with:

“I will inspect the repository in read-only mode first. I will only create or update Markdown files under the selected documentation output directory, and I will not modify source files.”

Then begin Phase 1.
