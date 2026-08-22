# image-to-component 确定性结构比较器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 image-to-component Step 6 的 signature 结构判断实现为确定性的 TypeScript 库与 CLI，并用多状态黄金案例自动回归。

**Architecture:** 扩展现有 slot parser 生成共享 AST，在纯函数比较库中分别计算展示 skeleton、container topology、leaf 差异、pair 决策与集合决策。CLI 只负责批次展平、防御性校验和稳定 JSON/退出状态；用户声明与人工 decision-gate 仍保留在 skill 工作流中。

**Tech Stack:** TypeScript 5.8、Zod 3、Vitest 3、tsx、Node.js 20+

**Spec:** `docs/superpowers/specs/2026-08-22-image-structural-comparison-design.md`

## Global Constraints

- 不新增、合成或修改截图。
- 不调用视觉模型或新增外部服务依赖。
- 不修改 `BatchResultSchema`、signature JSON、role 词汇表或 slot grammar。
- 保持 `validateSlotExpr()` 的现有接口与行为兼容。
- O slot 不参与基础组件 identity；F slot 变化不决定组件 identity。
- 用户声明、candidate-group 和人工 decision-gate 不进入机械比较库。
- 输入图片使用全量两两比较；总体优先级固定为 `different-components`、`manual-review`、`same-component`。
- 每个任务按测试先行执行，并在通过其聚焦测试后单独提交。

## File Map

| 文件 | 责任 |
| --- | --- |
| `skills/image-to-component/scripts/src/lib/slot-parser.ts` | 解析 slot grammar，输出 AST；保留现有校验 API |
| `skills/image-to-component/scripts/src/__tests__/slot-parser.test.ts` | AST 形状与校验兼容性回归 |
| `skills/image-to-component/scripts/src/lib/structural-comparison.ts` | skeleton、topology、leaf diff、pair 与集合判断纯函数 |
| `skills/image-to-component/scripts/src/__tests__/structural-comparison.test.ts` | 两图规则、边界、集合聚合与 overlay 测试 |
| `skills/image-to-component/scripts/src/__tests__/fixtures/structural-comparison-cases.ts` | Case A–E 的机器可执行 signature fixture |
| `skills/image-to-component/scripts/src/types.ts` | comparison input 的 Zod schema |
| `skills/image-to-component/scripts/src/compare-signatures.ts` | stdin/stdout CLI、批次展平、稳定错误和退出状态 |
| `skills/image-to-component/scripts/src/__tests__/compare-signatures.test.ts` | CLI 边界、跨 batch、错误聚合和进程退出测试 |
| `skills/image-to-component/scripts/package.json` | 暴露 `compare-signatures` npm script |
| `skills/image-to-component/SKILL.md` | Scripts 表和 Step 6 CLI 路由 |
| `skills/image-to-component/workflows/structural-comparison.md` | 机械规则权威改为 CLI 输出，修正规则优先级 |
| `skills/image-to-component/tests/README.md` | 宣告多状态自动覆盖并保留截图人工回归说明 |
| `skills/image-to-component/examples/golden-cases.md` | 指向机器 fixture，保持语义案例与测试一致 |

---

### Task 1: 让 slot parser 输出共享 AST

**Files:**
- Modify: `skills/image-to-component/scripts/src/lib/slot-parser.ts`
- Modify: `skills/image-to-component/scripts/src/__tests__/slot-parser.test.ts`

**Interfaces:**
- Produces: `parseSlotExpr(expr: string): SlotAstParseResult`
- Preserves: `validateSlotExpr(expr: string): ParseResult`
- Produces types:

```ts
export interface MissingNode {
  kind: 'missing';
}

export interface SequenceNode {
  kind: 'sequence';
  rows: RowNode[];
}

export interface RowNode {
  kind: 'row';
  atoms: AtomNode[];
}

export interface LeafNode {
  kind: 'leaf';
  role: RoleWord;
  uncertain: boolean;
}

export interface ContainerNode {
  kind: 'container';
  role: ContainerRole;
  child: SequenceNode;
}

export type AtomNode = LeafNode | ContainerNode;
export type SlotExprNode = MissingNode | SequenceNode;

export type SlotAstParseResult =
  | { valid: true; ast: SlotExprNode }
  | { valid: false; error: string };
```

- [ ] **Step 1: 写 AST 失败测试**

在 `slot-parser.test.ts` 的 import 中加入 `parseSlotExpr`，并增加：

