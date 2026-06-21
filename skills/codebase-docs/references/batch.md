# Batch Mode: Orchestration, State, and Publishing

Batch mode prepares multiple Git repositories deterministically, then documents
**one repository per Agent session** using the single-mode workflow
(`references/single-repo.md`). It has three stages; the third is opt-in.

Do not perform cross-repository architecture or business analysis unless the user
explicitly requests it. Repositories are independent by default — do not infer
relationships from names.

## Stage 1: Deterministic Preparation

```bash
./scripts/batch-generate-docs.sh \
  --repos repos.txt \
  --docs-root codebase-docs \
  --repos-root _repos \
  --max-repos 1
```

Options: `--repo <git-url>` (repeatable), `--repos <file>` (one spec per line),
`--docs-root <folder>` (required), `--repos-root <folder>` (clone root, default
`_repos`), `--max-repos <N>` (activate at most N unfinished repositories),
`--fail-fast`. A spec may carry a branch as `url#branch`. Names derive from the
final URL/path segment with `.git` removed; duplicates resolve to `a`, `a-2`, …

There is no `--dry-run`; before any write the script prints a plan
(`Input Spec | Repo Name | Branch | Source Path | Docs Path`) to stderr. The
script invokes no LLM, Agent CLI, `node`, or `jq`, may run longer than 30
minutes, and writes `batch-report.md` atomically. Only one batch process may use
a docs root at a time (`<docs-root>/.batch-generate-docs.lock`).

The script may create/update `<repos-root>/<name>/`, `<docs-root>/<name>/`,
`<docs-root>/batch-report.md`, and lock files. Every cloned source repository is
read-only for documentation work.

## State Model

For each deduplicated repository the derived state is one of:

```text
done      document completion validation passed; skip clone/fetch/scaffold; does not consume --max-repos
cloned    docs incomplete, quota available, clone/update + checklist scaffold succeeded
deferred  docs incomplete but the activation limit is already reached
failed    clone, checkout, or scaffold failed
```

`done` is always re-derived from current documents through the validator — the
script does not parse an old report or keep a state database. Every repository
that enters clone/update consumes one activation slot whether it becomes `cloned`
or `failed`, so `--max-repos` bounds preparation attempts, not successful clones.
`batch-report.md` is a complete current snapshot; do not hand-edit row states.

The checklist scaffold is copied from `templates/coverage-checklist.md` only when
the target does not already exist — it is the resume anchor and is never
overwritten.

## Stage 2: Per-Repository Agent Session

The normative boundary is:

```text
one Agent invocation/session = one deeply explored repository
```

After the script finishes: read `batch-report.md`, select exactly one `cloned`
repository, follow `references/single-repo.md` (run `repo-inventory.sh` first),
write all analysis and documents to its Docs Path, and do not start a second
repository in the same session even if the first finishes early. Use
`--max-repos 1` when preparation is immediately followed by analysis.

When context pressure or compaction is observed, update the repository's
checklist (`进行中模块`, files read, unresolved points, next high-signal files),
write confirmed findings into the existing documents, keep
`Completion: incomplete`, and end the session. Shell cannot snapshot active model
reasoning and does not automatically wake an Agent; a later invocation reads the
checklist and resumes the same unfinished repository. Large batches are expected
to complete across multiple invocations — a single session not finishing the
batch is not a failure. Rerunning the same command resumes deferred work and
re-derives `done`.

## Stage 3: Publish (Opt-In, Step 8)

This runs only when the user asks to publish, and it is a separate deterministic
script — never part of doc generation.

```bash
./scripts/publish-docs.sh --docs-root codebase-docs        # local commit + plan, then stop
./scripts/publish-docs.sh --docs-root codebase-docs --yes  # push + open pull request
```

Behavior:

1. Discovers repo doc directories under `--docs-root` (those with
   `project-overview.md`) and re-derives `done` through the validator. Only `done`
   repositories are published; `--only <name>` scopes to specific ones.
2. Requires `--docs-root` to be a Git repository (initialize it and add a remote
   first). It never operates on the cloned source repositories.
3. Creates one publish branch (default `docs/codebase-docs-<timestamp>`, override
   with `--branch`) and commits each `done` repo's docs as a scoped
   `docs(<repo-name>): ...` commit.
4. **Human-in-the-loop gate**: without `--yes` it stops after the local commits
   and prints the exact `git push` and `gh pr create` commands it would run. Only
   re-running with `--yes` pushes the branch and opens the pull request (via
   `gh pr create --fill`, with `--base` optional).

Like the preparation script, `publish-docs.sh` invokes no LLM or Agent CLI and
acquires `<docs-root>/.publish-docs.lock` to prevent concurrent publish runs.

## Anti-Overclaim

Do not claim every repository is fully documented or every module/gotcha is
covered unless each relevant repository is `done` and its coverage evidence
supports the statement. Preserve each repository's own coverage limitations.
