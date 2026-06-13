# Codegen G1 渐变填充对齐 Preview 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 React codegen 对 Sketch 渐变填充输出 `background-image: linear-gradient(...)`(盒子)与 background-clip:text 渐变文字,与 preview 字节一致,消除「蓝色气泡渲染成橙色实色」。

**Architecture:** 把 preview 现有的 `linearGradientCss` 及其渐变解析原语抽到新的共享纯函数模块 `packages/d2c-core/src/style/gradient.ts`,preview 与 codegen **同源消费**(杜绝两端分叉)。codegen 在盒子填充与文字两处加 gradient 分支:渐变 → background-image / background-clip:text;radial/angular/解析失败回退实色(与 preview 同语义,不静默丢色)。

**Tech Stack:** TypeScript、Vitest、现有 d2c-core preview/codegen 管线、sketch-to-component CLI + visual-harness。

**依据:** [路线图 PR-G1](2026-06-13-codegen-fidelity-and-reuse-roadmap.md)、[2026-06-13 对比报告](../reports/codegen-vs-preview-fidelity-run-2026-06-13.md)。

**执行结果:** 已完成。详见
[G1 端到端验证报告](../../reports/codegen-g1-gradient-verification-2026-06-13.md)。

---

## File Map

- 创建 `packages/d2c-core/src/style/gradient.ts`：共享 `linearGradientCss` + 渐变原语(`parseGradientPoint`/`gradientStopColor`/`colorChannel`/`toHexByte`),preview 与 codegen 唯一来源。
- 创建 `packages/d2c-core/src/style/__tests__/gradient.test.ts`：纯函数红/绿单测。
- 修改 `packages/d2c-core/src/preview/generate-preview.ts`：删除被移动的 5 个定义,改为从 `../style/gradient` import(行为不变,既有 preview 测试保持绿)。
- 修改 `packages/d2c-core/src/codegen/react/generate.ts`：`visualStyleDeclarations` 盒子渐变分支、`textStyleDeclarations` 文字渐变分支。
- 修改 `packages/d2c-core/src/codegen/__tests__/codegen-fixtures.ts`：新增渐变 fixture。
- 修改 `packages/d2c-core/src/codegen/__tests__/generate-content.test.ts`：盒子/文字渐变红绿覆盖。
- 视情况修改 `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/*`：真实稿含 13 个渐变节点,golden 字节会变,需重生。

> **worktree 已知坑**：本分支在 `/private/tmp/skill-collections-g1-gradient`,`visual-harness.test.ts:437/440` 写死 `skill-collections/` 路径正则,异名 worktree 里**该单测必失**(见 memory `skill-collections-worktree-name-pitfall`)。本计划的验证用定向测试 + 手动 harness 跑;完整 `check:full` 的唯一可接受失败就是这条路径名断言,由 CI 终判。

---

## Task 1：抽取共享渐变模块并让 preview 同源消费(行为保持)

**Files:**
- Create: `packages/d2c-core/src/style/gradient.ts`
- Create: `packages/d2c-core/src/style/__tests__/gradient.test.ts`
- Modify: `packages/d2c-core/src/preview/generate-preview.ts:1-8`（import）、删除 `linearGradientCss`(525-561)、`parseGradientPoint`(646-657)、`gradientStopColor`(659-667)、`colorChannel`(669-672)、`toHexByte`(674-676)

- [x] **Step 1: 写共享模块单测(RED)**

