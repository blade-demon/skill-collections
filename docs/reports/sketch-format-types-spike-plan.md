# Sketch File-Format Types Spike — 开发计划

## 背景与目的

当前 `skills/sketch-to-component/scripts/src/` 中的 raw model 用 `z.record(z.unknown())`
表达 Sketch document/page，导致下游 normalize 模块（`sketch-nodes.ts`、
`select-artboard.ts`、`symbols.ts`、`visual.ts`）大量依赖 `as any` 和手写
`typeof` 摸字段。

经过讨论（见对话记录），明确：

- **不**引入 `@sketch-hq/sketch-file` 作为解析器替代品 —— 现有 fflate + 自写
  acquire 已经足够薄，换库会引入 `adm-zip` + `node-stream-zip` 两个 sync 依赖，
  且 fromFile 不提供资产元数据。
- **引入** `@sketch-hq/sketch-file-format-ts@6.5.0` 仅作为开发期类型来源，
  让下游获得 `_class` discriminated union 的类型收窄能力。
- runtime 仍由 zod 做**浅**的结构 guard；TS 类型与 zod schema **分层**，互不
  承担对方的职责。

> sketch-document repo 已于 2023-04 archived，但 npm 包 `@sketch-hq/sketch-file-format-ts@6.5.0`
> 仍在分发。类型可能不覆盖最新 Sketch 文件中的所有字段 —— 这是已知风险，
> 详见下文"已知边界与回退策略"。

## 范围（本次 spike）

只做以下 4 步，**到 `normalize/sketch-nodes.ts` 迁移完毕、跑通 typecheck +
vitest 即停**。不动 `select-artboard.ts` / `symbols.ts` / `visual.ts`。

### Step 1 — 安装依赖（dev-only）

```bash
npm install -D -w @skill-collections/sketch-to-component-scripts \
  @sketch-hq/sketch-file-format-ts@6.5.0
```

约束：

- 必须装在 `skills/sketch-to-component/scripts` 的 `devDependencies`，不进入
  `dependencies`。该包只服务 TS，运行时不应依赖。
- 全部 import 使用 `import type { FileFormat } from '@sketch-hq/sketch-file-format-ts'`，
  确保 emit 时不残留任何 runtime require。

### Step 2 — 收紧 `sketch-raw-model.ts`

关键决定：**zod schema 与 TS interface 分离**。

- `SketchRawModelSchema` 保持现状级别的"浅"runtime guard，只保证：
  - `meta` 是非空对象
  - `document` 是非空对象
  - `pages[]` 每项 `{ id, path, data }` 且 `data` 是非空对象
  - `assets` 是 `SketchAssetEntry[]`
- TS 类型手写为 interface，**不**用 `z.infer`：
  ```ts
  interface SketchRawModel {
    meta: FileFormat.Meta;
    document: FileFormat.Document; // pages 字段官方已是 FileRef[]，无需 Omit
    pages: Array<{ id: string; path: string; data: FileFormat.Page }>;
    assets: SketchAssetEntry[];
  }
  ```
- 新增边界函数 `asSketchRawModel(value: unknown): SketchRawModel`：
  - 内部 `SketchRawModelSchema.parse(value)`
  - 然后做唯一允许的 `as unknown as SketchRawModel`
  - 该 cast 是整个项目中唯一允许跨越 zod/TS 边界的位置，加显著注释

**关于 `document.pages` 类型**：核对 `@sketch-hq/sketch-file-format-ts@6.5.0`
的 `Document` 定义后确认 `pages: FileRef[]`（types.d.ts:1543），与磁盘 raw
shape 一致 —— 因为 `Document` 是磁盘 schema 类型，已展开的 page 在另一个
`Contents` 类型里。所以本次直接使用 `FileFormat.Document` 即可，无需 Omit。
（这一点原计划做了多余的防御，已根据实际类型修正。）

### Step 3 — 新增 `normalize/sketch-types.ts`

集中所有跨越 `unknown → FileFormat.*` 的 cast。

```ts
import type { FileFormat } from '@sketch-hq/sketch-file-format-ts';

// 入口边界类型：接住"像 layer 的对象"，不强求 _class 是已知 union 成员
export interface SketchLayerLike {
  _class?: string;
  do_objectID?: string;
  name?: string;
  // 其他通用字段按需补，但保持 optional
}

// 缺/坏 _class 的两个稳定 sentinel
export const MISSING_CLASS_SENTINEL = '<missing-class>';
export const INVALID_CLASS_SENTINEL = '<invalid-class>';

export function asAnyLayer(value: unknown): SketchLayerLike | undefined;
export function getLayerClass(value: unknown): string; // 返回真实 _class 或 sentinel
export function getLayerId(value: unknown): string; // 返回真实 do_objectID 或 sentinel

// 按需添加的 type guards（只放本 spike 实际用到的）
export function isSymbolMaster(layer: SketchLayerLike): layer is FileFormat.SymbolMaster;
export function isSymbolInstance(layer: SketchLayerLike): layer is FileFormat.SymbolInstance;
export function isArtboard(layer: SketchLayerLike): layer is FileFormat.Artboard;
export function isGroup(layer: SketchLayerLike): layer is FileFormat.Group;
export function isText(layer: SketchLayerLike): layer is FileFormat.Text;
// ... 仅 sketch-nodes.ts 当前实际用到的分类
```

设计要点：

- `asAnyLayer` 返回 `undefined` 表示"连像 layer 的对象都不是"（null/原始值/无 `_class` 字段都映射到 undefined）。
- `getLayerClass` 区分两类异常并以 sentinel 返回，让上层 warning 能区分：
  - `<missing-class>` —— 没有 `_class` 字段 —— 文件结构 corrupt
  - `<invalid-class>` —— `_class` 存在但不是 string —— 文件 corrupt
  - 任意 string —— 可能是已知（命中 FileFormat union）或未知（新版 Sketch class）