```ts
it('parses missing slot into a missing node', () => {
  expect(parseSlotExpr('-')).toEqual({ valid: true, ast: { kind: 'missing' } });
});

it('parses nested sequence and row topology into AST', () => {
  expect(parseSlotExpr('card(media + card(title -> meta?) -> status)')).toEqual({
    valid: true,
    ast: {
      kind: 'sequence',
      rows: [
        {
          kind: 'row',
          atoms: [
            {
              kind: 'container',
              role: 'card',
              child: {
                kind: 'sequence',
                rows: [
                  {
                    kind: 'row',
                    atoms: [
                      { kind: 'leaf', role: 'media', uncertain: false },
                      {
                        kind: 'container',
                        role: 'card',
                        child: {
                          kind: 'sequence',
                          rows: [
                            {
                              kind: 'row',
                              atoms: [{ kind: 'leaf', role: 'title', uncertain: false }],
                            },
                            {
                              kind: 'row',
                              atoms: [{ kind: 'leaf', role: 'meta', uncertain: true }],
                            },
                          ],
                        },
                      },
                    ],
                  },
                  {
                    kind: 'row',
                    atoms: [{ kind: 'leaf', role: 'status', uncertain: false }],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });
});

it('returns the same syntax error through parse and validate APIs', () => {
  const parsed = parseSlotExpr('status(error)');
  const validated = validateSlotExpr('status(error)');
  expect(parsed.valid).toBe(false);
  expect(validated).toEqual(parsed.valid ? { valid: true } : parsed);
});
```

- [ ] **Step 2: 运行聚焦测试并确认失败**

Run:

```bash
npm test --workspace image-to-component-scripts -- --run src/__tests__/slot-parser.test.ts
```

Expected: FAIL，TypeScript 报告 `parseSlotExpr` 尚未导出。

- [ ] **Step 3: 将 parser 的 void 流程改为构造 AST**

在 `slot-parser.ts` 中：

```ts
import {
  ROLE_WORDS,
  CONTAINER_ROLES,
  type ContainerRole,
  type RoleWord,
} from '../types.js';

export interface MissingNode {
  kind: 'missing';
}

export interface SequenceNode {
  kind: 'sequence';
  rows: RowNode[];
}

export interface RowNode {
  kind: 'row';
  atoms: AtomNode[];
}

export interface LeafNode {
  kind: 'leaf';
  role: RoleWord;
  uncertain: boolean;
}

export interface ContainerNode {
  kind: 'container';
  role: ContainerRole;
  child: SequenceNode;
}

export type AtomNode = LeafNode | ContainerNode;
export type SlotExprNode = MissingNode | SequenceNode;
```

让 `Parser.parse()` 返回 `SequenceNode`，`seq()` 返回 `{ kind: 'sequence', rows }`，
`row()` 返回 `{ kind: 'row', atoms }`，`atom()` 返回 leaf 或 container。container role 在
`CONTAINER_ROLES` 检查后窄化为 `ContainerRole`；leaf 的 `uncertain` 使用 `tryConsume('?')` 的返回值。

新增统一入口并让旧 API 委托给它：

```ts
export function parseSlotExpr(expr: string): SlotAstParseResult {
  if (expr === '-') return { valid: true, ast: { kind: 'missing' } };

  const precheck = precheckSlotExpr(expr);
  if (precheck) return { valid: false, error: precheck };

  try {
    return { valid: true, ast: new Parser(expr).parse() };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof ParseError ? error.message : String(error),
    };
  }
}

export function validateSlotExpr(expr: string): ParseResult {
  const result = parseSlotExpr(expr);
  return result.valid ? { valid: true } : result;
}
```

把现有 forbidden operator 与 operator spacing 检查移动到私有
`precheckSlotExpr(expr): string | null`；错误文本保持不变。

- [ ] **Step 4: 运行 parser 测试与类型检查**

Run:

```bash
npm test --workspace image-to-component-scripts -- --run src/__tests__/slot-parser.test.ts
npm run typecheck:image
```

Expected: parser 测试全部 PASS；TypeScript 无错误。

- [ ] **Step 5: 提交 AST 增量**

```bash
git add skills/image-to-component/scripts/src/lib/slot-parser.ts skills/image-to-component/scripts/src/__tests__/slot-parser.test.ts
git commit -m "refactor(image-to-component): 让 slot parser 输出 AST"
```

---

### Task 2: 实现两图结构比较核心

**Files:**
- Create: `skills/image-to-component/scripts/src/lib/structural-comparison.ts`
- Create: `skills/image-to-component/scripts/src/__tests__/structural-comparison.test.ts`

**Interfaces:**
- Consumes: `parseSlotExpr()` 与 `ImageResult`
- Produces:

```ts
export type StructuralDecision =
  | 'same-component'
  | 'different-components'
  | 'manual-review';

export type ComparisonReasonCode =
  | 'identical-structure'
  | 'container-topology-changed'
  | 'role-count-threshold-exceeded'
  | 'leaf-swap'
  | 'uncertain-leaf'
  | 'leaf-added'
  | 'leaf-removed'
  | 'whole-slot-replaced'
  | 'floating-variant'
  | 'unresolved-leaf-variation'
  | 'manual-multi-slot-variation'
  | 'manual-mixed-large-set';

export interface SlotDiff {
  slot: 'T' | 'M' | 'B' | 'F';
  kind: ComparisonReasonCode;
  left: string;
  right: string;
  roleDelta: number;
}

export interface PairComparison {
  left: string;
  right: string;
  decision: StructuralDecision;
  reasonCodes: ComparisonReasonCode[];
  slotDiffs: SlotDiff[];
}

export interface OverlayGroup {
  overlayType: 'modal' | 'drawer' | 'toast' | 'sheet';
  files: string[];
  skeletons: Array<{ filename: string; skeleton: string }>;
}

export interface StructuralComparisonResult {
  decision: StructuralDecision;
  reasonCodes: ComparisonReasonCode[];
  skeletons: Array<{
    filename: string;
    slots: Record<'T' | 'M' | 'B' | 'F', string>;
  }>;
  pairs: PairComparison[];
  overlayGroups: OverlayGroup[];
}

export function compareSignatures(images: ImageResult[]): StructuralComparisonResult;
```

- [ ] **Step 1: 写两图规则失败测试**

创建 `structural-comparison.test.ts`，加入本地 helper：

```ts
import { describe, expect, it } from 'vitest';
import type { ImageResult, SignatureObject } from '../types.js';
import { compareSignatures } from '../lib/structural-comparison.js';

const image = (
  filename: string,
  signature: Partial<SignatureObject>,
): ImageResult => ({
  filename,
  signature: { T: '-', M: '-', B: '-', O: '-', F: '-', ...signature },
  notes: {},
});

describe('compareSignatures pair rules', () => {
  it('treats one added leaf inside the same container topology as a state variant', () => {
    const result = compareSignatures([
      image('idle.png', { M: 'form(form -> action)' }),
      image('error.png', { M: 'form(form -> hint -> action)' }),
    ]);
    expect(result.decision).toBe('same-component');
    expect(result.pairs[0]?.reasonCodes).toContain('leaf-added');
  });

  it('treats leaf-only slot replacement as a state variant', () => {
    const result = compareSignatures([
      image('pending.png', { B: 'hint -> action + hint' }),
      image('used.png', { B: 'meta' }),
    ]);
    expect(result.decision).toBe('same-component');
    expect(result.pairs[0]?.reasonCodes).toContain('whole-slot-replaced');
  });

  it('treats a container topology change as different components', () => {
    const result = compareSignatures([
      image('list.png', { M: 'list(card(title -> meta))' }),
      image('detail.png', { M: 'title -> meta -> media' }),
    ]);
    expect(result.decision).toBe('different-components');
    expect(result.pairs[0]?.reasonCodes).toContain('container-topology-changed');
  });

  it('keeps F slot changes out of component identity', () => {
    const result = compareSignatures([
      image('base.png', { M: 'card(title)' }),
      image('floating.png', { M: 'card(title)', F: 'action' }),
    ]);
    expect(result.decision).toBe('same-component');
    expect(result.pairs[0]?.reasonCodes).toContain('floating-variant');
  });
});
```

- [ ] **Step 2: 运行测试并确认缺少比较模块**

Run:

```bash
npm test --workspace image-to-component-scripts -- --run src/__tests__/structural-comparison.test.ts
```

Expected: FAIL，无法解析 `lib/structural-comparison.js`。

- [ ] **Step 3: 实现 skeleton、topology 与 leaf 投影**

在 `structural-comparison.ts` 中实现以下私有 helper：

```ts
const BASE_SLOTS = ['T', 'M', 'B'] as const;
const OUTPUT_SLOTS = ['T', 'M', 'B', 'F'] as const;

function parseOrThrow(expr: string): SlotExprNode {
  const result = parseSlotExpr(expr);
  if (!result.valid) throw new Error(result.error);
  return result.ast;
}

function renderSkeleton(node: SlotExprNode): string;
function renderContainerTopology(node: SlotExprNode): string;
function countRoles(node: SlotExprNode): number;
function collectLeaves(node: SlotExprNode): LeafNode[];
function containsContainer(node: SlotExprNode): boolean;
```

`renderSkeleton()` 用 `_` 替换 leaf 并保留完整 `->` / `+`；
`renderContainerTopology()` 删除 leaf 与没有 container 的 row，再按剩余 container 的 `+` / `->`
顺序输出。container 没有嵌套 container 时输出 role 名，如 `card`；有嵌套时输出
`card(<nested topology>)`。

实现 slot 分类顺序：

1. leaf 与 uncertain 完全相同 → 无 diff；
2. role 数相同且仅 uncertain 不同 → `uncertain-leaf`；
3. role 数相同但 role 不同 → `leaf-swap`；
4. 数量差为 1，且短数组是长数组的有序子序列 → `leaf-added` / `leaf-removed`；
5. 两边都不含 container 且内容不同 → `whole-slot-replaced`；
6. 其他 → `unresolved-leaf-variation`。

- [ ] **Step 4: 实现 pair 与两图总体判断**

