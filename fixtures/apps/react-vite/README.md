# Fixture App: React + Vite

This directory contains a small React + TypeScript + Vite app used as a reusable
fixture for skill development and validation.

It is not a product sample and it is not part of a published skill. Keep it
intentionally plain so skills can use it as predictable input when testing
app-oriented workflows.

The app also imports `src/golden/` behind a hidden section so CI can prove the
committed generated React package is lint/build-clean.

## Commands

```bash
npm ci --prefix fixtures/apps/react-vite
npm run dev:fixture:react
npm run check:fixtures:react
```

Generated artifacts such as `node_modules/` and `dist/` must stay untracked.