`packages/d2c-core/src/style/__tests__/gradient.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import type { Fill } from '../../ir';
import { linearGradientCss } from '../gradient';

function gradientFill(overrides: Partial<Record<string, unknown>> = {}): Fill {
  return {
    type: 'gradient',
    color: '#FA5900FF',
    raw: {
      gradient: {
        gradientType: 0,
        from: '{0, 0}',
        to: '{0, 1}',
        stops: [
          { position: 0, color: { red: 1, green: 0, blue: 0, alpha: 1 } },
          { position: 1, color: { red: 0, green: 0, blue: 1, alpha: 1 } },
        ],
        ...overrides,
      },
    },
  } as Fill;
}

describe('linearGradientCss', () => {
  it('renders a vertical two-stop linear gradient', () => {
    expect(linearGradientCss(gradientFill())).toBe(
      'linear-gradient(180deg, #FF0000FF 0%, #0000FFFF 100%)',
    );
  });

  it('orders stops by position regardless of input order', () => {
    const fill = gradientFill({
      stops: [
        { position: 1, color: { red: 0, green: 0, blue: 1, alpha: 1 } },
        { position: 0, color: { red: 1, green: 0, blue: 0, alpha: 1 } },
      ],
    });
    expect(linearGradientCss(fill)).toBe('linear-gradient(180deg, #FF0000FF 0%, #0000FFFF 100%)');
  });

  it('returns undefined for radial gradients (caller falls back to solid)', () => {
    expect(linearGradientCss(gradientFill({ gradientType: 1 }))).toBeUndefined();
  });

  it('returns undefined when gradient data is missing or malformed', () => {
    expect(linearGradientCss({ type: 'gradient', color: '#FA5900FF' } as Fill)).toBeUndefined();
    expect(linearGradientCss(gradientFill({ stops: [] }))).toBeUndefined();
    expect(linearGradientCss(gradientFill({ from: '{0,0}', to: '{0,0}' }))).toBeUndefined();
  });
});
```

- [x] **Step 2: 跑单测验证 RED**

Run: `npm test --workspace @skill-collections/d2c-core -- src/style/__tests__/gradient.test.ts`
Expected: FAIL —— `Cannot find module '../gradient'`。

- [x] **Step 3: 创建共享模块(逐字移植 preview 现有逻辑)**

`packages/d2c-core/src/style/gradient.ts`：

```ts
import type { Fill } from '../ir';

/**
 * Sketch 渐变填充 → CSS `linear-gradient(...)`。preview 与 codegen 同源消费,
 * 保证两端渐变字节一致。仅处理 linear(gradientType 0);radial/angular/解析失败
 * 返回 undefined,由调用方回退实色——与历史 preview 语义一致,不静默错色。
 */
export function linearGradientCss(fill: Fill): string | undefined {
  const raw = fill.raw;
  if (!raw || typeof raw !== 'object') return undefined;
  const gradient = (raw as { gradient?: unknown }).gradient;
  if (!gradient || typeof gradient !== 'object') return undefined;
  const g = gradient as Record<string, unknown>;
  // gradientType: 0 = linear, 1 = radial, 2 = angular. 仅 linear。
  if (g.gradientType !== 0) return undefined;

  const from = parseGradientPoint(g.from);
  const to = parseGradientPoint(g.to);
  if (!from || !to) return undefined;

  const stops = Array.isArray(g.stops) ? g.stops : undefined;
  if (!stops || stops.length === 0) return undefined;

  const ordered: Array<{ position: number; hex: string }> = [];
  for (const stop of stops) {
    if (!stop || typeof stop !== 'object') return undefined;
    const s = stop as Record<string, unknown>;
    const position = typeof s.position === 'number' ? s.position : undefined;
    const hex = gradientStopColor(s.color);
    if (position === undefined || !hex) return undefined;
    ordered.push({ position, hex });
  }
  ordered.sort((a, b) => a.position - b.position);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return undefined;
  const angleDeg = roundTo((Math.atan2(dx, -dy) * 180) / Math.PI + 360, 100) % 360;
  const stopsCss = ordered
    .map(({ position, hex }) => `${hex} ${formatNumber(roundTo(position * 100, 100))}%`)
    .join(', ');

  return `linear-gradient(${formatNumber(angleDeg)}deg, ${stopsCss})`;
}

/** Sketch 点串 `"{x, y}"` → 数值对。供 linear 与(G3)svg 渐变共用。 */
export function parseGradientPoint(value: unknown): { x: number; y: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const match =
    /^\{\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*\}$/i.exec(
      value.trim(),
    );
  if (!match || match[1] === undefined || match[2] === undefined) return undefined;
  const x = Number.parseFloat(match[1]);
  const y = Number.parseFloat(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
}

/** Sketch stop 颜色对象 → `#RRGGBBAA`。 */
export function gradientStopColor(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const c = value as Record<string, unknown>;
  const r = colorChannel(c.red);
  const g = colorChannel(c.green);
  const b = colorChannel(c.blue);
  const a = colorChannel(c.alpha ?? 1);
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}${toHexByte(a)}`;
}

export function colorChannel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

export function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function roundTo(value: number, factor: number): number {
  return Math.round(value * factor) / factor;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}
```

