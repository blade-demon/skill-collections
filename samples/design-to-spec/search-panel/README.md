# Sample：search-panel

一个动手练习 workspace：接收 UI 设计稿 + API 文档 + 交互说明，经 `design-to-spec` skill 处理并实现结果。

## 本 sample 教什么

- 仓库内完整的 **inputs → spec → implementation** 闭环
- 典型的「搜索框 + 提交 + 结果列表」UI 单元（常见于搜索栏、筛选面板、查找控件）
- 同一组件中三种方向的 `bindings`（`ui_to_api`、`api_to_ui`、`ui_to_event`）如何出现
- `state_machine` 转换如何对应运行时行为（idle → loading → success/empty/error）
- `data-fetching.md` 如何落地为实际的 fetch + abort + 错误处理代码

## 本 sample 不是什么

- **不是**生产级组件库。状态管理刻意极简（无 Redux / Zustand / Pinia）。
- **不是**框架演示。采用 Vanilla HTML + JS + CSS，以便 spec → 实现 的映射清晰无歧义。
- **不是**对 skill 本身的测试。请参阅 `skills/design-to-spec/scripts/tests/`。

## 目录结构

```
samples/design-to-spec/search-panel/
├── README.md             # 本文件
├── package.json          # 基于 Vite 的 dev server + build
├── inputs/               # 原始材料（提交后视为不可变）
│   ├── design.svg        # 含全部状态的 UI 稿
│   ├── api.md            # API 文档
│   └── interaction-notes.md   # 自然语言交互说明
├── design-spec/          # Skill 输出（重新生成，勿手改）
│   └── search-panel/
│       ├── contracts/
│       ├── notes.md
│       ├── data-fetching.md
│       └── specs/search-panel/spec.md
├── src/                  # 仅依据 design-spec/ 构建的实现
│   ├── index.html
│   ├── main.js
│   └── style.css
└── walkthrough.md        # design-spec/ 如何生成（回顾性文档）
```

## 本地运行

在**仓库根目录**安装一次：

```bash
npm install
```

然后在本目录：

```bash
npm run dev      # Vite 开发服务器（打开打印的 URL）
npm run build    # 生产构建输出到 ./dist
```

开发服务器在 `src/main.js` 中使用简易 mock fetch，无需后端。

## 如何重新生成 spec

若修改了 `inputs/` 或需验证 skill 产出相同制品：

```bash
# 在本目录执行
node ../../../skills/design-to-spec/scripts/generate-output.js \
  --ui design-spec/search-panel/contracts/ui-schema.yaml \
  --api design-spec/search-panel/contracts/api-schema.yaml \
  --mapping design-spec/search-panel/contracts/mapping-logic.yaml \
  --out-dir design-spec/search-panel
```

校验：

```bash
node ../../../skills/design-to-spec/scripts/validate-contracts.js \
  --ui design-spec/search-panel/contracts/ui-schema.yaml \
  --api design-spec/search-panel/contracts/api-schema.yaml \
  --mapping design-spec/search-panel/contracts/mapping-logic.yaml

node ../../../skills/design-to-spec/scripts/validate-output.js --strict \
  --ui design-spec/search-panel/contracts/ui-schema.yaml \
  --api design-spec/search-panel/contracts/api-schema.yaml \
  --mapping design-spec/search-panel/contracts/mapping-logic.yaml \
  --notes design-spec/search-panel/notes.md \
  --data-fetching design-spec/search-panel/data-fetching.md \
  --spec design-spec/search-panel/specs/search-panel/spec.md
```

## 如何阅读本 sample

若有一小时并希望了解工作流：

1. 阅读 [`inputs/design.svg`](./inputs/design.svg)、[`inputs/api.md`](./inputs/api.md)、[`inputs/interaction-notes.md`](./inputs/interaction-notes.md)（约 5 分钟）
2. 阅读 [`walkthrough.md`](./walkthrough.md)，了解 `design-spec/` 如何从上述输入产出（约 15 分钟）
3. 浏览 `design-spec/search-panel/notes.md` 与 `spec.md`（约 10 分钟）
4. 对照 `design-spec/search-panel/data-fetching.md` 与 `spec.md` 阅读 `src/main.js`，看实现如何映射到 spec（约 20 分钟）
5. 运行 `npm run dev`，逐一点击四种状态（约 5 分钟）
