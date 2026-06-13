# Codegen G1 渐变端到端验证

日期：2026-06-13

分支：`codex/codegen-g1-gradient`

基线：`master@d3d5058`

## 结论

G1 已完成端到端验证。真实稿 visual harness 从 17 条失败降至 10 条:

- 渐变相关 `backgroundColor` / `color` 失败：7 → 0。
- 剩余失败：10 条，全部是 G2 范围的字体宽度差异。
- 候选截图中的聊天气泡恢复蓝色渐变，`推荐理由：` 渐变文字可见。

验证产物位于 gitignored 的 `.d2c-run-compare/harness/`:

- `review.html`
- `baseline.png`
- `candidate.png`

## Golden

执行：

```bash
npm test --workspace @skill-collections/sketch-to-component-scripts -- \
  src/__tests__/codegen-golden.test.ts
```

结果：3/3 PASS。

现有 golden fixture 不含本次受影响的真实渐变节点。以下目录相对 HEAD 均为零 diff:

- `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden`
- `fixtures/apps/react-vite/src/golden`

因此不需要重生 golden，也不创建空的 golden commit。

## 真实稿

输入使用主 checkout 中 gitignored 的真实文件:

`/Users/blade/IdeaProjects/skill-collections/skills/sketch-to-component/resource/d2c.sketch`

隔离 worktree 中依次执行 `extract`、`contract`、`approve`、`preview`、`codegen`:

- extract：2 pages、5 assets、3 images。
- preview：3 real assets、0 placeholders。
- codegen：118 files、3 assets。
- 生成 CSS：7 个 `linear-gradient(`，2 个 `background-clip: text`。

Harness 结果:

```text
rect width mismatch: 10
backgroundColor mismatch: 0
style color mismatch: 0
```

## 最终门禁

通过:

- D2C style/codegen/preview：20 files、111 tests。
- `npm run typecheck:d2c`
- `npm run lint`
- `npm run format:check`
- `npm run test:samples`
- `npm run build:samples`
- `npm run check:fixtures`：8 tests + fixture production build。

`npm run check:full` 复现唯一已知环境失败:

```text
visual-harness.test.ts:435
fixtureDir/outDir path regex expects .../skill-collections/...
actual worktree is .../skill-collections-g1-gradient/...
```

该 Sketch suite 结果为 154 PASS / 1 expected FAIL。未出现其它回归。

## 范围

实现仅涉及:

- `packages/d2c-core/src/style/`
- `packages/d2c-core/src/preview/generate-preview.ts`
- React codegen 实现、fixture 与内容测试
- G1 计划、路线图和验证报告

未修改 contract、normalize、IR schema、#77 child import guard 或 parent-relative 坐标逻辑。
