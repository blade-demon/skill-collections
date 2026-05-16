# Case 1 Expected Output Contract — 风险承受能力评估结果页

Run settings: React / TypeScript / CSS Modules / chat output.

## Step 6 Decision

Single image → one independent component `RiskAssessmentResult`.

## Props Contract

Must contain a status union for the risk level:

```ts
export type RiskLevel = 'C1' | 'C2' | 'C3' | 'C4' | 'C5'
```

Must contain root props equivalent to:

```ts
export interface RiskAssessmentResultProps {
  riskLevel: RiskLevel
  riskLabel: string
  validUntil: string
  suitableRanks: string[]
  taxResidency: string
  monthlyRemaining: number
  dailyRemaining: number
  onReassess?: () => void
  onViewHistory?: () => void
}
```

`onReassess` must be optional — the button can be disabled when `dailyRemaining === 0`.

## Directory Contract

Must produce exactly one root component directory:

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

## Key Code Contract

Must contain:

- `ResultCard` renders risk level, validity, suitable ranks, tax residency, and static rule list.
- `ReassessFooter` renders the button and quota hint; button is `disabled` when `dailyRemaining === 0`.
- Quota hint text interpolates `monthlyRemaining` and `dailyRemaining` as dynamic values.

Must not contain:

- `monthlyRemaining` and `dailyRemaining` hardcoded as static strings.
- A single monolithic component file when the directory tree contains subcomponents.
- Required `onReassess` prop.
