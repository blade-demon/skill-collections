# Style Plan 工作流

在 Style Connect 之后、代码生成之前使用（当启用样式提示时）。将已确认的样式决策转为 `scripts/generate-skeleton` 消费的 `stylePlan` 字段。

## 输入

- 来自 `protocols/style-context-spec.md` 的已校验 `style_hints`。
- 来自 `workflows/style-connect.md` 的已确认 `token-ledger.md` 决策。
- 来自结构对比与 prop 建模的组件树与组件名。
- 所选 style stack：`css-modules` 或 `bem`。

## 输出契约

向传给 `generate-skeleton` 的 `SkeletonConfig` 添加 `stylePlan`：

```json
{
  "stylePlan": {
    "rules": [
      {
        "component": "RiskPage",
        "declarations": [
          { "property": "display", "value": "grid", "source": "inferred" },
          {
            "property": "gap",
            "value": "var(--space-md)",
            "source": "token-ledger",
            "comment": "Confirmed in token-ledger.md"
          }
        ],
        "variants": [
          {
            "name": "high",
            "declarations": [
              { "property": "box-shadow", "value": "var(--shadow-card)", "source": "token-ledger" }
            ]
          }
        ]
      }
    ]
  }
}
```

## 规则

- 将截图衍生样式视为 inferred，除非用户或项目 token 确认。
- 优先使用已确认 token 引用如 `var(--space-md)`，而非硬编码值。
- 仅当 Style Connect 将行标为 `hardcoded` 时使用硬编码值；包含描述 intended 未来 token 提取的 `comment`。
- 不要从截图臆造颜色、精确像素或字号。
- 不要让样式提示改变结构组件树。
- variant 名使用 lower kebab-case，因其成为 CSS 类名或 BEM modifier。
- 省略 token ledger 中标记 `skip` 的任何样式 trait。

## 默认映射指引

| Style hint              | StylePlan 用法                                                           |
| ----------------------- | ------------------------------------------------------------------------ |
| `density`               | 选择 spacing/gap token 族，如 `--space-sm`、`--space-md`、`--space-lg`   |
| `corner_radius`         | 选择 border-radius token，如 `--radius-sm`、`--radius-md`、`--radius-lg` |
| `shadow_presence`       | 若已确认则选择 elevation/shadow token                                    |
| `type_hierarchy_levels` | 除非项目 token 已确认，否则仅添加 typography TODO 注释                   |
| `primary_action_count`  | 优先现有 button/组件 API；无 token 确认时不推断颜色                      |
| `is_mobile_viewport`    | 使用布局注释或 mobile-first 容器样式，而非固定视口尺寸                   |

## 退出

以完整 `stylePlan` 对象退出，或显式说明不传递 style plan。然后运行 `workflows/code-generation.md`。
