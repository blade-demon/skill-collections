# sketch-to-component Provider Architecture

## Overview

`sketch-to-component` is the Sketch provider adapter for the shared design-source pipeline.

The authoritative D2C contract is [`../../../docs/design-source-to-component-architecture.md`](../../../docs/design-source-to-component-architecture.md). This provider document must not redefine:

- canonical IR naming or schema location;
- preview, IR, or package output directories;
- review gate count or gate semantics;
- target package layout;
- barrel export rules;
- target stack defaults.

Sketch-specific extraction feeds the shared pipeline:

```text
.sketch file (direct ZIP parse)        # first / primary extraction path
  — or — SketchMCP (later alternative)
-> Sketch provider extractor (extractRaw)
-> output/ir/raw-dsl.json
-> output/ir/design-ir.json
-> shared preview, contract, and target-package pipeline
```

**Extraction approach (2026-05-21).** The first extraction path is **direct `.sketch`
file parsing** — `.sketch` is an open ZIP of JSON, so `extractRaw` is offline,
inspectable, and fixture-friendly. SketchMCP is a later alternative behind the same
seam: both acquisition strategies converge on one internal `SketchRawModel`, so
`normalize` and the shared pipeline are unaffected when MCP is added. The current
Stage 2 build is scoped to the file path — see
[`stage-2-extract-raw-outline.md`](./stage-2-extract-raw-outline.md). The
`Prerequisites` and `Configuration` sections below describe the *later* SketchMCP
path, not the Stage 2 file path.

## Current Stage 2 scope

The sections below (`Role Split`, `Prerequisites`, `Provider Responsibilities`,
`Commands`) describe the full eventual Sketch provider, much of it via SketchMCP.
**The current Stage 2 build is much narrower** — see
[`stage-2-extract-raw-outline.md`](./stage-2-extract-raw-outline.md):

- one command only: `extract --file <path> --out <dir>` — read a local `.sketch`,
  write `raw-dsl.json`;
- no SketchMCP, no frame/artboard selection, no asset or reference-frame export,
  no `normalize`;
- output is a `RawArtifact` whose `payload` is the whole-document `SketchRawModel`.

Treat anything below that conflicts with this section as future scope, not Stage 2.

## When To Use

This provider applies when:

- the user wants to convert a Sketch design through D2C;
- a local `.sketch` file is available — the current Stage 2 main entry, via `extract --file`;
- SketchMCP is available (a later extraction path, not Stage 2);
- the repo contains committed Sketch-derived raw or canonical artifacts;
- the user asks for Sketch provider behavior, limitations, or validation.

Screenshot-only inputs belong to `image-to-component`, not this provider.

## Role Split

| Role | Responsibility |
|---|---|
| Operator with a local `.sketch` file *(current — Stage 2)* | Run `extract --file <path> --out <dir>` to produce `raw-dsl.json`. |
| Designer with Sketch + SketchMCP *(future)* | Extract the selected frame, assets, and reference-frame image. |
| Developer without Sketch | Work from committed `output/ir/` artifacts, review gates, and generated `output/package/`. |
| Shared D2C engine | Own canonical IR views, HTML preview, interaction spec, component plan, target package output, and validation. |

The Sketch provider should make developer builds possible without requiring Sketch, as long as the required `output/ir/raw-dsl.json`, `output/ir/design-ir.json`, and asset/reference artifacts are committed or otherwise supplied.

## Prerequisites

### Designer Machine

- Sketch.app installed and running.
- Target document open.
- Target Frame selected or otherwise addressable.
- SketchMCP responding at the configured URL, defaulting to `http://localhost:31126/mcp`.

Probe example:

```bash
curl -sS -X POST "$SKETCH_MCP_URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
```

Expect the MCP server to identify itself as SketchMCP or an equivalent configured Sketch connector.

### Developer Machine

- Node version required by the repo.
- No Sketch installation required when committed canonical artifacts exist.
- Access to the project rules that define target stack, tokens, naming, BEM, and package export rules.

## Configuration

Provider configuration should describe Sketch access and output root only. It must not define a separate IR or package contract.

Recommended shape:

```json
{
  "mcpUrl": "http://localhost:31126/mcp",
  "outputRoot": "output",
  "frames": [
    { "name": "home", "frameId": "selected" },
    { "name": "settings", "frameId": "settings-frame-id" }
  ]
}
```

`SKETCH_MCP_URL` may override `mcpUrl`.

Output locations under `outputRoot` follow the global architecture:

```text
output/
  preview/
  ir/
  package/
```

## Provider Responsibilities

The Sketch provider owns only Sketch-specific work:

| Responsibility | Provider rule |
|---|---|
| Frame resolution | Resolve the selected frame or configured frame id. |
| MCP extraction | Fetch Sketch document/frame data through SketchMCP. |
| Raw preservation | Save provider response as `output/ir/raw-dsl.json`. |
| Source trace | Preserve page, artboard, layer, symbol, and override source ids under canonical source metadata or trace records. |
| Asset export | Export images, SVGs, symbols, masks, and unresolved placeholders when available. |
| Reference frame | Export a Sketch-rendered frame image for screenshot diff. |
| Normalization | Convert Sketch-specific document data into canonical `output/ir/design-ir.json`. |
| Warnings | Record unsupported effects, masks, gradients, nested overrides, missing assets, and low-confidence semantic candidates. |

Raw Sketch data must not be consumed directly by preview or target package generation.

## Provider Normalization Guidance

Sketch data may include:

```text
Page
Artboard / Frame
Group
Shape
Text
Symbol Master
Symbol Instance
Override
Shared Style
Exportable asset
```

Provider normalization should:

- preserve source ids and layer names for traceability;
- map Symbol Masters and Symbol Instances to semantic candidates, not approved contracts;
- preserve Overrides as candidate props with confidence;
- preserve visual data needed by the Visual View;
- export or ledger bitmap/vector assets;
- record unsupported masks, gradients, shadows, blurs, and nested symbol swaps as warnings;
- keep Sketch-specific fields under `source` metadata or trace records.

## Commands

### Current — Stage 2 only

The Stage 2 build exposes one extraction command — see
[`stage-2-extract-raw-outline.md`](./stage-2-extract-raw-outline.md):

| Command | Purpose |
|---|---|
| `npm install` | Install provider script dependencies. |
| `npm test` | Run provider-owned tests. |
| `npm run typecheck` | Type-check the provider scripts. |
| `npm run extract -- --file <path> --out <dir>` | Parse a local `.sketch` file; write `<out>/ir/raw-dsl.json`. |

### Future — not Stage 2

These describe the eventual full provider (SketchMCP extraction, frame selection,
normalization) and are **out of scope now**:

| Command | Purpose |
|---|---|
| `extract` via SketchMCP / frame selection | Extract a selected frame, assets, and a reference image. |
| `generate` | Normalize provider artifacts into `design-ir.json` and hand off to the shared pipeline. |

Command names may evolve as the provider matures; outputs must still follow the global architecture.

## Gates

This provider uses the gates defined by the global architecture:

1. Gate 1: HTML preview approval for visual fidelity.
2. Gate 2: component contract approval for Semantic View, Interaction Spec, and Component Plan.

The Sketch provider may extract and normalize data before either gate. It must not generate or claim final target package output until both gates pass.

## Validation Focus

Sketch provider validation should cover provider-owned behavior:

- SketchMCP connectivity and failure reporting.
- Selected frame or configured frame resolution.
- Raw Sketch fixture parsing.
- Source trace preservation.
- Symbol, instance, and override preservation as candidates.
- Asset and reference-frame export or warning behavior.
- Canonical `schemaVersion` presence.
- Provider-specific data isolation under `source` or trace records.

Shared output package structure, barrel export shape, gate semantics, regeneration policy, token reconciliation, and screenshot-diff thresholds are owned by the global design-source architecture.

## Limitations

- SketchMCP availability and authentication are environment-specific.
- Some Sketch visual effects may be unsupported and must become warnings.
- Nested symbol swaps should remain candidates until the shared component plan approves them.
- The provider should not promise handler implementation; interaction semantics require developer approval in Gate 2.