对 T/M/B：先比较 `renderContainerTopology()`；不同立即将 pair 判为
`different-components`。再统计 T/M/B 总 role 数：`max > 0` 且 `min / max < 0.5` 时添加
`role-count-threshold-exceeded` 并判为不同组件。恰好 `0.5` 不触发。

拓扑和 role 阈值均通过后分类 T/M/B leaf diff；F 仅在原表达式不同时添加
`floating-variant`。一个及以上 unresolved slot 产生 `manual-review`；两个及以上 unresolved slot
额外使用 `manual-multi-slot-variation`。其余结果为 `same-component`；完全无差异时使用
`identical-structure`。

稳定去重 reason code，使用以下固定顺序：

```ts
const REASON_ORDER: ComparisonReasonCode[] = [
  'container-topology-changed',
  'role-count-threshold-exceeded',
  'manual-multi-slot-variation',
  'unresolved-leaf-variation',
  'manual-mixed-large-set',
  'whole-slot-replaced',
  'leaf-swap',
  'uncertain-leaf',
  'leaf-added',
  'leaf-removed',
  'floating-variant',
  'identical-structure',
];
```

- [ ] **Step 5: 增加 role 阈值和不确定 leaf 边界测试**

```ts
it('does not trip the role threshold at exactly one half', () => {
  const result = compareSignatures([
    image('small.png', { T: 'title', M: 'meta' }),
    image('large.png', { T: 'title -> meta', M: 'media -> status' }),
  ]);
  expect(result.pairs[0]?.reasonCodes).not.toContain('role-count-threshold-exceeded');
});

it('trips the role threshold below one half', () => {
  const result = compareSignatures([
    image('small.png', { T: 'title' }),
    image('large.png', { T: 'title -> meta', M: 'media -> status' }),
  ]);
  expect(result.decision).toBe('different-components');
  expect(result.pairs[0]?.reasonCodes).toContain('role-count-threshold-exceeded');
});

it('classifies only the question-mark change as uncertain leaf state', () => {
  const result = compareSignatures([
    image('known.png', { M: 'card(title -> meta)' }),
    image('uncertain.png', { M: 'card(title -> meta?)' }),
  ]);
  expect(result.decision).toBe('same-component');
  expect(result.pairs[0]?.reasonCodes).toContain('uncertain-leaf');
});
```

- [ ] **Step 6: 运行比较测试、全 image 测试和类型检查**

Run:

```bash
npm test --workspace image-to-component-scripts -- --run src/__tests__/structural-comparison.test.ts
npm run test:image
npm run typecheck:image
```

Expected: 全部 PASS。

- [ ] **Step 7: 提交两图比较核心**

```bash
git add skills/image-to-component/scripts/src/lib/structural-comparison.ts skills/image-to-component/scripts/src/__tests__/structural-comparison.test.ts
git commit -m "feat(image-to-component): 实现 signature 结构比较核心"
```

---

### Task 3: 补齐多图黄金案例、集合聚合与 overlay

**Files:**
- Create: `skills/image-to-component/scripts/src/__tests__/fixtures/structural-comparison-cases.ts`
- Modify: `skills/image-to-component/scripts/src/__tests__/structural-comparison.test.ts`
- Modify: `skills/image-to-component/scripts/src/lib/structural-comparison.ts`

**Interfaces:**
- Consumes: `compareSignatures(images)`
- Completes: Task 2 已定义的 `overlayGroups`、全量 `pairs` 与集合级 `reasonCodes`

- [ ] **Step 1: 创建 Case A–E 机器 fixture**

在 `fixtures/structural-comparison-cases.ts` 导出五个 `BatchResult` 常量。使用以下精确 signature：

