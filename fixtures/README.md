# Fixtures

This directory contains reusable app fixtures for CI regression checks and
manual browser debugging. Fixture apps are not product samples and are not skill
source.

## Layout

```text
fixtures/
  apps/
    react-vite/
  shared/
```

- `apps/<target>/` contains a self-contained frontend app for one framework or
  stack target.
- `shared/` contains cross-fixture assets, design specs, and notes that are
  intentionally reused by more than one target.

## Commands

```bash
npm ci --prefix fixtures/apps/react-vite
npm run check:fixtures
npm run dev:fixture:react
```

Keep `npm run check:fixtures` as the CI-facing aggregate. Add per-target
commands such as `check:fixtures:vue3` when new fixture apps land.
