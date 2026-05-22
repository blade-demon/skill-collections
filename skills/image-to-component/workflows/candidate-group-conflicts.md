# Candidate Group Conflicts

Use this workflow after all signatures have been collected. Do not run it during filename pre-grouping.

## Trigger

A conflict exists when:

- Two or more candidate groups have different structural skeletons, and
- Each conflicting candidate group contains more than 1 image.

A single isolated image is not a conflict. Match a single image to the closest candidate group by structural skeleton. If no group matches, treat it as an independent component candidate.

## Required Prompt

```text
Merging found multiple candidate groups with different structural skeletons; cannot auto-merge.

Candidate group 1 (N images): <filename list>  Structural skeleton: <skeleton signature>
Candidate group 2 (N images): <filename list>  Structural skeleton: <skeleton signature>

Please choose:
A. Split by component, generate independent code skeletons for each
B. Treat as a state set of the same component, force merge
C. Process only a specified subset of files. List filenames directly,
   e.g.: pending.png, used.png, expired.png
   The model will restart from file listing and only process these files.
```

## Outcomes

| User choice | Action                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| A           | Run prop modeling and code generation separately for each candidate group |
| B           | Merge all signatures, model all differences as props/status, and continue |
| C           | Restart file-list handling with only the user-listed filenames            |

## Guardrails

- Do not silently merge conflicting multi-image groups.
- Do not discard a group without explicit user choice.
- Do not re-read images unless the selected outcome requires a restarted subset.
