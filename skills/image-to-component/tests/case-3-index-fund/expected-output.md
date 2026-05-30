# Case 3 Expected Output Contract — 指数精选（含 Tab 切换）

运行设置：React / TypeScript / CSS Modules / chat output。

## Step 6 决策

单图 → 一个独立组件 `IndexFundSection`。

## Props 契约

须将 tab 状态外部建模（受控组件）：

```ts
export type IndexTab = '指数增强' | '宽基指数' | '港股指数' | '双创指数';

export interface IndexFundItem {
  id: string;
  name: string;
  returnRate: number;
  returnLabel: string;
  isFavorited: boolean;
}

export interface IndexFundSectionProps {
  tabs: IndexTab[];
  activeTab: IndexTab;
  items: IndexFundItem[];
  onTabChange?: (tab: IndexTab) => void;
  onSubscribe?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  onViewMore?: () => void;
}
```

## 目录契约

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

## 关键代码契约

须包含：

- `TabBar` 为独立组件，接收 `tabs`、`activeTab`、`onChange`。
- 收益率上 `returnRate >= 0` 条件 class 用于正负色。
- 每行同时有 `onSubscribe` 与 `onToggleFavorite` —— 两个独立 action。
- `activeTab` 为受控 prop，非内部 state。

不得包含：

- 组件内部用 `useState` 管理 tab 状态。
- 「定投」按钮与收藏星合并为单一 prop 或 handler。
- `TabBar` 或 `IndexFundSection` 内硬编码 tab 列表。
