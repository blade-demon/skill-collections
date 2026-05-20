# mastergo-to-component Provider Architecture

## Scope

`mastergo-to-component` is the MasterGo provider adapter for the shared design-source pipeline.

The authoritative D2C contract is [`../../../docs/design-source-to-component-architecture.md`](../../../docs/design-source-to-component-architecture.md). This provider document must not redefine:

- the canonical IR identity or schema location;
- preview, IR, or package output directories;
- review gate count or gate semantics;
- barrel export structure;
- target stack output shape.

Provider implementation must feed the global contract:

```text
MasterGo URL
-> MasterGo provider extractor
-> output/ir/raw-dsl.json
-> output/ir/design-ir.json
-> shared preview, contract, and target-package pipeline
```

The first reference design remains:

```text
https://mastergo.com/file/192813714739577?fileOpenFrom=home&page_id=M&devMode=true&layer_id=2%3A0031
```

For this reference, `layer_id=2:0031` has previously represented the root page `财资小助手对话页`.

## Provider Responsibilities

The MasterGo provider owns only provider-specific work:

| Responsibility | Provider rule |
|---|---|
| URL parsing | Parse `https://mastergo.com/file/{fileId}` and decode URL-encoded `layer_id` values such as `2%3A0031` into `2:0031`. |
| Authentication | Read `MASTERGO_TOKEN` from the shell environment and never print the token value. |
| DSL fetch | Request MasterGo DSL for the resolved `fileId` and `layerId`. |
| Raw preservation | Save provider data as `output/ir/raw-dsl.json` when running the full pipeline. |
| Source trace | Preserve source ids, source names, node types, file id, page id, and layer id under the canonical IR `source` or trace records. |
| Asset export | Export or record MasterGo images, SVGs, icons, masks, and unresolved asset placeholders. |
| Reference frame | Export a provider-rendered frame or layer image for screenshot diff when MasterGo supports it. |
| Normalization | Convert MasterGo-specific nodes into the canonical `output/ir/design-ir.json` target described by the global architecture. |
| Warnings | Emit warnings for lossy conversion, unsupported node types, missing assets, low-confidence semantic candidates, and skipped screenshot diff. |

All provider-specific fields must remain isolated under `source` metadata or trace records. Downstream preview and target code generation must consume canonical IR views and contracts, not raw MasterGo DSL.

## Non-Goals

- Do not define a MasterGo-only IR file.
- Do not define a MasterGo-only output tree.
- Do not define a separate preview approval flow.
- Do not define a separate React package layout or barrel export contract.
- Do not generate target code before both global gates pass.
- Do not treat annotations as mandatory; zero-annotation runs must degrade through global semantic fallback rules.

## Runtime Modules

When implemented, the provider package should keep provider-specific modules separate from shared D2C stages:

```text
scripts/src/
  cli.ts
  parse-url.ts
  fetch-dsl.ts
  export-assets.ts
  export-reference-frame.ts
  normalize-design-ir.ts
  write-provider-artifacts.ts
  types.ts
```

| Module | Responsibility |
|---|---|
| `parse-url.ts` | Extract `fileId`, `pageId` when available, and decoded `layerId`. |
| `fetch-dsl.ts` | Read `MASTERGO_TOKEN` safely and fetch MasterGo raw DSL. |
| `export-assets.ts` | Export or ledger image, SVG, icon, mask, and placeholder assets. |
| `export-reference-frame.ts` | Export the reference frame/layer image used by screenshot diff. |
| `normalize-design-ir.ts` | Convert MasterGo raw DSL into the canonical `output/ir/design-ir.json` shape. |
| `write-provider-artifacts.ts` | Write `raw-dsl.json`, provider traces, assets, and reference-frame artifacts without overwriting unless explicitly requested. |
| `types.ts` | Define MasterGo raw adapter types and provider trace helpers only. Canonical IR types belong to the shared pipeline. |
| `cli.ts` | Expose provider entrypoints that hand off to the shared preview, contract, and package generation pipeline. |

## Execution Flow