- [x] **Step 4: 跑单测验证 GREEN**

Run: `npm test --workspace @skill-collections/d2c-core -- src/style/__tests__/gradient.test.ts`
Expected: PASS（4 个 it 全绿）。

- [x] **Step 5: preview 改为同源消费(删除被移动定义)**

在 `generate-preview.ts` 顶部 import 区(当前 1-8 行从 `../ir` 引入)新增一行:

```ts
import {
  colorChannel,
  gradientStopColor,
  linearGradientCss,
  parseGradientPoint,
  toHexByte,
} from '../style/gradient';
```

然后**删除** `generate-preview.ts` 中这 5 个函数的本地定义:`linearGradientCss`(525-561)、`parseGradientPoint`(646-657)、`gradientStopColor`(659-667)、`colorChannel`(669-672)、`toHexByte`(674-676)。
保留 `formatNumber`、`roundTo`(preview 其余处仍在用,grep 确认 formatNumber 18 处、roundTo 6 处)。
`svgGradientFill` / `svgGradientStopMarkup` 现引用的 `parseGradientPoint`/`colorChannel`/`toHexByte` 改由 import 提供,无需改调用处。

- [x] **Step 6: 跑 preview 既有测试确认行为不变(GREEN)**

Run:
```bash
npm test --workspace @skill-collections/d2c-core -- \
  src/preview/__tests__/gradient-preview.test.ts \
  src/preview/__tests__/vector-svg-preview.test.ts \
  src/preview/__tests__/gradient-text 2>/dev/null
npm run typecheck:d2c
```
Expected: PASS —— preview 渐变/矢量输出逐字节不变(同源移植),typecheck 干净。
（若 `gradient-text` 文件名不存在则忽略该项;关键是 gradient-preview 与 vector-svg-preview 绿。)

- [x] **Step 7: Commit**

```bash
git add packages/d2c-core/src/style/gradient.ts \
  packages/d2c-core/src/style/__tests__/gradient.test.ts \
  packages/d2c-core/src/preview/generate-preview.ts
git commit -m "refactor(d2c): extract shared linearGradientCss into src/style/gradient"
```

---

## Task 2：codegen 盒子填充渐变分支

**Files:**
- Modify: `packages/d2c-core/src/codegen/__tests__/codegen-fixtures.ts`
- Modify: `packages/d2c-core/src/codegen/__tests__/generate-content.test.ts`
- Modify: `packages/d2c-core/src/codegen/react/generate.ts:9-20`（import）、`visualStyleDeclarations:193-223`

- [x] **Step 1: 新增渐变 fixture**

在 `codegen-fixtures.ts` 末尾追加(沿用文件已有的 `frame`/`text`/`source` helper 与 `approvedStyledCardInput` 的封装方式):

