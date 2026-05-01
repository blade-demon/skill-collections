# Sample: search-panel

A hands-on workspace that takes a UI design + API doc + interaction description, runs them through the `design-to-spec` skill, and implements the result.

## What this sample teaches

- The full **inputs → spec → implementation** loop in one repository
- A canonical "search box + submit + result list" UI unit (typical of search bars, filter panels, lookup widgets)
- How `bindings` of all three directions (`ui_to_api`, `api_to_ui`, `ui_to_event`) appear in one component
- How `state_machine` transitions correspond to runtime behavior (idle → loading → success/empty/error)
- How `data-fetching.md` translates into actual fetch + abort + error handling code

## What this sample is not

- **Not** a production-ready component library. State management is intentionally minimal (no Redux / Zustand / Pinia).
- **Not** a framework demo. Vanilla HTML + JS + CSS so the spec → impl mapping is unambiguous.
- **Not** a test of the skill itself. For that, see `design-to-spec/scripts/tests/`.

## Layout

```
samples/search-panel/
├── README.md             # This file
├── package.json          # Vite-based devserver + build
├── inputs/               # Raw materials (immutable once committed)
│   ├── design.svg        # UI mockup with all states
│   ├── api.md            # API documentation
│   └── interaction-notes.md   # Plain-language interaction description
├── design-spec/          # Skill output (regenerate, don't hand-edit)
│   └── search-panel/
│       ├── contracts/
│       ├── notes.md
│       ├── data-fetching.md
│       └── specs/search-panel/spec.md
├── src/                  # Implementation built only from design-spec/
│   ├── index.html
│   ├── main.js
│   └── style.css
└── walkthrough.md        # How design-spec/ was generated, retrospectively
```

## How to run locally

From the **repo root**, install once:

```bash
npm install
```

Then from this directory:

```bash
npm run dev      # Vite dev server (open the printed URL)
npm run build    # Production build into ./dist
```

The dev server uses a tiny mock fetch (in `src/main.js`) so you don't need a backend.

## How to regenerate the spec

If you change `inputs/` or want to verify the skill produces the same artifacts:

```bash
# From this directory
node ../../design-to-spec/scripts/generate-output.js \
  --ui design-spec/search-panel/contracts/ui-schema.yaml \
  --api design-spec/search-panel/contracts/api-schema.yaml \
  --mapping design-spec/search-panel/contracts/mapping-logic.yaml \
  --out-dir design-spec/search-panel
```

To validate:

```bash
node ../../design-to-spec/scripts/validate-contracts.js \
  --ui design-spec/search-panel/contracts/ui-schema.yaml \
  --api design-spec/search-panel/contracts/api-schema.yaml \
  --mapping design-spec/search-panel/contracts/mapping-logic.yaml

node ../../design-to-spec/scripts/validate-output.js --strict \
  --ui design-spec/search-panel/contracts/ui-schema.yaml \
  --api design-spec/search-panel/contracts/api-schema.yaml \
  --mapping design-spec/search-panel/contracts/mapping-logic.yaml \
  --notes design-spec/search-panel/notes.md \
  --data-fetching design-spec/search-panel/data-fetching.md \
  --spec design-spec/search-panel/specs/search-panel/spec.md
```

## How to read this sample

If you have an hour and want to learn the workflow:

1. Read [`inputs/design.svg`](./inputs/design.svg), [`inputs/api.md`](./inputs/api.md), [`inputs/interaction-notes.md`](./inputs/interaction-notes.md) (5 min)
2. Read [`walkthrough.md`](./walkthrough.md) to see how `design-spec/` was produced from those inputs (15 min)
3. Skim `design-spec/search-panel/notes.md` and `spec.md` (10 min)
4. Read `src/main.js` alongside `design-spec/search-panel/data-fetching.md` and `spec.md` to see how the implementation maps to the spec (20 min)
5. Run `npm run dev` and click through the four states (5 min)