```ts
import type { BatchResult } from '../../types.js';

export const caseA: BatchResult = {
  batch: 'case-a',
  images: [
    {
      filename: 'pending.png',
      signature: {
        T: 'title -> meta',
        M: 'card(media + card(title -> meta -> meta) -> media)',
        B: 'hint -> action + hint',
        O: '-',
        F: '-',
      },
      notes: { divider: 'dashed' },
    },
    {
      filename: 'used.png',
      signature: {
        T: 'title -> meta',
        M: 'card(media + card(title -> meta -> meta) -> media -> status)',
        B: 'meta',
        O: '-',
        F: '-',
      },
      notes: { divider: 'dashed' },
    },
    {
      filename: 'expired.png',
      signature: {
        T: 'title -> meta',
        M: 'card(media + card(title -> meta -> meta) -> media -> status)',
        B: 'meta',
        O: '-',
        F: '-',
      },
      notes: { divider: 'dashed' },
    },
  ],
};

export const caseB: BatchResult = {
  batch: 'case-b',
  images: [
    {
      filename: 'list.png',
      signature: {
        T: 'nav',
        M: 'list(card(title -> meta + status))',
        B: 'nav',
        O: '-',
        F: '-',
      },
      notes: {},
    },
    {
      filename: 'detail.png',
      signature: {
        T: 'nav',
        M: 'title -> meta -> media -> status -> form',
        B: 'action + action',
        O: '-',
        F: '-',
      },
      notes: {},
    },
  ],
};

export const caseC: BatchResult = {
  batch: 'case-c',
  images: [
    {
      filename: 'normal.png',
      signature: {
        T: 'nav',
        M: 'title -> meta -> media -> form',
        B: 'action + action',
        O: '-',
        F: '-',
      },
      notes: {},
    },
    {
      filename: 'confirm-modal.png',
      signature: {
        T: 'nav',
        M: 'title -> meta -> media -> form',
        B: 'action + action',
        O: 'card(title -> meta -> action + action)',
        F: '-',
      },
      notes: { overlay_type: 'modal' },
    },
  ],
};

export const caseD: BatchResult = {
  batch: 'case-d',
  images: [
    {
      filename: 'idle.png',
      signature: {
        T: 'title -> meta',
        M: 'form(form -> form -> action)',
        B: 'hint',
        O: '-',
        F: '-',
      },
      notes: {},
    },
    {
      filename: 'error.png',
      signature: {
        T: 'title -> meta',
        M: 'form(form -> form -> hint -> action)',
        B: 'hint',
        O: '-',
        F: '-',
      },
      notes: {},
    },
  ],
};

export const caseE: BatchResult = {
  batch: 'case-e',
  images: [
    {
      filename: 'empty.png',
      signature: { T: 'nav', M: 'empty', B: 'action', O: '-', F: '-' },
      notes: {},
    },
    {
      filename: 'filled.png',
      signature: {
        T: 'nav',
        M: 'list(card(title -> meta))',
        B: 'action',
        O: '-',
        F: '-',
      },
      notes: {},
    },
  ],
};
```

- [ ] **Step 2: 写黄金结果和全量 pair 失败测试**

```ts
import { caseA, caseB, caseC, caseD, caseE } from './fixtures/structural-comparison-cases.js';

it.each([
  ['A', caseA, 'same-component'],
  ['B', caseB, 'different-components'],
  ['C', caseC, 'same-component'],
  ['D', caseD, 'same-component'],
  ['E', caseE, 'different-components'],
] as const)('matches golden Case %s', (_name, batch, expected) => {
  expect(compareSignatures(batch.images).decision).toBe(expected);
});

it('compares all pairs in stable input order', () => {
  const result = compareSignatures(caseA.images);
  expect(result.pairs.map(({ left, right }) => [left, right])).toEqual([
    ['pending.png', 'used.png'],
    ['pending.png', 'expired.png'],
    ['used.png', 'expired.png'],
  ]);
});

it('keeps the Case C modal outside base identity', () => {
  const result = compareSignatures(caseC.images);
  expect(result.decision).toBe('same-component');
  expect(result.overlayGroups).toEqual([
    {
      overlayType: 'modal',
      files: ['confirm-modal.png'],
      skeletons: [
        {
          filename: 'confirm-modal.png',
          skeleton: 'card(_ -> _ -> _ + _)',
        },
      ],
    },
  ]);
});
```

Run:

```bash
npm test --workspace image-to-component-scripts -- --run src/__tests__/structural-comparison.test.ts
```

Expected: 至少 Case A 或 overlay 断言 FAIL。

- [ ] **Step 3: 实现全量 pair、总体汇总和 overlay 分组**

使用嵌套索引循环生成稳定 pair：

```ts
for (let leftIndex = 0; leftIndex < images.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < images.length; rightIndex += 1) {
    pairs.push(comparePair(images[leftIndex]!, images[rightIndex]!));
  }
}
```

总体 decision：任一 pair 不同组件优先；否则任一人工复核优先；否则同一组件。
总体 `reasonCodes` 按 `REASON_ORDER` 聚合 pair code。

overlay 按 `OVERLAY_TYPES` 的固定顺序建组；仅纳入 O 非 `-` 且有匹配
`notes.overlay_type` 的图片。组内文件保持输入顺序，skeleton 使用 `renderSkeleton(parseOrThrow(O))`。

- [ ] **Step 4: 写四图混合模式与非混合模式测试**

```ts
it('requires manual review for four-image mixed additions and replacements', () => {
  const images = [
    image('a.png', { M: 'card(title)', B: 'hint -> action' }),
    image('b.png', { M: 'card(title -> status)', B: 'hint -> action' }),
    image('c.png', { M: 'card(title)', B: 'meta' }),
    image('d.png', { M: 'card(title -> status)', B: 'meta' }),
  ];
  const result = compareSignatures(images);
  expect(result.decision).toBe('manual-review');
  expect(result.reasonCodes).toContain('manual-mixed-large-set');
});

it('keeps four images automatic when they repeat one explained change kind', () => {
  const images = [
    image('a.png', { M: 'card(title)' }),
    image('b.png', { M: 'card(title -> status)' }),
    image('c.png', { M: 'card(title -> meta)' }),
    image('d.png', { M: 'card(title -> hint)' }),
  ];
  const result = compareSignatures(images);
  expect(result.decision).toBe('same-component');
  expect(result.reasonCodes).not.toContain('manual-mixed-large-set');
});
```

