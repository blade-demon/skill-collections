# Codegen Visual Harness Design

## Context

Stage 6 already has a React codegen golden package under
`fixtures/apps/react-vite/src/golden`. The existing golden test proves that the
same approved `design-spec/` produces the same committed files byte for byte.
That is a deterministic output check, not a visual fidelity check.

The current fixture app renders the generated package inside an app shell. That
is useful for manual visibility, but it also introduces host CSS, spacing, and
page chrome. A visual harness needs to isolate the generated component from that
shell so visual differences can be attributed to codegen or preview behavior,
not the demo wrapper.

## Goal

Build the first visual harness slice for the existing `codegen-golden`
synthetic fixture. The harness should generate a side-by-side review artifact
that compares:

- baseline: `design-ir` rendered through the preview renderer;
- candidate: the generated React output rendered in a neutral React mount.

The first slice should also add stable DOM, layout, and computed-style checks.
Strict pixel diffing is intentionally out of scope for this slice.

## Non-Goals

- Do not compare against a real Sketch design yet.
- Do not commit screenshot golden images in the first slice.
- Do not introduce pixel-diff thresholds or baseline image update workflow yet.
- Do not reuse the existing `fixtures/apps/react-vite` display shell as the
  comparison environment.

## Architecture

The harness has three boundaries:

1. `fixture input`
   - Uses the committed `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden`
     fixture.
   - Treats its `design-ir.json` and approved `design-spec/` files as the single
     source for both comparison branches.

2. `render targets`
   - Baseline branch: generate isolated preview HTML/CSS from the same
     `design-ir`.
   - Candidate branch: render the generated React package in a neutral mount
     with no app-level layout or typography inheritance.

3. `review artifact and assertions`
   - Emits a local side-by-side page and screenshots for human review.
   - Captures machine-readable metrics for root bounds, key node bounds, and
     computed styles.
   - Fails tests on deterministic layout/style drift before adding pixel diff.

## Components

### Harness Fixture Loader

Loads the existing `codegen-golden` input files and produces a normalized
fixture descriptor for the harness. The descriptor should include the fixture
name, the design IR path, the approved design-spec paths, and expected key node
IDs used by assertions.

### Baseline Renderer

Uses the existing preview rendering path to produce an isolated baseline. The
baseline should not depend on the fixture React app.

### Candidate Renderer

Builds or serves a neutral React page that mounts the generated package. The
neutral page must avoid inherited host styles that can change generated output,
especially global `text-align`, font, margin, and box sizing.

### Capture Runner

Runs both render targets in a browser, captures screenshots, and reads DOM
metrics from the rendered pages. The first implementation should prefer stable
DOM/style assertions over pixel-level comparison.

### Review Artifact Writer

Writes a local artifact directory containing:

- baseline screenshot;
- candidate screenshot;
- side-by-side HTML review page;
- JSON metrics for both branches;
- a small summary of assertion results.

The artifact directory should be generated during local validation and should
not be committed as part of the first slice.

## Data Flow

1. Load `codegen-golden/design-ir.json` and `codegen-golden/design-spec/`.
2. Generate the baseline preview from `design-ir`.
3. Generate or import the candidate React package from the approved design-spec.
4. Render both outputs in neutral browser pages.
5. Capture screenshots and metrics.
6. Write local review artifacts.
7. Assert root bounds, key node bounds, and selected computed styles.

## Assertions

The first slice should check:

- root width and height match the visual root;
- root bounds are stable in the neutral page;
- key text and CTA node positions match their parent-relative layout;
- generated text nodes do not inherit unintended host `text-align`;
- core visual styles are present where expected: background, border, radius,
  shadow, text color, font size, and font weight.

These assertions are intended to catch regressions like host CSS pollution,
missing root sizing, and incorrect nested offsets.

## Error Handling

Harness failures should identify which branch failed:

- fixture loading errors name the missing or invalid file;
- baseline render errors name the preview artifact or renderer failure;
- candidate render errors name the React build or browser render failure;
- assertion failures report the node ID, property, expected value, and actual
  value.

Browser or dev-server startup failures should be reported as environment
failures, not as visual mismatches.

## Testing Strategy

The first implementation should follow a red-green path:

1. Add a focused failing test or script assertion that exposes a known visual
   isolation problem, such as inherited `text-align`.
2. Implement the neutral candidate render path and metrics capture.
3. Add the side-by-side artifact writer.
4. Run the focused harness check, `npm run check:fixtures`, and the relevant
   D2C or Sketch test gate touched by the implementation.

Before claiming the slice complete, run the repo-appropriate verification gate
for the touched packages. If the implementation changes shared codegen or
preview behavior, run `npm run check:full`.

## Follow-Up: Pixel Diff

After the neutral harness is stable, a second slice can add pixel diffing. That
slice should define:

- where baseline images live;
- how baseline updates are approved;
- viewport, font, and browser version controls;
- acceptable thresholds;
- CI behavior for generated visual artifacts.

Keeping pixel diff out of the first slice lets the team validate the comparison
environment before committing to image baseline governance.
