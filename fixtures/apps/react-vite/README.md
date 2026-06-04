# Fixture 应用：React + Vite

本目录包含一个用于 skill 开发与校验的小型 React + TypeScript + Vite 应用。

它不是产品 sample，也不属于已发布的 skill。请保持实现刻意简单，以便 skill 在测试面向应用的工作流时拥有可预期的输入。

应用会在页面中可见渲染 `src/golden/` 的生成 React 包，并通过 fixture 检查证明它可被 lint、测试与构建。

## 命令

```bash
npm ci --prefix fixtures/apps/react-vite
npm run dev:fixture:react
npm run check:fixtures:react
```

`node_modules/`、`dist/` 等生成物必须保持未跟踪。
