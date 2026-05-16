# Diagnostic Redispatch Workflow

Use this workflow before any re-dispatch after the first signature validation failure.

## Trigger

The first returned signature for a batch fails validation.

## Required Diagnosis

Before re-dispatching, the main agent must identify:
- Exact rule violated.
- Exact slot or line.
- Exact invalid token/operator/key when applicable.
- Correction instruction for the subagent.

Never resend the same prompt unchanged.

## Diagnostic Format

```text
Validation diagnosis:
- Rule: <validation rule name>
- Slot/line: <T/M/B/O/F/notes or full line>
- Invalid token: <token/operator/key or "n/a">
- Correction: <specific instruction>
```

## Dispatcher Instruction Fence

Place the correction strictly inside the dispatcher-instructions fence:

```text
===dispatcher-instructions-begin===
Previous signature failed validation.

Validation diagnosis:
- Rule: <validation rule name>
- Slot/line: <T/M/B/O/F/notes or full line>
- Invalid token: <token/operator/key or "n/a">
- Correction: <specific instruction>

Return a corrected JSON object only. Do not explain the screenshot.
===dispatcher-instructions-end===
```

## Examples

| Failure | Correction |
|---|---|
| `overlay` used as a role | Replace `overlay` with an allowed O-slot expression and include `overlay_type` in notes |
| `status(error)` | `status` cannot take parentheses; use bare `status` |
| `card(title -> meta) -> media -> status` suspected as broken card internals and user confirmed internals | Put trailing `media` and `status` inside the `card(...)` container |
| `notes: bg=blue` | Remove visual note keys; notes keys must come from the allowlist |
| Unbalanced `card(title -> meta` | Balance parentheses before returning |

## Second Failure

If the redispatched batch fails again, stop and ask:

```text
Signature validation failed twice for this batch.

Bad return:
<json or raw output>

Validation errors:
<errors>

Please choose:
A. Provide corrected JSON for this batch manually
B. Skip this batch
C. Stop the workflow
```

## Exit

Exit when a corrected valid signature is received, the batch is skipped, or the workflow stops.