补充 overlay 类型和总体优先级测试：

```ts
it('groups matching overlay types and separates different overlay types', () => {
  const images: ImageResult[] = [
    image('base.png', { M: 'card(title)' }),
    {
      ...image('modal.png', { M: 'card(title)', O: 'card(title -> action)' }),
      notes: { overlay_type: 'modal' },
    },
    {
      ...image('drawer.png', { M: 'card(title)', O: 'card(title -> action)' }),
      notes: { overlay_type: 'drawer' },
    },
    {
      ...image('modal-2.png', { M: 'card(title)', O: 'card(title -> action)' }),
      notes: { overlay_type: 'modal' },
    },
  ];
  const result = compareSignatures(images);
  expect(result.overlayGroups.map(({ overlayType, files }) => ({ overlayType, files }))).toEqual([
    { overlayType: 'modal', files: ['modal.png', 'modal-2.png'] },
    { overlayType: 'drawer', files: ['drawer.png'] },
  ]);
});

it('promotes one different pair to the overall decision', () => {
  const result = compareSignatures([
    image('idle.png', { M: 'form(form -> action)' }),
    image('error.png', { M: 'form(form -> hint -> action)' }),
    image('list.png', { M: 'list(card(title))' }),
  ]);
  expect(result.pairs).toHaveLength(3);
  expect(result.decision).toBe('different-components');
});
```

集合级 mixed 条件仅在 `images.length >= 4`、没有 pair 已判不同组件、聚合 code 同时包含
`whole-slot-replaced` 与 `leaf-added`/`leaf-removed` 时触发。触发后总体 decision 设为
`manual-review`，顶层增加 `manual-mixed-large-set`；不要污染 pair reason codes。

- [ ] **Step 5: 运行黄金回归、全 image 测试和类型检查**

```bash
npm test --workspace image-to-component-scripts -- --run src/__tests__/structural-comparison.test.ts
npm run test:image
npm run typecheck:image
```

Expected: Case A–E、overlay、pair 顺序与大集合测试全部 PASS。

- [ ] **Step 6: 提交黄金回归增量**

```bash
git add skills/image-to-component/scripts/src/lib/structural-comparison.ts skills/image-to-component/scripts/src/__tests__/structural-comparison.test.ts skills/image-to-component/scripts/src/__tests__/fixtures/structural-comparison-cases.ts
git commit -m "test(image-to-component): 覆盖多状态结构比较"
```

---

### Task 4: 增加 compare-signatures CLI 与输入边界

**Files:**
- Modify: `skills/image-to-component/scripts/src/types.ts`
- Create: `skills/image-to-component/scripts/src/compare-signatures.ts`
- Create: `skills/image-to-component/scripts/src/__tests__/compare-signatures.test.ts`
- Modify: `skills/image-to-component/scripts/package.json`

**Interfaces:**
- Produces schema and type:

```ts
export const StructuralComparisonInputSchema = z
  .object({ batches: z.array(BatchResultSchema).min(1) })
  .strict();

export type StructuralComparisonInput = z.infer<typeof StructuralComparisonInputSchema>;
```

- Produces:

```ts
export type ComparisonCliResult =
  | { valid: true; result: StructuralComparisonResult }
  | { valid: false; errors: string[] };

export function compareBatchInput(raw: unknown): ComparisonCliResult;
```

- [ ] **Step 1: 写 CLI 边界失败测试**

创建 `compare-signatures.test.ts`：

