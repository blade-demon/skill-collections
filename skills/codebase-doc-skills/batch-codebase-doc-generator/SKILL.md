---
name: batch-codebase-doc-generator
description: Orchestrate codebase documentation across multiple Git repositories — clone/update each repo, derive completion state, seed resume files, build an atomic batch report, then document one repository per Agent session via codebase-explorer-docs, with an opt-in step to publish the docs via pull request. Use this whenever the user supplies several repo URLs or a repos list and wants docs generated for each, e.g. "给这几个仓库批量生成文档", "document all our microservices", "batch onboarding docs for these repos", "为这批 git 地址生成代码库文档", or "resume the codebase doc batch". For a single repository, use codebase-explorer-docs instead.
---

# Batch Codebase Doc Generator Skill

## Purpose

Use this skill when the user provides multiple Git repository URLs and wants
independent codebase exploration documents for each repository.

This skill has three stages; the third is opt-in:

1. Deterministic Shell preparation: validate input, clone/update repositories,
   derive completion state, seed resume files, and build `batch-report.md`.
2. Agent documentation: select exactly one `cloned` repository for the current
   invocation/session and follow `codebase-explorer-docs`.
3. Opt-in publish: after a repository is `done`, `publish-docs.sh` commits its
   docs into the docs-root Git repository and opens a pull request behind a
   human-review gate. This stage runs only when the user asks to publish.

Together these implement an 8-step loop: clone → explore structure → identify
tech stack → module docs → architecture & call graph → verify coverage →
supplement until the validator passes → commit/PR (opt-in). Source repositories
stay read-only throughout.

Do not perform cross-repository architecture or business analysis unless the
user explicitly requests it.

## Inputs and Naming

Required:

1. Git repository specs, from `--repos <file>` or repeated `--repo <spec>`.
2. A documentation root passed through `--docs-root`.

Optional branch syntax:

```text
https://github.com/org/a.git#main
git@github.com:org/b.git#develop
```

Derive names from the final URL/path segment, remove `.git`, and resolve
duplicates deterministically:

```text
a
a-2
a-3
```

Repositories are independent by default. Do not infer relationships from names.

## Write Boundaries

The script may create or update:

```text
<repos-root>/<repo-name>/
<docs-root>/<repo-name>/
<docs-root>/batch-report.md
<docs-root>/.batch-generate-docs.lock
```

The Agent may create or update Markdown only under:

```text
<docs-root>/<repo-name>/
```

Treat every cloned source repository as read-only for documentation work. Do not
modify source, configuration, package, lock, build, test, asset, generated, or
vendor files.

The opt-in publish script `publish-docs.sh` additionally creates a Git branch,
commits, and (only with `--yes`) pushes and opens a pull request — but **only
inside the docs-root repository**:

```text
<docs-root>/.publish-docs.lock
<docs-root>/<repo-name>/   (staged and committed)
```

It never runs Git write operations inside any cloned source repository.

## Deterministic Orchestration Script

Use:

```bash
./scripts/batch-generate-docs.sh \
  --repos repos.txt \
  --docs-root codebase-docs \
  --repos-root _repos \
  --max-repos 1
```

Options:

```text
--repo <git-url>      repeatable repository spec
--repos <file>        one repository spec per line
--docs-root <folder>  required documentation root
--repos-root <folder> clone root, default _repos
--max-repos <N>       activate at most N unfinished repositories
--fail-fast           stop later clone/update work after one failure
```

There is no `--dry-run`. Before any directory creation, report write, or Git
operation, the script performs static validation and prints this plan to stderr:

```text
Input Spec | Repo Name | Branch | Source Path | Docs Path
```

Review that output when names or target paths matter.

The script invokes no LLM, Agent CLI, `node`, or `jq`. It may run longer than 30
minutes and has no model-budget timeout. Clone/fetch progress is deterministic
Shell work and does not consume model requests.

## Script State Model

For each deduplicated repository, state selection is:

1. `done`: all six documents and completion checks pass. Skip clone, fetch,
   checkout, and scaffold. This state does not consume `--max-repos`.
2. `deferred`: documentation is incomplete and the activation limit is already
   reached. Do not clone or create that repository's document directory.
3. `cloned`: documentation is incomplete, quota is available, and clone/update
   plus checklist scaffold succeed.
4. `failed`: clone, checkout, or scaffold fails.

`failed` is not persistent. The next run retries it and consumes activation
quota again. Every repository that enters clone/update consumes one activation
slot whether it becomes `cloned` or `failed`; `--max-repos` bounds preparation
attempts, not successful clones. This prevents invalid URLs or authentication
failures from causing unbounded Git attempts. `done` is always re-derived from
current documents; the script does not parse an old report or maintain a state
database.

The report is a complete snapshot of all current inputs and uses only:

```text
done
cloned
deferred
failed
```

Do not manually change rows to `success` or `partial`. The next script run will
derive `done` through the completion validator.

## Completion Contract

`done` requires:

```text
<docs-root>/<repo-name>/project-overview.md
<docs-root>/<repo-name>/module-analysis.md
<docs-root>/<repo-name>/onboarding-guide.md
<docs-root>/<repo-name>/api-and-data-flow.md
<docs-root>/<repo-name>/business-flow-summary.md
<docs-root>/<repo-name>/architecture.md
<docs-root>/<repo-name>/_analysis/repo-inventory.md
<docs-root>/<repo-name>/_analysis/coverage-checklist.md
```

The six documents must retain all template H1/H2 sections with non-empty
content. The coverage-matrix/self-check section titles, column names, and
self-check item labels are also exact validation contract. The module coverage
matrix, evidence column, inventory candidate-count proxy, coverage self-check,
and standalone `Completion: complete` declaration must pass:

```bash
../codebase-explorer-docs/scripts/validate-doc-completion.sh \
  --docs-root <docs-root>/<repo-name>
```

Documents that are not applicable still exist and explain `不适用`, the reason,
and evidence paths. Three documents are not a complete result.

## Resume Scaffold

For each newly `cloned` repository, the script creates this file only when it
does not already exist:

```text
<docs-root>/<repo-name>/_analysis/coverage-checklist.md
```

Initial structure:

```markdown
# Coverage Checklist

Completion: incomplete

## 已分析模块

## 进行中模块

## 部分覆盖、未确认和未分析模块

## 下一批 high-signal 文件

## 待业务确认

## 文档状态
```

Never overwrite an existing checklist. It is the Agent resume anchor.

## Agent Budget and Session Boundary

The operating reference is about 130k context tokens and about 200 model
requests per 30 minutes. The Agent cannot reliably observe exact wall time or
request count, so these are operator/runtime budgets, not self-measured timers.

The normative boundary is:

```text
one Agent invocation/session = one deeply explored repository
```

After the script finishes:

1. Read `batch-report.md`.
2. Select one `cloned` repository only.
3. Follow `codebase-explorer-docs` Budget-Aware Execution Mode.
4. Run that repository's `repo-inventory.sh` first.
5. Write all analysis and documents to its Docs Path.
6. Do not start a second repository in the same session, even if the first
   repository finishes early.

Use `--max-repos 1` when preparation is immediately followed by analysis. A
larger value or no limit is acceptable for long-running clone prewarming, but it
does not permit one Agent session to deeply analyze multiple repositories.

## Context Checkpoint and Continuation

When context pressure or compaction is observed:

1. Stop expanding source exploration.
2. Update the current repository's checklist, especially `进行中模块`, files
   already read, unresolved points, and the next high-signal files.
3. Write confirmed findings into the existing six documents.
4. Keep `Completion: incomplete`.
5. End the current session.

Shell cannot snapshot active model reasoning and does not automatically wake an
Agent. A later operator/runtime invocation reads the checklist and resumes the
same unfinished repository from `进行中模块`. Do not skip to a new repository or
restart analysis from zero.

