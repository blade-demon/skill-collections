# Case 1 Expected Output Contract — 风险承受能力评估结果页

运行设置：React / TypeScript / CSS Modules / chat output。

## Step 6 决策

单图 → 一个独立组件 `RiskAssessmentResult`。

## Props 契约

须含风险等级的 status union：

```ts
export type RiskLevel = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
```

须含等价的根 props：

```ts
export interface RiskAssessmentResultProps {
  riskLevel: RiskLevel;
  riskLabel: string;
  validUntil: string;
  suitableRanks: string[];
  taxResidency: string;
  monthlyRemaining: number;
  dailyRemaining: number;
  onReassess?: () => void;
  onViewHistory?: () => void;
}
```

`onReassess` 须为可选 —— 当 `dailyRemaining === 0` 时按钮可 disabled。

## 目录契约

须恰好产出一个根组件目录：

```
src/components/
└── RiskAssessmentResult/
    ├── index.ts
    ├── RiskAssessmentResult.tsx
    ├── RiskAssessmentResult.module.css
    ├── types.ts
    └── components/
        ├── ResultCard.tsx
        ├── ResultCard.module.css
        ├── ReassessFooter.tsx
        └── ReassessFooter.module.css
```

## 关键代码契约

须包含：

- `ResultCard` 渲染风险等级、有效期、适合等级、税务居民身份与静态规则列表。
- `ReassessFooter` 渲染按钮与额度提示；`dailyRemaining === 0` 时按钮 `disabled`。
- 额度提示文案将 `monthlyRemaining` 与 `dailyRemaining` 作为动态值插值。

不得包含：

- `monthlyRemaining` 与 `dailyRemaining` 硬编码为静态字符串。
- 目录树含子组件时使用单一单体组件文件。
- 必填的 `onReassess` prop。
