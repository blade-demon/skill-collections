# Commenting Guide

Comments in this repo should help a human maintainer understand contracts and
handoffs quickly. They should not decorate obvious code.

## Where Comments Help

- Public package exports and barrel files.
- Parser, provider, and IR boundaries where data changes shape.
- Validation rules that encode product or workflow decisions.
- Test fixtures whose shape is intentionally strange.
- Generated-output expectations that are easy to mistake for arbitrary text.

## Where Comments Usually Hurt

- Simple assignments, imports, and direct function calls.
- Comments that restate names already chosen well.
- Long historical notes that belong in docs or changelogs.
- TODOs without owner, priority, or concrete next step.

## Public API Comments

Use short JSDoc on exported functions, types, and namespaces when another
package or skill is expected to import them.

```ts
/**
 * Converts a provider-specific artifact into the stable D2C IR contract.
 */
export function normalizeArtifact(input: ProviderArtifact): DesignIr;
```

For barrel files, prefer module-level comments that explain how imports should
be grouped:

```ts
/**
 * Public D2C core entry point. Import from subpath barrels when a consumer only
 * needs one layer, such as `@skill-collections/d2c-core/ir`.
 */
```

## Inline Comments

Inline comments should explain why a branch exists, not what syntax does.

```ts
// Preserve missing dimensions so visual review can distinguish unknown values
// from explicit zero-size layers.
const width = frame.width ?? null;
```

## Test Comments

Use comments in tests when fixture data is intentionally minimal, malformed, or
constructed to hit a specific edge case.

```ts
// The symbol omits override metadata to prove the normalizer keeps the instance
// tree renderable when Sketch exports partial data.
```

## Maintenance Rule

When a comment stops matching the code, update or delete the comment in the same
change. Stale comments are worse than missing comments because they mislead the
next maintainer.