Large batches are expected to complete across multiple invocations. A single
session not finishing the batch is not a failure.

## Long-Running and Concurrency Behavior

The script:

1. prints per-repository progress and Done/Cloned/Deferred/Failed counts;
2. uses a sibling temporary clone path and renames it only after clone succeeds;
3. writes the report to a temporary file and atomically replaces the previous
   complete report only after all inputs are represented;
4. preserves completed clones, documents, and the last complete report on
   `INT`/`TERM`;
5. tells the operator to rerun the same command to continue.

Only one Batch process may use the same docs root. The script acquires:

```text
<docs-root>/.batch-generate-docs.lock
```

If a stale lock remains after `SIGKILL` or host failure, confirm no process is
using that docs root before manually removing the lock.

## Per-Repository Workflow

For the one selected `cloned` repository:

1. Treat Source Path as read-only.
2. Read the existing coverage checklist first; resume `进行中模块` if present.
3. Run `repo-inventory.sh` into Docs Path.
4. Analyze high-signal files in bounded, parallel batches.
5. Generate all six documents.
6. Keep uncertain meaning under `TODO: 需要业务确认`.
7. Set `Completion: complete` only after semantic self-check.
8. Run `validate-doc-completion.sh`; on failure restore `incomplete` and fix.
9. Run `git -C <Source Path> status --short` and confirm no source changes.
10. End the session. A later invocation reruns Batch to derive `done`.

## Publish Stage (Opt-In)

This stage is step 8 of the loop. It runs only when the user asks to publish, and
it is a separate deterministic script — never part of doc generation.

```bash
./scripts/publish-docs.sh --docs-root codebase-docs        # local commit + plan, then stop
./scripts/publish-docs.sh --docs-root codebase-docs --yes  # push + open pull request
```

Behavior:

1. Discovers repo doc directories under `--docs-root` (those with
   `project-overview.md`) and re-derives `done` through
   `validate-doc-completion.sh`. Only `done` repositories are published; `--only
<name>` scopes to specific ones.
2. Requires `--docs-root` to be a Git repository (initialize it and add a remote
   first). It never operates on the cloned source repositories.
3. Creates one publish branch (default `docs/codebase-docs-<timestamp>`, override
   with `--branch`) and commits each `done` repo's docs as a scoped
   `docs(<repo-name>): ...` commit.
4. **Human-in-the-loop gate**: without `--yes` it stops after the local commits
   and prints the exact `git push` and `gh pr create` commands it would run. A
   human reviews that plan; only re-running with `--yes` pushes the branch and
   opens the pull request (via `gh pr create --fill`, with `--base` optional).

Like the preparation script, `publish-docs.sh` invokes no LLM or Agent CLI and
acquires `<docs-root>/.publish-docs.lock` to prevent concurrent publish runs.

## Report Semantics

`batch-report.md` contains:

1. every input repository and its current derived state;
2. Summary counts for Total, Done, Cloned, Deferred, and Failed;
3. a to-do list containing only `cloned` repositories;
4. separate Done, Deferred, and Failed lists.

Deferred repositories are resumed by rerunning the same command. Agent work does
not hand-edit the report.

## Anti-Overclaim Rules

Do not claim:

```text
All repositories are fully documented.
All business modules are fully covered.
All gotchas are found.
```

unless every relevant repository is `done` and its coverage evidence supports
the statement. Preserve each repository's own coverage limitations.

## Acceptance Criteria

1. Static preflight finishes before filesystem writes or Git operations.
2. Repositories are named predictably and duplicate names are safe.
3. `--max-repos` limits only unfinished repositories entering clone/update.
4. `done` requires the six-document completion validator.
5. The report is an atomic, complete current snapshot.
6. One Agent session deeply explores only one repository.
7. Context checkpoints preserve the current module and next files.
8. Source repositories remain unchanged.
9. Rerunning the same command resumes unfinished work without an external state
   database or Agent CLI.
