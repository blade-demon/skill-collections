# Agent Instructions

This file is for coding agents working in this repository. Human contributors
should start with [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Working Style

- Inspect the real files before planning edits.
- Keep changes scoped to the requested package, skill, sample, or document.
- Preserve unrelated user changes and untracked local scratch directories.
- Prefer established repo patterns over new abstractions.
- Use `rg` / `rg --files` for discovery.

## Repository Boundaries

- `packages/d2c-core/` contains shared D2C contracts and pipeline helpers. Treat
  barrel exports as public API.
- `skills/*` directories must remain understandable and copyable as individual
  skills.
- `samples/*/*` directories are hands-on reader workspaces. Do not make sample
  implementations depend on raw `inputs/`; they should consume `design-spec/`.
- `fixtures/apps/*` contains per-framework fixture apps checked by their own
  install and build commands.
- `docs/superpowers/plans/` contains planning artifacts and is excluded from the
  formatter baseline.

## Verification Matrix

Use targeted checks while editing:

- D2C core: `npm run typecheck:d2c` and `npm run test:d2c`
- Sketch provider: `npm run typecheck:sketch` and `npm run test:sketch`
- Image skeleton scripts: `npm run typecheck:image` and `npm run test:image`
- HTML article skill: `npm run typecheck:html`
- Samples: `npm run test:samples` and `npm run build:samples`
- Fixture apps: `npm run check:fixtures`

Before claiming repo-wide completion, run `npm run check:full`.

## Comments

Add comments where they clarify contracts, public exports, provider boundaries,
or unusual validation behavior. Do not add narration that merely repeats the
next line of code. See [`docs/commenting-guide.md`](./docs/commenting-guide.md).

## Commits

Prefer reviewable commits by concern:

- tooling and config
- mechanical formatting
- CI and hooks
- documentation
- runtime or test behavior

Do not mix broad formatting changes with behavioral changes unless the user
explicitly asks for a single squashed result.