```ts
/** 渐变盒子 + 渐变文字,数值取自真实蓝色气泡(146.95° 系列,这里用 180° 简化)。 */
export function gradientShowcaseDesignIr(): DesignIR {
  const root = frame(
    'grad-root',
    'GradientShowcase',
    { x: 0, y: 0, width: 320, height: 160 },
    [
      // 渐变气泡:legacy 实色 #FA5900FF 必须被 background-image 覆盖,不得输出。
      frame('grad-bubble', 'Bubble', { x: 16, y: 16, width: 200, height: 60 }, [], {
        style: {
          fills: [
            {
              type: 'gradient',
              color: '#FA5900FF',
              raw: {
                gradient: {
                  gradientType: 0,
                  from: '{0.5, 0}',
                  to: '{0.5, 1}',
                  stops: [
                    { position: 0, color: { red: 0.4078, green: 0.6157, blue: 1, alpha: 1 } },
                    { position: 1, color: { red: 0.1529, green: 0.4902, blue: 1, alpha: 1 } },
                  ],
                },
              },
            },
          ],
          radius: 12,
        },
      }),
      // 渐变文字标题。
      text(
        'grad-title',
        '推荐理由：',
        { x: 16, y: 96, width: 120, height: 24 },
        {
          fontFamily: 'PingFangSC',
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 24,
          color: '#102A43FF',
        },
        {
          style: {
            fills: [
              {
                type: 'gradient',
                color: '#102A43FF',
                raw: {
                  gradient: {
                    gradientType: 0,
                    from: '{0, 0.5}',
                    to: '{1, 0.5}',
                    stops: [
                      { position: 0, color: { red: 1, green: 0, blue: 0, alpha: 1 } },
                      { position: 1, color: { red: 0, green: 0, blue: 1, alpha: 1 } },
                    ],
                  },
                },
              },
            ],
          },
        },
      ),
    ],
  );

  return {
    schemaVersion: 'd2c.design-ir/v0.3.0',
    source: {
      提供方: 'test',
      ref: { fileName: 'fixture.sketch', documentId: 'doc-grad' },
      rootName: 'Gradient Showcase',
    },
    visual: { artboard: { width: 320, height: 160 }, root, assets: [] },
    semantic: { candidates: [] },
    interaction: { status: 'draft' },
    warnings: [],
  };
}

export function approvedGradientShowcaseInput(): CodegenInput {
  const { componentPlan, visualView, semanticView, interactionSpec } = runContract({
    designIr: gradientShowcaseDesignIr(),
    mode: 'presentational',
    interactionMode: 'deferred',
    approval: APPROVAL,
  });
  return {
    componentPlan: approveComponentPlan(componentPlan, SIGN_OFF),
    visualView,
    semanticView,
    interactionSpec,
  };
}
```

> **两处前置改动(已与代码核对)**：
> 1. `text()` helper 当前签名是 `text(id, content, layout, style)`(4 参,codegen-fixtures.ts:98-114),**没有** `extras` 参。先把它扩展出可选 `extras: Partial<VisualNode> = {}` 并在返回对象末尾 `...extras` 展开(与 `frame()` 一致),才能给文字节点注入 `style.fills`。
> 2. **不存在** `approvedInputFromDesignIr` 封装。上面 `approvedGradientShowcaseInput` 直接复刻 `approvedStyledCardInput`(codegen-fixtures.ts:226-239)的 `runContract(...) + approveComponentPlan(componentPlan, SIGN_OFF)` 链路,复用文件顶部既有的 `APPROVAL` / `SIGN_OFF` / `runContract` / `approveComponentPlan` 导入,勿新造封装。

- [x] **Step 2: 写盒子渐变失败测试(RED)**

在 `generate-content.test.ts` 增加(import 处加 `approvedGradientShowcaseInput`):

```ts
it('emits background-image gradient for a gradient box fill, not the legacy solid color', () => {
  const input = approvedGradientShowcaseInput();
  const filePlan = generateComponentPackage(input);
  const css = filePlan.files
    .filter((f) => f.path.endsWith('.module.css'))
    .map((f) => f.content)
    .join('\n');

  expect(css).toContain('background-image: linear-gradient(180deg, #689DFFFF 0%, #277DFFFF 100%);');
  expect(css).not.toContain('background-color: #FA5900FF;');
});
```

- [x] **Step 3: 跑测试验证 RED**

Run: `npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/generate-content.test.ts -t "gradient box fill"`
Expected: FAIL —— 当前输出 `background-color: #FA5900FF;`,无 `background-image`。

- [x] **Step 4: 实现盒子渐变分支**

`generate.ts` import 区加：

```ts
import { linearGradientCss } from '../../style/gradient';
```

把 `visualStyleDeclarations`(193-199)的填充块改为：

```ts
  const fill = style?.fills?.[0];
  if (fill && shouldRenderBoxFill(node)) {
    const gradientCss = fill.type === 'gradient' ? linearGradientCss(fill) : undefined;
    if (gradientCss) {
      declarations.push(`background-image: ${gradientCss};`);
    } else if (fill.color !== undefined) {
      declarations.push(`background-color: ${fill.color};`);
    }
  }
```

- [x] **Step 5: 跑测试验证 GREEN**

Run:
```bash
npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/generate-content.test.ts
npm run typecheck:d2c
```
Expected: PASS（新测试绿,既有内容测试不回归)。

- [x] **Step 6: Commit**

