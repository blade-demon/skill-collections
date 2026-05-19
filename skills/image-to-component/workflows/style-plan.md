# Style Plan Workflow

Use this after Style Connect and before code generation when style hints are enabled. It converts confirmed style decisions into the `stylePlan` field consumed by `scripts/generate-skeleton`.

## Inputs

- Validated `style_hints` from `protocols/style-context-spec.md`.
- Confirmed `token-ledger.md` decisions from `workflows/style-connect.md`.
- Component tree and component names from structural comparison and prop modeling.
- Selected style stack: `css-modules` or `bem`.

## Output Contract

Add `stylePlan` to the `SkeletonConfig` passed to `generate-skeleton`:

```json
{
  "stylePlan": {
    "rules": [
      {
        "component": "RiskPage",
        "declarations": [
          { "property": "display", "value": "grid", "source": "inferred" },
          { "property": "gap", "value": "var(--space-md)", "source": "token-ledger", "comment": "Confirmed in token-ledger.md" }
        ],
        "variants": [
          {
            "name": "high",
            "declarations": [
              { "property": "box-shadow", "value": "var(--shadow-card)", "source": "token-ledger" }
            ]
          }
        ]
      }
    ]
  }
}
```

## Rules

- Treat screenshot-derived styles as inferred unless the user or project tokens confirm them.
- Prefer confirmed token references such as `var(--space-md)` over hardcoded values.
- Use hardcoded values only when Style Connect marked the row as `hardcoded`; include a `comment` describing the intended future token extraction.
- Do not invent colors, exact pixel measurements, or font sizes from screenshots.
- Do not let style hints alter the structural component tree.
- Use lower kebab-case variant names because they become CSS class names or BEM modifiers.
- Omit any style trait marked `skip` in the token ledger.

## Default Mapping Guidance

| Style hint | StylePlan use |
|---|---|
| `density` | Select spacing/gap token family, e.g. `--space-sm`, `--space-md`, `--space-lg` |
| `corner_radius` | Select border-radius token, e.g. `--radius-sm`, `--radius-md`, `--radius-lg` |
| `shadow_presence` | Select elevation/shadow token if confirmed |
| `type_hierarchy_levels` | Add typography TODO comments only unless project tokens are confirmed |
| `primary_action_count` | Prefer existing button/component APIs; do not infer color without token confirmation |
| `is_mobile_viewport` | Use layout comments or mobile-first container styles, not fixed viewport dimensions |

## Exit

Exit with a complete `stylePlan` object or explicitly state that no style plan will be passed. Then run `workflows/code-generation.md`.
