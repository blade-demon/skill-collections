# Image Connect 工作流

Image Connect 在结构对比（Step 6）之后、属性定义（Step 9）之前运行。它通过将结构化签名与 `.image-to-component.rules.md` 及现有源文件对比，决定生成的区域应复用、扩展还是新建组件。

## 输入

必需输入：

- Step 5 中已校验的结构化签名。
- Step 6 的结构决策与 diff。
- 从各签名槽位推导的顶层角色（`T`、`M`、`B`、`O`、`F`）及容器角色（`card`、`list`、`form`、`nav`）。
- `.image-to-component.rules.md`。
- 用户在 Step 1 的选择及 Step 2 的意图声明（如有）。

若缺少 `.image-to-component.rules.md`，先运行 `workflows/init-project-rules.md`，待文件创建后再继续 Image Connect。

## 候选发现

在定义属性之前构建候选集：

1. 读取 `.image-to-component.rules.md`。
2. 当发现路径时，加入列出的基础组件（`Button`、`Card`、`Modal`、`ListItem`）。
3. 在配置的组件目录中搜索名称与顶层角色或结构对比中可能语义区域匹配的组件。
4. 当已发现候选组件导入的组件看起来像用于组合的包装器或原语时，一并纳入。
5. 排除无关页面、路由壳层、Story 文件、测试、生成构建产物及包依赖。

角色提示：

| 签名角色           | 候选名称                                             |
| ------------------ | ---------------------------------------------------- |
| `action`           | `Button`、`IconButton`、`LinkButton`、`ActionButton` |
| `card`             | `Card`、`Panel`、`Tile`、领域对象卡片                |
| `list(card)`       | `ListItem`、`ItemCard`、重复的行/卡片组件            |
| `O` 槽位 / overlay | `Modal`、`Drawer`、`Toast`、`Sheet`                  |
| `nav`              | `Tabs`、`Breadcrumb`、`NavBar`、`SegmentedControl`   |
| `form`             | `Input`、`Select`、`Switch`、字段包装器              |
| `media`            | `Image`、`Avatar`、`Icon`、媒体/资源包装器           |

不要仅凭名称臆造复用候选。候选文件必须存在且可读。

## 属性提取

读取每个候选源文件，尽可能提取其公共接口：

- TypeScript React：`interface XProps`、`type XProps`、导出的 prop 类型、泛型 `ComponentProps` 别名。
- JavaScript React：JSDoc `@typedef`、`propTypes`、解构函数参数、default props。
- Vue：`defineProps`、Options API `props`、导出的 prop 接口，以及相关的 emitted 事件。
- Barrel 文件：沿本地 export 追踪到实际组件源文件。

记录：

- 组件名称与路径。
- 必需 props。
- 可选 props。
- 回调/事件 props。
- children/slot 支持。
- className/style 扩展点。
- 无障碍 props，如 `aria-label`、`aria-labelledby` 或 `title`。
- 生成组件应使用的 import 路径。

若提取不完整，标记为 partial 并说明无法推断的部分。partial 提取本身不应视为阻塞项。

## 角色到组件匹配

对每个顶层角色或生成的子组件区域，归类为以下决策之一：

- `reuse`：现有组件无需修改源码即可覆盖该角色。
- `extend`：现有组件接近匹配，但需要少量新增 props 或变体。
- `create`：无合适组件，或复用会使生成骨架变形。

使用以下检查：

1. 角色契合：候选组件的用途是否与签名角色/容器匹配？
2. 属性契合：候选组件能否用公共 props/children/slots 渲染所需状态？
3. 组合契合：能否放入生成的拆分计划而不产生反向依赖？
4. 样式契合：是否遵循规则文件的样式栈与 class helper 策略？
5. 无障碍契合：能否满足规则文件的无障碍要求？
6. 包契合：是否遵守 icon 来源与依赖规则？

当覆盖度高时，优先复用原语（`Button`、`Card`、`Modal`、`ListItem`）。当现有组件在语义上无关时，即使结构相似，也优先为领域特定区域 `create`。

## 覆盖度评分标准

以百分比估算实际覆盖度。这是判断辅助，而非数学证明：

| 覆盖度  | 含义                                            | 默认决策 |
| ------- | ----------------------------------------------- | -------- |
| 85-100% | 候选组件可用现有公共 API 与规则合规性渲染该角色 | `reuse`  |
| 60-84%  | 候选组件接近匹配，但需要少量新增 API 或变体     | `extend` |
| 0-59%   | 候选组件缺少主要结构、状态、样式或无障碍需求    | `create` |

覆盖度因素：

- 30% 角色与语义匹配。
- 25% 所需结构/children/slots 支持。
- 20% props 与状态 API 契合。
- 15% 样式与 class 组合兼容性。
- 10% 无障碍与依赖合规。

当必需 props 无法推断、组件强加无关语义，或复用需要在生成组件范围外修改行为时，降低覆盖度。

## 候选表格式

在 Step 9 之前输出表格并等待确认：

```markdown
Image Connect candidates:

| Region / role  | Signature source     | Candidate | Path                               | Extracted API                                   | Coverage | Decision | Notes                         |
| -------------- | -------------------- | --------- | ---------------------------------- | ----------------------------------------------- | -------: | -------- | ----------------------------- |
| Action buttons | `B: action + action` | `Button`  | `src/components/Button/Button.tsx` | `variant?`, `disabled?`, `onClick?`, `children` |      92% | reuse    | Add `aria-label` at call site |
| Main card      | `M: card(...)`       | `Card`    | `src/components/Card/Card.tsx`     | `children`, `className?`                        |      88% | reuse    | Use existing wrapper          |
| Status stamp   | `M.card.status`      | none      | -                                  | -                                               |       0% | create   | Domain-specific state marker  |
```

当无候选时，使用 `none`、`-` 和 `0%`。

表格之后询问：

```text
Please confirm Image Connect decisions:
A. Accept these reuse/extend/create decisions and continue to prop definition.
B. Change one or more decisions. Tell me which rows should be reuse, extend, or create.
C. Skip Image Connect for this run and create all generated regions from scratch.
```

在用户确认 A、B 或 C 之前，不要进入属性定义或代码生成。

## 确认门控

用户选择处理：

| Choice | Action                                                                  |
| ------ | ----------------------------------------------------------------------- |
| A      | 记录决策并继续 Step 9。                                                 |
| B      | 应用用户行级修改，更新决策表；若仍有歧义决策则再次请求确认。            |
| C      | 记录 Image Connect 已跳过；将所有生成区域标记为 `create`；继续 Step 9。 |

若决策为 `extend`，在编辑现有组件前请求确认，除非用户已要求直接改文件且变更在允许的输出范围内。若扩展会修改允许范围外的文件，停止并报告阻塞项。

## 供给 Step 9 与 Step 10

Image Connect 决策约束后续步骤：

- Step 9 属性定义仅包含新建/扩展生成组件所需的 props，并须适配复用组件的现有公共 API。
- 复用组件通过 import 引入，不重新生成。
- 扩展组件保持现有 API 兼容；除非用户明确批准破坏性变更，否则仅允许新增可选 props 或变体。
- 新建组件遵循 `.image-to-component.rules.md` 中的目录、样式栈、`cn` helper、icon 来源、无障碍与测试命令。
- Step 10 拆分计划须分别展示复用、扩展与新建文件。
- Step 10 代码生成须保留现有组件所有权边界，避免共享/基础组件对生成领域组件产生反向依赖。

若 Image Connect 改变了 Step 11 的预期目录树，在写入或输出文件前更新目录树，使其与已确认决策一致。
