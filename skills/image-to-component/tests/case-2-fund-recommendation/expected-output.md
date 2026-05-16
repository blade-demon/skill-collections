# Case 2 Expected Output Contract — 布局大盘宽基基金列表

Run settings: React / TypeScript / CSS Modules / chat output.

## Step 6 Decision

Single image → one independent component `FundRecommendationSection`.

## Props Contract

Must model `returnPeriod` as a data field (not hardcoded), because the screenshot shows both "近一年涨幅" and "成立以来涨幅" variants:

```ts
export interface FundItem {
  id: string
  name: string
  returnRate: number
  returnPeriod: string
  tagline: string
  minAmount: string
  sparklineData: number[]
  isFavorited: boolean
}

export interface FundRecommendationSectionProps {
  title: string
  subtitle: string
  items: FundItem[]
  onToggleFavorite?: (id: string) => void
  onItemClick?: (id: string) => void
}
```

## Directory Contract

```
src/components/
└── FundRecommendationSection/
    ├── index.ts
    ├── FundRecommendationSection.tsx
    ├── FundRecommendationSection.module.css
    ├── types.ts
    └── components/
        ├── FundCard.tsx
        └── FundCard.module.css
```

## Key Code Contract

Must contain:

- `sparklineData` as a prop — sparkline is data-driven, not a static image.
- `isFavorited` driving `aria-pressed` on the star button.
- `returnRate >= 0` conditional class for positive/negative color.
- `returnPeriod` rendered as a dynamic string.

Must not contain:

- Hardcoded "近一年涨幅" string inside `FundCard`.
- `returnRatePositive` / `returnRateNegative` as separate props.
- Star button without `aria-pressed` or `aria-label`.
