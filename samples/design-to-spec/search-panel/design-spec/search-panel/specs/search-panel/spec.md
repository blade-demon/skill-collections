# search-panel — add-search-panel 的增量规格

<!-- CONTRACT_DERIVED: 此文件由 generate-output.js 从 YAML 契约机械生成。4B 阶段 LLM 不得添加契约中不存在的 Requirement 或 Scenario，不得修改 state: / request: trace anchor。-->

## ADDED Requirements

### Requirement: SearchPanel 状态覆盖

The system SHALL render each contract-defined required state with observable output.

#### Scenario: loading state after submitBtn.onClick AND searchInput.value.trim(...

- WHEN submitBtn.onClick AND searchInput.value.trim().length > 0
- THEN renders 3 skeletonRow placeholders; submitBtn 半透明禁用 (`loading`)
- AND trace id `state:loading`

#### Scenario: success state after api_success AND data.results.length > 0

- WHEN api_success AND data.results.length > 0
- THEN renders resultCount with data.total, resultList with data.results[].title and .summary (`success`)
- AND trace id `state:success`

#### Scenario: empty state after api_success AND data.results.length === 0

- WHEN api_success AND data.results.length === 0
- THEN renders emptyIcon and emptyText '未找到相关结果'; hides resultList (`empty`)
- AND trace id `state:empty`

#### Scenario: error state after api_error AND code in (NETWORK_ERROR, RATE_LI...

- WHEN api_error AND code in (NETWORK_ERROR, RATE_LIMITED, INTERNAL_ERROR)
- THEN renders errorIcon, errorText, retryButton; text varies per code (`error`)
- AND trace id `state:error`

#### Scenario: invalidKeyword state after api_error AND code === INVALID_KEYWORD

- WHEN api_error AND code === INVALID_KEYWORD
- THEN renders validationHint with backend message; resultsRegion stays in idle layout (`invalidKeyword`)
- AND trace id `state:invalidKeyword`

#### Scenario: idle state after api_error AND code === FORBIDDEN

- WHEN api_error AND code === FORBIDDEN
- THEN navigates to /login (not visible in component); searchInput keeps value while in flight (`idle`)
- AND trace id `state:idle`

#### Scenario: loading state after retryButton.onClick

- WHEN retryButton.onClick
- THEN renders 3 skeletonRow placeholders; submitBtn 半透明禁用 (`loading`)
- AND trace id `state:loading`

#### Scenario: loading state after submitBtn.onClick AND searchInput.value 已变更

- WHEN submitBtn.onClick AND searchInput.value 已变更
- THEN abort previous request; renders skeletonRow placeholders (`loading`)
- AND trace id `state:loading`

#### Scenario: loading state after submitBtn.onClick

- WHEN submitBtn.onClick
- THEN renders skeletonRow placeholders; clears validationHint (`loading`)
- AND trace id `state:loading`

### Requirement: SearchPanel 事件输出

The system SHALL emit contract-defined UI events without inventing navigation or write-side effects.

#### Scenario: tap-search-submit event

- WHEN 用户触发 `tap-search-submit` 对应的 UI 行为
- THEN 组件派发 `tap-search-submit` 事件 1 次

#### Scenario: tap-search-retry event

- WHEN 用户触发 `tap-search-retry` 对应的 UI 行为
- THEN 组件派发 `tap-search-retry` 事件 1 次
