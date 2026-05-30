# Summarize Signatures 工作流

在 Step 5 中使用本工作流：所有签名批次校验完成后、结构对比之前。为每张图片输出自然语言摘要与机械化的 JSX 组件树。树结构供用户在 workflow 提交组件决策前校验结构解析。

不要向用户展示原始签名 JSON。不要输出签名未携带信息的树。

## 输出格式

```
已完成结构分析，共 N 张图：

**image1.png**：<one-sentence natural-language description of slots and regions>

<RootComponentName>                 # Root component; include state name when known
  ├── <Child>                       # slot and role annotation
  │   ├── <Child>                   # slot and role annotation
  │   └── <Child>                   # slot and role annotation
  └── <Child>                       # slot and role annotation

**image2.png**：<one-sentence description>

<RootComponentName>
  ├── ...
  └── ...
```

所有树之后写一句过渡语，例如："接下来将对比这 N 张图的结构，判断是否属于同一组件的不同状态。"

## 命名规则

组件名称仅可从以下来源推导：(a) 签名角色与槽位，(b) Step 2 用户声明的状态或业务上下文，(c) Step 6 确认的状态名称（如有）。切勿使用签名未携带的视觉信息。

| Slot / role                     | Default name                              | When user context is known                           |
| ------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| `T` container                   | `<Header>`                                | `<PageNameHeader>` when page purpose is declared     |
| `M` top-level `card(...)`       | `<Card>`                                  | `<CouponCard>` when business object is declared      |
| `M` top-level `list(card(...))` | `<List>` with `<ListItem>`                | domain names when declared                           |
| `media` (first in slot)         | `<MediaA>`                                | semantic name only when Step 2 declares it           |
| `media` (second in slot)        | `<MediaB>`                                | semantic name only when Step 2 declares it           |
| `status`                        | `<StatusStamp>`                           | `<UsedStamp>` / `<ExpiredStamp>` when state is known |
| `hint` (first)                  | `<HintA>`                                 | no content-based names                               |
| `hint` (second)                 | `<HintB>`                                 | no content-based names                               |
| `action` (first)                | `<ActionA>`                               | `<RefreshButton>` when Step 2 declares the action    |
| `action` (second)               | `<ActionB>`                               | semantic name only when declared                     |
| `form` fields                   | `<FormFieldA>`, `<FormFieldB>`            | domain name when declared                            |
| `B` slot                        | `<Footer>` or inline leaves               | —                                                    |
| `O` overlay                     | `<OverlayModal>` / `<OverlayDrawer>` etc. | domain name when declared                            |
| `F` floating anchor             | `<FloatAction>`                           | —                                                    |

所有组件名称使用 PascalCase。

不要根据视觉位置、图标形状、文本内容、颜色或签名未携带的任何属性命名组件。

禁止示例：

- ❌ `<IconThumb>` — icon shape
- ❌ `<QRCodeArea>` — visual content guess
- ❌ `<OrangeButton>` — color
- ❌ `<BottomSection>` — layout position
- ❌ `<ErrorText>` — text content

允许示例：

- ✅ `<MediaA>` — generic media, first in slot
- ✅ `<CouponCard>` — business object declared in Step 2
- ✅ `<ExpiredStamp>` — state name confirmed in Step 6
- ✅ `<ActionA>` — generic action, first in slot

## 树符号规则

- `├──` 表示非最后一个兄弟节点
- `└──` 表示最后一个兄弟节点
- `│` 用于保持缩进线
- 每个深度的每个节点都必须带 `#` 注释

## 注释规则

每个 `#` 注释仅可包含：

- (a) 节点的签名角色：`title`、`meta`、`media`、`status`、`hint`、`action`、`form`、`nav`、`brand`、`empty`
- (b) 槽位与容器位置：`T slot`、`M slot`、`inside card`、`inside list`
- (c) Step 2 声明或 Step 6 结果中的状态上下文：`rendered when status === 'expired'`
- (d) 非视觉 notes 字段：`from notes: divider=dashed`、`overlay_type=modal`

注释中禁止以下内容——签名未携带这些信息，会导致幻觉：

