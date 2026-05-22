# Summarize Signatures Workflow

Use this workflow in Step 5, after all signature batches validate and before structural comparison. Output a natural-language summary and a mechanical JSX component tree for each image. The trees let the user verify structural parsing before the workflow commits to component decisions.

Do not show raw signature JSON to the user. Do not output trees that contain information the signature did not carry.

## Output Format

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

After all trees, write one transition sentence, for example: "接下来将对比这 N 张图的结构，判断是否属于同一组件的不同状态。"

## Naming Rules

Derive component names only from: (a) signature role and slot, (b) user-declared state or business context from Step 2, (c) confirmed state names from Step 6 when available. Never use visual information the signature does not carry.

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

Use PascalCase for all component names.

Do not name a component after its visual position, icon shape, text content, color, or any attribute the signature does not carry.

Forbidden examples:

- ❌ `<IconThumb>` — icon shape
- ❌ `<QRCodeArea>` — visual content guess
- ❌ `<OrangeButton>` — color
- ❌ `<BottomSection>` — layout position
- ❌ `<ErrorText>` — text content

Allowed examples:

- ✅ `<MediaA>` — generic media, first in slot
- ✅ `<CouponCard>` — business object declared in Step 2
- ✅ `<ExpiredStamp>` — state name confirmed in Step 6
- ✅ `<ActionA>` — generic action, first in slot

## Tree Symbol Rules

- `├──` for non-last sibling
- `└──` for last sibling
- `│` to maintain indentation lines
- Every node at every depth must carry a `#` comment

## Comment Rules

Each `#` comment may only contain:

- (a) The signature role of the node: `title`, `meta`, `media`, `status`, `hint`, `action`, `form`, `nav`, `brand`, `empty`
- (b) Slot and container position: `T slot`, `M slot`, `inside card`, `inside list`
- (c) State context from Step 2 declaration or Step 6 result: `rendered when status === 'expired'`
- (d) Non-visual notes fields: `from notes: divider=dashed`, `overlay_type=modal`

Forbidden in comments — these cause hallucination because the signature does not carry this information:

- ❌ Colors or gradients: `# 橙色渐变背景`, `# white card`
- ❌ Shadow or radius: `# 圆角阴影`, `# card shadow`
- ❌ Icon shapes: `# 警告图标`, `# ¥ 图标`
- ❌ Specific text copy: `# "订单已过期"`, `# "Submit"`
- ❌ Font size or alignment: `# 灰色小字，居中`, `# small grey text`
- ❌ Layout measurements: `# 16px padding`, `# 48px height`

Allowed comment examples:

- ✅ `# T slot, title leaf`
- ✅ `# media leaf in M (first occurrence)`
- ✅ `# status leaf, rendered when status !== 'pending'`
- ✅ `# decorative divider (from notes: divider=dashed)`
- ✅ `# overlay: modal (from notes: overlay_type=modal)`
- ✅ `# F slot, floating action anchor (from notes: float_anchor=br)`

## Operator-to-Tree Mapping

| Signature operator            | Tree representation                                              |
| ----------------------------- | ---------------------------------------------------------------- |
| `A + B` (horizontal siblings) | `A` and `B` as separate sibling lines at the same indent level   |
| `A -> B` (vertical sequence)  | `B` is a child of `A`, indented one level                        |
| `container(...)`              | `container` node with children from the parenthesised expression |

## Overlay and Float Trees

When `O` is not `"-"`, output the overlay tree separately below the base tree, outside the root component node:

```
<RootComponent>
  └── ...

<OverlayModal>                      # overlay: modal (from notes: overlay_type=modal)
  ├── <ModalTitle>                  # title leaf inside overlay
  └── <ActionA>                     # action leaf inside overlay
```

When `F` is not `"-"`, show the floating anchor as a sibling of the root component's last child with a note:

```
<RootComponent>
  ├── ...
  └── <FloatAction>                 # F slot, floating action anchor (from notes: float_anchor=br)
```

## Multi-State Trees

When multiple images represent the same component in different states, output one tree per image. Name each root node to reflect its state:

```
<PendingOrderPage>                  # Root component, pending state
  ├── ...

<UsedOrderPage>                     # Root component, used state
  ├── ...

<ExpiredOrderPage>                  # Root component, expired state
  ├── ...
```

## Worked Example

Signature input (internal, not shown to user):

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

User context from Step 2: page is a coupon order page; state is expired.

Natural-language summary shown to user:

> **expired.png**：T 槽导航栏 + 标题；M 槽券信息卡（含两个 media 节点、内嵌信息卡、状态印章）；B 槽提示文字

JSX tree shown to user:

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

Note: `<CouponCard>` and `<CouponInfoCard>` use business names because Step 2 declared the coupon context. `<MediaA>` and `<MediaB>` use generic names because no Step 2 declaration identified their specific semantic.

## User Correction Gate

After outputting all trees, invite correction before proceeding:

> 如果发现结构与设计稿不符，请在进入结构比较前指出，主代理将重新派发签名子代理。

If the user identifies a mismatch, re-dispatch the affected batch with a correction instruction inside the dispatcher-instructions fence and re-validate before continuing.
