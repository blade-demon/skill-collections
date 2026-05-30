> **代码生成由脚本驱动。** 从 Step 9 的组件树与 prop 定义构建 `SkeletonConfig` JSON，Step 8 启用样式提示时加上 `stylePlan`，然后运行：
>
> ```bash
> echo '<SkeletonConfig JSON>' | npm run generate-skeleton
> ```
>
> 输出为 `[{path, content}]` JSON 数组。将该数组作为 Step 11 的文件列表。**不要**读取 `templates/` —— 那些文件已移除。
>
> **SkeletonConfig 形状：**
>
> ```json
> {
>   "framework": "react|vue3|vue2",
>   "lang": "ts|js",
>   "style": "css-modules|bem",
>   "rootComponent": {
>     "name": "ComponentName",
>     "element": "article",
>     "discriminator": { "propName": "status", "type": "Status", "variants": ["a", "b"] },
>     "props": [{ "name": "title", "type": "string", "required": true }],
>     "children": [{ "name": "Header", "element": "header", "props": [], "children": [] }]
>   },
>   "stylePlan": {
>     "rules": [
>       {
>         "component": "ComponentName",
>         "declarations": [
>           { "property": "display", "value": "grid", "source": "inferred" },
>           { "property": "gap", "value": "var(--space-md)", "source": "token-ledger" }
>         ]
>       }
>     ]
>   }
> }
> ```

# 代码生成工作流

在 prop 建模之后使用。

## 拆分规则

- 根组件拥有 `status`、共享 data props 与组合。
- 按结构区域拆分：`T` header/status hero、`M` main content/card/media、`B` footer/action area、`O` overlay、`F` floating action。
- 当区域随 status 变化、重复、资源密集、结构非平凡或为 distinct 语义区域时拆分。
- 静态业务对象区域在视觉 distinct 时仍应为独立组件。
- 仅传递子组件需要的 props。不要传递整个 parent props 对象。

## Class 组合

- 遵循 `.image-to-component.rules.md` 的 `cn` helper 路径。
- React：使用现有 `cn`、`clsx` 或 `classnames`；若 rules 授权缺失 helper，在配置路径添加一次。
- Vue：使用原生 array/object 绑定，除非项目已有 helper。
- 不要手工构建长条件 class 字符串。

## Token 用法（来自 Style Connect）

若 Step 8 运行 Style Connect 并产出 token-ledger：

- **Provided tokens**（status：`provided` 或 `reused`）—— 在生成代码中直接引用。
  - CSS：`color: var(--token-name);`
  - SCSS：`color: $token-name;`
  - Tailwind：若项目将 token 暴露为 class 则使用 token class。
- **Create tokens**（status：`create`）—— 添加 TODO 注释并内联值，或创建占位 CSS 变量。
  - `color: var(--new-token-name); /* TODO: define this token in design system */`
- **Hardcoded tokens**（status：`hardcoded`）—— 用 TODO 标记待提取。
  - `color: #ff6b6b; /* TODO: extract to token --color-warning */`
- **Skipped tokens**（status：`skip`）—— 完全省略样式；依赖浏览器默认或继承。

代码生成时若 token status 尚未完全 resolved，查 token-ledger 行并遵循 `User action` 列指引。

## Style Plan 用法

若 `workflows/style-plan.md` 产出 `SkeletonConfig.stylePlan`，将其包含在传给 `generate-skeleton` 的 JSON 中。

React 生成现已消费 `stylePlan`：

- CSS Modules：将 declarations 写入 root 与子 `.module.css`。
- BEM：仅为有 style rules 的组件生成并 import root 与子 `.css`。

Vue 生成在实现 Vue 样式支持前可忽略 `stylePlan`。除非测试覆盖，不要声称 Vue 样式生成。

## 模板选择

根据 Step 1 选择恰好读一个模板：

| Framework | Language                 | Style stack     | Template                             |
| --------- | ------------------------ | --------------- | ------------------------------------ |
| React     | TypeScript               | CSS Modules     | `templates/react-tsx-css-modules.md` |
| React     | TypeScript               | plain CSS + BEM | `templates/react-tsx-bem.md`         |
| React     | JavaScript               | CSS Modules     | `templates/react-jsx-css-modules.md` |
| React     | JavaScript               | plain CSS + BEM | `templates/react-jsx-bem.md`         |
| Vue 3     | TypeScript or JavaScript | CSS Modules     | `templates/vue3-sfc-css-modules.md`  |
| Vue 3     | TypeScript or JavaScript | plain CSS + BEM | `templates/vue3-sfc-bem.md`          |
| Vue 2     | TypeScript or JavaScript | CSS Modules     | `templates/vue2-sfc-css-modules.md`  |
| Vue 2     | TypeScript or JavaScript | plain CSS + BEM | `templates/vue2-sfc-bem.md`          |

永不混用 TypeScript 与 JavaScript 语法。若用户选择不支持 framework，运行 `degraded-mode.md` 且仅输出结构指引。

## 目录树规则

- 代码 skeleton 须与计划树完全一致。
- React CSS Modules 列出 root `.module.css` 与每个子组件 `.module.css`。
- Vue CSS Modules 默认在每个 SFC 内用 `<style module>`。
- React + JavaScript 用带 JSDoc typedef 的 `types.js`，非 `types.ts`。

## 退出

以完整目录树与 skeleton 内容或文件写入计划退出，供 `output-and-writing.md` 使用。
