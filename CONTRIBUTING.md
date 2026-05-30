# Contributing

This repo is a monorepo for AI skills, sample workspaces, and shared D2C
packages. Keep changes small, verified, and easy for another maintainer to
review.

## Environment

- Use Node.js 20 or newer. The pinned local version is in `.nvmrc`.
- Install root workspace dependencies with `npm ci`.
- Install React fixture app dependencies with
  `npm ci --prefix fixtures/apps/react-vite` when touching fixture code or
  running the full gate.
- Install local Git hooks with `npx lefthook install`.

## Before Editing

1. Read the nearest README, architecture note, or workflow document for the
   area you are changing.
2. Identify whether the change belongs to `packages/`, `skills/`, `samples/`,
   `fixtures/`, or `docs/`.
3. Check existing tests and golden outputs before updating behavior.

## Quality Gates

Run the narrowest useful command while developing, then run the full gate before
opening a PR.

| Purpose                | Command                  |
| ---------------------- | ------------------------ |
| Lint repository code   | `npm run lint`           |
| Auto-fix lint issues   | `npm run lint:fix`       |
| Format repository      | `npm run format`         |
| Check formatting       | `npm run format:check`   |
| Type-check workspaces  | `npm run typecheck`      |
| Run all tests          | `npm run test:all`       |
| Build hands-on samples | `npm run build:samples`  |
| Check fixture app      | `npm run check:fixtures` |
| Full repository gate   | `npm run check:full`     |

`npm run check:full` is the expected local equivalent of CI.

## Change Boundaries

- `packages/*` is shared code. Treat exported types and functions as public
  contracts and document new public entry points.
- `skills/*` is copyable skill source. Keep each skill self-contained and avoid
  cross-skill dependencies unless they go through a shared package.
- `samples/*/*` is reader-facing demonstration code. A sample should build and
  explain what it teaches.
- `fixtures/apps/*` are reusable app fixtures, not places for skill source.
  `fixtures/shared/*` holds cross-fixture assets and design specs only.
- `docs/` is for repo-level guidance and architecture context.

## Generated and Golden Artifacts

- Do not edit golden outputs casually. If output changes, explain the behavior
  change and run the owning tests.
- Keep `inputs/` for samples stable after the sample lands. Evolve by adding a
  new sample or regenerating the matching `design-spec/` intentionally.
- Never commit `node_modules/`, build output, nested `.git/`, or local agent
  scratch directories.

## Comments and Docs

Prefer concise comments at boundaries that future maintainers must understand:
public exports, parser-to-IR transitions, validation rules, and non-obvious test
fixtures. Avoid comments that repeat the code. See
[`docs/commenting-guide.md`](./docs/commenting-guide.md).

## Pull Request Checklist

- [ ] The changed area has an appropriate README, architecture note, or inline
      comment update.
- [ ] New public APIs include comments or docs.
- [ ] Generated outputs and golden fixtures were reviewed intentionally.
- [ ] `npm run check:full` passes locally, or the skipped part is explained.
- [ ] The PR description includes verification evidence.
