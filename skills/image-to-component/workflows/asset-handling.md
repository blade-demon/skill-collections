# Asset Handling Workflow

Use this workflow while defining props and generating the directory tree/code skeleton.

## Hard Rules

- Media nodes become `src` and `alt` props only.
- Do not infer icon package names from screenshots.
- Do not guess icon component names.
- Do not add new icon packages.
- Do not replace an unknown icon with status text.
- If an icon or media asset cannot be identified reliably, preserve an asset placeholder and record it in `asset-ledger.md`.

## Prop Mapping

| Signature role | Generated API |
|---|---|
| `media` image/content | `{name}Src: string` and `{name}Alt: string` |
| Optional `media` | `{name}Src?: string` and `{name}Alt?: string` |
| Status-varying media | Use data props keyed by status or conditional rendering driven by the existing `status` union |
| Unreliable icon | Placeholder component/element plus asset-ledger row |

Use generic names when the signature lacks semantics, e.g. `mediaASrc`, `mediaAAlt`. Use semantic names only when supplied by the user, filename, or project context.

## Exact Asset Ledger Format

Create or output `asset-ledger.md` with this table:

```markdown
| Asset ID | Source image(s) | Signature path | Intended use | Generated placeholder | Required user action | Status |
|---|---|---|---|---|---|---|
| asset-001 | pending.png, used.png | M.card[0].media | QR/code-like media area | `mediaASrc` / `mediaAAlt` props | Provide final image URL or import path | pending |
| asset-002 | expired.png | T.media | Unknown leading icon | `<span className={styles.iconPlaceholder} aria-hidden />` | Identify icon asset or existing icon component | pending |
```

## Status Values

- `pending`: user must provide asset, URL, import path, or existing component name.
- `provided`: user already supplied a reliable asset reference.
- `reused`: an existing project asset/component is explicitly identified.

## Accessibility

- Every media prop must include an alt prop unless the user confirms the asset is decorative.
- Decorative unknown icons use `aria-hidden` and must still appear in the ledger.
- Do not fabricate alt text from screenshot content the signature did not carry.

## Exit

Exit when every media/icon node is represented by:
- A concrete `src`/`alt` prop,
- A confirmed existing asset/component, or
- A row in `asset-ledger.md`.