```bash
git add packages/d2c-core/src/codegen/react/generate.ts \
  packages/d2c-core/src/codegen/__tests__/codegen-fixtures.ts \
  packages/d2c-core/src/codegen/__tests__/generate-content.test.ts
git commit -m "feat(codegen): render gradient box fills as background-image"
```

---

## Task 3：codegen 文字渐变分支(background-clip:text)

**Files:**
- Modify: `packages/d2c-core/src/codegen/__tests__/generate-content.test.ts`
- Modify: `packages/d2c-core/src/codegen/react/generate.ts:225-245`（`textStyleDeclarations`）

- [x] **Step 1: 写文字渐变失败测试(RED)**

```ts
it('renders gradient text via background-clip:text + transparent color', () => {
  const input = approvedGradientShowcaseInput();
  const filePlan = generateComponentPackage(input);
  const css = filePlan.files
    .filter((f) => f.path.endsWith('.module.css'))
    .map((f) => f.content)
    .join('\n');

  expect(css).toContain('background-image: linear-gradient(90deg, #FF0000FF 0%, #0000FFFF 100%);');
  expect(css).toContain('-webkit-background-clip: text;');
  expect(css).toContain('background-clip: text;');
  expect(css).toContain('color: transparent;');
  expect(css).not.toContain('color: #102A43FF;');
});
```

> 说明:文字渐变 from `{0,0.5}`→`{1,0.5}` 为水平,dx=1,dy=0 → 角度 `atan2(1,0)=90°` → `90deg`。

- [x] **Step 2: 跑测试验证 RED**

Run: `npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/generate-content.test.ts -t "gradient text"`
Expected: FAIL —— 当前文字节点只输出 `color: #102A43FF;`,无渐变。

- [x] **Step 3: 实现文字渐变分支**

把 `textStyleDeclarations` 中输出 `color` 的那行(当前 241)替换为渐变优先、实色回退的块(放在 `line-height` 之后、`text-align` 之前):

```ts
  const textFill = node.style?.fills?.[0];
  const textGradientCss = textFill?.type === 'gradient' ? linearGradientCss(textFill) : undefined;
  if (textGradientCss) {
    declarations.push(`background-image: ${textGradientCss};`);
    declarations.push('-webkit-background-clip: text;');
    declarations.push('background-clip: text;');
    declarations.push('color: transparent;');
  } else if (textStyle?.color !== undefined) {
    declarations.push(`color: ${textStyle.color};`);
  }
  declarations.push(`text-align: ${textStyle?.textAlign ?? 'left'};`);
```

（`text-align` 那行原本已存在于 242,替换时合并进来,勿重复输出。）

- [x] **Step 4: 跑测试验证 GREEN**

Run:
```bash
npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/generate-content.test.ts
npm run typecheck:d2c
```
Expected: PASS。

- [x] **Step 5: Commit**

```bash
git add packages/d2c-core/src/codegen/react/generate.ts \
  packages/d2c-core/src/codegen/__tests__/generate-content.test.ts
git commit -m "feat(codegen): render gradient text via background-clip:text"
```

---

## Task 4：真实稿 harness 验证 + golden 重生

**Files:**
- 视情况 Modify: `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden/**`（真实稿含 13 渐变节点,生成字节会变）

- [x] **Step 1: 跑 codegen golden,确认是否需要重生**

Run: `npm test --workspace @skill-collections/sketch-to-component-scripts -- src/__tests__/codegen-golden.test.ts`
Actual: PASS(3/3)。现有 golden fixture 不含本次受影响的真实渐变节点。

- [x] **Step 2: 确认无需重生 golden**

`codegen-golden` 与 `fixtures/apps/react-vite/src/golden` 相对 HEAD 均为零 diff,
因此未制造无内容的 golden 更新。

- [x] **Step 3: 跑 golden 验证 GREEN**

Run: `npm test --workspace @skill-collections/sketch-to-component-scripts -- src/__tests__/codegen-golden.test.ts`
Expected: PASS。

- [x] **Step 4: 真实稿全管线 + harness 实测(消除 7 条渐变失败)**

