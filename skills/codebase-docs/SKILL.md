---
name: codebase-docs
description: Explore existing codebases read-only and generate onboarding documentation — project overview, module analysis, onboarding guide, API/data-flow, business-flow summary, and an architecture/call-graph doc with Mermaid diagrams — without modifying any source files. Handles both a single repository and a batch of repositories (clone, per-repo session, optional PR publish). Use this whenever the user wants to understand, document, map, or onboard onto one or more repos, e.g. "帮我看懂这个项目", "这个代码库是怎么组织的", "generate docs for this repo", "write an architecture overview", "onboarding guide for new devs", "给这几个仓库批量生成文档", "document all our microservices", or "resume the codebase doc batch". Trigger even when the user never says the word "documentation" but clearly needs a structured explanation of how a codebase works.
---

# Codebase Docs Skill

Generate onboarding-oriented documentation for existing codebases by reading them
read-only and writing Markdown into a documentation output directory. This skill
covers one repository or many; it never modifies source files.

## Mode Selection

Pick the mode from the input, then follow the matching reference:

- **Single mode** — the user points at one repository (a path, the current
  working directory, or a single Git URL). Follow `references/single-repo.md`:
  run the inventory, read high-signal files, and produce the document set.
- **Batch mode** — the user gives several repo URLs or a repos file plus a docs
  root. Follow `references/batch.md`: run `scripts/batch-generate-docs.sh` to
  clone/update repos and build `batch-report.md`, then process exactly one
  `cloned` repository per session using the single-mode workflow.

Both modes share one scripts/ directory, one validator, and one document set, so
there is no cross-skill path dependency.

## Write Boundary

The boundary differs for the two kinds of actor; **source repositories are
read-only for both**.

**Agent (documentation writing).** Create or update **only Markdown files under
the selected documentation output directory** (default `docs/`; honor an explicit
output directory when given). Do not modify source, configuration, package, lock,
build, test, generated, vendor, or asset files in any repository, and do not
reformat anything. Do not add code comments, refactor, rename, introduce
dependencies, run migrations, or invent business meaning when the code is
unclear. The point is a result a maintainer can review as pure documentation,
with every claim traceable to evidence.

**Deterministic scripts (batch/publish only).** These are not documentation
writes and are exempt from the Markdown-only rule, but still never touch source
repositories:

- `batch-generate-docs.sh` may clone/update repositories into `<repos-root>/`,
  scaffold `<docs-root>/<repo>/_analysis/coverage-checklist.md`, and write
  `<docs-root>/batch-report.md` and `<docs-root>/.batch-generate-docs.lock`.
- `publish-docs.sh` (opt-in, step 8) may create a branch, commit, and — only with
  `--yes` after a human reviews the plan — push and open a PR, **all inside the
  docs-root Git repository**, plus `<docs-root>/.publish-docs.lock`. It never runs
  Git write operations inside any cloned source repository.

## 8-Step Loop

This skill is the body of an 8-step loop. Deterministic steps are owned by
scripts; reasoning steps by the Agent. Source repositories are read-only at every
step.

| Step                         | What                                                      | Owner                    |
| ---------------------------- | --------------------------------------------------------- | ------------------------ |
| 1. clone repo                | clone/update into repos-root (batch only)                 | `batch-generate-docs.sh` |
| 2. explore structure         | `repo-inventory.sh` + high-signal reads                   | script + Agent           |
| 3. identify tech stack       | from inventory + manifests                                | Agent                    |
| 4. module docs               | overview / module / onboarding / api-data-flow / business | Agent                    |
| 5. architecture & call graph | `architecture.md` with required Mermaid                   | Agent                    |
| 6. verify coverage           | `validate-doc-completion.sh` (deterministic grader)       | script                   |
| 7. supplement if failing     | route failures back, fix, re-validate (bounded)           | Agent                    |
| 8. commit / PR (opt-in)      | `scripts/publish-docs.sh`                                 | script + human gate      |

Steps 6 and 7 form the inner verify→supplement loop: keep
`Completion: incomplete` until the validator passes, fixing only the reported
gaps each round instead of rewriting everything. Step 8 runs only when the user
opts into publishing and never touches source repositories.

## Document Set

A complete single-repository delivery is the document set under
`templates/documents/` plus two analysis files:

```text
project-overview.md
module-analysis.md
onboarding-guide.md
api-and-data-flow.md
business-flow-summary.md
architecture.md
_analysis/repo-inventory.md
_analysis/coverage-checklist.md
```

`templates/documents/` is the single source of truth for which documents are
required; `validate-doc-completion.sh` enumerates that directory rather than a
hardcoded list. `api-and-data-flow.md` and `business-flow-summary.md` are always
generated — when something genuinely does not apply, write `不适用` with
reasoning and evidence paths rather than omitting the file, because a reviewer
cannot distinguish "absent because irrelevant" from "absent because skipped".

What goes inside each document, plus the contract sections
(`# 新同事上手指南`, `## 业务模块覆盖矩阵`, `## Gotcha 清单`, `## 覆盖度自检`),
is defined in `references/single-repo.md`. Read it before writing.

## Budget-Aware Execution and Session Boundary

Assume an operating budget of about 130k context tokens and about 200 model
requests per 30 minutes. These are operator/runtime limits, not values the Agent
can measure precisely. One assistant turn is approximately one model request;
multiple independent tool calls in the same turn do not add requests, so batch
independent reads and searches when the environment supports parallel calls.

The deterministic Shell inventory can run for a long time. The Agent boundary is
different: **one invocation/session may deeply explore only one repository.**
Even if the current repository finishes early, do not begin a second repository
in the same session.

Context pressure is the highest-priority stop signal. When the platform reports
context pressure or compaction, or continued reading would crowd out document
generation: stop expanding exploration, update
`_analysis/coverage-checklist.md` (especially `进行中模块` and the next-file
queue), write confirmed conclusions into the existing documents, keep
`Completion: incomplete`, and end the session.
Shell cannot snapshot model reasoning and does not automatically wake an Agent;
a later invocation resumes from the checklist. Never fabricate conclusions to
reach `complete`.

## Completion Contract

Completion requires every document under `templates/documents/`, all template
H1/H2 sections with non-empty content, a populated coverage matrix, the coverage
self-check, the inventory module-count proxy, evidence paths, and
`Completion: complete` in `_analysis/coverage-checklist.md`. Then run:

```bash
./scripts/validate-doc-completion.sh --docs-root <文档输出目录>
```

If validation fails, restore `Completion: incomplete`, fix the reported
structural gaps, and retry. The validator only checks mechanically observable
structure; whether evidence is true and an `不适用` conclusion is credible
remains the Agent's responsibility. Template headings, matrix/self-check section
titles, their column names, and self-check item labels are validation contract —
changing any of them breaks previously generated documents.

## Publishing (Opt-In, Step 8)

Generating documents never commits or pushes. Publishing is a separate, opt-in
step handled by `scripts/publish-docs.sh`, which acts only on repositories whose
docs already pass the validator, commits each repo's docs into the **docs-root**
Git repository on a publish branch, and then stops. Pushing the branch and
opening the pull request happen only when it is re-run with `--yes`, after a
human reviews the printed plan. The script never touches source repositories.
See `references/batch.md` for details.

## First Response When Activated

Start with: “I will inspect the repository in read-only mode first. I will only
create or update Markdown files under the selected documentation output
directory, and I will not modify source files.” Then select the mode and follow
the matching reference.
