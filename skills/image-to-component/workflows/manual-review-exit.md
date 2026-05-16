# Manual Review Exit

Use this workflow when mechanical comparison returns "structural variant (manual review)".

## Trigger

Trigger when structural skeletons are identical but leaf-node differences are too ambiguous to classify automatically, especially:
- Leaf nodes added or removed in 2 or more distinct slots.
- Mixed replacement/addition/removal patterns across 4 or more signatures.
- Business meaning cannot be inferred from signature roles alone.

## Required Prompt

Show the differing slot signatures and difference locations before asking for a decision:

```text
Structural skeletons are identical, but there are 2+ leaf-node differences; cannot decide mechanically.

Signature comparison:
Image 1  M: <image 1 M slot signature>
         B: <image 1 B slot signature>

Image 2  M: <image 2 M slot signature>
         B: <image 2 B slot signature>

Difference locations: <list specific locations and counts>

Please choose:
A. Different states of the same component (express differences via props)
B. Different components, structure is coincidentally similar (generate independent code skeletons)
C. Sequential steps of one flow that happen to share structure (generate a single component with a step/phase prop)
```

Do not replace this with a vague uncertainty statement.

## Outcomes

| User choice | Action |
|---|---|
| A | Record `user confirmed: same component`; continue to prop modeling and map differences to props/status |
| B | Record `user confirmed: different components, coincidentally similar structure`; run prop modeling and code generation separately for each image/component |
| C | Record `user confirmed: sequential flow steps`; use `step` or `phase` discriminator and model per-step differences under that discriminator |

## Notes

Identical structural skeletons do not prove semantic sameness. Several unrelated pages can share `T: nav, M: list(form), B: action`, and wizard steps can share layout while representing different phases.

Read `examples/golden-cases.md` when this workflow triggers or when comparing 4+ signatures with mixed leaf-node changes.
