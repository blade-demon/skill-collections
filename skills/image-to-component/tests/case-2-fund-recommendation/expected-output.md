# Case 2 Expected Output Contract — 布局大盘宽基基金列表

运行设置：React / TypeScript / CSS Modules / chat output。

## Step 6 决策

单图 → 一个独立组件 `FundRecommendationSection`。

## Props 契约

须将 `returnPeriod` 建模为数据字段（非硬编码），因截图同时出现「近一年涨幅」与「成立以来涨幅」变体：

```ts
export interface FundItem {
  id: string;
  name: string;
  returnRate: number;
  returnPeriod: string;
  tagline: string;
  minAmount: string;
  sparklineData: number[];
  isFavorited: boolean;
}

export interface FundRecommendationSectionProps {
  title: string;
  subtitle: string;
  items: FundItem[];
  onToggleFavorite?: (id: string) => void;
  onItemClick?: (id: string) => void;
}
```

## 目录契约

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

## 关键代码契约

须包含：

- `sparklineData` 作为 prop —— sparkline 由数据驱动，非静态图片。
- `isFavorited` 驱动星标按钮的 `aria-pressed`。
- `returnRate >= 0` 条件 class 用于正负色。
- `returnPeriod` 作为动态字符串渲染。

不得包含：

- `FundCard` 内硬编码「近一年涨幅」字符串。
- `returnRatePositive` / `returnRateNegative` 作为独立 props。
- 无 `aria-pressed` 或 `aria-label` 的星标按钮。
