# price-card — add-price-card 的增量规格

## ADDED Requirements

### Requirement: PriceCard 状态覆盖

The system SHALL 渲染契约定义的每个 required 状态，且产出可观察的结果。

#### Scenario: props.originalPrice 与 props.discountPercent 均非空时进入 discount 态

- WHEN props.originalPrice !== null AND props.discountPercent !== null
- THEN renders amountText in red, originalPriceText with strikethrough, discountBadge with -{n}% (`discount`)
- AND trace id `state:discount`

#### Scenario: 有原价但无折扣百分比时进入 partial 态

- WHEN props.originalPrice !== null AND props.discountPercent === null
- THEN renders amountText, originalPriceText with strikethrough; hides discountBadge (`partial`)
- AND trace id `state:partial`

#### Scenario: 缺货时进入 disabled 态

- WHEN props.hasStock === false
- THEN renders stockOutOverlay with stockOutLabel; greys out amountText and currencySymbol (`disabled`)
- AND trace id `state:disabled`

#### Scenario: props.discountPercent 为空时进入 partial 态

- WHEN props.discountPercent === null
- THEN renders amountText, originalPriceText with strikethrough; hides discountBadge (`partial`)
- AND trace id `state:partial`

#### Scenario: 缺货时进入 disabled 态（由 discount 态转换）

- WHEN props.hasStock === false
- THEN renders stockOutOverlay with stockOutLabel; greys out amountText and currencySymbol (`disabled`)
- AND trace id `state:disabled`

#### Scenario: props.discountPercent 非空时进入 discount 态

- WHEN props.discountPercent !== null
- THEN renders amountText in red, originalPriceText with strikethrough, discountBadge with -{n}% (`discount`)
- AND trace id `state:discount`

#### Scenario: 缺货时进入 disabled 态（由 partial 态转换）

- WHEN props.hasStock === false
- THEN renders stockOutOverlay with stockOutLabel; greys out amountText and currencySymbol (`disabled`)
- AND trace id `state:disabled`

#### Scenario: 有库存时进入 success 态

- WHEN props.hasStock === true
- THEN renders currencySymbol, amountText, subLabel; hides originalPriceText, discountBadge, stockOutOverlay (`success`)
- AND trace id `state:success`
