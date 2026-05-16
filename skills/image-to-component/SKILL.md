---
name: image-to-component
description: Use when the user points to a directory of UI screenshots or design mockup images and wants component skeleton code generated. Triggers when images show app screens, pages, or UI states. Generates React, Vue 3, or Vue 2 skeletons with TypeScript or JavaScript using BEM or CSS Modules.
---

# image-to-component

## Overview

Convert a directory of UI screenshots into typed component skeletons. The critical step is **structural comparison first**: multiple screenshots often represent one component in different states, not multiple components.

**Hard context boundary:** the main agent must never read image files directly. Image reading happens only inside signature subagents, coarse-signature subagents, or optional style-context subagents. If subagent dispatch is unavailable, use `workflows/degraded-mode.md`.

## Routing Map

Load supporting docs only when their trigger applies:

| Area | File |
|---|---|
| Project rules init | `workflows/init-project-rules.md` |
| Large directories and two-stage reading | `workflows/large-directory.md` |
| Subagent unavailable / unsupported framework | `workflows/degraded-mode.md` |
| Coarse Stage A protocol | `protocols/coarse-signature-format.md` |
| Full signature JSON protocol | `protocols/subagent-return-format.md` |
| Optional style hints protocol | `protocols/style-context-spec.md` |
| Signature validation redispatch | `workflows/diagnostic-redispatch.md` |
| Signature summary and JSX tree output | `workflows/summarize-signatures.md` |
| Structural comparison | `workflows/structural-comparison.md` |
| Manual structural review | `workflows/manual-review-exit.md` |
| Candidate group conflicts | `workflows/candidate-group-conflicts.md` |
| Image Connect reuse/extend/create mapping | `workflows/image-connect.md` |
| Prop modeling | `workflows/prop-modeling.md` |
| Asset and icon hard rules | `workflows/asset-handling.md` |
| Code generation and templates | `workflows/code-generation.md` |
| Output and file writing | `workflows/output-and-writing.md` |
| Signature coverage table | `workflows/coverage-table.md` |
| Optional render verification | `workflows/render-verification.md` |

Always use `signature-spec.md` for grammar and role vocabulary. Read `examples/golden-cases.md` when manual review triggers or when comparing 4+ signatures with mixed leaf additions/removals.

## Step Skeleton

### Step 0 — Ensure Project Rules

Resolve the target project root. If `.image-to-component.rules.md` is missing, run `workflows/init-project-rules.md`; otherwise read it as the project-convention authority. Do not read images before this completes.

### Step 1 — Gather Context

Confirm framework, output mode, language, style stack, and whether optional style hints are enabled. Recommended defaults are React, chat output, TypeScript, CSS Modules, and style hints disabled. Do not assume missing answers.

### Step 2 — Capture User Intent

Record any user-declared relationship among images: same component states, different components, or sequenced flow steps. Use the declaration as input to structural comparison, subject to conflict checks.

### Step 3 — List Files And Plan Batches

Run `ls <directory>` or equivalent. Use `workflows/large-directory.md` for image-count handling, filename pre-grouping, Stage A coarse scans, and Stage B full-signature selection.

### Step 4 — Dispatch Subagents

For Stage A large-directory scans, dispatch `coarse-signature-prompt.md` and validate with `protocols/coarse-signature-format.md`.

For every full-signature batch, dispatch `subagent-prompt.md` and validate with `protocols/subagent-return-format.md`. Assign stable batch ids and place them inside the dispatcher-instructions fence.

If style hints were enabled, dispatch `style-context-prompt.md` over the same batches and validate with `protocols/style-context-spec.md`. Style hints must remain separate from structural signatures.

If subagent dispatch is unavailable, run `workflows/degraded-mode.md`.

### Step 5 — Validate And Summarize Signatures

Validate all subagent JSON before comparison. On first validation failure, run `workflows/diagnostic-redispatch.md`; never resend an unchanged prompt. On second failure, ask for corrected JSON, skip the batch, or stop.

Before Step 6, run `workflows/summarize-signatures.md` to output a natural-language structure summary and mechanical JSX component tree for each image. Do not show raw signature JSON unless debugging validation. Do not add visual information the signature does not carry.

### Step 6 — Compare Structures

Run `workflows/structural-comparison.md`. Use `workflows/manual-review-exit.md` for ambiguous structural variants and `workflows/candidate-group-conflicts.md` for conflicting multi-image groups.

### Step 6.5 — Image Connect

Run `workflows/image-connect.md`. Output the reuse/extend/create candidate table and wait for user confirmation before prop modeling.

### Step 7 — Define Props

Run `workflows/prop-modeling.md`, then `workflows/asset-handling.md` for every `media` node or unknown icon.

### Step 8 — Generate Code Skeleton

Run `workflows/code-generation.md`. Read exactly one template from `templates/` based on Step 1 choices. Unsupported frameworks use `workflows/degraded-mode.md`.

### Step 9 — Output Or Write Files

Run `workflows/output-and-writing.md`. Always output a directory tree first, include `workflows/coverage-table.md`, and include `asset-ledger.md` when pending assets exist.

### Step 10 — Optional Render Verification

Only in write-file mode, run `workflows/render-verification.md` when a Storybook or safe Vite preview route exists and the user did not ask to skip verification.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Skip `.image-to-component.rules.md` | Run init first when missing |
| Parse free-text signatures | Require JSON from `protocols/subagent-return-format.md` |
| Treat Stage A coarse signatures as final | Use them only to select Stage B files |
| Re-dispatch the same bad prompt | Diagnose with `workflows/diagnostic-redispatch.md` |
| Skip structural comparison | Run `workflows/structural-comparison.md` before props/code |
| Create files without being asked | Default to chat output |
| Main agent reads images | Dispatch subagents or use degraded-mode menu |
| Let style hints alter structure | Keep `style_hints` separate |
| Invent icon names from screenshots | Use `workflows/asset-handling.md` and asset ledger |
| Add new icon packages | Obey `.image-to-component.rules.md`; default is only `@iconify/react` |
| Split props into status-specific objects | Keep flat discriminator props |
| Mix TS syntax in JS output | Match the selected language |
