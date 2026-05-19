# Sketch-to-Component Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `sketch-to-component` skill that converts a Sketch Frame selected in the local Sketch app to pixel-faithful React + TypeScript + CSS Modules code, mapping Symbol Masters to reusable components with Overrides → typed props.

**Architecture:** Two-stage pipeline with **IR JSON as the contract** between roles. **Stage 1 — Extractor (designer-only)**: a JS script POSTed to the configured SketchMCP server (default `http://localhost:31126/mcp`, tool `run_code`) walks the selected layer subtree, in-memory exports Image base64s, and emits a Zod-validated IR JSON. The designer commits that IR to the repo. **Stage 2 — Generator (every developer)**: a TS CLI reads the committed IR and emits one `.tsx` + `.module.css` per Symbol Master plus a root component for the Frame; image assets are written to `assets/`. **No frontend developer needs Sketch installed.** A `sketch-to-component.config.json` at the repo root + `SKETCH_MCP_URL` env var control the MCP endpoint for designers. Layout is absolute positioning (real-world Frame `375×1173` in fixture has zero Stack layouts; flex sizing is a Phase 2 concern). Override types become typed optional props on the Master component.

**Tech Stack:** TypeScript 5, Node 20+, Zod 3 (IR validation), Vitest 3 (tests), tsx (runner). Sketch JS API for extraction. Mirrors the existing `skills/image-to-component/scripts/` package conventions (private, ESM, tsx-driven).

**Real fixture (already inspected via MCP):** `/Users/blade/Desktop/figma-mcp%E6%B5%8B%E8%AF%95.sketch` → Page 1 root Frame `2.0-1备份 21` (375×1173, 137 nodes, depth 8, 13 SymbolInstances over 9 unique Masters, 29 Texts, 4 Images, 0 Stacks). Override histogram shows the property set the generator MUST handle: `stringValue`, `textColor/Size/Weight/HAlign/Decoration`, `color:fill-{0..6}`, `color:border-{0,1}`, `color:shadow-0`, `color:innershadow-0`, `isVisible`, `symbolID`, `layerStyle`, `fillColor`.

**Out of scope for this plan (deferred):** Stack layouts (none in fixture), gradient fills, mask chains, blur/progressive blur, masking modes, font-loading verification, design-token JSON export (color variables emit CSS vars but no separate token file).

---

## File Structure

```
skills/sketch-to-component/
├── SKILL.md                              # Skill entry; designer vs developer workflows
├── docs/
│   ├── ir-schema.md                      # IR JSON shape reference
│   ├── override-mapping.md               # Override property → React/CSS mapping table
│   └── deployment.md                     # How to share IRs vs share a central MCP
├── workflows/
│   ├── designer-publish-ir.md            # Designer: extract from Sketch & commit IR
│   ├── developer-build.md                # Developer: read committed IR & generate code
│   └── verify-output.md                  # How to validate generated code compiles & matches
├── protocols/
│   ├── mcp-extractor-contract.md         # The script body sent to run_code & its IR contract
│   └── config-schema.md                  # sketch-to-component.config.json shape
└── scripts/
    ├── package.json                      # private, ESM, tsx, vitest
    ├── tsconfig.json
    ├── vitest.config.ts
    └── src/
        ├── ir/
        │   ├── schema.ts                 # Zod schemas + inferred types
        │   └── __tests__/schema.test.ts
        ├── config/
        │   ├── load.ts                   # Read+validate sketch-to-component.config.json
        │   └── __tests__/load.test.ts
        ├── extractor/
        │   ├── extract.js                # Body for run_code; pure JS, runs inside Sketch
        │   ├── client.ts                 # POSTs to MCP URL, parses result
        │   └── __tests__/client.test.ts  # Mocked fetch test
        ├── generator/
        │   ├── naming.ts                 # Sanitize names → PascalCase / valid CSS ident
        │   ├── css.ts                    # Style → CSS rule string
        │   ├── tsx.ts                    # Node tree → JSX string
        │   ├── symbols.ts                # Symbol Master → component file emitter
        │   ├── overrides.ts              # Override → prop name/type/default & call-site arg
        │   ├── index.ts                  # Top-level: ir → { files: Record<path, content> }
        │   └── __tests__/
        │       ├── naming.test.ts
        │       ├── css.test.ts
        │       ├── tsx.test.ts
        │       ├── overrides.test.ts
        │       └── symbols.test.ts
        ├── assets/
        │   └── write-images.ts           # Decode base64 → disk
        ├── cli.ts                        # CLI: sync (designer) / build (dev) / extract / generate
        └── tests/
            └── fixtures/
                ├── tiny-ir.json          # Hand-authored minimal IR for unit tests
                ├── frame-ir.json         # Real extracted IR (commit after first run)
                └── tiny-config.json      # Hand-authored minimal config for unit tests
```

**Repo-level artifact (lives in the consuming project, not in this skill):**

```
<consumer-project>/
├── sketch-to-component.config.json       # MCP URL, irDir, outDir, frame manifest
└── design/sketch-ir/                     # Committed IR JSONs (one per Frame)
    ├── home.json
    └── settings.json
```

**Out path:** Generator writes to a caller-supplied directory (default `out/`). Each Symbol Master → `<sanitized>.tsx` + `<sanitized>.module.css`. Root → `Frame.tsx` + `Frame.module.css`. Images → `assets/<short-hash>.png`. A `tokens.css` holds `:root` Color Variable definitions if any are referenced.

---

## Task 1: Skill scaffold

**Files:**
- Create: `skills/sketch-to-component/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add skills/sketch-to-component/SKILL.md
git commit -m "feat(sketch-to-component): scaffold skill entry"
```

---

## Task 2: Scripts package setup

**Files:**
- Create: `skills/sketch-to-component/scripts/package.json`
- Create: `skills/sketch-to-component/scripts/tsconfig.json`
- Create: `skills/sketch-to-component/scripts/vitest.config.ts`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "sketch-to-component-scripts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "extract": "tsx src/cli.ts extract",
    "generate": "tsx src/cli.ts generate",
    "e2e": "tsx src/cli.ts e2e"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "tsx": "^4.19.2",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Install**

```bash
cd skills/sketch-to-component/scripts && npm install
```

Expected: lockfile written, `node_modules/` populated, exit 0.

- [ ] **Step 5: Commit**

```bash
git add skills/sketch-to-component/scripts/package.json skills/sketch-to-component/scripts/tsconfig.json skills/sketch-to-component/scripts/vitest.config.ts skills/sketch-to-component/scripts/package-lock.json
git commit -m "feat(sketch-to-component): scripts package skeleton"
```

---

## Task 3: IR — primitive schemas

**Files:**
- Create: `skills/sketch-to-component/scripts/src/ir/schema.ts`
- Create: `skills/sketch-to-component/scripts/src/ir/__tests__/schema.test.ts`

- [ ] **Step 1: Write failing test for primitive schemas**

```ts
// src/ir/__tests__/schema.test.ts
import { describe, it, expect } from 'vitest';
import { ColorSchema, RectSchema } from '../schema.js';

describe('IR primitives', () => {
  it('parses a hex8 color', () => {
    expect(ColorSchema.parse('#FA5900FF')).toBe('#FA5900FF');
  });
  it('rejects malformed colors', () => {
    expect(() => ColorSchema.parse('FA5900')).toThrow();
  });
  it('parses a rect', () => {
    expect(RectSchema.parse({ x: 0, y: 0, width: 375, height: 1173 })).toEqual({
      x: 0, y: 0, width: 375, height: 1173,
    });
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
cd skills/sketch-to-component/scripts && npx vitest run src/ir/__tests__/schema.test.ts
```

Expected: FAIL `Cannot find module '../schema.js'`.

- [ ] **Step 3: Implement primitives**

```ts
// src/ir/schema.ts
import { z } from 'zod';

export const ColorSchema = z.string().regex(/^#[0-9A-Fa-f]{8}$/);
export type Color = z.infer<typeof ColorSchema>;

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Rect = z.infer<typeof RectSchema>;
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add skills/sketch-to-component/scripts/src/ir/schema.ts skills/sketch-to-component/scripts/src/ir/__tests__/schema.test.ts
git commit -m "feat(sketch-to-component): IR primitive schemas (Color, Rect)"
```

---

## Task 4: IR — style schemas

**Files:**
- Modify: `skills/sketch-to-component/scripts/src/ir/schema.ts`
- Modify: `skills/sketch-to-component/scripts/src/ir/__tests__/schema.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
// append to src/ir/__tests__/schema.test.ts
import { StyleSchema } from '../schema.js';

describe('Style', () => {
  it('parses a minimal style', () => {
    expect(StyleSchema.parse({
      fills: [{ kind: 'solid', color: '#FF0000FF', opacity: 1 }],
      borders: [],
      shadows: [],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    })).toBeTruthy();
  });
  it('parses fill with swatch reference', () => {
    expect(StyleSchema.parse({
      fills: [{ kind: 'solid', color: '#FA5900FF', opacity: 1, swatchName: 'brand/orange' }],
      borders: [], shadows: [],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

Expected: FAIL on missing `StyleSchema` export.

- [ ] **Step 3: Implement Style schemas**

Append to `src/ir/schema.ts`:

```ts
export const FillSchema = z.object({
  kind: z.literal('solid'),
  color: ColorSchema,
  opacity: z.number().min(0).max(1),
  swatchName: z.string().optional(),
});
export type Fill = z.infer<typeof FillSchema>;

export const BorderSchema = z.object({
  color: ColorSchema,
  width: z.number().nonnegative(),
  position: z.enum(['inside', 'center', 'outside']),
  swatchName: z.string().optional(),
});
export type Border = z.infer<typeof BorderSchema>;

export const ShadowSchema = z.object({
  kind: z.enum(['outer', 'inner']),
  color: ColorSchema,
  x: z.number(),
  y: z.number(),
  blur: z.number().nonnegative(),
  spread: z.number().nonnegative(),
  swatchName: z.string().optional(),
});
export type Shadow = z.infer<typeof ShadowSchema>;

export const CornersSchema = z.object({
  topLeft: z.number().nonnegative(),
  topRight: z.number().nonnegative(),
  bottomRight: z.number().nonnegative(),
  bottomLeft: z.number().nonnegative(),
});

