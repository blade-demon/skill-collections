# image-to-component Regression Tests

These fixtures serve two audiences:

- **Golden demo**: people evaluating the skill can inspect real business screenshots and the expected output shape.
- **Regression checklist**: people editing `SKILL.md`, `../protocols/signature-spec.md`, `../prompts/subagent-prompt.md`, or templates can rerun the cases and verify behavior contracts.

The expected outputs are **behavior contracts**, not byte-for-byte snapshots. Template wording, comments, and formatting may evolve without changing these files. Update expected files only when the intended skill behavior changes.

All input screenshots are real business pages from the ToC financial app.

## Cases

| Case | Images | Skill behavior covered |
|---|---:|---|
| [case-1-risk-assessment](case-1-risk-assessment/) | 1 | Single-page result: nav + card + footer action, props from dynamic quota data |
| [case-2-fund-recommendation](case-2-fund-recommendation/) | 1 | Section-level list: sparkline media, favoriting toggle, variable return period label |
| [case-3-index-fund](case-3-index-fund/) | 1 | Section with tab navigation: nav slot in M, dual-action per row (subscribe + favorite) |

## Coverage Gap

The current cases are all single screenshots → all judged as independent components. The **same-component multi-state judgment** (Step 6 state variant logic) is not yet covered. Add more cases with real multi-state screenshots when available.

## Manual Regression Run

For each case:

1. Trigger the `image-to-component` skill on that case's `input/` directory.
2. Select:
   - Framework: React
   - Output: chat output
   - Language: TypeScript
   - Style stack: CSS Modules
3. Compare generated structured JSON signature returns with `expected-signatures.md`.
4. Compare the result with `expected-output.md` behavior contracts.

Core checks:

- [ ] Structural decision matches expected (same/different component count)
- [ ] Signature return is JSON-only with `batch`, `images`, `signature`, and `notes`
- [ ] Props interface matches the must-contain contract
- [ ] Directory tree file count and naming match expected
- [ ] must-not-contain items are absent from the output

Estimated time: 2–3 minutes per case.