```bash
rm -rf .d2c-run-compare && git checkout .d2c-run-compare 2>/dev/null; mkdir -p .d2c-run-compare
npx tsx skills/sketch-to-component/scripts/src/cli.ts extract --file skills/sketch-to-component/resource/d2c.sketch --out .d2c-run-compare
npx tsx skills/sketch-to-component/scripts/src/cli.ts contract --file skills/sketch-to-component/resource/d2c.sketch --out .d2c-run-compare --mode presentational --interaction-mode deferred --approval-reason "G1 verify" --approved-by blade --approved-at 2026-06-12T00:00:00Z
npx tsx skills/sketch-to-component/scripts/src/cli.ts approve --spec .d2c-run-compare/design-spec --approved-by blade --approved-at 2026-06-12T00:00:00Z --acknowledge-behavior-stubbed
npx tsx skills/sketch-to-component/scripts/src/cli.ts preview --design-ir .d2c-run-compare/ir/design-ir.json --out .d2c-run-compare/preview --assets .d2c-run-compare/ir/assets
npx tsx skills/sketch-to-component/scripts/src/cli.ts codegen --spec .d2c-run-compare/design-spec --design-ir .d2c-run-compare/ir/design-ir.json --assets .d2c-run-compare/ir/assets --out .d2c-run-compare/generated
cp .d2c-run-compare/ir/design-ir.json .d2c-run-compare/design-ir.json && cp -r .d2c-run-compare/ir/assets .d2c-run-compare/assets
# viewer:
./fixtures/apps/react-vite/node_modules/.bin/vite --config .d2c-run-compare/viewer/vite.config.mjs &  # :5181
# harness:
( cd skills/sketch-to-component/scripts && npm run visual-harness:codegen -- --candidate-url http://127.0.0.1:5181/ --fixture ../../../.d2c-run-compare --out ../../../.d2c-run-compare/harness )
```
Actual: harness 失败数从 17 → **10**;`backgroundColor`/`color` 失败为 0;
剩余 10 条全部为 G2 字体宽度。候选页气泡恢复蓝色,
渐变标题可见(`.d2c-run-compare/harness/candidate.png` 已目检)。
完成后 `kill %1` 停掉 viewer。

- [x] **Step 5: Commit 判定(仅当 golden 有变)**

```bash
git add skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-golden
git commit -m "test(d2c): refresh codegen golden for gradient fills"
```

Actual: golden 无变化,故不创建空提交;验证证据由本计划更新及独立验证报告提交。

---

## Task 5：最终门禁

**Files:** 验证全部改动。

- [x] **Step 1: 定向全绿 + 类型 + lint/format**

```bash
npm test --workspace @skill-collections/d2c-core -- src/style src/codegen src/preview
npm run typecheck:d2c
npm run lint && npm run format:check
```
Expected: PASS。

- [x] **Step 2: 完整门禁(注意 worktree 已知失败)**

```bash
npm run check:full
```
Expected: 仅 `visual-harness.test.ts` 的路径名断言(`:437`/`:440`)因 worktree 目录名非 `skill-collections` 而失败——这是 memory 记录的已知坑,**由 CI 终判**;其余全部 PASS。若出现任何其它失败,即为真实回归,必须修复。

Actual: 仅 `visual-harness.test.ts:435` 的路径正则失败;Sketch suite 为
154 PASS / 1 expected FAIL。因 `check:full` 的 `&&` 在此提前退出,已单独补跑
`npm run check:fixtures`、`npm run test:samples`、`npm run build:samples`,全部通过。

- [x] **Step 3: 范围自检**

```bash
git diff --stat master...HEAD
```
Expected: 仅 `src/style/`、`preview/generate-preview.ts`、`codegen/`(generate + fixtures + tests)、可能的 `codegen-golden` fixture、本计划与路线图/报告文档;无 contract/normalize/IR schema 改动。

---

## Self-Review 备忘

- **范围**:G1 只碰渐变;矢量(G3)、字体(G2)、折叠消费(S-PR-2)不在此 PR。
- **不变量**:#77 import guard 不动;codegen 坐标保持 parent-relative;排序无 `localeCompare`(本 PR 不引入新排序)。
- **同源保证**:preview 与 codegen 都调 `linearGradientCss`,渐变 CSS 字节一致是结构性保证,而非靠两端各自维护。
- **回退语义**:radial/angular/解析失败 → 实色,既不报错也不静默错色,与 preview 历史行为一致。
