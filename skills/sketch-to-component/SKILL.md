---
name: sketch-to-component
description: Use when the user wants to convert a Sketch Frame into pixel-faithful React + TypeScript + CSS Modules code. Two roles — designers run extract to publish a versioned IR JSON via the SketchMCP server; developers run generate against the committed IR with no Sketch installation needed. Triggers on phrases like "convert this Sketch frame", "generate React from Sketch", "build from sketch IR", or when a sketch-to-component.config.json exists.
---

# sketch-to-component

## Overview

**IR JSON is the contract between design and code.** Pipeline has two roles:

- **Designer (has Sketch + SketchMCP):** runs `npm run sync <name>`. This extracts the selected Frame from Sketch, validates as IR, writes to `design/sketch-ir/<name>.json`, and generates code. They commit both the IR and the generated code.
- **Developer (no Sketch needed):** runs `npm run build <name>`. This reads the committed IR and regenerates code. Used in CI and when refactoring the generator.

Each Sketch Symbol Master becomes one React component file; its Overrides become typed optional props on that component.

## Prerequisites

### Designer machine (extract path)

- Sketch.app installed and running, with the target document open and a Frame selected
- SketchMCP responding at the configured URL (default `http://localhost:31126/mcp`). Verify:

  ```bash
  curl -sS -X POST $SKETCH_MCP_URL \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
  ```

  Expect `serverInfo.name == "SketchMCP"`.

### Developer machine (build path)

- Node 20+. **No Sketch installation required.**
- The repo has `sketch-to-component.config.json` and at least one IR JSON under `irDir`.

## Configuration

A `sketch-to-component.config.json` at the consumer repo root (validated by `src/config/load.ts`):

```json
{
  "mcpUrl": "http://localhost:31126/mcp",
  "irDir": "design/sketch-ir",
  "outDir": "src/generated/sketch",
  "frames": [
    { "name": "home", "ir": "home.json" },
    { "name": "settings", "ir": "settings.json" }
  ]
}
```

`mcpUrl` can be overridden by the `SKETCH_MCP_URL` env var. `irDir` and `outDir` are resolved relative to the config file's directory.

## Routing Map

| Need | Read |
|---|---|
| IR shape reference | `docs/ir-schema.md` |
| Override → React/CSS mapping table | `docs/override-mapping.md` |
| Deployment options (local vs shared MCP) | `docs/deployment.md` |
| Designer flow — extract & commit IR | `workflows/designer-publish-ir.md` |
| Developer flow — build from IR | `workflows/developer-build.md` |
| Verifying generated output | `workflows/verify-output.md` |
| The extractor script body & MCP contract | `protocols/mcp-extractor-contract.md` |
| Config file schema | `protocols/config-schema.md` |

## Scripts

From the scripts folder:

| Command | Audience | Purpose |
|---|---|---|
| `npm install` | All | Once on first use |
| `npm test` | All | Run Vitest suite |
| `npm run sync -- --name home --config <path>` | Designer | extract → write IR → generate (no extra step) |
| `npm run build -- --name home --config <path>` | Developer | read committed IR → generate (no Sketch needed) |
| `npm run extract -- --out path.json --url <mcpUrl>` | Designer | low-level: extract only |
| `npm run generate -- --ir path.json --out dir/` | All | low-level: generate only |

## Limitations

- Layout is absolute positioning. Stack layouts and Flex sizing are not yet emitted.
- Gradient fills, mask chains, progressive blur are not yet emitted.
- A Symbol Instance with a `symbolID` override (nested symbol swap) is inlined rather than abstracted, to keep the prop model simple.
- Sharing the SketchMCP server across a team requires an out-of-band auth/network solution (Tailscale, mTLS, etc.) because MCP itself has no authentication — see `docs/deployment.md`.
