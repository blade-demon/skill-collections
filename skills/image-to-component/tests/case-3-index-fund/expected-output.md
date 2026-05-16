# Case 3 Expected Output Contract — 指数精选（含 Tab 切换）

Run settings: React / TypeScript / CSS Modules / chat output.

## Step 6 Decision

Single image → one independent component `IndexFundSection`.

## Props Contract

Must model tab state externally (controlled component):

```ts
export type IndexTab = '指数增强' | '宽基指数' | '港股指数' | '双创指数'

export interface IndexFundItem {
  id: string
  name: string
  returnRate: number
  returnLabel: string
  isFavorited: boolean
}

export interface IndexFundSectionProps {
  tabs: IndexTab[]
  activeTab: IndexTab
  items: IndexFundItem[]
  onTabChange?: (tab: IndexTab) => void
  onSubscribe?: (id: string) => void
  onToggleFavorite?: (id: string) => void
  onViewMore?: () => void
}
```

## Directory Contract

```
src/components/
└── IndexFundSection/
    ├── index.ts
    ├── IndexFundSection.tsx
    ├── IndexFundSection.module.css
    ├── types.ts
    └── components/
        ├── TabBar.tsx
        ├── TabBar.module.css
        ├── IndexFundRow.tsx
        └── IndexFundRow.module.css
```

## Key Code Contract

Must contain:

- `TabBar` as a separate component receiving `tabs`, `activeTab`, `onChange`.
- `returnRate >= 0` conditional class for positive/negative color on return rate.
- Both `onSubscribe` and `onToggleFavorite` on each row — two independent actions.
- `activeTab` as a controlled prop, not internal state.

Must not contain:

- Tab state managed internally with `useState` inside the component.
- "定投" button and favorite star merged into a single prop or handler.
- Hardcoded tab list inside `TabBar` or `IndexFundSection`.
