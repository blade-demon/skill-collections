/**
 * Stage 6 — target-agnostic codegen contract.
 *
 * A `TargetGenerator` turns a (presentational, v1) component-plan plus its
 * upstream semantic-view / interaction-spec into an in-memory file plan. Pure:
 * no IO, no clock, no randomness. The CLI (6-PR-3) owns writing files to disk
 * (plan docs/stages/stage-6-codegen-plan.md §3.1).
 */
import type { ComponentPlan } from '../contract/component-plan-schema';
import type { InteractionSpec } from '../contract/interaction-schema';
import type { SemanticView, VisualView } from '../ir/views';

/** One generated file; `path` is relative to the package root, POSIX-style. */
export interface CodegenFile {
  path: string;
  content: string;
}

/**
 * One binary asset to copy into the generated package. The pure generator emits
 * these as data only (no bytes, no IO); the CLI resolves `sourceFileName` inside
 * its `--assets` dir and copies bytes to `outputPath`. See
 * docs/superpowers/plans/2026-06-06-react-codegen-asset-pipeline.md.
 */
export interface CodegenAssetFile {
  /** Stable id of the visual asset (equals the media node's `assetRef`). */
  assetRef: string;
  /** Source file name inside the extract `--assets` dir (basename, case kept). */
  sourceFileName: string;
  /** Package-relative destination, e.g. `src/assets/asset-<hash>.png`. */
  outputPath: string;
  /** OR of `required` across every planned node that reuses this asset. */
  required: boolean;
}

export interface CodegenFilePlan {
  /** Sorted by `path`, with unique paths. */
  files: CodegenFile[];
  /** Sorted by `outputPath`, with one entry per unique `assetRef`. */
  assets: CodegenAssetFile[];
  warnings: string[];
}

export interface CodegenInput {
  componentPlan: ComponentPlan;
  visualView: VisualView;
  semanticView: SemanticView;
  interactionSpec: InteractionSpec;
}

export interface TargetGenerator {
  /** Matches `component-plan.body.target.framework`. */
  readonly framework: string;
  generate(input: CodegenInput): CodegenFilePlan;
}