- `is*` guard 收窄到官方 union 成员；遇到未知 string 就**不会被任何 guard
  接住**，仍能流到上层产生 `unknown-node-class` warning。

### Step 4 — 迁移 `normalize/sketch-nodes.ts`

只替换 `unknown` / `Record<string, unknown>` 入口，让 helper 函数返回的字段
享受 `FileFormat.*` 类型。

**不允许的改动**：

- 不修改控制流（不改 if 分支、不改循环结构）
- 不删字段访问（即使 TS 报"字段不存在"也用 `as` 局部圈住 + TODO 注释，留给后续 PR）
- 不"顺手"修任何看起来不对的逻辑

迁移完后：

- `npm run typecheck -w @skill-collections/sketch-to-component-scripts` 必须过
- `npm test -w @skill-collections/sketch-to-component-scripts` 必须全绿

### Step 5 — 产出 spike 报告

`docs/reports/sketch-format-types-spike-report.md`，至少包含：

| 列   | 含义                                             |
| ---- | ------------------------------------------------ |
| 位置 | 文件:行                                          |
| 现象 | TS 报什么 / 旧代码摸什么字段                     |
| 类别 | `type-only` / `guard-required` / `behavior-risk` |
| 应对 | 这次怎么处理（cast / guard / TODO）              |
| 备注 | 是否疑似旧 bug、是否 FileFormat 缺字段           |

三类含义：

- **type-only**：单纯类型收紧，旧代码访问的字段在 FileFormat 中存在，TS 报错
  只是因为旧代码用了 `unknown`。处理方式：换成 FileFormat 类型，行为完全不变。
- **guard-required**：FileFormat 把字段标 optional 而旧代码当作必有。需要在
  访问前加 `?.` 或 guard。**可能**暴露旧 bug，但不主动修，记录在报告里。
- **behavior-risk**：FileFormat 没有该字段 / 字段名不同 / 旧代码逻辑明显依赖
  特定 shape，迁移后行为可能变化。**本次 spike 一律保持原行为**（局部 cast
  - TODO），把决策推到后续 PR。

报告产出后：

- 若 `behavior-risk` 数量 ≤ 3 且都有明确归因 → 建议继续向 `select-artboard.ts`
  推进
- 若 ≥ 5 或有任何项无法解释 → 停下来先解决/讨论，不推进 visual.ts

## 已知边界与回退策略

| 场景                                                                  | 处理                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| FileFormat 类型缺新版字段                                             | 局部 `(layer as FileFormat.X & { newField?: ... })` + TODO；同类 ≥ 3 处再考虑 module augmentation |
| FileFormat 字段类型比实际更严（例如官方写 `string`，实际允许 `null`） | 局部 cast，记录在报告                                                                             |
| zod 校验失败                                                          | `asSketchRawModel` 直接抛 `ExtractError`（行为同当前）                                            |
| `asAnyLayer` 返回 undefined                                           | 调用方现有的 `warnings.push({ code: 'unknown-node-class', ... })` 路径继续工作                    |

## 提交策略

PR 标题：`Introduce Sketch file-format types and centralize unsafe Sketch casts (spike)`

PR 描述要点：

- 明确这是 spike，不承诺零行为变化
- 列出 spike 报告里 `guard-required` / `behavior-risk` 条目，说明已知未修
- 列出后续 PR 计划（select-artboard → symbols → visual）

Commit 拆分（每个必须独立 typecheck + test 全绿，便于 `git bisect`）：

1. `chore(sketch): add @sketch-hq/sketch-file-format-ts as dev dependency`
   - 只动 `package.json` + `package-lock.json`
2. `refactor(sketch): split zod runtime guard from TS schema in raw model`
   - 改 `sketch-raw-model.ts`：zod 浅 guard + 手写 TS interface + `asSketchRawModel`
   - 更新 `extract-raw.ts` / `normalize.ts` 使用新边界函数（最小改动）
3. `feat(sketch): add typed boundary helpers for layer classification`
   - 新增 `normalize/sketch-types.ts`
   - 新增对应 `__tests__/sketch-types.test.ts`
4. `refactor(sketch): migrate sketch-nodes.ts to typed helpers`
   - 迁移 `normalize/sketch-nodes.ts`
   - 不动其他文件

## 不在范围内（明确排除）

- `select-artboard.ts`、`symbols.ts`、`visual.ts` 的迁移 → 后续 PR
- `@sketch-hq/sketch-file` parser 替换 → 已经决定不做
- 修复任何在迁移中暴露的 normalize 行为 bug → 单独 PR
- 优化 zod schema（例如把 assets 校验做严）→ 不在本次目标内

## 验收清单（本 PR）

- [ ] `@sketch-hq/sketch-file-format-ts` 仅出现在 `devDependencies`
- [ ] 整个 codebase 中对该包的 import 全部是 `import type`
- [ ] `SketchRawModelSchema` 行为与改动前等价（同一份 fixture parse 结果一致）
- [ ] `asSketchRawModel` 是唯一允许的跨 zod/TS 边界 cast
- [ ] `sketch-types.ts` 测试覆盖 `<missing-class>` / `<invalid-class>` / 已知 class / 未知 class 四种情况
- [ ] `normalize/sketch-nodes.ts` 改动后所有现有测试不变（不允许改测试期望）
- [ ] spike 报告产出，含三列分类
- [ ] 4 个 commit 各自独立 green
