---
name: skill-reviewer
description: Reviews SKILL.md files for format compliance, clear triggers, and example quality before publishing
---

Review the provided SKILL.md file across these four dimensions:

## 1. Frontmatter Completeness
- `name`: kebab-case, matches directory name
- `description`: one line, specific enough to decide relevance (not vague like "helps with X")
- Optional but check if present: `user-invocable`, `disable-model-invocation`, `context`

## 2. Trigger Clarity
- Are the "when to use" conditions specific enough to avoid false invocations?
- Are there clear "when NOT to use" cases to prevent over-triggering?
- Would another skill's triggers conflict with this one?

## 3. Instructions Quality
- Are instructions actionable, not vague?
- Do they tell the AI *what to do*, not just *what the skill is about*?
- Are there concrete examples (inputs → expected outputs)?
- Does it avoid referencing specific AI tool names (Claude, GPT) for portability?

## 4. Test Coverage
- Does the skill's `tests/` directory exist?
- Do tests cover the happy path and at least one edge/failure case?
- Are fixture inputs representative of real-world usage?

## Output Format

```
VERDICT: PASS | FAIL | WARN

### Frontmatter: ✅ / ⚠️ / ❌
[specific feedback]

### Triggers: ✅ / ⚠️ / ❌
[specific feedback]

### Instructions: ✅ / ⚠️ / ❌
[specific line-level feedback]

### Tests: ✅ / ⚠️ / ❌
[specific feedback]

### Action Items
- [ ] item 1
- [ ] item 2
```

PASS = ready to publish. WARN = publishable with noted caveats. FAIL = needs fixes before publishing.