```ts
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareBatchInput } from '../compare-signatures.js';
import { caseA } from './fixtures/structural-comparison-cases.js';

describe('compareBatchInput', () => {
  it('flattens multiple batches and preserves image order', () => {
    const result = compareBatchInput({
      batches: [
        { ...caseA, batch: 'first', images: caseA.images.slice(0, 1) },
        { ...caseA, batch: 'second', images: caseA.images.slice(1) },
      ],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.result.skeletons.map((item) => item.filename)).toEqual([
        'pending.png',
        'used.png',
        'expired.png',
      ]);
    }
  });

  it('rejects duplicate filenames across batches', () => {
    const duplicate = caseA.images[0]!;
    const result = compareBatchInput({
      batches: [
        { batch: 'one', images: [duplicate] },
        { batch: 'two', images: [duplicate] },
      ],
    });
    expect(result).toEqual({
      valid: false,
      errors: ['image "pending.png": duplicate filename across batches'],
    });
  });

  it('collects slot errors in image and slot order', () => {
    const result = compareBatchInput({
      batches: [
        {
          batch: 'bad',
          images: [
            {
              filename: 'bad.png',
              signature: {
                T: 'title->meta',
                M: 'section(title)',
                B: '-',
                O: '-',
                F: '-',
              },
              notes: {},
            },
            caseA.images[1],
          ],
        },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain('image "bad.png" T slot');
      expect(result.errors[1]).toContain('image "bad.png" M slot');
    }
  });

  it('requires at least two images after flattening', () => {
    const result = compareBatchInput({
      batches: [{ batch: 'single', images: [caseA.images[0]] }],
    });
    expect(result).toEqual({
      valid: false,
      errors: ['at least 2 images are required for comparison'],
    });
  });
});

describe('compare-signatures process', () => {
  const cli = fileURLToPath(new URL('../compare-signatures.ts', import.meta.url));

  it('exits zero and prints valid JSON for Case A', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', cli], {
      input: JSON.stringify({ batches: [caseA] }),
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      valid: true,
      result: { decision: 'same-component' },
    });
  });

  it('exits nonzero for invalid JSON', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', cli], {
      input: '{not-json',
      encoding: 'utf8',
    });
    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout)).toEqual({
      valid: false,
      errors: ['input is not valid JSON'],
    });
  });
});
```

- [ ] **Step 2: 运行测试并确认缺少 CLI**

```bash
npm test --workspace image-to-component-scripts -- --run src/__tests__/compare-signatures.test.ts
```

Expected: FAIL，无法解析 `compare-signatures.js`。

- [ ] **Step 3: 增加 schema、批次校验与 CLI**

在 `types.ts` 增加 `StructuralComparisonInputSchema` 和 type。

在 `compare-signatures.ts` 中：

1. 用 `safeParse()` 收集 Zod errors，格式为 `<path>: <message>`；
2. 按 batch、image、T/M/B/O/F 顺序运行 `validateSlotExpr()`；
3. 用 `Set<string>` 拒绝跨 batch 重复 filename；
4. 展平后不足两张图片时返回 `at least 2 images are required for comparison`；
5. 无错误时调用 `compareSignatures(images)`；
6. stdin JSON parse 失败时打印 invalid JSON 结果并 `process.exit(1)`；
7. 比较失败同样输出格式化 JSON 并以 1 退出，成功以 0 退出。

CLI 入口沿用现有脚本模式：

```ts
if (process.argv[1] === new URL(import.meta.url).pathname) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      process.stdout.write(
        JSON.stringify({ valid: false, errors: ['input is not valid JSON'] }, null, 2) + '\n',
      );
      process.exit(1);
    }

    const output = compareBatchInput(input);
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    if (!output.valid) process.exit(1);
  });
}
```

在 `scripts/package.json` 的 scripts 中加入：

```json
"compare-signatures": "tsx src/compare-signatures.ts"
```

- [ ] **Step 4: 运行 CLI 测试与真实 npm smoke**

```bash
npm test --workspace image-to-component-scripts -- --run src/__tests__/compare-signatures.test.ts
```

测试通过后，用最小 JSON 执行真实 npm smoke：

```bash
echo '{"batches":[{"batch":"smoke","images":[{"filename":"a.png","signature":{"T":"title","M":"card(meta)","B":"-","O":"-","F":"-"},"notes":{}},{"filename":"b.png","signature":{"T":"title","M":"card(meta -> status)","B":"-","O":"-","F":"-"},"notes":{}}]}]}' | npm run compare-signatures --workspace image-to-component-scripts
```

Expected: 测试 PASS；smoke 输出 `valid: true` 与 `decision: same-component`。

- [ ] **Step 5: 运行全 image 测试与类型检查**

