# 夹具（Fixtures）

本目录包含可复用的应用 fixture，用于 CI 回归检查与手动浏览器调试。Fixture 应用不是产品 sample，也不是 skill 源码。

## 目录结构

```text
fixtures/
  apps/
    react-vite/
  shared/
```

- `apps/<target>/` 包含面向某一框架或技术栈的自包含前端应用。
- `shared/` 存放被多个 target 有意复用的跨 fixture 资源、设计规格与说明。

## 命令

```bash
npm ci --prefix fixtures/apps/react-vite
npm run check:fixtures
npm run dev:fixture:react
```

请保持 `npm run check:fixtures` 作为面向 CI 的聚合命令。新增 fixture 应用时，再补充类似 `check:fixtures:vue3` 的 per-target 命令。
