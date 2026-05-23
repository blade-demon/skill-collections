---
name: image-to-component
description: Use when the user points to a directory of UI screenshots or design mockup images and wants structure-first component skeletons, state comparison, prop modeling, or screenshot-derived variants. Use design-source workflows instead when Sketch, Figma, or MasterGo source data is available for high-fidelity styling.
---

# image-to-component

## Overview

Convert a directory of UI screenshots into typed component skeletons. The critical step is **structural comparison first**: multiple screenshots often represent one component in different states, not multiple components.

This is a **screenshot-to-skeleton** workflow. It can infer structure, variants, props, and asset needs from pixels, but screenshots do not reliably contain source-level style data such as design tokens, layer names, component instances, exportable vectors, or layout constraints. For high-fidelity generation from structured design data, route to a design-source workflow — the `sketch-to-component` / `mastergo-to-component` / `figma-to-component` providers (all in development).

**Hard context boundary:** the main agent must never read image files directly. Image reading happens only inside signature subagents, coarse-signature subagents, or optional style-context subagents. If subagent dispatch is unavailable, use `workflows/degraded-mode.md`.

## Routing Map

Load supporting docs only when their trigger applies:

| Area                                         | File                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Project rules init                           | `workflows/init-project-rules.md`                                                   |
| Large directories and two-stage reading      | `workflows/large-directory.md`                                                      |
| Subagent unavailable / unsupported framework | `workflows/degraded-mode.md`                                                        |
| Coarse Stage A protocol                      | `protocols/coarse-signature-format.md`                                              |
| Full signature JSON protocol                 | `protocols/subagent-return-format.md`                                               |
| Optional style hints protocol                | `protocols/style-context-spec.md`                                                   |
| Signature validation redispatch              | `workflows/diagnostic-redispatch.md`                                                |
| Signature summary and JSX tree output        | `workflows/summarize-signatures.md`                                                 |
| Structural comparison                        | `workflows/structural-comparison.md`                                                |
| Manual structural review                     | `workflows/manual-review-exit.md`                                                   |
| Candidate group conflicts                    | `workflows/candidate-group-conflicts.md`                                            |
| Image Connect reuse/extend/create mapping    | `workflows/image-connect.md`                                                        |
| Style Connect token mapping and ledger       | `workflows/style-connect.md`                                                        |
| Style Plan CSS generation input              | `workflows/style-plan.md`                                                           |
| Prop modeling                                | `workflows/prop-modeling.md`                                                        |
| Asset and icon hard rules                    | `workflows/asset-handling.md`                                                       |
| Code generation and templates                | `workflows/code-generation.md` — calls `scripts/generate-skeleton`                  |
| Output and file writing                      | `workflows/output-and-writing.md`                                                   |
| Scripts package                              | `scripts/` — validate-signature, validate-coarse, coverage-table, generate-skeleton |
| Signature coverage table                     | `workflows/coverage-table.md`                                                       |
| Optional render verification                 | `workflows/render-verification.md`                                                  |

Always use `protocols/signature-spec.md` for grammar and role vocabulary. Read `examples/golden-cases.md` when manual review triggers or when comparing 4+ signatures with mixed leaf additions/removals.

## Scripts

Run all commands from `skills/image-to-component/scripts/`. Requires Node.js 20+ and `npm install` once on first use.

| Script                          | Usage                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| Validate full signature batch   | `echo '<json>' \| npm run validate-signature -- --batch batch-1 --expected-files a.png b.png` |
| Validate coarse signature batch | `echo '<json>' \| npm run validate-coarse -- --batch batch-1 --expected-files a.png b.png`    |
| Generate coverage table         | `echo '<json>' \| npm run coverage-table`                                                     |
| Generate component skeleton     | `echo '<json>' \| npm run generate-skeleton`                                                  |

Output format: `validate-*` scripts print `{"valid":true}` or `{"valid":false,"errors":[...]}` and exit non-zero on failure. `coverage-table` prints a markdown table. `generate-skeleton` prints a `[{path,content}]` JSON array.

## Step Skeleton

### Step 0 — Ensure Project Rules

Resolve the target project root. If `.image-to-component.rules.md` is missing, run `workflows/init-project-rules.md`; otherwise read it as the project-convention authority. Do not read images before this completes.

### Step 1 — Gather Context

Confirm framework, output mode, language, style stack, and whether optional style hints are enabled. Recommended defaults are React, chat output, TypeScript, CSS Modules, and style hints disabled. Do not assume missing answers.

If the user has Sketch, Figma, or MasterGo source data and asks for accurate styling, pause and route to the design-source pipeline instead of continuing with screenshot inference. Continue here only when the available input is screenshots/images or when the user explicitly wants a lower-fidelity skeleton.

### Step 2 — Capture User Intent

Record any user-declared relationship among images: same component states, different components, or sequenced flow steps. Use the declaration as input to structural comparison, subject to conflict checks.

### Step 3 — List Files And Plan Batches

Run `ls <directory>` or equivalent. Use `workflows/large-directory.md` for image-count handling, filename pre-grouping, Stage A coarse scans, and Stage B full-signature selection.

