# Degraded Mode Workflow

Use degraded mode only when the normal image-to-component path cannot produce runnable code for the selected target.

## Triggers

- User selects "other framework".
- Subagent dispatch is unavailable and the user does not allow the main agent to read images.
- Required project context for safe file writing is missing and the user chooses chat-only structural output.

## Subagent Unavailable Menu

If signature subagents cannot be dispatched, do not read images from the main agent unless the user explicitly allows it. Ask:

```text
Subagent dispatch is unavailable in this environment, so the main agent cannot read images while preserving the structure-only boundary. Please choose:

A. Provide structured signatures manually - I will paste JSON following protocols/subagent-return-format.md; the skill resumes at signature validation.
B. Allow the main agent to read images this run - accepts the trade-off that the structure-only boundary will be relaxed for this invocation only.
C. Cancel the skill - exit cleanly with no output.
```

## Other Framework Output

When the user chooses an unsupported framework:
- Do not generate React or Vue code.
- Output the Step 9 directory tree as a structural suggestion only.
- Output component trees derived from signatures.
- State that runnable code generation is unsupported for the chosen framework.
- Suggest hand-migrating the structure into the target framework.

## Manual Signatures

If the user provides structured signatures manually:
- Validate them using the same signature validation rules.
- On failure, show exact errors and ask for corrected JSON, skip, or stop.
- On success, resume structural comparison.

## Exit

Exit degraded mode when:
- Valid signatures are available and comparison can resume.
- The user allowed a one-run boundary relaxation.
- The user cancels.