### Step 1: Validate URL

Input example:

```bash
npm run extract -- --url "<mastergo-url>" --out output
```

Required behavior:

- Accept MasterGo file URLs.
- Accept `/goto/` links only after a resolver exists.
- Decode `layer_id`.
- Stop with a clear error when `layer_id` is missing or cannot be resolved.

### Step 2: Check Token Safely

Required behavior:

- Check whether `MASTERGO_TOKEN` exists before any network call.
- Never print the token value.
- Surface missing token as a fatal provider extraction failure.

Safe check:

```bash
test -n "$MASTERGO_TOKEN" && echo "Token is set" || echo "Token is NOT set"
```

### Step 3: Fetch MasterGo Raw DSL

Required behavior:

- Request the MasterGo DSL for the resolved `fileId` and `layerId`.
- Send the token through the expected MasterGo authentication header.
- Preserve the raw response in `output/ir/raw-dsl.json` for traceability when running the full pipeline.
- Distinguish missing token, permission denied, invalid token, network failure, URL parse failure, empty frame, and unsupported node families.

### Step 4: Export Assets And Reference Frame

Required behavior:

- Export images, SVGs, icons, and other resources when the MasterGo API exposes binary or vector content.
- If binary export is not available, create asset ledger entries and placeholders through the global output rules.
- Export a provider-rendered frame or layer image for screenshot diff when possible.
- If the reference image cannot be exported, continue with a warning as defined by the global Screenshot Diff Reference section.

### Step 5: Normalize To Canonical Design IR

Required behavior:

- Write `output/ir/design-ir.json` with `schemaVersion` matching the global architecture.
- Preserve every useful source node id and source node name.
- Keep provider-specific details under source metadata or trace records.
- Convert MasterGo node types into canonical visual and semantic fields.
- Record low-confidence semantic candidates rather than silently approving them.
- Emit warnings for lossy or unsupported transformations.

For `layer_id=2:0031`, the provider should avoid treating the whole page as one anonymous component. It should preserve enough source and layout information for the shared semantic mapper to propose meaningful regions such as page shell, navigation, conversation area, cards, action rows, and input area.

## MasterGo Normalization Guidance

MasterGo DSL may contain low-level design concepts such as:

```text
FRAME
INSTANCE
GROUP
LAYER
PATH
SVG_ELLIPSE
TEXT
layout
style
children
```

Provider normalization should:

- collapse wrappers that have no visual or semantic value;
- preserve wrappers that affect layout, clipping, mask, or z-order;
- extract text nodes even when text is split across nested groups;
- preserve layout and style data needed by the Visual View;
- record component-instance information when present;
- preserve repeated groups for later semantic inference;
- map unsupported paths to icon or shape candidates with warnings;
- leave business semantics as candidates, not approved contracts.

## Reference Design Candidate Regions

For the first reference design, candidate regions may include:

```text
StatusBar
TopNavBar
ChatBubble
SuggestionList
HotelRecommendationCard
RoomOptionRow
BottomInputBar
```

These names are hints, not provider-level contract. The final component names, props, states, events, and exports must come from the shared Semantic View, Interaction Spec, and Component Plan, then pass Gate 2.

## Validation Focus

MasterGo provider validation should cover provider-owned behavior:

- URL parsing and `layer_id` decoding.
- Missing token detection without token leakage.
- Raw DSL fixture loading.
- Empty frame detection.
- Source trace preservation.
- Asset and reference-frame warning paths.
- Canonical `schemaVersion` presence.
- Provider-specific data isolation under `source` or trace records.

Do not duplicate shared pipeline tests for output package structure or gate semantics here. Those belong to the shared design-source pipeline.

## Open Questions

1. Whether MasterGo can export a reliable provider-rendered reference image for every target frame.
2. Which MasterGo asset families can be exported automatically versus ledged as placeholders.
3. Whether `/goto/` URL resolution should be provider-owned or shared across connector utilities.
4. Which MasterGo component-instance fields should become provider-neutral concepts after another provider validates the same need.
