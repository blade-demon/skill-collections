# Scenario 写作指南

design-to-spec 在步骤 7（规格实体化）读取本文件。目的：把 spec.md 里的 `#### Scenario:` 从「看起来像规格」升级到「能直接当单测读」。

## 单条 Scenario 的三要素

一条好 Scenario 读起来像一个即将写成的测试用例：

1. **具体触发器（WHEN）**——用户动作、数据形状、生命周期事件，绝不是抽象的「当需要时」或「当合适时」
2. **可测的结果（THEN）**——测试能断言的产物（事件名 + detail、DOM 节点的存在/缺失、文本内容、元素属性值），不是「正确渲染」「优雅显示」这类形容词
3. **每个 Requirement 2–4 个 Scenario**——少于 2 说明覆盖不够，超过 4 几乎肯定说明 Requirement 拆得太粗

## 四个常见反模式

### 反模式 1：fits / overflows 样板重复

同一文档里出现第 3 次成对的「适应宽度 → 完整渲染」/「超出宽度 → 截断」，就是噪音。**合并成一条**，只保留「超出」那条：

错的：

```
#### 场景：标题在可见宽度内
- WHEN 标题适应可用宽度
- THEN 标题完整渲染

#### 场景：标题超出可见宽度
- WHEN 标题超出其行槽位
- THEN 标题尾部 `…` 截断
```

对的：

```
#### 场景：标题超出单行宽度
- WHEN `hotspot.title` 渲染宽度 > 容器可用宽度
- THEN 元素保持单行，尾部可见 `…` 字符
- AND `scrollWidth > clientWidth` 为 true
```

「适应宽度」是默认路径，已隐含在 Requirement 的主干 SHALL 语句里，不需要单独写 Scenario。

### 反模式 2：vibes 结果

「行高不变」「正确渲染」「优雅显示」——都是人类形容词，测不出来。改成具体产物：

错的：`- THEN 标题以尾部 … 截断，行高不变`

对的：

```
- THEN 元素高度等于 line-height × 1
- AND 元素 textContent 最后一个字符是 `…`
```

或者更好，直接断言可观察行为：`scrollWidth > clientWidth`、`event.detail.foo === "bar"`、`document.querySelector(".flame-icon") === null`。

### 反模式 3：把 CSS 属性当 Scenario

`text-overflow: ellipsis` 是一种实现方式，不是行为本身。别人用 `transform: scale()` 做视觉截断也可能满足「尾部有 …」。**描述可观察的行为，不是 CSS 属性名。**

错的：`- THEN 使用 text-overflow: ellipsis 样式`

对的：`- THEN 元素 textContent 末尾为 …`

### 反模式 4：只覆盖 happy path

Requirement 下只有「正常数据 + 常见变体」，缺了边界和异常，就是未完成的规格。

错的（单一维度枚举）：

```
### 需求：涨跌幅格式化
- WHEN change 为 5.14 → THEN 渲染 +5.14%
- WHEN change 为 -3.20 → THEN 渲染 -3.20%
```

对的（正 / 负 / 零 合并 + 精度边界 + 极大值边界）：

```
#### 场景：正 / 负 / 零
- WHEN change 为 5.14 → THEN 文本 `+5.14%`，正色
- WHEN change 为 -3.20 → THEN 文本 `-3.20%`，负色
- WHEN change 为 0 → THEN 文本 `+0.00%`，正色（产品约定零非中性）

#### 场景：小数精度超出两位
- WHEN change 为 5.1447
- THEN 文本 `+5.14%`（四舍五入到两位）

#### 场景：极大值不撑破布局
- WHEN change 为 999.99
- THEN 文本 `+999.99%`，标签容器宽度不超过 grid 列宽
```

**每个 Requirement 至少要有一个非-happy-path Scenario。** 如果真的想不出，大概率这个 Requirement 太琐碎，可以并进别的。

## 状态覆盖硬规则

`notes.md` 的「状态枚举」表里每个 `required: true` 的状态，在 `spec.md` 中必须**至少有 1 条对应 Scenario**。

判定方法：写完 spec.md 后逐行对照状态表，把每个 `required: true` 行映射到一条 Scenario 标题。对不上 → 补 Scenario，**不要省**。

**反例**（状态表把 `loading` / `empty` / `error` 标为 `required: true`，但 spec 只有 success 路径）：

```
### Requirement: 卡片渲染热点与基金推荐
The system SHALL render hotspot row and fund row when data is available.

#### Scenario: 完整数据时正确渲染
- WHEN hotspot 与 fund 都齐全
- THEN 渲染两行内容
```

→ 这是典型的"只覆盖 happy path"。状态表里 `required: true` 的 loading/empty/error 三态全部缺席，下游 AI 实现出来 90% 概率没有骨架屏 / 空状态 / 错误兜底。

**正例**（每个 `required: true` 状态都有对应 Scenario）：

```
#### Scenario: 数据请求中显示骨架（loading）
- WHEN 父组件 props.data === undefined 且 props.loading === true
- THEN 容器内仅渲染 .skeleton 节点，不渲染热点行/基金行的真实文本
- AND 容器高度等于 success 态高度（防抖动）

#### Scenario: tags 为空数组时降级（empty）
- WHEN hotspot.tags.length === 0
- THEN 渲染热点标题但不渲染标签网格
- AND 容器不出现空白占位条

#### Scenario: 完整数据时正确渲染（success）
- WHEN hotspot 与 fund 都齐全
- THEN 渲染热点行（标题 + 标签网格 + chevron）和基金行（sparkline + name + CTA）

#### Scenario: 数据请求失败显示重试（error）
- WHEN 父组件 props.error 不为 null
- THEN 容器内仅渲染 .error-state 节点，含可见的「重试」按钮
- AND 点击「重试」触发 retry 事件
```

如果某个 `required: true` 状态在设计稿中没有视觉提示，**不要跳过 Scenario**，而是在 `notes.md` 的「开放问题」里登记一条「<state> 的视觉表现待设计签收」，同时在 spec.md 里写一条带 `needs_human_input` 标注的占位 Scenario，等设计补全后填实。

## 结构 vs 行为

- **结构（静态契约）**—— 「有 2 列」「有 chevron」—— 在 Requirement 的 SHALL 语句里描述一次，配 **1 个** 确认型 Scenario 足够
- **行为（动态契约）**—— 事件发出、状态切换、数据驱动渲染 —— 每个值得 2–4 个 Scenario，覆盖 happy / edge / error

如果你发现自己为 **静态结构** 写了 5 个 Scenario（大小/颜色/字体/padding/border-radius），停下来：那些属于 `notes.md` 的布局陷阱或 stack-hints 的 design tokens，**不属于 spec.md**。

## 生成后 checklist

对每个 Scenario 逐条自检：

- WHEN 是一个具体触发器，不是「当需要时」「当条件满足时」
- THEN 至少有一个能断言的产物（DOM、事件 detail、文本、属性值）
- 同一 Requirement 下没有 fits/overflows 成对出现
- 同一 Requirement 下至少有一个非-happy-path Scenario（零值、极值、缺字段、异常输入）
- `notes.md` 状态表里每个 `required: true` 的状态都能在本 Requirement 或同 spec 内的其他 Requirement 中找到对应 Scenario
- 结果描述没有 vibes 词（正确、优雅、合理）和 CSS 属性名

如果某一条过不了自检，**改写而不是扔掉**——扔掉场景会让覆盖面萎缩；改写能把它升级成一条有信息量的规格。