### Step 4 — Dispatch Subagents

For Stage A large-directory scans, dispatch `prompts/coarse-signature-prompt.md` and validate with `protocols/coarse-signature-format.md`.

For every full-signature batch, dispatch `prompts/subagent-prompt.md` and validate with `protocols/subagent-return-format.md`. Assign stable batch ids and place them inside the dispatcher-instructions fence.

If style hints were enabled, dispatch `prompts/style-context-prompt.md` over the same batches and validate with `protocols/style-context-spec.md`. Style hints must remain separate from structural signatures.

If subagent dispatch is unavailable, run `workflows/degraded-mode.md`.

### Step 5 — Validate And Summarize Signatures

> **Script:** After receiving subagent JSON, run validation from `skills/image-to-component/scripts/`:
>
> ```bash
> echo '<subagent return JSON>' | npm run validate-signature -- --batch batch-1 --expected-files file1.png file2.png
> ```
>
> A non-zero exit means validation failed; the printed `errors` array describes what to fix. For Stage A coarse batches, use `npm run validate-coarse` instead.

Validate all subagent JSON before comparison. On first validation failure, run `workflows/diagnostic-redispatch.md`; never resend an unchanged prompt. On second failure, ask for corrected JSON, skip the batch, or stop.

Before Step 6, run `workflows/summarize-signatures.md` to output a natural-language structure summary and mechanical JSX component tree for each image. Do not show raw signature JSON unless debugging validation. Do not add visual information the signature does not carry.

### Step 6 — Compare Structures

Run `workflows/structural-comparison.md`. Use `workflows/manual-review-exit.md` for ambiguous structural variants and `workflows/candidate-group-conflicts.md` for conflicting multi-image groups.

### Step 7 — Image Connect

Run `workflows/image-connect.md`. Output the reuse/extend/create candidate table and wait for user confirmation before prop modeling.

### Step 8 — Style Connect (Optional)

Only run this step if style hints were enabled in Step 1. Run `workflows/style-connect.md`. Output the token-ledger table and wait for user confirmation of token mappings before code generation. If style hints were not enabled, skip to Step 9.

After token decisions are confirmed, run `workflows/style-plan.md` to create the `SkeletonConfig.stylePlan` object. The generator consumes `stylePlan` to write CSS module or BEM CSS files. If style hints were skipped, omit `stylePlan`.

### Step 9 — Define Props

Run `workflows/prop-modeling.md`, then `workflows/asset-handling.md` for every `media` node or unknown icon.

### Step 10 — Generate Code Skeleton

Run `workflows/code-generation.md` to build a `SkeletonConfig` JSON object from the component tree and prop definitions established in Step 9, plus `stylePlan` from Step 8 when available. Then run:

```bash
echo '<SkeletonConfig JSON>' | npm run generate-skeleton
```

The output is a `[{path, content}]` JSON array. Use this array as the file list in Step 11. Do not read `templates/` — those files have been removed.

### Step 11 — Output Or Write Files

> **Script:** Build a `CoverageInput` JSON object (entries with signaturePath, files, components, status, optional note), then run:
>
> ```bash
> echo '<CoverageInput JSON>' | npm run coverage-table
> ```
>
> Paste the output markdown directly into the response.

Run `workflows/output-and-writing.md`. Always output a directory tree first, include `workflows/coverage-table.md`, include `asset-ledger.md` when pending assets exist, and include `token-ledger.md` when pending token decisions exist.

### Step 12 — Optional Render Verification

Only in write-file mode, run `workflows/render-verification.md` when a Storybook or safe Vite preview route exists and the user did not ask to skip verification.

## Common Mistakes

| Mistake                                        | Fix                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Promise high-fidelity styling from screenshots | Explain the screenshot limitation and route to a design-source workflow when source data exists |
| Skip `.image-to-component.rules.md`            | Run init first when missing                                                                     |
| Parse free-text signatures                     | Require JSON from `protocols/subagent-return-format.md`                                         |
| Treat Stage A coarse signatures as final       | Use them only to select Stage B files                                                           |
| Re-dispatch the same bad prompt                | Diagnose with `workflows/diagnostic-redispatch.md`                                              |
| Skip structural comparison                     | Run `workflows/structural-comparison.md` before props/code                                      |
| Create files without being asked               | Default to chat output                                                                          |
| Main agent reads images                        | Dispatch subagents or use degraded-mode menu                                                    |
| Let style hints alter structure                | Keep `style_hints` separate                                                                     |
| Invent icon names from screenshots             | Use `workflows/asset-handling.md` and asset ledger                                              |
| Add new icon packages                          | Obey `.image-to-component.rules.md`; default is only `@iconify/react`                           |
| Split props into status-specific objects       | Keep flat discriminator props                                                                   |
| Mix TS syntax in JS output                     | Match the selected language                                                                     |
| Hardcode style values without ledger           | Use `workflows/style-connect.md` and token-ledger when style hints enabled                      |
| Invent new tokens without user approval        | Require Style Connect decision-gate before code generation                                      |
| Skip style-connect gate and guess tokens       | Run `workflows/style-connect.md` and wait for confirmation A/B/C                                |
