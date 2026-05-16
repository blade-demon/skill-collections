# Large Directory Workflow

Use this workflow after listing the target directory and before dispatching any signature subagents.

## Trigger

- 0 images: stop and ask for a directory containing screenshots.
- 1-20 images: proceed with normal batching.
- 21-50 images: use staged reading unless the user filters to a smaller subset.
- More than 50 images: never run a flat full-directory pass automatically. Require either a filtered subset or a staged plan confirmed by the user.

## 21-50 Images: Two-Stage Reading

Ask:

```text
The directory contains <N> images. Please choose:
A. Proceed with staged analysis for all <N> images.
B. Provide a filtered subset (list filenames, comma-separated; e.g., pending.png, used.png, expired.png).
C. Cancel.
```

If the user chooses A, run:

| Stage | Scope | Signature depth | Purpose |
|---|---|---|---|
| Stage A | Every image | T/M/B top-level roles only; no container expansion | Build coarse groups cheaply |
| Stage B | Selected images only | Full signature-spec signatures | Resolve ambiguity and support code generation |

Stage B includes only:
- Inconsistent coarse groups.
- Coarse signatures with unclear nested containers.
- Files explicitly requested by the user.
- At least one representative from each stable coarse group that will generate code.

Stage A dispatch uses `coarse-signature-prompt.md` and validates with `protocols/coarse-signature-format.md`. Stage A returns only `T`/`M`/`B` top-level role arrays plus `needs_full_signature`; it must not return full slot expressions.

Do not compare Stage A coarse signatures as final evidence. They only decide which files need full signatures.

## More Than 50 Images

Ask:

```text
The directory contains <N> images, which is too large for automatic full-directory processing.
Please choose:
A. Provide a filtered subset (list filenames, comma-separated; e.g., pending.png, used.png, expired.png).
B. Approve a staged plan: coarse scan all files, then full signatures only for ambiguous groups and selected representatives.
C. Cancel.
```

If the user chooses B, restate the staged plan with expected batch count and wait for confirmation before dispatching.

## Filename Pre-Grouping

For more than 5 selected images, pre-group filenames before batching:

| Rule | Grouping method |
|---|---|
| Filename contains status keyword (`pending`, `used`, `expired`, `active`, `disabled`) | Same candidate state group |
| Filename contains sequence keyword (`page1`, `page2`, `step1`, `step2`) | Same candidate sequence group |
| All other files | Alphabetical fill |

Candidate groups are semantic hints. Read batches are operational units of at most 5 images. If a candidate group exceeds 5 images, split it into multiple read batches but keep one candidate-group label.

## Exit

Exit this workflow with:
- A filtered filename set, or
- A confirmed staged plan, or
- Cancellation.

Then continue to signature dispatch.