```bash
npm run test:image
npm run typecheck:image
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交 CLI 增量**

```bash
git add skills/image-to-component/scripts/src/types.ts skills/image-to-component/scripts/src/compare-signatures.ts skills/image-to-component/scripts/src/__tests__/compare-signatures.test.ts skills/image-to-component/scripts/package.json
git commit -m "feat(image-to-component): 增加结构比较 CLI"
```

---

### Task 5: 将确定性比较器接入 skill 文档

**Files:**
- Modify: `skills/image-to-component/SKILL.md`
- Modify: `skills/image-to-component/workflows/structural-comparison.md`
- Modify: `skills/image-to-component/tests/README.md`
- Modify: `skills/image-to-component/examples/golden-cases.md`

**Interfaces:**
- Consumes: `npm run compare-signatures` 的 `{ valid, result }` 输出
- Produces: Step 6 的明确 CLI 调用与 decision 路由

- [ ] **Step 1: 写文档契约检查并确认当前缺失**

Run:

```bash
rg -n "compare-signatures|manual-mixed-large-set|确定性黄金" skills/image-to-component/SKILL.md skills/image-to-component/workflows/structural-comparison.md skills/image-to-component/tests/README.md skills/image-to-component/examples/golden-cases.md
```

Expected: 没有完整匹配，证明文档尚未接入新命令。

- [ ] **Step 2: 更新 SKILL.md 的 Scripts 与 Step 6**

在 Scripts 表加入：

```markdown
| 比较完整 signature 集合 | `echo '<comparison input JSON>' \| npm run compare-signatures` |
```

将 Step 6 开头改为先构建 `{ "batches": [...] }` 并运行：

```bash
echo '<comparison input JSON>' | npm run compare-signatures
```

明确路由：

- `different-components` → 按组件/组继续；若与用户同组件声明冲突，先展示 diff 并等待选择；
- `manual-review` → 展示 `pairs[].slotDiffs` 与顶层/Pair reason codes，再运行 `manual-review-exit.md`；
- `same-component` → 继续 Image Connect；
- `overlayGroups` 始终独立处理，不改变基础 decision。

- [ ] **Step 3: 重写 structural-comparison.md 的机械规则段**

将 CLI 输出声明为 Step 6 机械结果权威；记录以下精确规则：

- container topology 不同和 role ratio `< 0.5` 为不同组件；恰好 `0.5` 不触发；
- leaf swap、uncertain、单 leaf 增删、leaf-only 整体替换为状态变化；
- 仅未解释 leaf 变化跨两个以上 slot 时使用 `manual-multi-slot-variation`；
- 四张以上图片同时混合增删与整体替换时使用 `manual-mixed-large-set`；
- O 单独分组，F 不影响 identity；
- 用户声明冲突检查与 candidate-group gate 仍在 CLI 之后执行。

- [ ] **Step 4: 更新回归 README 与黄金案例说明**

在 `tests/README.md` 用“自动结构回归”替换覆盖缺口段，列出：

```bash
npm run test:image
```

说明 Case A–E 位于
`scripts/src/__tests__/fixtures/structural-comparison-cases.ts`，其中 Case A 自动覆盖同一组件三状态。
保留三个真实截图案例的手动回归步骤，并明确它们验证视觉子 agent 到 signature 的边界。

在 `examples/golden-cases.md` 开头增加机器 fixture 路径与同步规则：语义判断变化时同时修改 fixture、测试和本文档。

- [ ] **Step 5: 运行格式、文档检索和聚焦验证**

```bash
npm exec prettier -- --write skills/image-to-component/SKILL.md skills/image-to-component/workflows/structural-comparison.md skills/image-to-component/tests/README.md skills/image-to-component/examples/golden-cases.md
rg -n "compare-signatures|manual-mixed-large-set|确定性黄金" skills/image-to-component/SKILL.md skills/image-to-component/workflows/structural-comparison.md skills/image-to-component/tests/README.md skills/image-to-component/examples/golden-cases.md
npm run test:image
npm run typecheck:image
```

Expected: 检索能定位 CLI、集合人工复核和黄金回归说明；测试与类型检查 PASS。

- [ ] **Step 6: 提交文档接入**

```bash
git add skills/image-to-component/SKILL.md skills/image-to-component/workflows/structural-comparison.md skills/image-to-component/tests/README.md skills/image-to-component/examples/golden-cases.md
git commit -m "docs(image-to-component): 接入确定性结构比较"
```

---

### Task 6: 最终验证与交付检查

**Files:**
- Verify only; no planned file changes

**Interfaces:**
- Consumes: Tasks 1–5 的全部提交
- Produces: 可交付的验证证据

- [ ] **Step 1: 运行 image-to-component 聚焦门禁**

```bash
npm run typecheck:image
npm run test:image
```

Expected: TypeScript 无错误；全部 image-to-component 测试 PASS。

- [ ] **Step 2: 运行 CLI 成功与失败 smoke**

```bash
echo '{"batches":[{"batch":"smoke","images":[{"filename":"a.png","signature":{"T":"title","M":"card(meta)","B":"-","O":"-","F":"-"},"notes":{}},{"filename":"b.png","signature":{"T":"title","M":"card(meta -> status)","B":"-","O":"-","F":"-"},"notes":{}}]}]}' | npm run compare-signatures --workspace image-to-component-scripts
```

Expected: exit 0，输出 `valid: true`、`decision: same-component`、一个 pair。

```bash
echo '{not-json' | npm run compare-signatures --workspace image-to-component-scripts
```

Expected: exit 1，输出 `valid: false` 与 `input is not valid JSON`。

- [ ] **Step 3: 运行仓库完整门禁**

```bash
npm run check:full
```

Expected: lint、format、typecheck、tests、samples 与 fixtures 全部 PASS。

- [ ] **Step 4: 检查 diff 与提交状态**

```bash
git diff --check
git status --short
git log --oneline origin/master..HEAD
```

Expected: `git diff --check` 无输出；工作区干净；日志包含设计、AST、比较核心、黄金回归、CLI 和文档提交。
