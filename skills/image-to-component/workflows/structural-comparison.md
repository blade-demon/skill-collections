# Structural Comparison Workflow

Use this after all retained signature batches validate.

## Inputs

- Validated signature JSON objects from `protocols/subagent-return-format.md`.
- Step 2 user intent declaration, if any.
- Candidate groups from filename pre-grouping or Stage A large-directory grouping.

## Mechanical Rules

Structural skeleton = drop leaf roles, keep container roles and topology. Example: `title -> list(card(title -> meta))` becomes `_ -> list(card(_ -> _))`.

First strip `O` and compare only `T`, `M`, `B`, and `F` for base component identity:

| Condition                                                                        | Decision                 |
| -------------------------------------------------------------------------------- | ------------------------ |
| Structural skeletons are identical, or differ only by allowed leaf changes below | Candidate same component |
| Any container role or topology differs                                           | Different component      |
| Total role count differs by more than 50%                                        | Different component      |

For candidate same components:

| Difference                                     | Classification                                  |
| ---------------------------------------------- | ----------------------------------------------- |
| Leaf role swap, such as `hint` to `status`     | State variant                                   |
| Leaf `?` appears                               | State variant, uncertain                        |
| Leaf added/removed and total count change <= 1 | State variant                                   |
| One slot's leaf-only content is fully replaced | State variant                                   |
| Leaf nodes added/removed in 2+ distinct slots  | Structural variant; run `manual-review-exit.md` |
| Repetition count inside a container changes    | State variant, data-driven                      |

Overlay handling:

- Compare the base layer with `O` stripped.
- Aggregate `O` slots separately into overlay candidates.
- Different `overlay_type` means different overlay components.

F-slot appearing/disappearing is a state variant and does not decide component identity by itself.

## Declaration Conflict Check

If the user declared a relationship in Step 2, treat it as the default decision, but compare it with the mechanical result:

| Declaration              | Mechanical result   | Action                                                                    |
| ------------------------ | ------------------- | ------------------------------------------------------------------------- |
| Same component, N states | Same component      | Apply declaration and continue                                            |
| Same component, N states | Different component | Pause and ask force-merge, accept split, or restart with corrected images |
| Different components     | Same component      | Apply declaration; semantic intent wins                                   |
| Sequenced flow           | Same/manual review  | Use `step` or `phase` discriminator                                       |

## Exits

- Same component / state variants: continue to Image Connect, then prop modeling.
- Different components: run later steps separately per component/group.
- Structural variant: run `manual-review-exit.md`.
- Candidate group conflict: run `candidate-group-conflicts.md`.
