# Repo Workflow

This file explains how `skill-collections` is organized and how skill development, sample authoring, fixtures, and validation fit together.

> **Audience**: contributors / maintainers. End users who only want to use a skill should start at the relevant skill README or onboarding guide.

---

## 1. Repo layout

```
skill-collections/
├── README.md                       # Top-level orientation
├── package.json                    # npm workspace declaration
├── package-lock.json               # Root workspace lockfile
├── .gitignore                      # Shared local/build artifact ignores
│
├── packages/                       # Shared code consumed across skills
│   └── d2c-core/                   # @skill-collections/d2c-core — D2C pipeline core
│
├── skills/                         # Installable/copyable skills
│   ├── design-to-spec/
│   │   ├── SKILL.md
│   │   ├── ONBOARDING.md
│   │   ├── README.md
│   │   ├── CHANGELOG.md
│   │   ├── package.json            # js-yaml + node:test
│   │   ├── agents/
│   │   ├── assets/
│   │   ├── scripts/                # validate-contracts / generate-output / validate-output
│   │   ├── schemas/
│   │   ├── templates/
│   │   ├── references/
│   │   └── examples/               # Golden regression samples
│   ├── image-to-component/         # Screenshot -> component skeleton workflow
│   ├── mastergo-to-component/      # MasterGo design-source provider
│   ├── sketch-to-component/        # Sketch design-source provider
│   └── html-article-to-markdown/
│       ├── SKILL.md
│       ├── README.md
│       ├── CHANGELOG.md
│       ├── package.json
│       ├── agents/
│       ├── assets/
│       ├── bin/
│       ├── src/
│       ├── tests/
│       └── tools/
│
├── samples/                        # Hands-on workspaces grouped by skill
│   └── design-to-spec/
│       ├── search-panel/
│       └── feedback-form/
│
├── fixtures/                       # Shared test/demo app fixtures
└── docs/                           # Top-level cross-cutting documentation
    ├── repo-workflow.md
    ├── sample-authoring.md
    ├── design-source-to-component-architecture.md        # D2C 架构总纲（含 -zh 中文版）
    ├── design-source-to-component-implementation-plan.md # D2C 实施计划与进度
    └── superpowers/
```

The top-level split is intentional:

- `skills/<skill-name>/` contains a skill that can be installed, copied, tested, and versioned as a coherent unit.
- `samples/<skill-name>/<sample-name>/` contains hands-on workspaces that demonstrate a specific skill against realistic inputs.
- `fixtures/` contains reusable app fixtures used for testing or demonstrations, not skill source.
- `docs/` contains repo-level policy and contributor guides only.

---

## 2. Skill directory contract

Each skill should keep its own human docs, runtime code, tests, and assets together:

```
skills/<skill-name>/
├── SKILL.md          # Skill definition loaded by agent harnesses
├── README.md         # Human entry point
├── CHANGELOG.md      # Version history
├── agents/           # Agent/harness configuration
├── assets/           # Icons, previews, screenshots
├── src/ or scripts/  # Core implementation
├── schemas/          # JSON Schema or equivalent contracts, if applicable
├── templates/        # Output templates, if applicable
├── references/       # Long-form reference docs loaded on demand
├── examples/         # Golden samples / regression fixtures, if applicable
└── tests/            # Automated test suite, if applicable
```

Not every skill needs every folder. Add a folder only when the skill actually has that kind of artifact.

---

## 3. Two kinds of design-to-spec examples

The repo deliberately separates two concepts that are easy to conflate:

| | Golden regression samples | Hands-on samples |
|---|---|---|
| **Lives in** | `skills/design-to-spec/examples/` | `samples/design-to-spec/<name>/` |
| **Purpose** | Prove the skill works; pin behavior with byte-equal output | Demonstrate the inputs -> spec -> implementation workflow |
| **Audience** | The skill's own tests | Skill users / reviewers / readers |
| **Owned by** | `design-to-spec` maintainers | Sample authors |
| **Editable?** | No; test scripts assert exact output | Yes; samples evolve over time |
| **Contains** | Contracts + generated markdown | `inputs/` + `design-spec/` + `src/` + `walkthrough.md` |
| **Failure means** | The skill regressed | The sample drifted from its spec |

Mixing these is what motivated the monorepo split. Don't cross-contaminate them.

---

## 4. The hands-on sample flow

```
┌──────────────────────────┐
│  inputs/                 │   raw materials, human-authored
│  ├── design.svg          │
│  ├── api.md              │
│  └── interaction-notes.md│
└────────────┬─────────────┘
             │
             ▼
   ╔═══════════════════════╗
   ║  design-to-spec skill ║   four-stage interactive flow
   ╚═══════════╤═══════════╝
               │
               ▼
┌──────────────────────────┐
│  design-spec/<unit>/     │   skill output
│  ├── contracts/*.yaml    │
│  ├── notes.md            │
│  ├── data-fetching.md    │
│  └── specs/<cap>/spec.md │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  src/                    │   implementation
│  ├── index.html          │   consumes design-spec/
│  ├── main.js             │   never reads inputs/ directly
│  └── style.css           │
└──────────────────────────┘
```

`walkthrough.md` is the narrative layer gluing these stages together: what each stage looked like, what choices were made, and what `open_questions` remained.

---

## 5. Common operations

### Run skill tests

```bash
npm run test:skills
```

Runs the current skill test suites from the repo root. `npm run test:skill` is kept as a compatibility alias.

### Build all samples

```bash
npm run build:samples
```

Runs sample builds for the workspaces under `samples/<skill>/<sample>/`.

### Pre-merge full check

```bash
npm run check
```

Runs in order: skill tests -> sample lints -> sample builds. Fail fast.

`npm run check` does not yet cover the `d2c-core` package — run `npm run test:d2c`
separately until it is folded into `check` (Stage 7).

### Work on a single sample

```bash
cd samples/design-to-spec/search-panel
npm install
npm run dev
```

---

## 6. Runtime and lockfile policy

- The root workspace uses Node.js >= 20 because `skills/html-article-to-markdown` requires Node 20.
- Individual skills may declare a lower compatible engine when they can run standalone, such as `skills/design-to-spec` requiring Node >= 18.
- Keep the root `package-lock.json` for workspace development.
- Keep per-skill `package-lock.json` files when the skill is intended to be copied or installed standalone.
- Do not commit `node_modules/`, `dist/`, `.vite/`, build outputs, or nested `.git/` directories.

---

## 7. Shared packages and future tooling

`packages/` now exists — it holds `d2c-core` (`@skill-collections/d2c-core`), the shared
design-source-to-component pipeline core consumed across skills. Add further shared
packages under `packages/*` only after the duplication is real.

One folder that still doesn't exist but might:

- `tools/` - repo-level scripts that operate across multiple skills or samples, such as a `new-sample.mjs` generator. Create only after the need is real.

---

## 8. CI

There is currently no GitHub Actions workflow. For now, run `npm run check` locally before pushing. If multiple contributors start pushing regularly or `main` is broken by unverified merges, promote the local check into CI.
