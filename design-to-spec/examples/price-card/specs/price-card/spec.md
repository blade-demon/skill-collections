# price-card — add-price-card 的增量规格

## ADDED Requirements

### Requirement: PriceCard 状态覆盖

The system SHALL render each contract-defined required state with observable output.

#### Scenario: discount state after props.originalPrice !== null AND props.discou...

- WHEN props.originalPrice !== null AND props.discountPercent !== null
- THEN renders amountText in red, originalPriceText with strikethrough, discountBadge with -{n}% (`discount`)
- AND trace id `state:discount`

#### Scenario: partial state after props.originalPrice !== null AND props.discou...

- WHEN props.originalPrice !== null AND props.discountPercent === null
- THEN renders amountText, originalPriceText with strikethrough; hides discountBadge (`partial`)
- AND trace id `state:partial`

#### Scenario: disabled state after props.hasStock === false

- WHEN props.hasStock === false
- THEN renders stockOutOverlay with stockOutLabel; greys out amountText and currencySymbol (`disabled`)
- AND trace id `state:disabled`

#### Scenario: partial state after props.discountPercent === null

- WHEN props.discountPercent === null
- THEN renders amountText, originalPriceText with strikethrough; hides discountBadge (`partial`)
- AND trace id `state:partial`

#### Scenario: disabled state after props.hasStock === false

- WHEN props.hasStock === false
- THEN renders stockOutOverlay with stockOutLabel; greys out amountText and currencySymbol (`disabled`)
- AND trace id `state:disabled`

#### Scenario: discount state after props.discountPercent !== null

- WHEN props.discountPercent !== null
- THEN renders amountText in red, originalPriceText with strikethrough, discountBadge with -{n}% (`discount`)
- AND trace id `state:discount`

#### Scenario: disabled state after props.hasStock === false

- WHEN props.hasStock === false
- THEN renders stockOutOverlay with stockOutLabel; greys out amountText and currencySymbol (`disabled`)
- AND trace id `state:disabled`

#### Scenario: success state after props.hasStock === true

- WHEN props.hasStock === true
- THEN renders currencySymbol, amountText, subLabel; hides originalPriceText, discountBadge, stockOutOverlay (`success`)
- AND trace id `state:success`
