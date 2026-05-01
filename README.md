# skill-collections

Monorepo containing **AI skills** and **hands-on samples** that exercise them.

```
skill-collections/
├── design-to-spec/     # The skill itself (contracts, scripts, schemas, golden examples)
├── samples/            # Hands-on workspaces that take inputs → run skill → implement
│   └── search-panel/
└── docs/               # Repo-level workflow and authoring guides
```

## Quick map

| If you want to… | Read |
|---|---|
| Understand what `design-to-spec` does | [`design-to-spec/ONBOARDING.md`](./design-to-spec/ONBOARDING.md) |
| Run the skill on a real design | [`design-to-spec/references/operator-guide.md`](./design-to-spec/references/operator-guide.md) |
| See the full inputs → spec → implementation cycle in one place | [`samples/search-panel/`](./samples/search-panel) |
| Understand how this monorepo is organized | [`docs/repo-workflow.md`](./docs/repo-workflow.md) |
| Author a new sample | [`docs/sample-authoring.md`](./docs/sample-authoring.md) |
| Read the iteration roadmap | [`design-to-spec/docs/roadmap.md`](./design-to-spec/docs/roadmap.md) |

## Workspace conventions

- **Node ≥ 18.** Single global runtime; no Python anywhere in the production path.
- **npm workspaces.** Root `package.json` declares `design-to-spec` + every `samples/*`. Run skill tests and sample builds from root with `npm run check`.
- **Skill examples (golden) vs samples (hands-on)** are deliberately separated:
  - `design-to-spec/examples/` holds **golden regression samples** (`today-windvane`, `price-card`). They prove the skill works; tests assert byte-equality. **Do not edit.**
  - `samples/<name>/` holds **hands-on workspaces** with `inputs/`, `design-spec/`, `src/`, and `walkthrough.md`. They demonstrate the full author-facing workflow and are meant to be read, copied, and extended.

## Common commands

```bash
# Test the skill (regression suite)
npm run test:skill

# Build all samples that have a build script
npm run build:samples

# Full pre-merge check
npm run check
```

## Status

- `design-to-spec` is at v0.10.x (Node.js runtime, four-stage state machine, golden samples, 38 regression tests). See [`design-to-spec/CHANGELOG.md`](./design-to-spec/CHANGELOG.md).
- Hands-on samples: `search-panel` (in progress, V0.11). Roadmap in [`design-to-spec/docs/roadmap.md`](./design-to-spec/docs/roadmap.md).