- ❌ 颜色或渐变：`# 橙色渐变背景`、`# white card`
- ❌ 阴影或圆角：`# 圆角阴影`、`# card shadow`
- ❌ 图标形状：`# 警告图标`、`# ¥ 图标`
- ❌ 具体文案：`# "订单已过期"`、`# "Submit"`
- ❌ 字号或对齐：`# 灰色小字，居中`、`# small grey text`
- ❌ 布局尺寸：`# 16px padding`、`# 48px height`

允许的注释示例：

- ✅ `# T slot, title leaf`
- ✅ `# media leaf in M (first occurrence)`
- ✅ `# status leaf, rendered when status !== 'pending'`
- ✅ `# decorative divider (from notes: divider=dashed)`
- ✅ `# overlay: modal (from notes: overlay_type=modal)`
- ✅ `# F slot, floating action anchor (from notes: float_anchor=br)`

## 运算符到树的映射

| Signature operator            | Tree representation                                              |
| ----------------------------- | ---------------------------------------------------------------- |
| `A + B` (horizontal siblings) | `A` and `B` as separate sibling lines at the same indent level   |
| `A -> B` (vertical sequence)  | `B` is a child of `A`, indented one level                        |
| `container(...)`              | `container` node with children from the parenthesised expression |

## Overlay 与 Float 树

当 `O` 不为 `"-"` 时，在根组件节点之外、基础树下方单独输出 overlay 树：

```
<RootComponent>
  └── ...

<OverlayModal>                      # overlay: modal (from notes: overlay_type=modal)
  ├── <ModalTitle>                  # title leaf inside overlay
  └── <ActionA>                     # action leaf inside overlay
```

当 `F` 不为 `"-"` 时，将浮动锚点作为根组件最后一个子节点的兄弟节点展示并附注：

```
<RootComponent>
  ├── ...
  └── <FloatAction>                 # F slot, floating action anchor (from notes: float_anchor=br)
```

## 多状态树

当多张图片表示同一组件的不同状态时，每张图输出一棵树。根节点名称应反映其状态：

```
<PendingOrderPage>                  # Root component, pending state
  ├── ...

<UsedOrderPage>                     # Root component, used state
  ├── ...

<ExpiredOrderPage>                  # Root component, expired state
  ├── ...
```

## 完整示例

签名输入（内部使用，不展示给用户）：

```json
{
  "filename": "expired.png",
  "signature": {
    "T": "nav -> title",
    "M": "card(media + card(title -> meta -> meta) -> media -> status)",
    "B": "hint",
    "O": "-",
    "F": "-"
  },
  "notes": { "overlay_type": null, "float_anchor": null, "divider": "dashed" }
}
```

Step 2 用户上下文：页面为优惠券订单页；状态为 expired。

展示给用户的自然语言摘要：

> **expired.png**：T 槽导航栏 + 标题；M 槽券信息卡（含两个 media 节点、内嵌信息卡、状态印章）；B 槽提示文字

展示给用户的 JSX 树：

```
<ExpiredOrderPage>                      # Root component, expired state
  ├── <Header>                          # T slot, nav leaf
  │   └── <HeaderTitle>                 # T slot, title leaf (vertical sequence below nav)
  │
  └── <CouponCard>                      # M slot, top-level card container
      ├── <MediaA>                      # media leaf, first in M (inside CouponCard)
      ├── <CouponInfoCard>              # card subcontainer inside CouponCard
      │   ├── <CouponTitle>             # title leaf inside CouponInfoCard
      │   ├── <CouponMetaA>             # meta leaf inside CouponInfoCard (first)
      │   └── <CouponMetaB>             # meta leaf inside CouponInfoCard (second)
      ├── <MediaB>                      # media leaf, second in M (inside CouponCard)
      │   # from notes: divider=dashed above this region
      └── <StatusStamp>                 # status leaf, rendered when status === 'expired'

<Footer>                                # B slot, hint leaf
```

说明：`<CouponCard>` 与 `<CouponInfoCard>` 使用业务名称，因为 Step 2 声明了优惠券上下文。`<MediaA>` 与 `<MediaB>` 使用通用名称，因为 Step 2 未声明其具体语义。

## 用户修正门控

输出所有树后，在进入下一步前邀请修正：

> 如果发现结构与设计稿不符，请在进入结构比较前指出，主代理将重新派发签名子代理。

若用户指出不匹配，在 dispatcher-instructions fence 内附带修正指令重新派发受影响批次，重新校验后再继续。
