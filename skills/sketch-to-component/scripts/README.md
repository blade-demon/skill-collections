# sketch-to-component scripts (CLI)

D2C 管线 Sketch 段的 provider 专用 CLI。采集并将 `.sketch` 文件规范化为共享 `design-ir.json`，渲染 Stage 4 preview，运行 Stage 5 contract 链。所有共享 schema / derive 逻辑在 `@skill-collections/d2c-core`；本包拥有 provider 解析与**唯一**磁盘 IO（core 保持纯）。

经 `tsx` 运行（无构建步骤）：

```bash
npm run extract   -- --file <app.sketch> --out <dir>
npm run normalize -- --raw <dir>/ir/raw-dsl.json --out <dir> [--artboard <id|name>]
npm run preview   -- --design-ir <dir>/ir/design-ir.json --out <dir>
npm run contract  -- (--file <app.sketch> [--artboard <id|name>] | --design-ir <path>) \
                     --out <dir> --mode presentational \
                     --interaction-mode <omitted|deferred> \
                     --approval-reason <str> --approved-by <str> --approved-at <iso>
```

## `contract`（Stage 5D）

运行 `runContract`（链接 visual-view → semantic-view → interaction-spec → component-plan），并将结果写入 `<out>/`。

输入恰好其一：

- `--file <app.sketch>` —— extract + normalize，再运行完整链。同时持久化规范化 `ir/design-ir.json`，使输出目录为自包含、可重跑记录。
- `--design-ir <path>` —— 从现有 `design-ir.json` 开始。

输出布局：

```
<out>/
  ir/
    design-ir.json        # only written for --file
  design-spec/
    visual-view.json
    semantic-view.json
    interaction-spec.json
    component-plan.json
    manifest.json         # { artifacts: [{ filename, hash, origin, generatedFrom }] }
```

Artifact 序列化为排序键、pretty JSON 并带末尾换行，使相同输入跨运行产生字节级相同输出（由 `contract-golden` 测试锁定）。

### Flags

- `--mode presentational | interactive` —— component-plan codegen 原型。**本 CLI 拒绝 `interactive`**：它 derive interaction spec，而 interaction spec 永不为 `approved`，interactive mode 需要 approved spec。喂入预批准 spec（reuse-input 流程）为计划后续；目前使用 `--mode presentational`。
- `--interaction-mode draft | omitted | deferred` —— interaction spec 如何 derive。`omitted` / `deferred` 需要下方三个 approval flag；`draft` 不得携带。（注：presentational mode 需要 `omitted` 或 `deferred`。）
- `--approval-reason` / `--approved-by` / `--approved-at` —— 三者全有或全无。
- `--artboard <id|name>` —— 画板选择器，仅对 `--file` 有意义。

### 边界

`d2c-core` 不做文件 IO。`runContract` 与 `buildContractManifest` 返回内存值；`planContractFiles`（在 `src/cli.ts`）序列化为字符串；仅 `runContractCommand` 调用 `mkdir` / `writeFile`。

## Tests

```bash
npm run typecheck
npm test
```

`.sketch` 输入被 gitignore，因此 contract golden 使用已提交的 `design-ir.json` fixture（`src/__tests__/fixtures/contract-golden/`）并断言字节级相同的 `design-spec/` 输出。`.sketch → design-ir` 步骤由 normalize 测试单独覆盖。