export const StyleSchema = z.object({
  fills: z.array(FillSchema),
  borders: z.array(BorderSchema),
  shadows: z.array(ShadowSchema),
  corners: CornersSchema,
  opacity: z.number().min(0).max(1),
  sharedStyleName: z.string().optional(),
});
export type Style = z.infer<typeof StyleSchema>;
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/ir/
git commit -m "feat(sketch-to-component): IR Style schemas (fills, borders, shadows, corners)"
```

---

## Task 5: IR — text & node schemas

**Files:**
- Modify: `skills/sketch-to-component/scripts/src/ir/schema.ts`
- Modify: `skills/sketch-to-component/scripts/src/ir/__tests__/schema.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
// append
import { NodeSchema } from '../schema.js';

describe('Node', () => {
  it('parses a Text node', () => {
    expect(NodeSchema.parse({
      kind: 'Text',
      id: 'L1',
      name: '标题',
      frame: { x: 0, y: 0, width: 100, height: 20 },
      visible: true,
      content: 'Hello',
      fontFamily: 'PingFang SC',
      fontSize: 16,
      fontWeight: 400,
      color: '#1A1A1AFF',
      align: 'left',
      decoration: 'none',
    })).toBeTruthy();
  });
  it('parses a Group node with children', () => {
    expect(NodeSchema.parse({
      kind: 'Group',
      id: 'G1', name: 'wrapper',
      frame: { x: 0, y: 0, width: 100, height: 100 },
      visible: true,
      style: { fills: [], borders: [], shadows: [],
               corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
               opacity: 1 },
      children: [],
    })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

Expected: FAIL on missing `NodeSchema` export.

- [ ] **Step 3: Implement Node union with recursion**

Append to `src/ir/schema.ts`:

```ts
const BaseNodeProps = {
  id: z.string(),
  name: z.string(),
  frame: RectSchema,
  visible: z.boolean(),
};

export const TextNodeSchema = z.object({
  kind: z.literal('Text'),
  ...BaseNodeProps,
  content: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  fontWeight: z.number().int(),
  color: ColorSchema,
  align: z.enum(['left', 'center', 'right', 'justify']),
  decoration: z.enum(['none', 'underline', 'strikethrough']),
  textColorSwatchName: z.string().optional(),
});

export const ImageNodeSchema = z.object({
  kind: z.literal('Image'),
  ...BaseNodeProps,
  assetId: z.string(),
});

export const ShapeNodeSchema = z.object({
  kind: z.literal('Shape'),
  ...BaseNodeProps,
  style: StyleSchema,
});

export type NodeType =
  | z.infer<typeof TextNodeSchema>
  | z.infer<typeof ImageNodeSchema>
  | z.infer<typeof ShapeNodeSchema>
  | GroupNode
  | SymbolInstanceNode;

interface GroupNode {
  kind: 'Group' | 'Frame';
  id: string;
  name: string;
  frame: Rect;
  visible: boolean;
  style: Style;
  children: NodeType[];
}

interface SymbolInstanceNode {
  kind: 'SymbolInstance';
  id: string;
  name: string;
  frame: Rect;
  visible: boolean;
  masterId: string;
  overrides: OverrideRecord[];
}

export interface OverrideRecord {
  path: string;
  property: string;
  value: unknown;
  defaultValue: unknown;
  swatchName?: string;
}

export const OverrideSchema: z.ZodType<OverrideRecord> = z.object({
  path: z.string(),
  property: z.string(),
  value: z.unknown(),
  defaultValue: z.unknown(),
  swatchName: z.string().optional(),
});

export const GroupNodeSchema: z.ZodType<GroupNode> = z.lazy(() => z.object({
  kind: z.enum(['Group', 'Frame']),
  id: z.string(),
  name: z.string(),
  frame: RectSchema,
  visible: z.boolean(),
  style: StyleSchema,
  children: z.array(NodeSchema),
}));

export const SymbolInstanceNodeSchema: z.ZodType<SymbolInstanceNode> = z.object({
  kind: z.literal('SymbolInstance'),
  id: z.string(),
  name: z.string(),
  frame: RectSchema,
  visible: z.boolean(),
  masterId: z.string(),
  overrides: z.array(OverrideSchema),
});

export const NodeSchema: z.ZodType<NodeType> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    TextNodeSchema,
    ImageNodeSchema,
    ShapeNodeSchema,
    GroupNodeSchema as any,
    SymbolInstanceNodeSchema,
  ])
);
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/ir/
git commit -m "feat(sketch-to-component): IR Node union (Text, Image, Shape, Group, SymbolInstance)"
```

---

## Task 6: IR — Symbol Master & root document

**Files:**
- Modify: `skills/sketch-to-component/scripts/src/ir/schema.ts`
- Modify: `skills/sketch-to-component/scripts/src/ir/__tests__/schema.test.ts`

- [ ] **Step 1: Append failing test**

```ts
// append
import { DocumentSchema } from '../schema.js';

describe('Document', () => {
  it('parses an empty document', () => {
    expect(DocumentSchema.parse({
      root: {
        kind: 'Frame', id: 'F1', name: 'Frame',
        frame: { x: 0, y: 0, width: 100, height: 100 },
        visible: true,
        style: { fills: [], borders: [], shadows: [],
          corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          opacity: 1 },
        children: [],
      },
      symbols: {},
      assets: {},
      colorVariables: {},
    })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

Expected: FAIL on missing `DocumentSchema`.

- [ ] **Step 3: Implement Document & SymbolMaster**

Append to `src/ir/schema.ts`:

```ts
export const SymbolMasterSchema = z.object({
  id: z.string(),
  name: z.string(),
  frame: RectSchema,
  children: z.array(NodeSchema),
  style: StyleSchema,
});
export type SymbolMaster = z.infer<typeof SymbolMasterSchema>;

export const AssetSchema = z.object({
  id: z.string(),
  format: z.literal('png'),
  base64: z.string(),
});

// Keyed in the parent map by swatch name. cssVarName is derived deterministically
// by the generator via `toCssVarName(name)`, so producers don't need to compute it.
export const ColorVariableSchema = z.object({
  name: z.string(),
  color: ColorSchema,
});

export const DocumentSchema = z.object({
  root: GroupNodeSchema,
  symbols: z.record(SymbolMasterSchema),
  assets: z.record(AssetSchema),
  colorVariables: z.record(ColorVariableSchema),
});
export type Document = z.infer<typeof DocumentSchema>;
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/ir/
git commit -m "feat(sketch-to-component): IR Document root with symbols, assets, colorVariables"
```

---

## Task 7: Name sanitizer

**Files:**
- Create: `skills/sketch-to-component/scripts/src/generator/naming.ts`
- Create: `skills/sketch-to-component/scripts/src/generator/__tests__/naming.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/generator/__tests__/naming.test.ts
import { describe, it, expect } from 'vitest';
import { toPascalIdentifier, toCssVarName, shortHash } from '../naming.js';

describe('naming', () => {
  it('PascalCases ASCII words', () => {
    expect(toPascalIdentifier('my button', 'X')).toBe('MyButton');
  });
  it('strips non-ASCII and adds hash suffix when result would be empty', () => {
    const out = toPascalIdentifier('猜你想要', 'ABCDEF12');
    expect(out).toMatch(/^Symbol_[A-Za-z0-9]{6,8}$/);
  });
  it('preserves ASCII and appends short hash when mixed', () => {
    const out = toPascalIdentifier('icon/底部/查保单', 'AABBCCDD');
    expect(out.startsWith('Icon')).toBe(true);
  });
  it('CSS var name is kebab and lowercase', () => {
    expect(toCssVarName('FA5900平安橙色')).toMatch(/^--swatch-fa5900-[a-z0-9]{6}$/);
  });
  it('shortHash is deterministic and 6 chars', () => {
    expect(shortHash('hello')).toBe(shortHash('hello'));
    expect(shortHash('hello')).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/generator/__tests__/naming.test.ts
```

Expected: FAIL on missing module.

- [ ] **Step 3: Implement naming**

```ts
// src/generator/naming.ts
import { createHash } from 'node:crypto';

export function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 6);
}

const ASCII_WORD = /[A-Za-z0-9]+/g;

export function toPascalIdentifier(rawName: string, stableSalt: string): string {
  const asciiTokens = rawName.match(ASCII_WORD) ?? [];
  const pascal = asciiTokens
    .map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join('');
  if (pascal.length === 0) {
    return `Symbol_${shortHash(stableSalt)}`;
  }
  const hasNonAscii = /[^\x00-\x7F]/.test(rawName);
  return hasNonAscii ? `${pascal}_${shortHash(stableSalt)}` : pascal;
}

export function toCssVarName(rawName: string): string {
  const tokens = rawName.match(ASCII_WORD) ?? [];
  const ascii = tokens.join('-').toLowerCase();
  return `--swatch-${ascii || 'x'}-${shortHash(rawName)}`;
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/generator/__tests__/naming.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): name sanitizer (PascalCase, CSS var, short hash)"
```

---

## Task 8: CSS rule emitter

**Files:**
- Create: `skills/sketch-to-component/scripts/src/generator/css.ts`
- Create: `skills/sketch-to-component/scripts/src/generator/__tests__/css.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/generator/__tests__/css.test.ts
import { describe, it, expect } from 'vitest';
import { emitLayoutRules, emitStyleRules } from '../css.js';

describe('css emitter', () => {
  it('emits absolute position rules', () => {
    expect(emitLayoutRules({ x: 10, y: 20, width: 100, height: 40 })).toEqual([
      'position: absolute',
      'left: 10px',
      'top: 20px',
      'width: 100px',
      'height: 40px',
    ]);
  });
  it('emits solid fill as background', () => {
    expect(emitStyleRules({
      fills: [{ kind: 'solid', color: '#FF0000FF', opacity: 1 }],
      borders: [], shadows: [],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    })).toContain('background-color: #FF0000FF');
  });
  it('emits swatch reference as var()', () => {
    const rules = emitStyleRules({
      fills: [{ kind: 'solid', color: '#FA5900FF', opacity: 1, swatchName: 'brand/orange' }],
      borders: [], shadows: [],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    });
    expect(rules.some(r => r.includes('var(--swatch-brand-orange-'))).toBe(true);
  });
  it('emits per-corner radius when asymmetric', () => {
    const rules = emitStyleRules({
      fills: [], borders: [], shadows: [],
      corners: { topLeft: 4, topRight: 8, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    });
    expect(rules).toContain('border-radius: 4px 8px 0px 0px');
  });
  it('emits single border', () => {
    const rules = emitStyleRules({
      fills: [], shadows: [],
      borders: [{ color: '#000000FF', width: 2, position: 'inside' }],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    });
    expect(rules).toContain('border: 2px solid #000000FF');
  });
  it('emits outer shadow', () => {
    const rules = emitStyleRules({
      fills: [], borders: [],
      shadows: [{ kind: 'outer', color: '#0000004D', x: 0, y: 2, blur: 8, spread: 0 }],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    });
    expect(rules).toContain('box-shadow: 0px 2px 8px 0px #0000004D');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/generator/__tests__/css.test.ts
```

Expected: FAIL on missing module.

- [ ] **Step 3: Implement css emitter**

```ts
// src/generator/css.ts
import type { Rect, Style, Fill, Border, Shadow } from '../ir/schema.js';
import { toCssVarName } from './naming.js';

export function emitLayoutRules(frame: Rect): string[] {
  return [
    'position: absolute',
    `left: ${frame.x}px`,
    `top: ${frame.y}px`,
    `width: ${frame.width}px`,
    `height: ${frame.height}px`,
  ];
}

function colorOrVar(color: string, swatchName?: string): string {
  return swatchName ? `var(${toCssVarName(swatchName)}, ${color})` : color;
}

function fillRules(fills: Style['fills']): string[] {
  const first = fills[0];
  if (!first) return [];
  return [`background-color: ${colorOrVar(first.color, first.swatchName)}`];
}

function borderRules(borders: Style['borders']): string[] {
  const b = borders[0];
  if (!b) return [];
  return [`border: ${b.width}px solid ${colorOrVar(b.color, b.swatchName)}`];
}

function shadowRules(shadows: Style['shadows']): string[] {
  const parts = shadows.map(s => {
    const inset = s.kind === 'inner' ? 'inset ' : '';
    return `${inset}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${colorOrVar(s.color, s.swatchName)}`;
  });
  return parts.length ? [`box-shadow: ${parts.join(', ')}`] : [];
}

function cornerRules(c: Style['corners']): string[] {
  if (c.topLeft === 0 && c.topRight === 0 && c.bottomRight === 0 && c.bottomLeft === 0) return [];
  const all = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
  if (all.every(v => v === c.topLeft)) return [`border-radius: ${c.topLeft}px`];
  return [`border-radius: ${all.map(v => `${v}px`).join(' ')}`];
}

export function emitStyleRules(style: Style): string[] {
  const out: string[] = [];
  out.push(...fillRules(style.fills));
  out.push(...borderRules(style.borders));
  out.push(...shadowRules(style.shadows));
  out.push(...cornerRules(style.corners));
  if (style.opacity !== 1) out.push(`opacity: ${style.opacity}`);
  return out;
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/generator/__tests__/css.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): CSS rule emitter (layout, fills, borders, shadows, corners)"
```

---

## Task 9: Override → prop mapper

**Files:**
- Create: `skills/sketch-to-component/scripts/src/generator/overrides.ts`
- Create: `skills/sketch-to-component/scripts/src/generator/__tests__/overrides.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/generator/__tests__/overrides.test.ts
import { describe, it, expect } from 'vitest';
import { propsForOverrides, applyOverridesToInstance } from '../overrides.js';
import type { OverrideRecord } from '../../ir/schema.js';

const orec = (p: string, prop: string, val: unknown, def: unknown): OverrideRecord =>
  ({ path: p, property: prop, value: val, defaultValue: def });

describe('overrides → props', () => {
  it('maps stringValue to a typed optional text prop', () => {
    const props = propsForOverrides([orec('L1', 'stringValue', 'Hi', 'Hello')]);
    expect(props.find(p => p.name === 'text_L1')).toEqual({
      name: 'text_L1', type: 'string', optional: true, default: 'Hello',
    });
  });
  it('maps color:fill-0 to a color prop', () => {
    const props = propsForOverrides([orec('L1', 'color:fill-0', '#FFFFFFFF', '#000000FF')]);
    expect(props.find(p => p.name === 'fill0_L1')).toEqual({
      name: 'fill0_L1', type: 'string', optional: true, default: '#000000FF',
    });
  });
  it('maps isVisible to a boolean prop', () => {
    const props = propsForOverrides([orec('L1', 'isVisible', false, true)]);
    expect(props.find(p => p.name === 'visible_L1')).toEqual({
      name: 'visible_L1', type: 'boolean', optional: true, default: true,
    });
  });
  it('skips unsupported override properties without throwing', () => {
    const props = propsForOverrides([orec('L1', 'someThingWeDoNotHandle', 1, 0)]);
    expect(props).toHaveLength(0);
  });
});

describe('applyOverridesToInstance', () => {
  it('emits only call-site props that differ from default', () => {
    const instance = { id: 'I1', overrides: [
      orec('L1', 'stringValue', 'Custom', 'Default'),
      orec('L2', 'stringValue', 'Same', 'Same'),
    ] };
    const args = applyOverridesToInstance(instance as any);
    expect(args).toEqual({ text_L1: 'Custom' });
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/generator/__tests__/overrides.test.ts
```

Expected: FAIL on missing module.

- [ ] **Step 3: Implement overrides mapper**

```ts
// src/generator/overrides.ts
import type { OverrideRecord } from '../ir/schema.js';

export interface PropSpec {
  name: string;
  type: 'string' | 'boolean' | 'number';
  optional: true;
  default: unknown;
}

const COLOR_FILL_RE = /^color:fill-(\d+)$/;
const COLOR_BORDER_RE = /^color:border-(\d+)$/;
const COLOR_SHADOW_RE = /^color:(?:inner)?shadow-(\d+)$/;

function pathSlug(path: string): string {
  return path.split('/').pop() ?? path;
}

function specForOverride(o: OverrideRecord): PropSpec | null {
  const slug = pathSlug(o.path);
  switch (o.property) {
    case 'stringValue':
      return { name: `text_${slug}`, type: 'string', optional: true, default: o.defaultValue };
    case 'isVisible':
      return { name: `visible_${slug}`, type: 'boolean', optional: true, default: o.defaultValue };
    case 'textColor':
      return { name: `textColor_${slug}`, type: 'string', optional: true, default: o.defaultValue };
    case 'textSize':
      return { name: `textSize_${slug}`, type: 'number', optional: true, default: o.defaultValue };
    case 'textWeight':
      return { name: `textWeight_${slug}`, type: 'number', optional: true, default: o.defaultValue };
    case 'fillColor':
      return { name: `tint_${slug}`, type: 'string', optional: true, default: o.defaultValue };
  }
  let m = COLOR_FILL_RE.exec(o.property);
  if (m) return { name: `fill${m[1]}_${slug}`, type: 'string', optional: true, default: o.defaultValue };
  m = COLOR_BORDER_RE.exec(o.property);
  if (m) return { name: `border${m[1]}_${slug}`, type: 'string', optional: true, default: o.defaultValue };
  m = COLOR_SHADOW_RE.exec(o.property);
  if (m) return { name: `shadow${m[1]}_${slug}`, type: 'string', optional: true, default: o.defaultValue };
  return null;
}

export function propsForOverrides(overrides: OverrideRecord[]): PropSpec[] {
  const out: PropSpec[] = [];
  const seen = new Set<string>();
  for (const o of overrides) {
    const spec = specForOverride(o);
    if (!spec || seen.has(spec.name)) continue;
    seen.add(spec.name);
    out.push(spec);
  }
  return out;
}

export function applyOverridesToInstance(instance: { overrides: OverrideRecord[] }): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const o of instance.overrides) {
    const spec = specForOverride(o);
    if (!spec) continue;
    if (o.value === o.defaultValue) continue;
    args[spec.name] = o.value;
  }
  return args;
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/generator/__tests__/overrides.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): override → typed React prop mapping"
```

---

## Task 10: TSX emitter for plain nodes

**Files:**
- Create: `skills/sketch-to-component/scripts/src/generator/tsx.ts`
- Create: `skills/sketch-to-component/scripts/src/generator/__tests__/tsx.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/generator/__tests__/tsx.test.ts
import { describe, it, expect } from 'vitest';
import { emitNodeJsx } from '../tsx.js';
import type { NodeType } from '../../ir/schema.js';

const baseStyle = {
  fills: [], borders: [], shadows: [],
  corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  opacity: 1,
};

describe('emitNodeJsx', () => {
  it('renders a Text node with content', () => {
    const n: NodeType = {
      kind: 'Text', id: 'T1', name: 'title', visible: true,
      frame: { x: 0, y: 0, width: 100, height: 20 },
      content: 'Hi', fontFamily: 'PingFang SC', fontSize: 14, fontWeight: 400,
      color: '#000000FF', align: 'left', decoration: 'none',
    };
    const out = emitNodeJsx(n, 'cls');
    expect(out).toContain('<span className={cls.t_T1}>Hi</span>');
  });
  it('renders an Image node', () => {
    const n: NodeType = {
      kind: 'Image', id: 'I1', name: 'pic', visible: true,
      frame: { x: 0, y: 0, width: 100, height: 100 },
      assetId: 'asset_abc',
    };
    const out = emitNodeJsx(n, 'cls');
    expect(out).toContain('<img className={cls.i_I1}');
    expect(out).toContain('src={asset_abc}');
  });
  it('renders a Group with children wrapped in a div', () => {
    const n: NodeType = {
      kind: 'Group', id: 'G1', name: 'wrap', visible: true,
      frame: { x: 0, y: 0, width: 10, height: 10 }, style: baseStyle,
      children: [],
    };
    const out = emitNodeJsx(n, 'cls');
    expect(out).toContain('<div className={cls.g_G1}>');
    expect(out).toContain('</div>');
  });
  it('omits hidden nodes', () => {
    const n: NodeType = {
      kind: 'Text', id: 'T2', name: 'x', visible: false,
      frame: { x: 0, y: 0, width: 1, height: 1 },
      content: 'x', fontFamily: 'F', fontSize: 1, fontWeight: 400,
      color: '#000000FF', align: 'left', decoration: 'none',
    };
    expect(emitNodeJsx(n, 'cls')).toBe('');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/generator/__tests__/tsx.test.ts
```

Expected: FAIL on missing module.

- [ ] **Step 3: Implement tsx emitter**

```ts
// src/generator/tsx.ts
import type { NodeType } from '../ir/schema.js';

function classPrefix(kind: NodeType['kind']): string {
  switch (kind) {
    case 'Text': return 't';
    case 'Image': return 'i';
    case 'Shape': return 's';
    case 'Group':
    case 'Frame': return 'g';
    case 'SymbolInstance': return 'si';
  }
}

export function emitNodeJsx(node: NodeType, classesIdent: string): string {
  if (!node.visible) return '';
  const cls = `${classesIdent}.${classPrefix(node.kind)}_${node.id}`;
  switch (node.kind) {
    case 'Text':
      return `<span className={${cls}}>${escapeJsxText(node.content)}</span>`;
    case 'Image':
      return `<img className={${cls}} src={asset_${node.assetId}} alt="${escapeAttr(node.name)}" />`;
    case 'Shape':
      return `<div className={${cls}} />`;
    case 'Group':
    case 'Frame': {
      const children = node.children.map(c => emitNodeJsx(c, classesIdent)).filter(Boolean).join('\n');
      return `<div className={${cls}}>\n${children}\n</div>`;
    }
    case 'SymbolInstance':
      return `<div className={${cls}}>{/* SymbolInstance ${node.masterId} */}</div>`;
  }
}

function escapeJsxText(s: string): string {
  return s.replace(/[<>{}]/g, ch => `{'${ch}'}`);
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/generator/__tests__/tsx.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): TSX emitter for Text/Image/Shape/Group/Frame"
```

---

## Task 11: Symbol Master file emitter

**Files:**
- Create: `skills/sketch-to-component/scripts/src/generator/symbols.ts`
- Create: `skills/sketch-to-component/scripts/src/generator/__tests__/symbols.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/generator/__tests__/symbols.test.ts
import { describe, it, expect } from 'vitest';
import { emitSymbolMaster } from '../symbols.js';
import type { SymbolMaster } from '../../ir/schema.js';

const baseStyle = {
  fills: [], borders: [], shadows: [],
  corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  opacity: 1,
};

describe('emitSymbolMaster', () => {
  it('emits a tsx + css module pair', () => {
    const master: SymbolMaster = {
      id: 'MID1', name: 'MyButton',
      frame: { x: 0, y: 0, width: 100, height: 40 },
      style: baseStyle,
      children: [{
        kind: 'Text', id: 'TLABEL', name: 'label', visible: true,
        frame: { x: 10, y: 10, width: 80, height: 20 },
        content: 'OK', fontFamily: 'PingFang SC', fontSize: 14, fontWeight: 400,
        color: '#000000FF', align: 'left', decoration: 'none',
      }],
    };
    const out = emitSymbolMaster(master, [
      { name: 'text_TLABEL', type: 'string', optional: true, default: 'OK' },
    ]);
    expect(out.componentName).toBe('MyButton');
    expect(out.tsxPath).toBe('MyButton.tsx');
    expect(out.cssPath).toBe('MyButton.module.css');
    expect(out.tsx).toContain('export interface MyButtonProps');
    expect(out.tsx).toContain('text_TLABEL?: string');
    expect(out.tsx).toContain("import classes from './MyButton.module.css'");
    expect(out.css).toContain('.t_TLABEL');
    expect(out.css).toContain('width: 80px');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/generator/__tests__/symbols.test.ts
```

Expected: FAIL on missing module.

- [ ] **Step 3: Implement symbol emitter**

```ts
// src/generator/symbols.ts
import type { NodeType, SymbolMaster } from '../ir/schema.js';
import { emitLayoutRules, emitStyleRules } from './css.js';
import { emitNodeJsx } from './tsx.js';
import { toPascalIdentifier } from './naming.js';
import type { PropSpec } from './overrides.js';

export interface SymbolFiles {
  componentName: string;
  tsxPath: string;
  cssPath: string;
  tsx: string;
  css: string;
}

function collectCssRules(node: NodeType, out: string[]): void {
  if (!node.visible) return;
  const prefix = node.kind === 'Text' ? 't'
    : node.kind === 'Image' ? 'i'
    : node.kind === 'Shape' ? 's'
    : node.kind === 'SymbolInstance' ? 'si'
    : 'g';
  const rules: string[] = [...emitLayoutRules(node.frame)];
  if (node.kind === 'Text') {
    rules.push(`color: ${node.color}`);
    rules.push(`font-family: "${node.fontFamily}"`);
    rules.push(`font-size: ${node.fontSize}px`);
    rules.push(`font-weight: ${node.fontWeight}`);
    rules.push(`text-align: ${node.align}`);
    if (node.decoration !== 'none') rules.push(`text-decoration: ${node.decoration}`);
  } else if (node.kind === 'Group' || node.kind === 'Frame' || node.kind === 'Shape') {
    rules.push(...emitStyleRules(node.style));
  }
  out.push(`.${prefix}_${node.id} {\n  ${rules.join(';\n  ')};\n}`);
  if (node.kind === 'Group' || node.kind === 'Frame') {
    for (const c of node.children) collectCssRules(c, out);
  }
}

function defaultLiteral(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return 'undefined';
}

export function emitSymbolMaster(master: SymbolMaster, props: PropSpec[]): SymbolFiles {
  const componentName = toPascalIdentifier(master.name, master.id);
  const cssParts: string[] = [];
  cssParts.push(`.root {\n  position: relative;\n  width: ${master.frame.width}px;\n  height: ${master.frame.height}px;\n}`);
  for (const c of master.children) collectCssRules(c, cssParts);
  const childrenJsx = master.children.map(c => emitNodeJsx(c, 'classes')).filter(Boolean).join('\n      ');
  const propDecls = props.map(p => `  ${p.name}?: ${p.type};`).join('\n');
  const propDestructure = props.length
    ? `{ ${props.map(p => `${p.name} = ${defaultLiteral(p.default)}`).join(', ')} }`
    : '_props';
  const tsx = `import React from 'react';
import classes from './${componentName}.module.css';

export interface ${componentName}Props {
${propDecls}
}

export function ${componentName}(${propDestructure}: ${componentName}Props) {
  return (
    <div className={classes.root}>
      ${childrenJsx}
    </div>
  );
}
`;
  return {
    componentName,
    tsxPath: `${componentName}.tsx`,
    cssPath: `${componentName}.module.css`,
    tsx,
    css: cssParts.join('\n\n') + '\n',
  };
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/generator/__tests__/symbols.test.ts
```

Expected: 1 passed (with all 6 assertions).

- [ ] **Step 5: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): Symbol Master → tsx + CSS Module file pair"
```

---

## Task 12: TSX emitter for SymbolInstance with overrides

**Files:**
- Modify: `skills/sketch-to-component/scripts/src/generator/tsx.ts`
- Modify: `skills/sketch-to-component/scripts/src/generator/__tests__/tsx.test.ts`

- [ ] **Step 1: Add failing test**

```ts
// append to src/generator/__tests__/tsx.test.ts
import { emitSymbolInstanceJsx } from '../tsx.js';

describe('emitSymbolInstanceJsx', () => {
  it('renders <Component prop="value" />', () => {
    const out = emitSymbolInstanceJsx(
      { kind: 'SymbolInstance', id: 'I1', name: 'btn', visible: true,
        frame: { x: 0, y: 0, width: 100, height: 40 },
        masterId: 'M1', overrides: [
          { path: 'L1', property: 'stringValue', value: 'Hello', defaultValue: 'Default' },
        ],
      },
      { M1: 'MyButton' },
      'cls'
    );
    expect(out).toContain('<MyButton text_L1="Hello" />');
  });
  it('emits unknown master as commented-out placeholder', () => {
    const out = emitSymbolInstanceJsx(
      { kind: 'SymbolInstance', id: 'I2', name: 'x', visible: true,
        frame: { x: 0, y: 0, width: 1, height: 1 }, masterId: 'M_unknown', overrides: [] },
      {}, 'cls'
    );
    expect(out).toContain('{/* missing master M_unknown */}');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/generator/__tests__/tsx.test.ts
```

Expected: FAIL on missing export.

- [ ] **Step 3: Append `emitSymbolInstanceJsx` to `src/generator/tsx.ts`**

```ts
// append to src/generator/tsx.ts
import { applyOverridesToInstance } from './overrides.js';

type Instance = Extract<NodeType, { kind: 'SymbolInstance' }>;

export function emitSymbolInstanceJsx(
  instance: Instance,
  masterIdToComponent: Record<string, string>,
  classesIdent: string,
): string {
  if (!instance.visible) return '';
  const componentName = masterIdToComponent[instance.masterId];
  const cls = `${classesIdent}.si_${instance.id}`;
  if (!componentName) {
    return `<div className={${cls}}>{/* missing master ${instance.masterId} */}</div>`;
  }
  const args = applyOverridesToInstance(instance);
  const propStr = Object.entries(args)
    .map(([k, v]) => `${k}=${jsxAttrValue(v)}`)
    .join(' ');
  return propStr
    ? `<${componentName} ${propStr} />`
    : `<${componentName} />`;
}

function jsxAttrValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean' || typeof v === 'number') return `{${v}}`;
  return `{${JSON.stringify(v)}}`;
}
```

- [ ] **Step 4: Replace the `SymbolInstance` branch inside `emitNodeJsx`**

In `src/generator/tsx.ts`, find:

```ts
    case 'SymbolInstance':
      return `<div className={${cls}}>{/* SymbolInstance ${node.masterId} */}</div>`;
```

Replace with:

```ts
    case 'SymbolInstance':
      throw new Error('Use emitSymbolInstanceJsx for SymbolInstance nodes; emitNodeJsx does not have the master→component map');
```

(Tests from Task 10 only exercise non-instance kinds, so they continue to pass. Top-level `generate()` in Task 13 routes SymbolInstance nodes through `emitSymbolInstanceJsx`.)

- [ ] **Step 5: Run test, expect PASS**

```bash
npx vitest run src/generator/__tests__/tsx.test.ts
```

Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): TSX emitter for SymbolInstance with override props"
```

---

## Task 13: Top-level generator (index)

**Files:**
- Create: `skills/sketch-to-component/scripts/src/generator/index.ts`
- Create: `skills/sketch-to-component/scripts/src/generator/__tests__/index.test.ts`
- Create: `skills/sketch-to-component/scripts/tests/fixtures/tiny-ir.json`

- [ ] **Step 1: Hand-author the tiny fixture**

```json
{
  "root": {
    "kind": "Frame", "id": "ROOT", "name": "Demo",
    "frame": { "x": 0, "y": 0, "width": 200, "height": 100 },
    "visible": true,
    "style": { "fills": [{"kind":"solid","color":"#FFFFFFFF","opacity":1}],
               "borders": [], "shadows": [],
               "corners": {"topLeft":0,"topRight":0,"bottomRight":0,"bottomLeft":0},
               "opacity": 1 },
    "children": [
      {
        "kind": "SymbolInstance", "id": "INS1", "name": "btn-A", "visible": true,
        "frame": { "x": 10, "y": 30, "width": 80, "height": 40 },
        "masterId": "MID_BTN",
        "overrides": [
          { "path": "LBL", "property": "stringValue", "value": "Click", "defaultValue": "OK" }
        ]
      }
    ]
  },
  "symbols": {
    "MID_BTN": {
      "id": "MID_BTN", "name": "MyButton",
      "frame": { "x": 0, "y": 0, "width": 80, "height": 40 },
      "style": { "fills": [], "borders": [], "shadows": [],
                 "corners": {"topLeft":0,"topRight":0,"bottomRight":0,"bottomLeft":0},
                 "opacity": 1 },
      "children": [
        {
          "kind": "Text", "id": "LBL", "name": "label", "visible": true,
          "frame": { "x": 0, "y": 10, "width": 80, "height": 20 },
          "content": "OK", "fontFamily": "PingFang SC",
          "fontSize": 14, "fontWeight": 400, "color": "#000000FF",
          "align": "center", "decoration": "none"
        }
      ]
    }
  },
  "assets": {},
  "colorVariables": {}
}
```

- [ ] **Step 2: Write failing test**

```ts
// src/generator/__tests__/index.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { generate } from '../index.js';
import { DocumentSchema } from '../../ir/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, '../../../tests/fixtures/tiny-ir.json'), 'utf8'));

describe('generate', () => {
  it('produces a Frame, a Symbol component, and a tokens file', () => {
    const doc = DocumentSchema.parse(fixture);
    const out = generate(doc);
    expect(Object.keys(out.files).sort()).toEqual([
      'Frame.module.css', 'Frame.tsx',
      'MyButton.module.css', 'MyButton.tsx',
      'tokens.css',
    ].sort());
    expect(out.files['Frame.tsx']).toContain('<MyButton text_LBL="Click" />');
    expect(out.files['MyButton.tsx']).toContain('export function MyButton');
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
npx vitest run src/generator/__tests__/index.test.ts
```

Expected: FAIL on missing module.

- [ ] **Step 4: Implement generator entry**

```ts
// src/generator/index.ts
import type { Document, NodeType, SymbolMaster, OverrideRecord } from '../ir/schema.js';
import { toPascalIdentifier } from './naming.js';
import { emitSymbolMaster } from './symbols.js';
import { emitNodeJsx, emitSymbolInstanceJsx } from './tsx.js';
import { propsForOverrides } from './overrides.js';
import { emitLayoutRules, emitStyleRules } from './css.js';

export interface GenerateResult {
  files: Record<string, string>;
}

function collectAllInstances(node: NodeType, out: Array<Extract<NodeType, {kind:'SymbolInstance'}>>): void {
  if (node.kind === 'SymbolInstance') { out.push(node); return; }
  if (node.kind === 'Group' || node.kind === 'Frame') for (const c of node.children) collectAllInstances(c, out);
}

function overridesByMaster(root: NodeType, symbols: Document['symbols']): Record<string, OverrideRecord[]> {
  const acc: Record<string, OverrideRecord[]> = {};
  const insts: Array<Extract<NodeType,{kind:'SymbolInstance'}>> = [];
  collectAllInstances(root, insts);
  for (const inst of insts) {
    if (!symbols[inst.masterId]) continue;
    (acc[inst.masterId] ||= []).push(...inst.overrides);
  }
  return acc;
}

function rootJsxFor(node: NodeType, masterMap: Record<string, string>): string {
  if (node.kind === 'SymbolInstance') return emitSymbolInstanceJsx(node, masterMap, 'classes');
  if (node.kind === 'Group' || node.kind === 'Frame') {
    const children = node.children.map(c => rootJsxFor(c, masterMap)).filter(Boolean).join('\n      ');
    return `<div className={classes.g_${node.id}}>\n      ${children}\n    </div>`;
  }
  return emitNodeJsx(node, 'classes');
}

function rootCssFor(node: NodeType, lines: string[]): void {
  if (!node.visible) return;
  if (node.kind === 'SymbolInstance') {
    lines.push(`.si_${node.id} {\n  ${emitLayoutRules(node.frame).join(';\n  ')};\n}`);
    return;
  }
  if (node.kind === 'Group' || node.kind === 'Frame') {
    const rules = [...emitLayoutRules(node.frame), ...emitStyleRules(node.style)];
    lines.push(`.g_${node.id} {\n  ${rules.join(';\n  ')};\n}`);
    for (const c of node.children) rootCssFor(c, lines);
    return;
  }
  // Plain leaf nodes handled inside symbol emitter when they appear as masters' children;
  // for root-level leaves we reuse the same emitter logic via a small inline branch:
  const layout = emitLayoutRules(node.frame);
  if (node.kind === 'Text') {
    lines.push(`.t_${node.id} {\n  ${[
      ...layout,
      `color: ${node.color}`,
      `font-family: "${node.fontFamily}"`,
      `font-size: ${node.fontSize}px`,
      `font-weight: ${node.fontWeight}`,
      `text-align: ${node.align}`,
    ].join(';\n  ')};\n}`);
  } else if (node.kind === 'Image') {
    lines.push(`.i_${node.id} {\n  ${layout.join(';\n  ')};\n  object-fit: cover;\n}`);
  } else if (node.kind === 'Shape') {
    lines.push(`.s_${node.id} {\n  ${[...layout, ...emitStyleRules(node.style)].join(';\n  ')};\n}`);
  }
}

function tokensCssFor(doc: Document): string {
  const lines: string[] = [':root {'];
  for (const v of Object.values(doc.colorVariables)) {
    lines.push(`  ${toCssVarName(v.name)}: ${v.color};`);
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

export function generate(doc: Document): GenerateResult {
  const files: Record<string, string> = {};
  const ovMap = overridesByMaster(doc.root, doc.symbols);

  const masterMap: Record<string, string> = {};
  for (const [mid, master] of Object.entries(doc.symbols)) {
    const props = propsForOverrides(ovMap[mid] ?? []);
    const out = emitSymbolMaster(master as SymbolMaster, props);
    masterMap[mid] = out.componentName;
    files[out.tsxPath] = out.tsx;
    files[out.cssPath] = out.css;
  }

  // Asset imports for Image nodes
  const assetImports = Object.keys(doc.assets)
    .map(a => `import asset_${a} from './assets/${a}.png';`)
    .join('\n');

  const rootCss: string[] = [];
  rootCssFor(doc.root, rootCss);
  const rootBody = rootJsxFor(doc.root, masterMap);
  files['Frame.tsx'] = `import React from 'react';
import classes from './Frame.module.css';
${assetImports}
${Object.values(masterMap).map(c => `import { ${c} } from './${c}.js';`).join('\n')}

export function Frame() {
  return (
    ${rootBody}
  );
}
`;
  files['Frame.module.css'] = rootCss.join('\n\n') + '\n';
  files['tokens.css'] = tokensCssFor(doc);
  return { files };
}
```

- [ ] **Step 5: Run test, expect PASS**

```bash
npx vitest run src/generator/__tests__/index.test.ts
```

Expected: 1 passed (with 3 assertions).

- [ ] **Step 6: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/ skills/sketch-to-component/scripts/tests/fixtures/tiny-ir.json
git commit -m "feat(sketch-to-component): top-level generator assembling Frame + Symbols + tokens"
```

---

## Task 14: Asset writer

**Files:**
- Create: `skills/sketch-to-component/scripts/src/assets/write-images.ts`
- Create: `skills/sketch-to-component/scripts/src/assets/__tests__/write-images.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/assets/__tests__/write-images.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeImages } from '../write-images.js';

describe('writeImages', () => {
  it('writes each base64 asset as a png', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sk-'));
    try {
      // 1x1 transparent PNG
      const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=';
      writeImages({ a: { id: 'a', format: 'png', base64: png1x1 } }, dir);
      const data = readFileSync(join(dir, 'a.png'));
      expect(data.length).toBeGreaterThan(50);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/assets/__tests__/write-images.test.ts
```

Expected: FAIL on missing module.

- [ ] **Step 3: Implement asset writer**

```ts
// src/assets/write-images.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Document } from '../ir/schema.js';

export function writeImages(assets: Document['assets'], outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  for (const [id, asset] of Object.entries(assets)) {
    const buf = Buffer.from(asset.base64, 'base64');
    writeFileSync(join(outDir, `${id}.png`), buf);
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/assets/__tests__/write-images.test.ts
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/assets/
git commit -m "feat(sketch-to-component): write base64 image assets to disk"
```

---

## Task 15: MCP extractor client

**Files:**
- Create: `skills/sketch-to-component/scripts/src/extractor/client.ts`
- Create: `skills/sketch-to-component/scripts/src/extractor/__tests__/client.test.ts`

- [ ] **Step 1: Write failing test (mocked fetch)**

```ts
// src/extractor/__tests__/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runCode } from '../client.js';

describe('runCode', () => {
  it('POSTs to /mcp and returns parsed text content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: { content: [{ type: 'text', text: "'{\"hello\":\"world\"}'" }], isError: false },
      }),
    });
    const result = await runCode({ url: 'http://x/mcp', script: 'console.log(1)', title: 't', fetchImpl: fetchMock as any });
    expect(result).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('run_code');
    expect(body.params.arguments.script).toBe('console.log(1)');
  });
  it('throws when the server reports isError', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'boom' }], isError: true } }),
    });
    await expect(runCode({ url: 'http://x/mcp', script: '', title: 't', fetchImpl: fetchMock as any }))
      .rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/extractor/__tests__/client.test.ts
```

Expected: FAIL on missing module.

- [ ] **Step 3: Implement client**

```ts
// src/extractor/client.ts
export interface RunCodeOptions {
  url: string;
  script: string;
  title: string;
  fetchImpl?: typeof fetch;
}

interface McpResponse {
  result?: { content: Array<{ type: string; text: string }>; isError: boolean };
  error?: { message: string };
}

export async function runCode(opts: RunCodeOptions): Promise<unknown> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(opts.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'run_code', arguments: { title: opts.title, script: opts.script } },
    }),
  });
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
  const body = (await res.json()) as McpResponse;
  if (body.error) throw new Error(body.error.message);
  if (!body.result) throw new Error('no result');
  const text = body.result.content[0]?.text ?? '';
  if (body.result.isError) throw new Error(text);
  // SketchMCP wraps console.log output in single quotes; strip and parse JSON.
  const stripped = text.replace(/^'/, '').replace(/'$/, '');
  return JSON.parse(stripped);
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/extractor/__tests__/client.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/extractor/
git commit -m "feat(sketch-to-component): MCP run_code HTTP client with JSON unwrap"
```

---

## Task 16: Extractor script (runs inside Sketch)

**Files:**
- Create: `skills/sketch-to-component/scripts/src/extractor/extract.js`

- [ ] **Step 1: Write the extractor JS body**

This script is embedded as a string and POSTed via `runCode`. It must use only the `sketch` module (no Node APIs). It walks the selected layer, builds the IR, and base64-exports every Image. **No tests** at this step — it can only be exercised end-to-end against a real Sketch. Integration verification happens in Task 20.

```js
// src/extractor/extract.js
// Sent verbatim as the `script` argument to MCP run_code.
// Output: console.log(JSON.stringify({ root, symbols, assets, colorVariables }))
// Then return null. (Single string output via console; in-memory image bytes go through
// a per-image second call — but for this MVP we use base64 read from imageLayer.image.base64,
// which avoids needing the `return … .toNSData()` channel.)
export const EXTRACTOR_JS = `
const sketch = require('sketch');
const doc = sketch.getSelectedDocument();
const sel = doc.selectedLayers.layers;
if (!sel.length) { console.log(JSON.stringify({error:'no selection'})); }
else {
  const root = sel[0];
  const symbols = {};
  const assets = {};
  const colorVariables = {};

  function colorOf(maybeColor) {
    if (!maybeColor) return null;
    if (typeof maybeColor === 'string') return maybeColor.length === 9 ? maybeColor.toUpperCase() : maybeColor;
    return null;
  }
  function recordSwatch(swatch, color) {
    if (!swatch || !swatch.name) return undefined;
    if (!colorVariables[swatch.name]) {
      colorVariables[swatch.name] = {
        name: swatch.name,
        color: color || '#00000000',
      };
    }
    return swatch.name;
  }
  function styleOf(layer) {
    const st = layer.style || {};
    const fills = (st.fills || []).filter(f => f.enabled !== false).map(f => ({
      kind: 'solid',
      color: colorOf(f.color) || '#00000000',
      opacity: 1,
      swatchName: recordSwatch(f.swatch, colorOf(f.color)),
    }));
    const borders = (st.borders || []).filter(b => b.enabled !== false).map(b => ({
      color: colorOf(b.color) || '#00000000',
      width: b.thickness || 1,
      position: (b.position || 'inside'),
      swatchName: recordSwatch(b.swatch, colorOf(b.color)),
    }));
    const shadows = ((st.shadows || []).concat(st.innerShadows || [])).filter(s => s.enabled !== false).map(s => ({
      kind: s.isInnerShadow ? 'inner' : 'outer',
      color: colorOf(s.color) || '#00000000',
      x: s.x || 0, y: s.y || 0, blur: s.blur || 0, spread: s.spread || 0,
      swatchName: recordSwatch(s.swatch, colorOf(s.color)),
    }));
    const c = (st.corners && st.corners.radii) || [0,0,0,0];
    return {
      fills, borders, shadows,
      corners: { topLeft: c[0]||0, topRight: c[1]||0, bottomRight: c[2]||0, bottomLeft: c[3]||0 },
      opacity: (layer.style && layer.style.opacity) != null ? layer.style.opacity : 1,
      sharedStyleName: layer.sharedStyle && layer.sharedStyle.name,
    };
  }
  function frameOf(layer) {
    return { x: layer.frame.x || 0, y: layer.frame.y || 0,
             width: layer.frame.width || 0, height: layer.frame.height || 0 };
  }
  function overrideOf(o) {
    return { path: o.path || '', property: o.property,
             value: o.value, defaultValue: o.defaultValue,
             swatchName: o.swatchValue && o.swatchValue.name };
  }
  function walk(layer) {
    if (!layer) return null;
    const id = layer.id;
    const base = { id, name: layer.name || '', frame: frameOf(layer), visible: !layer.hidden };
    const t = layer.type;
    if (t === 'Text') {
      return Object.assign(base, {
        kind: 'Text',
        content: layer.text || '',
        fontFamily: (layer.style && layer.style.fontFamily) || 'system-ui',
        fontSize: (layer.style && layer.style.fontSize) || 14,
        fontWeight: (layer.style && layer.style.fontWeight) || 400,
        color: colorOf(layer.style && layer.style.textColor) || '#000000FF',
        align: ((layer.style && layer.style.alignment) || 'left'),
        decoration: 'none',
      });
    }
    if (t === 'Image') {
      const assetId = 'img_' + id.replace(/[^A-Za-z0-9]/g,'').slice(0,12);
      try { if (layer.image && layer.image.base64) assets[assetId] = { id: assetId, format: 'png', base64: layer.image.base64 }; } catch (e) {}
      return Object.assign(base, { kind: 'Image', assetId });
    }
    if (t === 'SymbolInstance') {
      const masterId = layer.master && layer.master.id;
      if (masterId && !symbols[masterId]) {
        const m = layer.master;
        symbols[masterId] = {
          id: masterId, name: m.name || '',
          frame: { x: 0, y: 0, width: m.frame.width || 0, height: m.frame.height || 0 },
          style: styleOf(m),
          children: (m.layers || []).map(walk).filter(Boolean),
        };
      }
      return Object.assign(base, {
        kind: 'SymbolInstance', masterId: masterId || 'unknown',
        overrides: (layer.overrides || []).map(overrideOf),
      });
    }
    if (t === 'Group' || t === 'Artboard' || layer.isFrame || layer.isGraphicFrame) {
      return Object.assign(base, {
        kind: (t === 'Group' && !layer.isFrame) ? 'Group' : 'Frame',
        style: styleOf(layer),
        children: (layer.layers || []).map(walk).filter(Boolean),
      });
    }
    if (t === 'ShapePath' || t === 'Shape') {
      return Object.assign(base, { kind: 'Shape', style: styleOf(layer) });
    }
    return null;
  }

  const irRoot = walk(root);
  console.log(JSON.stringify({ root: irRoot, symbols, assets, colorVariables }));
}
`;
```

- [ ] **Step 2: Lint syntax**

```bash
cd skills/sketch-to-component/scripts && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add skills/sketch-to-component/scripts/src/extractor/extract.js
git commit -m "feat(sketch-to-component): in-Sketch extractor producing IR JSON"
```

---

## Task 17: Config loader

**Files:**
- Create: `skills/sketch-to-component/scripts/src/config/load.ts`
- Create: `skills/sketch-to-component/scripts/src/config/__tests__/load.test.ts`
- Create: `skills/sketch-to-component/scripts/tests/fixtures/tiny-config.json`

- [ ] **Step 1: Write the fixture config**

```json
{
  "mcpUrl": "http://localhost:31126/mcp",
  "irDir": "design/sketch-ir",
  "outDir": "src/generated/sketch",
  "frames": [
    { "name": "home", "ir": "home.json" }
  ]
}
```

- [ ] **Step 2: Write failing test**

```ts
// src/config/__tests__/load.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, resolveFrame } from '../load.js';

describe('config loader', () => {
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 's2c-cfg-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('reads config and resolves dirs relative to the config file', () => {
    const cfgPath = join(dir, 'sketch-to-component.config.json');
    writeFileSync(cfgPath, JSON.stringify({
      mcpUrl: 'http://h/mcp', irDir: 'd/ir', outDir: 'd/out',
      frames: [{ name: 'home', ir: 'home.json' }],
    }));
    const cfg = loadConfig(cfgPath);
    expect(cfg.mcpUrl).toBe('http://h/mcp');
    expect(cfg.irDir).toBe(join(dir, 'd/ir'));
    expect(cfg.outDir).toBe(join(dir, 'd/out'));
  });

  it('SKETCH_MCP_URL env overrides config mcpUrl', () => {
    const cfgPath = join(dir, 'c.json');
    writeFileSync(cfgPath, JSON.stringify({
      mcpUrl: 'http://from-file/mcp', irDir: '.', outDir: '.', frames: [],
    }));
    const prev = process.env.SKETCH_MCP_URL;
    process.env.SKETCH_MCP_URL = 'http://from-env/mcp';
    try {
      expect(loadConfig(cfgPath).mcpUrl).toBe('http://from-env/mcp');
    } finally {
      if (prev === undefined) delete process.env.SKETCH_MCP_URL;
      else process.env.SKETCH_MCP_URL = prev;
    }
  });

  it('resolveFrame finds a frame by name', () => {
    const cfgPath = join(dir, 'c.json');
    writeFileSync(cfgPath, JSON.stringify({
      mcpUrl: 'x', irDir: 'ir', outDir: 'out',
      frames: [{ name: 'home', ir: 'home.json' }],
    }));
    const cfg = loadConfig(cfgPath);
    const f = resolveFrame(cfg, 'home');
    expect(f.irPath).toBe(join(dir, 'ir/home.json'));
    expect(f.outPath).toBe(join(dir, 'out/home'));
  });

  it('resolveFrame throws on unknown name with helpful message', () => {
    const cfgPath = join(dir, 'c.json');
    writeFileSync(cfgPath, JSON.stringify({
      mcpUrl: 'x', irDir: 'ir', outDir: 'out',
      frames: [{ name: 'home', ir: 'home.json' }],
    }));
    const cfg = loadConfig(cfgPath);
    expect(() => resolveFrame(cfg, 'nope')).toThrow(/nope.*home/);
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
cd skills/sketch-to-component/scripts && npx vitest run src/config/__tests__/load.test.ts
```

Expected: FAIL on missing module.

- [ ] **Step 4: Implement loader**

```ts
// src/config/load.ts
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

const FrameSchema = z.object({
  name: z.string().min(1),
  ir: z.string().min(1),
});

const ConfigFileSchema = z.object({
  mcpUrl: z.string().url(),
  irDir: z.string().min(1),
  outDir: z.string().min(1),
  frames: z.array(FrameSchema),
});

export interface ResolvedConfig {
  mcpUrl: string;
  irDir: string;
  outDir: string;
  frames: Array<{ name: string; ir: string }>;
}

export interface ResolvedFrame {
  name: string;
  irPath: string;
  outPath: string;
}

export function loadConfig(configPath: string): ResolvedConfig {
  const abs = resolve(configPath);
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  const parsed = ConfigFileSchema.parse(raw);
  const base = dirname(abs);
  const envUrl = process.env.SKETCH_MCP_URL;
  return {
    mcpUrl: envUrl && envUrl.length ? envUrl : parsed.mcpUrl,
    irDir: isAbsolute(parsed.irDir) ? parsed.irDir : join(base, parsed.irDir),
    outDir: isAbsolute(parsed.outDir) ? parsed.outDir : join(base, parsed.outDir),
    frames: parsed.frames,
  };
}

export function resolveFrame(cfg: ResolvedConfig, name: string): ResolvedFrame {
  const frame = cfg.frames.find(f => f.name === name);
  if (!frame) {
    const known = cfg.frames.map(f => f.name).join(', ') || '(none)';
    throw new Error(`Frame "${name}" not found in config. Known frames: ${known}`);
  }
  return {
    name: frame.name,
    irPath: join(cfg.irDir, frame.ir),
    outPath: join(cfg.outDir, frame.name),
  };
}
```

- [ ] **Step 5: Run test, expect PASS**

```bash
npx vitest run src/config/__tests__/load.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add -A skills/sketch-to-component/scripts/src/config skills/sketch-to-component/scripts/tests/fixtures/tiny-config.json
git commit -m "feat(sketch-to-component): config loader (file + SKETCH_MCP_URL env)"
```

---

## Task 18: CLI entry (sync / build / extract / generate)

**Files:**
- Create: `skills/sketch-to-component/scripts/src/cli.ts`
- Modify: `skills/sketch-to-component/scripts/package.json`

- [ ] **Step 1: Implement CLI**

```ts
// src/cli.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { DocumentSchema } from './ir/schema.js';
import { generate } from './generator/index.js';
import { writeImages } from './assets/write-images.js';
import { runCode } from './extractor/client.js';
import { EXTRACTOR_JS } from './extractor/extract.js';
import { loadConfig, resolveFrame } from './config/load.js';

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function extractToFile(irOutPath: string, url: string): Promise<void> {
  const ir = await runCode({ url, script: EXTRACTOR_JS, title: 'extract-selected-frame' });
  if ((ir as { error?: string }).error) throw new Error((ir as { error: string }).error);
  const validated = DocumentSchema.parse(ir);
  mkdirSync(dirname(irOutPath), { recursive: true });
  writeFileSync(irOutPath, JSON.stringify(validated, null, 2));
  console.log(`IR written: ${irOutPath}`);
}

function generateFromIr(irPath: string, outDir: string): void {
  const ir = DocumentSchema.parse(JSON.parse(readFileSync(irPath, 'utf8')));
  const { files } = generate(ir);
  mkdirSync(outDir, { recursive: true });
  for (const [p, content] of Object.entries(files)) {
    writeFileSync(join(outDir, p), content);
  }
  writeImages(ir.assets, join(outDir, 'assets'));
  console.log(`Wrote ${Object.keys(files).length} files + ${Object.keys(ir.assets).length} assets → ${outDir}`);
}

const USAGE = `Usage:
  cli sync     --name <frame> --config <path>     # designer: extract → write IR → generate
  cli build    --name <frame> --config <path>     # developer: read committed IR → generate
  cli extract  --out <path> [--url <mcpUrl>]      # low-level: extract only
  cli generate --ir <path> --out <dir>            # low-level: generate only`;

const cmd = process.argv[2];
(async () => {
  if (cmd === 'sync') {
    const cfg = loadConfig(arg('--config', './sketch-to-component.config.json')!);
    const frame = resolveFrame(cfg, arg('--name')!);
    await extractToFile(frame.irPath, cfg.mcpUrl);
    generateFromIr(frame.irPath, frame.outPath);
  } else if (cmd === 'build') {
    const cfg = loadConfig(arg('--config', './sketch-to-component.config.json')!);
    const frame = resolveFrame(cfg, arg('--name')!);
    generateFromIr(frame.irPath, frame.outPath);
  } else if (cmd === 'extract') {
    await extractToFile(resolve(arg('--out', './ir.json')!), arg('--url', 'http://localhost:31126/mcp')!);
  } else if (cmd === 'generate') {
    generateFromIr(resolve(arg('--ir', './ir.json')!), resolve(arg('--out', './out')!));
  } else {
    console.error(USAGE);
    process.exit(2);
  }
})().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Update package.json scripts**

Replace the `scripts` section with:

```json
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "sync": "tsx src/cli.ts sync",
    "build": "tsx src/cli.ts build",
    "extract": "tsx src/cli.ts extract",
    "generate": "tsx src/cli.ts generate"
  },
```

- [ ] **Step 3: Sanity-typecheck**

```bash
cd skills/sketch-to-component/scripts && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke-test the `generate` path with the tiny fixture**

```bash
rm -rf /tmp/s2c-out && npm run generate -- --ir tests/fixtures/tiny-ir.json --out /tmp/s2c-out && ls /tmp/s2c-out
```

Expected output (alphabetical):
```
Frame.module.css  Frame.tsx  MyButton.module.css  MyButton.tsx  assets  tokens.css
```

- [ ] **Step 5: Smoke-test the `build` path with a temporary config**

```bash
mkdir -p /tmp/s2c-proj/design/ir && cp tests/fixtures/tiny-ir.json /tmp/s2c-proj/design/ir/home.json
cat > /tmp/s2c-proj/sketch-to-component.config.json <<'JSON'
{
  "mcpUrl": "http://localhost:31126/mcp",
  "irDir": "design/ir",
  "outDir": "out",
  "frames": [{ "name": "home", "ir": "home.json" }]
}
JSON
npm run build -- --name home --config /tmp/s2c-proj/sketch-to-component.config.json
ls /tmp/s2c-proj/out/home
```

Expected: same six entries listed in Step 4.

- [ ] **Step 6: Commit**

```bash
git add skills/sketch-to-component/scripts/src/cli.ts skills/sketch-to-component/scripts/package.json
git commit -m "feat(sketch-to-component): CLI with sync/build/extract/generate + config-driven flows"
```

---

## Task 19: Full Vitest run

**Files:**
- (none — execution only)

- [ ] **Step 1: Run the entire suite**

```bash
cd skills/sketch-to-component/scripts && npm test
```

Expected: all suites green (schema 8, naming 5, css 6, overrides 5, tsx 6, symbols 1, index 1, write-images 1, extractor client 2, config 4 = 39 passed).

- [ ] **Step 2: If anything fails, fix and re-run, then commit**

```bash
git add -A skills/sketch-to-component/scripts
git commit -m "fix(sketch-to-component): align suites for full green run"
```

(Skip this commit if the suite was already green.)

---

## Task 20: Integration POC against real Sketch document

**Files:**
- Create: `skills/sketch-to-component/scripts/tests/fixtures/frame-ir.json` (written by the run)

**Preconditions:**
- Sketch.app is open with `/Users/blade/Desktop/figma-mcp测试.sketch`
- A Frame is selected (use Page 1's `2.0-1备份 21` Frame)
- MCP responds to the `initialize` probe (see SKILL.md)

- [ ] **Step 1: Extract**

```bash
cd skills/sketch-to-component/scripts && npm run extract -- --out tests/fixtures/frame-ir.json
```

Expected output: `IR written: …/tests/fixtures/frame-ir.json`

- [ ] **Step 2: Generate**

```bash
rm -rf /tmp/s2c-real && npm run generate -- --ir tests/fixtures/frame-ir.json --out /tmp/s2c-real
ls /tmp/s2c-real
```

Expected: at least `Frame.tsx`, `Frame.module.css`, `tokens.css`, `assets/`, and one `.tsx`/`.module.css` pair per unique Symbol Master (9 expected from the fixture inventory).

- [ ] **Step 3: Confirm no parser errors**

```bash
node --check /tmp/s2c-real/Frame.tsx 2>&1 || true
```

Note: `node --check` does NOT understand TSX. Instead use TypeScript:

```bash
cd /tmp && cat > tsconfig.s2c.json <<'JSON'
{ "compilerOptions": { "jsx": "preserve", "target": "ES2022", "module": "ESNext",
  "moduleResolution": "Bundler", "esModuleInterop": true, "skipLibCheck": true,
  "noEmit": true, "allowImportingTsExtensions": false, "isolatedModules": true,
  "types": [] }, "include": ["s2c-real/**/*.tsx"] }
JSON
npx --yes typescript@5.8.3 -p tsconfig.s2c.json
```

Expected: zero errors (or only `Cannot find module 'react'` — acceptable since we did not install react in `/tmp`; the parser shape is the relevant signal).

- [ ] **Step 4: Eyeball one Symbol output**

```bash
ls /tmp/s2c-real/*.tsx | head -3 | xargs head -40
```

Expected: each file begins with `import React from 'react'` and `import classes from './X.module.css'`, then `export interface XProps`, then `export function X(...)`.

- [ ] **Step 5: Commit the fixture for future regression tests**

```bash
cd /Users/blade/IdeaProjects/skill-collections
git add skills/sketch-to-component/scripts/tests/fixtures/frame-ir.json
git commit -m "test(sketch-to-component): commit real-document IR fixture from Page 1 Frame"
```

---

## Task 21: Documentation — workflows & contracts

**Files:**
- Create: `skills/sketch-to-component/workflows/designer-publish-ir.md`
- Create: `skills/sketch-to-component/workflows/developer-build.md`
- Create: `skills/sketch-to-component/workflows/verify-output.md`
- Create: `skills/sketch-to-component/docs/ir-schema.md`
- Create: `skills/sketch-to-component/docs/override-mapping.md`
- Create: `skills/sketch-to-component/docs/deployment.md`
- Create: `skills/sketch-to-component/protocols/mcp-extractor-contract.md`
- Create: `skills/sketch-to-component/protocols/config-schema.md`

- [ ] **Step 1: Write `workflows/designer-publish-ir.md`**

```markdown
# Designer: Publish IR

Audience: the person who has Sketch.app and SketchMCP running.

## One-shot sync (recommended)

1. Open the target document in Sketch.app.
2. Select the Frame you want to publish.
3. From the consumer project root:

   ```bash
   cd path/to/skills/sketch-to-component/scripts
   npm run sync -- --name home --config /path/to/your-project/sketch-to-component.config.json
   ```

   This extracts the selected Frame, writes the IR to `<irDir>/home.json`, and generates the React components into `<outDir>/home/`.

4. Commit both the IR and the generated code:

   ```bash
   cd /path/to/your-project
   git add design/sketch-ir/home.json src/generated/sketch/home
   git commit -m "design(home): publish IR + regenerate components"
   ```

## Troubleshooting

- `no selection` — click a Frame in Sketch and re-run.
- `MCP HTTP 404` / connection refused — verify the MCP probe in SKILL.md Prerequisites.
- `frames not found in config` — list expected frames in `sketch-to-component.config.json`.
```

- [ ] **Step 2: Write `workflows/developer-build.md`**

```markdown
# Developer: Build from Committed IR

Audience: any frontend developer. **No Sketch installation needed.**

1. Pull the latest IR from the repo (`git pull`).
2. From the scripts folder:

   ```bash
   cd path/to/skills/sketch-to-component/scripts
   npm install                         # first time only
   npm run build -- --name home --config /path/to/your-project/sketch-to-component.config.json
   ```

3. The generator reads `<irDir>/home.json` and writes regenerated code to `<outDir>/home/`. If your repo treats generated code as build output (i.e. `outDir` is gitignored), wire `npm run build -- --name <each frame>` into the consumer project's build step.

## When the IR is stale

If a screen looks wrong:
1. Inspect the IR JSON in `design/sketch-ir/` — it is human-readable.
2. If the IR is stale, ask the designer to re-run `npm run sync` and commit the updated IR.
```

- [ ] **Step 3: Write `workflows/verify-output.md`**

```markdown
# Verify Generated Output

Mechanical checks (must pass):

```bash
# Type-check the generated TSX against a stub project
npx --yes typescript@5.8.3 --noEmit --jsx preserve out/*.tsx
```

Visual check (manual):
1. Copy `out/` into a React project (Vite scaffold works: `npm create vite@latest`).
2. Add `import './tokens.css';` to the entry, `import { Frame } from './Frame'` in `App.tsx`.
3. `npm run dev`, open in a browser, compare against the Sketch Frame.

Common discrepancies to expect:
- Fonts may render differently if the Sketch font is not installed in the OS where the browser runs.
- Absolute positioning means responsive resizing is not supported (out of scope).
- Gradient fills are not yet emitted (see Limitations in SKILL.md).
```

- [ ] **Step 4: Write `docs/ir-schema.md`**

```markdown
# IR Schema Reference

Source of truth: `scripts/src/ir/schema.ts`.

## Top-level

```ts
Document = { root: GroupNode; symbols: Record<id, SymbolMaster>;
             assets: Record<id, Asset>; colorVariables: Record<id, ColorVariable> }
```

## Node kinds

- `Text` — `content`, `fontFamily`, `fontSize`, `fontWeight`, `color`, `align`, `decoration`
- `Image` — `assetId` references `Document.assets`
- `Shape` — leaf shape with `style`
- `Group` / `Frame` — container with `children: NodeType[]` and `style`
- `SymbolInstance` — `masterId` references `Document.symbols` + `overrides`

All nodes share `id`, `name`, `frame`, `visible`.

## Color

8-digit hex `#RRGGBBAA`. When sourced from a Color Variable, the original swatch name is preserved on the fill/border/shadow as `swatchName`, and an entry is added to `Document.colorVariables` so the CSS emitter can emit `var(--swatch-…)`.

## Overrides

Each override has `{ path, property, value, defaultValue, swatchName? }`. See `docs/override-mapping.md` for the supported property set.
```

- [ ] **Step 5: Write `docs/override-mapping.md`**

```markdown
# Override → React Prop Mapping

| Sketch override property | React prop type | Notes |
|---|---|---|
| `stringValue` | `text_<slug>?: string` | Text content of a nested layer |
| `textColor` | `textColor_<slug>?: string` | 8-digit hex |
| `textSize` | `textSize_<slug>?: number` | px |
| `textWeight` | `textWeight_<slug>?: number` | 100–900 |
| `isVisible` | `visible_<slug>?: boolean` | |
| `color:fill-N` | `fillN_<slug>?: string` | One per fill index |
| `color:border-N` | `borderN_<slug>?: string` | |
| `color:shadow-N` / `color:innershadow-N` | `shadowN_<slug>?: string` | |
| `fillColor` | `tint_<slug>?: string` | Group tint |
| `symbolID` | (not yet supported — inlined) | Nested symbol swap; deferred |
| `layerStyle` | (not yet supported — inlined) | Shared style swap; deferred |
| `horizontalSizing` / `verticalSizing` | (not emitted) | No Stack layouts in fixture; deferred |

`<slug>` is the last path segment of the override's `path` field. Defaults come from `defaultValue`. At call sites, the generator only emits props whose `value !== defaultValue`.
```

- [ ] **Step 6: Write `docs/deployment.md`**

```markdown
# Deployment Options

The IR JSON is the contract. Pick how it is produced.

## Option A — Designer publishes IR (recommended)

The designer runs `npm run sync` on their Mac (Sketch + SketchMCP local) and commits the IR JSON to the repo. Frontend developers only run `npm run build` — they need Node, not Sketch.

Pros: reviewable via PR, works offline, no live service to operate, IRs are immutable history.
Cons: designer needs to remember to re-sync after design changes.

## Option B — Shared MCP server (advanced)

One designated Mac runs Sketch + SketchMCP, with the port exposed over a private network (Tailscale, WireGuard, mTLS-fronted reverse proxy). Designers point their `SKETCH_MCP_URL` at it.

**Security warning:** SketchMCP's `run_code` tool executes arbitrary ES2020 inside the host Sketch process. Anyone who can reach the URL can read or modify any open Sketch document on that machine. Do not expose it to the public internet. Use Tailscale ACLs or a mTLS-fronted proxy.

Pros: one source of truth for the "live" file.
Cons: the host machine must keep Sketch running and the right file open; no auth in MCP itself.

## Option C — Headless .sketch parsing (not implemented)

A future extractor could parse `.sketch` zip files directly and produce IR without Sketch.app. This eliminates the macOS dependency entirely but loses runtime-resolved data (Override defaults, font metrics, rasterized images). Out of scope for this plan.
```

- [ ] **Step 7: Write `protocols/mcp-extractor-contract.md`**

```markdown
# MCP Extractor Contract

The extractor body lives in `scripts/src/extractor/extract.js` as a single template literal `EXTRACTOR_JS`. It is sent verbatim to the SketchMCP `run_code` tool.

## Inputs

- `sketch.getSelectedDocument()` must return a document.
- `document.selectedLayers.layers[0]` is the root for extraction.

## Output

`console.log(JSON.stringify(Document))` exactly once.

If no selection: `console.log(JSON.stringify({error:'no selection'}))`.

## Wire format

SketchMCP wraps `console.log` output in single quotes inside `result.content[0].text`. The client (`src/extractor/client.ts`) strips the outer quotes before `JSON.parse`.

## Why this lives in JS, not TS

`run_code` runs ES2020 inside Sketch — no Node, no TS, no imports. Keep it dependency-free.
```

- [ ] **Step 8: Write `protocols/config-schema.md`**

```markdown
# Config Schema

`sketch-to-component.config.json` lives at the consumer repo root. Validated by `scripts/src/config/load.ts` (Zod).

| Field | Type | Notes |
|---|---|---|
| `mcpUrl` | `string` (URL) | Default endpoint for `sync`/`extract`. Override per-invocation with `SKETCH_MCP_URL` env var. |
| `irDir` | `string` (path) | Where committed IR JSONs live. Resolved relative to the config file's directory. |
| `outDir` | `string` (path) | Where generated code is written. Each Frame goes into `<outDir>/<frame.name>/`. |
| `frames` | `Array<{ name, ir }>` | Manifest of Frames. `name` is the CLI key (`--name <name>`); `ir` is the file name within `irDir`. |

Example:

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

Adding a new Frame requires three steps: (1) designer adds a `frames` entry; (2) `npm run sync --name <name>`; (3) commit the new IR + generated files.
```

- [ ] **Step 9: Commit**

```bash
git add skills/sketch-to-component/workflows skills/sketch-to-component/docs skills/sketch-to-component/protocols
git commit -m "docs(sketch-to-component): designer/developer workflows, IR/override/deployment/config docs"
```

---

## Self-Review (executor: verify these before declaring done)

1. **Spec coverage** — every Override property in the fixture's histogram is either listed in `docs/override-mapping.md` Supported rows or in the deferred rows; the IR schema has nodes for every type in the fixture histogram (Artboard→Frame, SymbolInstance, Group, ShapePath→Shape, Text, Image, Shape); the no-Sketch-on-developer-machine requirement is met by Task 17 (config loader) + Task 18 `build` command + `workflows/developer-build.md`.
2. **Placeholder scan** — no "TODO", "TBD", "Add appropriate…" in the plan or generated code. Every step has the exact code/command.
3. **Type consistency** — `OverrideRecord`/`PropSpec`/`SymbolFiles`/`Document`/`ResolvedConfig`/`ResolvedFrame` names appear with the same signature in tests and implementation. `masterIdToComponent` parameter is named consistently in `emitSymbolInstanceJsx` and the generator's `masterMap`. `ColorVariableSchema` carries only `{name, color}`; `cssVarName` is derived in the generator via `toCssVarName(name)` — extractor and generator agree on this.
4. **Identifier collisions** — `naming.toPascalIdentifier` appends a short hash for non-ASCII names; two distinct Symbol Masters with identical ASCII tokens get distinct file names because the hash uses `master.id` as the stable salt.
5. **Config/env precedence** — `loadConfig` honors `SKETCH_MCP_URL` over the config file's `mcpUrl`. Tested in Task 17 step 2.

If any of the above fails, fix in-place and re-run the affected task's Vitest target.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-19-sketch-to-component.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task; review between tasks; fast iteration. Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — Execute tasks in this session with checkpoints. Use `superpowers:executing-plans`.

Which approach?
