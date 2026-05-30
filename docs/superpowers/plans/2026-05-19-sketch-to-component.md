> **⚠️ 已弃用（2026-05-21）。** 本计划早于共享设计源架构。它面向独立的 SketchMCP → CSS Modules 生成器，与当前方向（provider 中立的 `d2c-core` + Sketch raw 提取器汇入共享管线）冲突。已被
> [`../../../skills/sketch-to-component/docs/stage-2-extract-raw-outline.md`](../../../skills/sketch-to-component/docs/stage-2-extract-raw-outline.md)
> 与 [`../../design-source-to-component-implementation-plan.md`](../../design-source-to-component-implementation-plan.md) 取代。
> 仅作历史留存 —— **不要**按本文件实现。

# Sketch-to-Component Skill 实施计划

> **给 agent 工作者：** 必须使用子技能：推荐 `superpowers:subagent-driven-development`，也可使用 `superpowers:executing-plans`，逐任务执行本计划。步骤使用 checkbox（`- [ ]`）语法跟踪。

**目标：** 构建 `sketch-to-component` skill，将本地 Sketch 应用中选中的 Frame 转为像素级忠实的 React + TypeScript + CSS Modules 代码，把 Symbol Master 映射为可复用组件，Override → 类型化 props。

**架构：** 两阶段管线，**IR JSON 作为角色之间的契约**。**阶段 1 — 提取器（仅设计师）**：一段 JS 脚本 POST 到配置的 SketchMCP 服务（默认 `http://localhost:31126/mcp`，工具 `run_code`），遍历选中图层子树，在内存中导出 Image base64，并输出经 Zod 校验的 IR JSON。设计师将该 IR 提交到仓库。**阶段 2 — 生成器（所有开发者）**：TS CLI 读取已提交的 IR，为每个 Symbol Master 输出一对 `.tsx` + `.module.css`，并为 Frame 输出根组件；图片资源写入 `assets/`。**前端开发者无需安装 Sketch。** 仓库根目录的 `sketch-to-component.config.json` + 环境变量 `SKETCH_MCP_URL` 控制设计师使用的 MCP 端点。布局为绝对定位（fixture 中真实 Frame `375×1173` 无 Stack 布局；flex 尺寸属 Phase 2）。Override 类型变成 Master 组件上的可选类型化 props。

**技术栈：** TypeScript 5、Node 20+、Zod 3（IR 校验）、Vitest 3（测试）、tsx（运行器）。提取使用 Sketch JS API。镜像现有 `skills/image-to-component/scripts/` 的 package 约定（private、ESM、tsx 驱动）。

**真实 fixture（已通过 MCP 检视）：** `/Users/blade/Desktop/figma-mcp%E6%B5%8B%E8%AF%95.sketch` → Page 1 根 Frame `2.0-1备份 21`（375×1173，137 节点，深度 8，9 个唯一 Master 上的 13 个 SymbolInstance，29 个 Text，4 个 Image，0 个 Stack）。Override 直方图展示生成器**必须**处理的属性集：`stringValue`、`textColor/Size/Weight/HAlign/Decoration`、`color:fill-{0..6}`、`color:border-{0,1}`、`color:shadow-0`、`color:innershadow-0`、`isVisible`、`symbolID`、`layerStyle`、`fillColor`。

**本计划范围外（延后）：** Stack 布局（fixture 中无）、渐变填充、蒙版链、模糊/渐进模糊、蒙版模式、字体加载验证、设计 token JSON 导出（颜色变量输出 CSS var，但不单独出 token 文件）。

---

## 文件结构

```
skills/sketch-to-component/
├── SKILL.md                              # Skill 入口；设计师 vs 开发者工作流
├── docs/
│   ├── ir-schema.md                      # IR JSON 形态参考
│   ├── override-mapping.md               # Override 属性 → React/CSS 映射表
│   └── deployment.md                     # 如何共享 IR vs 共享中央 MCP
├── workflows/
│   ├── designer-publish-ir.md            # 设计师：从 Sketch 提取并提交 IR
│   ├── developer-build.md                # 开发者：读取已提交 IR 并生成代码
│   └── verify-output.md                  # 如何校验生成代码可编译且匹配
├── protocols/
│   ├── mcp-extractor-contract.md         # 发给 run_code 的脚本体及其 IR 契约
│   └── config-schema.md                  # sketch-to-component.config.json 形态
└── scripts/
    ├── package.json                      # private、ESM、tsx、vitest
    ├── tsconfig.json
    ├── vitest.config.ts
    └── src/
        ├── ir/
        │   ├── schema.ts                 # Zod schema + 推断类型
        │   └── __tests__/schema.test.ts
        ├── config/
        │   ├── load.ts                   # 读取并校验 sketch-to-component.config.json
        │   └── __tests__/load.test.ts
        ├── extractor/
        │   ├── extract.js                # run_code 脚本体；纯 JS，在 Sketch 内运行
        │   ├── client.ts                 # POST 到 MCP URL，解析结果
        │   └── __tests__/client.test.ts  # Mock fetch 测试
        ├── generator/
        │   ├── naming.ts                 # 名称清理 → PascalCase / 合法 CSS 标识符
        │   ├── css.ts                    # Style → CSS 规则字符串
        │   ├── tsx.ts                    # 节点树 → JSX 字符串
        │   ├── symbols.ts                # Symbol Master → 组件文件发射器
        │   ├── overrides.ts              # Override → prop 名/类型/默认值与调用点参数
        │   ├── index.ts                  # 顶层：ir → { files: Record<path, content> }
        │   └── __tests__/
        │       ├── naming.test.ts
        │       ├── css.test.ts
        │       ├── tsx.test.ts
        │       ├── overrides.test.ts
        │       └── symbols.test.ts
        ├── assets/
        │   └── write-images.ts           # base64 解码 → 落盘
        ├── cli.ts                        # CLI：sync（设计师）/ build（开发）/ extract / generate
        └── tests/
            └── fixtures/
                ├── tiny-ir.json          # 手写最小 IR，供单元测试
                ├── frame-ir.json         # 真实提取的 IR（首次运行后提交）
                └── tiny-config.json      # 手写最小 config，供单元测试
```

**仓库级产物（位于消费方项目，不在本 skill 内）：**

```
<consumer-project>/
├── sketch-to-component.config.json       # MCP URL、irDir、outDir、frame 清单
└── design/sketch-ir/                     # 已提交的 IR JSON（每个 Frame 一份）
    ├── home.json
    └── settings.json
```

**输出路径：** 生成器写入调用方指定目录（默认 `out/`）。每个 Symbol Master → `<sanitized>.tsx` + `<sanitized>.module.css`。根 → `Frame.tsx` + `Frame.module.css`。图片 → `assets/<short-hash>.png`。若有引用，`tokens.css` 存放 `:root` 颜色变量定义。

---

## 任务 1：Skill 脚手架

**文件：**
- 创建：`skills/sketch-to-component/SKILL.md`

- [ ] **步骤 1：编写 SKILL.md**

```markdown
---
name: sketch-to-component
description: 当用户想把 Sketch Frame 转为像素级忠实的 React + TypeScript + CSS Modules 代码时使用。两种角色 —— 设计师通过 SketchMCP 服务运行 extract 发布带版本的 IR JSON；开发者对已提交的 IR 运行 generate，无需安装 Sketch。触发短语如 "convert this Sketch frame"、"generate React from Sketch"、"build from sketch IR"，或存在 sketch-to-component.config.json 时。
---

# sketch-to-component

## 概览

**IR JSON 是设计与代码之间的契约。** 管线有两种角色：

- **设计师（有 Sketch + SketchMCP）：** 运行 `npm run sync <name>`。从 Sketch 提取选中 Frame，校验为 IR，写入 `design/sketch-ir/<name>.json` 并生成代码。同时提交 IR 与生成代码。
- **开发者（无需 Sketch）：** 运行 `npm run build <name>`。读取已提交 IR 并重新生成代码。用于 CI 与重构生成器时。

每个 Sketch Symbol Master 对应一个 React 组件文件；其 Override 变成该组件上的可选类型化 props。

## 前置条件

### 设计师机器（extract 路径）

- 已安装并运行 Sketch.app，目标文档已打开且选中了 Frame
- SketchMCP 在配置 URL 响应（默认 `http://localhost:31126/mcp`）。验证：

  ```bash
  curl -sS -X POST $SKETCH_MCP_URL \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
  ```

  预期 `serverInfo.name == "SketchMCP"`。

### 开发者机器（build 路径）

- Node 20+。**无需安装 Sketch。**
- 仓库有 `sketch-to-component.config.json`，且 `irDir` 下至少有一份 IR JSON。

## 配置

消费方仓库根目录的 `sketch-to-component.config.json`（由 `src/config/load.ts` 校验）：

```json
{
  "mcpUrl": "http://localhost:31126/mcp",
  "irDir": "design/sketch-ir",
  "outDir": "src/generated/sketch",
  "frames": [
    { "name": "home", "ir": "home.json" },
    { "name": "settings", "ir": "settings.json" }
  ]
}
```

`mcpUrl` 可由环境变量 `SKETCH_MCP_URL` 覆盖。`irDir` 与 `outDir` 相对于配置文件所在目录解析。

## 路由表

| 需求 | 阅读 |
|---|---|
| IR 形态参考 | `docs/ir-schema.md` |
| Override → React/CSS 映射表 | `docs/override-mapping.md` |
| 部署选项（本地 vs 共享 MCP） | `docs/deployment.md` |
| 设计师流程 —— 提取并提交 IR | `workflows/designer-publish-ir.md` |
| 开发者流程 —— 从 IR 构建 | `workflows/developer-build.md` |
| 校验生成输出 | `workflows/verify-output.md` |
| extractor 脚本体与 MCP 契约 | `protocols/mcp-extractor-contract.md` |
| 配置文件 schema | `protocols/config-schema.md` |

## 脚本

在 scripts 目录下：

| 命令 | 受众 | 用途 |
|---|---|---|
| `npm install` | 全部 | 首次使用时执行一次 |
| `npm test` | 全部 | 运行 Vitest 套件 |
| `npm run sync -- --name home --config <path>` | 设计师 | extract → 写 IR → generate（一步完成） |
| `npm run build -- --name home --config <path>` | 开发者 | 读已提交 IR → generate（无需 Sketch） |
| `npm run extract -- --out path.json --url <mcpUrl>` | 设计师 | 底层：仅 extract |
| `npm run generate -- --ir path.json --out dir/` | 全部 | 底层：仅 generate |

## 限制

- 布局为绝对定位。尚未输出 Stack 布局与 Flex 尺寸。
- 尚未输出渐变填充、蒙版链、渐进模糊。
- 带 `symbolID` override 的 Symbol Instance（嵌套 symbol 替换）会内联而非抽象，以保持 prop 模型简单。
- 团队共享 SketchMCP 需要带外 auth/网络方案（Tailscale、mTLS 等），因 MCP 本身无认证 —— 见 `docs/deployment.md`。
```

- [ ] **步骤 2：提交**

```bash
git add skills/sketch-to-component/SKILL.md
git commit -m "feat(sketch-to-component): scaffold skill entry"
```

---

## 任务 2：Scripts package 搭建

**文件：**
- 创建：`skills/sketch-to-component/scripts/package.json`
- 创建：`skills/sketch-to-component/scripts/tsconfig.json`
- 创建：`skills/sketch-to-component/scripts/vitest.config.ts`

- [ ] **步骤 1：编写 package.json**

```json
{
  "name": "sketch-to-component-scripts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "extract": "tsx src/cli.ts extract",
    "generate": "tsx src/cli.ts generate",
    "e2e": "tsx src/cli.ts e2e"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "tsx": "^4.19.2",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4"
  }
}
```

- [ ] **步骤 2：编写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **步骤 3：编写 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **步骤 4：安装依赖**

```bash
cd skills/sketch-to-component/scripts && npm install
```

预期：写入 lockfile，`node_modules/` 已填充，退出码 0。

- [ ] **步骤 5：提交**

```bash
git add skills/sketch-to-component/scripts/package.json skills/sketch-to-component/scripts/tsconfig.json skills/sketch-to-component/scripts/vitest.config.ts skills/sketch-to-component/scripts/package-lock.json
git commit -m "feat(sketch-to-component): scripts package skeleton"
```

---

## 任务 3：IR — primitive schema

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/ir/schema.ts`
- 创建：`skills/sketch-to-component/scripts/src/ir/__tests__/schema.test.ts`

- [ ] **步骤 1：编写 primitive schema 的失败测试**

```ts
// src/ir/__tests__/schema.test.ts
import { describe, it, expect } from 'vitest';
import { ColorSchema, RectSchema } from '../schema.js';

describe('IR primitives', () => {
  it('parses a hex8 color', () => {
    expect(ColorSchema.parse('#FA5900FF')).toBe('#FA5900FF');
  });
  it('rejects malformed colors', () => {
    expect(() => ColorSchema.parse('FA5900')).toThrow();
  });
  it('parses a rect', () => {
    expect(RectSchema.parse({ x: 0, y: 0, width: 375, height: 1173 })).toEqual({
      x: 0, y: 0, width: 375, height: 1173,
    });
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
cd skills/sketch-to-component/scripts && npx vitest run src/ir/__tests__/schema.test.ts
```

预期：失败，提示 `Cannot find module '../schema.js'`。

- [ ] **步骤 3：实现 primitives**

```ts
// src/ir/schema.ts
import { z } from 'zod';

export const ColorSchema = z.string().regex(/^#[0-9A-Fa-f]{8}$/);
export type Color = z.infer<typeof ColorSchema>;

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Rect = z.infer<typeof RectSchema>;
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

预期：3 个通过。

- [ ] **步骤 5：提交**

```bash
git add skills/sketch-to-component/scripts/src/ir/schema.ts skills/sketch-to-component/scripts/src/ir/__tests__/schema.test.ts
git commit -m "feat(sketch-to-component): IR primitive schemas (Color, Rect)"
```

---

## 任务 4：IR — style schema

**文件：**
- 修改：`skills/sketch-to-component/scripts/src/ir/schema.ts`
- 修改：`skills/sketch-to-component/scripts/src/ir/__tests__/schema.test.ts`

- [ ] **步骤 1：追加失败测试**

```ts
// 追加到 src/ir/__tests__/schema.test.ts
import { StyleSchema } from '../schema.js';

describe('Style', () => {
  it('parses a minimal style', () => {
    expect(StyleSchema.parse({
      fills: [{ kind: 'solid', color: '#FF0000FF', opacity: 1 }],
      borders: [],
      shadows: [],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    })).toBeTruthy();
  });
  it('parses fill with swatch reference', () => {
    expect(StyleSchema.parse({
      fills: [{ kind: 'solid', color: '#FA5900FF', opacity: 1, swatchName: 'brand/orange' }],
      borders: [], shadows: [],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    })).toBeTruthy();
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

预期：因缺少 `StyleSchema` 导出而失败。

- [ ] **步骤 3：实现 Style schema**

追加到 `src/ir/schema.ts`：

```ts
export const FillSchema = z.object({
  kind: z.literal('solid'),
  color: ColorSchema,
  opacity: z.number().min(0).max(1),
  swatchName: z.string().optional(),
});
export type Fill = z.infer<typeof FillSchema>;

export const BorderSchema = z.object({
  color: ColorSchema,
  width: z.number().nonnegative(),
  position: z.enum(['inside', 'center', 'outside']),
  swatchName: z.string().optional(),
});
export type Border = z.infer<typeof BorderSchema>;

export const ShadowSchema = z.object({
  kind: z.enum(['outer', 'inner']),
  color: ColorSchema,
  x: z.number(),
  y: z.number(),
  blur: z.number().nonnegative(),
  spread: z.number().nonnegative(),
  swatchName: z.string().optional(),
});
export type Shadow = z.infer<typeof ShadowSchema>;

export const CornersSchema = z.object({
  topLeft: z.number().nonnegative(),
  topRight: z.number().nonnegative(),
  bottomRight: z.number().nonnegative(),
  bottomLeft: z.number().nonnegative(),
});

export const StyleSchema = z.object({
  fills: z.array(FillSchema),
  borders: z.array(BorderSchema),
  shadows: z.array(ShadowSchema),
  corners: CornersSchema,
  opacity: z.number().min(0).max(1),
  sharedStyleName: z.string().optional(),
});
export type Style = z.infer<typeof StyleSchema>;
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

预期：5 个通过。

- [ ] **步骤 5：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/ir/
git commit -m "feat(sketch-to-component): IR Style schemas (fills, borders, shadows, corners)"
```

---

## 任务 5：IR — text 与 node schema

**文件：**
- 修改：`skills/sketch-to-component/scripts/src/ir/schema.ts`
- 修改：`skills/sketch-to-component/scripts/src/ir/__tests__/schema.test.ts`

- [ ] **步骤 1：追加失败测试**

```ts
// 追加
import { NodeSchema } from '../schema.js';

describe('Node', () => {
  it('parses a Text node', () => {
    expect(NodeSchema.parse({
      kind: 'Text',
      id: 'L1',
      name: '标题',
      frame: { x: 0, y: 0, width: 100, height: 20 },
      visible: true,
      content: 'Hello',
      fontFamily: 'PingFang SC',
      fontSize: 16,
      fontWeight: 400,
      color: '#1A1A1AFF',
      align: 'left',
      decoration: 'none',
    })).toBeTruthy();
  });
  it('parses a Group node with children', () => {
    expect(NodeSchema.parse({
      kind: 'Group',
      id: 'G1', name: 'wrapper',
      frame: { x: 0, y: 0, width: 100, height: 100 },
      visible: true,
      style: { fills: [], borders: [], shadows: [],
               corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
               opacity: 1 },
      children: [],
    })).toBeTruthy();
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

预期：因缺少 `NodeSchema` 导出而失败。

- [ ] **步骤 3：实现带递归的 Node 联合类型**

追加到 `src/ir/schema.ts`：

```ts
const BaseNodeProps = {
  id: z.string(),
  name: z.string(),
  frame: RectSchema,
  visible: z.boolean(),
};

export const TextNodeSchema = z.object({
  kind: z.literal('Text'),
  ...BaseNodeProps,
  content: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  fontWeight: z.number().int(),
  color: ColorSchema,
  align: z.enum(['left', 'center', 'right', 'justify']),
  decoration: z.enum(['none', 'underline', 'strikethrough']),
  textColorSwatchName: z.string().optional(),
});

export const ImageNodeSchema = z.object({
  kind: z.literal('Image'),
  ...BaseNodeProps,
  assetId: z.string(),
});

export const ShapeNodeSchema = z.object({
  kind: z.literal('Shape'),
  ...BaseNodeProps,
  style: StyleSchema,
});

export type NodeType =
  | z.infer<typeof TextNodeSchema>
  | z.infer<typeof ImageNodeSchema>
  | z.infer<typeof ShapeNodeSchema>
  | GroupNode
  | SymbolInstanceNode;

interface GroupNode {
  kind: 'Group' | 'Frame';
  id: string;
  name: string;
  frame: Rect;
  visible: boolean;
  style: Style;
  children: NodeType[];
}

interface SymbolInstanceNode {
  kind: 'SymbolInstance';
  id: string;
  name: string;
  frame: Rect;
  visible: boolean;
  masterId: string;
  overrides: OverrideRecord[];
}

export interface OverrideRecord {
  path: string;
  property: string;
  value: unknown;
  defaultValue: unknown;
  swatchName?: string;
}

export const OverrideSchema: z.ZodType<OverrideRecord> = z.object({
  path: z.string(),
  property: z.string(),
  value: z.unknown(),
  defaultValue: z.unknown(),
  swatchName: z.string().optional(),
});

export const GroupNodeSchema: z.ZodType<GroupNode> = z.lazy(() => z.object({
  kind: z.enum(['Group', 'Frame']),
  id: z.string(),
  name: z.string(),
  frame: RectSchema,
  visible: z.boolean(),
  style: StyleSchema,
  children: z.array(NodeSchema),
}));

export const SymbolInstanceNodeSchema: z.ZodType<SymbolInstanceNode> = z.object({
  kind: z.literal('SymbolInstance'),
  id: z.string(),
  name: z.string(),
  frame: RectSchema,
  visible: z.boolean(),
  masterId: z.string(),
  overrides: z.array(OverrideSchema),
});

export const NodeSchema: z.ZodType<NodeType> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    TextNodeSchema,
    ImageNodeSchema,
    ShapeNodeSchema,
    GroupNodeSchema as any,
    SymbolInstanceNodeSchema,
  ])
);
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

预期：7 个通过。

- [ ] **步骤 5：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/ir/
git commit -m "feat(sketch-to-component): IR Node union (Text, Image, Shape, Group, SymbolInstance)"
```

---

## 任务 6：IR — Symbol Master 与根文档

**文件：**
- 修改：`skills/sketch-to-component/scripts/src/ir/schema.ts`
- 修改：`skills/sketch-to-component/scripts/src/ir/__tests__/schema.test.ts`

- [ ] **步骤 1：追加失败测试**

```ts
// 追加
import { DocumentSchema } from '../schema.js';

describe('Document', () => {
  it('parses an empty document', () => {
    expect(DocumentSchema.parse({
      root: {
        kind: 'Frame', id: 'F1', name: 'Frame',
        frame: { x: 0, y: 0, width: 100, height: 100 },
        visible: true,
        style: { fills: [], borders: [], shadows: [],
          corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          opacity: 1 },
        children: [],
      },
      symbols: {},
      assets: {},
      colorVariables: {},
    })).toBeTruthy();
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

预期：因缺少 `DocumentSchema` 而失败。

- [ ] **步骤 3：实现 Document 与 SymbolMaster**

追加到 `src/ir/schema.ts`：

```ts
export const SymbolMasterSchema = z.object({
  id: z.string(),
  name: z.string(),
  frame: RectSchema,
  children: z.array(NodeSchema),
  style: StyleSchema,
});
export type SymbolMaster = z.infer<typeof SymbolMasterSchema>;

export const AssetSchema = z.object({
  id: z.string(),
  format: z.literal('png'),
  base64: z.string(),
});

// Keyed in the parent map by swatch name. cssVarName is derived deterministically
// by the generator via `toCssVarName(name)`, so producers don't need to compute it.
export const ColorVariableSchema = z.object({
  name: z.string(),
  color: ColorSchema,
});

export const DocumentSchema = z.object({
  root: GroupNodeSchema,
  symbols: z.record(SymbolMasterSchema),
  assets: z.record(AssetSchema),
  colorVariables: z.record(ColorVariableSchema),
});
export type Document = z.infer<typeof DocumentSchema>;
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/ir/__tests__/schema.test.ts
```

预期：8 个通过。

- [ ] **步骤 5：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/ir/
git commit -m "feat(sketch-to-component): IR Document root with symbols, assets, colorVariables"
```

---

## 任务 7：名称清理器

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/generator/naming.ts`
- 创建：`skills/sketch-to-component/scripts/src/generator/__tests__/naming.test.ts`

- [ ] **步骤 1：编写失败测试**

```ts
// src/generator/__tests__/naming.test.ts
import { describe, it, expect } from 'vitest';
import { toPascalIdentifier, toCssVarName, shortHash } from '../naming.js';

describe('naming', () => {
  it('PascalCases ASCII words', () => {
    expect(toPascalIdentifier('my button', 'X')).toBe('MyButton');
  });
  it('strips non-ASCII and adds hash suffix when result would be empty', () => {
    const out = toPascalIdentifier('猜你想要', 'ABCDEF12');
    expect(out).toMatch(/^Symbol_[A-Za-z0-9]{6,8}$/);
  });
  it('preserves ASCII and appends short hash when mixed', () => {
    const out = toPascalIdentifier('icon/底部/查保单', 'AABBCCDD');
    expect(out.startsWith('Icon')).toBe(true);
  });
  it('CSS var name is kebab and lowercase', () => {
    expect(toCssVarName('FA5900平安橙色')).toMatch(/^--swatch-fa5900-[a-z0-9]{6}$/);
  });
  it('shortHash is deterministic and 6 chars', () => {
    expect(shortHash('hello')).toBe(shortHash('hello'));
    expect(shortHash('hello')).toHaveLength(6);
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/generator/__tests__/naming.test.ts
```

预期：因缺少模块而失败。

- [ ] **步骤 3：实现 naming**

```ts
// src/generator/naming.ts
import { createHash } from 'node:crypto';

export function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 6);
}

const ASCII_WORD = /[A-Za-z0-9]+/g;

export function toPascalIdentifier(rawName: string, stableSalt: string): string {
  const asciiTokens = rawName.match(ASCII_WORD) ?? [];
  const pascal = asciiTokens
    .map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join('');
  if (pascal.length === 0) {
    return `Symbol_${shortHash(stableSalt)}`;
  }
  const hasNonAscii = /[^\x00-\x7F]/.test(rawName);
  return hasNonAscii ? `${pascal}_${shortHash(stableSalt)}` : pascal;
}

export function toCssVarName(rawName: string): string {
  const tokens = rawName.match(ASCII_WORD) ?? [];
  const ascii = tokens.join('-').toLowerCase();
  return `--swatch-${ascii || 'x'}-${shortHash(rawName)}`;
}
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/generator/__tests__/naming.test.ts
```

预期：5 个通过。

- [ ] **步骤 5：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): name sanitizer (PascalCase, CSS var, short hash)"
```

---

## 任务 8：CSS 规则发射器

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/generator/css.ts`
- 创建：`skills/sketch-to-component/scripts/src/generator/__tests__/css.test.ts`

- [ ] **步骤 1：编写失败测试**

```ts
// src/generator/__tests__/css.test.ts
import { describe, it, expect } from 'vitest';
import { emitLayoutRules, emitStyleRules } from '../css.js';

describe('css emitter', () => {
  it('emits absolute position rules', () => {
    expect(emitLayoutRules({ x: 10, y: 20, width: 100, height: 40 })).toEqual([
      'position: absolute',
      'left: 10px',
      'top: 20px',
      'width: 100px',
      'height: 40px',
    ]);
  });
  it('emits solid fill as background', () => {
    expect(emitStyleRules({
      fills: [{ kind: 'solid', color: '#FF0000FF', opacity: 1 }],
      borders: [], shadows: [],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    })).toContain('background-color: #FF0000FF');
  });
  it('emits swatch reference as var()', () => {
    const rules = emitStyleRules({
      fills: [{ kind: 'solid', color: '#FA5900FF', opacity: 1, swatchName: 'brand/orange' }],
      borders: [], shadows: [],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    });
    expect(rules.some(r => r.includes('var(--swatch-brand-orange-'))).toBe(true);
  });
  it('emits per-corner radius when asymmetric', () => {
    const rules = emitStyleRules({
      fills: [], borders: [], shadows: [],
      corners: { topLeft: 4, topRight: 8, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    });
    expect(rules).toContain('border-radius: 4px 8px 0px 0px');
  });
  it('emits single border', () => {
    const rules = emitStyleRules({
      fills: [], shadows: [],
      borders: [{ color: '#000000FF', width: 2, position: 'inside' }],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    });
    expect(rules).toContain('border: 2px solid #000000FF');
  });
  it('emits outer shadow', () => {
    const rules = emitStyleRules({
      fills: [], borders: [],
      shadows: [{ kind: 'outer', color: '#0000004D', x: 0, y: 2, blur: 8, spread: 0 }],
      corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 1,
    });
    expect(rules).toContain('box-shadow: 0px 2px 8px 0px #0000004D');
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/generator/__tests__/css.test.ts
```

预期：因缺少模块而失败。

- [ ] **步骤 3：实现 css 发射器**

```ts
// src/generator/css.ts
import type { Rect, Style, Fill, Border, Shadow } from '../ir/schema.js';
import { toCssVarName } from './naming.js';

export function emitLayoutRules(frame: Rect): string[] {
  return [
    'position: absolute',
    `left: ${frame.x}px`,
    `top: ${frame.y}px`,
    `width: ${frame.width}px`,
    `height: ${frame.height}px`,
  ];
}

function colorOrVar(color: string, swatchName?: string): string {
  return swatchName ? `var(${toCssVarName(swatchName)}, ${color})` : color;
}

function fillRules(fills: Style['fills']): string[] {
  const first = fills[0];
  if (!first) return [];
  return [`background-color: ${colorOrVar(first.color, first.swatchName)}`];
}

function borderRules(borders: Style['borders']): string[] {
  const b = borders[0];
  if (!b) return [];
  return [`border: ${b.width}px solid ${colorOrVar(b.color, b.swatchName)}`];
}

function shadowRules(shadows: Style['shadows']): string[] {
  const parts = shadows.map(s => {
    const inset = s.kind === 'inner' ? 'inset ' : '';
    return `${inset}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${colorOrVar(s.color, s.swatchName)}`;
  });
  return parts.length ? [`box-shadow: ${parts.join(', ')}`] : [];
}

function cornerRules(c: Style['corners']): string[] {
  if (c.topLeft === 0 && c.topRight === 0 && c.bottomRight === 0 && c.bottomLeft === 0) return [];
  const all = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
  if (all.every(v => v === c.topLeft)) return [`border-radius: ${c.topLeft}px`];
  return [`border-radius: ${all.map(v => `${v}px`).join(' ')}`];
}

export function emitStyleRules(style: Style): string[] {
  const out: string[] = [];
  out.push(...fillRules(style.fills));
  out.push(...borderRules(style.borders));
  out.push(...shadowRules(style.shadows));
  out.push(...cornerRules(style.corners));
  if (style.opacity !== 1) out.push(`opacity: ${style.opacity}`);
  return out;
}
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/generator/__tests__/css.test.ts
```

预期：6 个通过。

- [ ] **步骤 5：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): CSS rule emitter (layout, fills, borders, shadows, corners)"
```

---

## 任务 9：Override → prop 映射器

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/generator/overrides.ts`
- 创建：`skills/sketch-to-component/scripts/src/generator/__tests__/overrides.test.ts`

- [ ] **步骤 1：编写失败测试**

```ts
// src/generator/__tests__/overrides.test.ts
import { describe, it, expect } from 'vitest';
import { propsForOverrides, applyOverridesToInstance } from '../overrides.js';
import type { OverrideRecord } from '../../ir/schema.js';

const orec = (p: string, prop: string, val: unknown, def: unknown): OverrideRecord =>
  ({ path: p, property: prop, value: val, defaultValue: def });

describe('overrides → props', () => {
  it('maps stringValue to a typed optional text prop', () => {
    const props = propsForOverrides([orec('L1', 'stringValue', 'Hi', 'Hello')]);
    expect(props.find(p => p.name === 'text_L1')).toEqual({
      name: 'text_L1', type: 'string', optional: true, default: 'Hello',
    });
  });
  it('maps color:fill-0 to a color prop', () => {
    const props = propsForOverrides([orec('L1', 'color:fill-0', '#FFFFFFFF', '#000000FF')]);
    expect(props.find(p => p.name === 'fill0_L1')).toEqual({
      name: 'fill0_L1', type: 'string', optional: true, default: '#000000FF',
    });
  });
  it('maps isVisible to a boolean prop', () => {
    const props = propsForOverrides([orec('L1', 'isVisible', false, true)]);
    expect(props.find(p => p.name === 'visible_L1')).toEqual({
      name: 'visible_L1', type: 'boolean', optional: true, default: true,
    });
  });
  it('skips unsupported override properties without throwing', () => {
    const props = propsForOverrides([orec('L1', 'someThingWeDoNotHandle', 1, 0)]);
    expect(props).toHaveLength(0);
  });
});

describe('applyOverridesToInstance', () => {
  it('emits only call-site props that differ from default', () => {
    const instance = { id: 'I1', overrides: [
      orec('L1', 'stringValue', 'Custom', 'Default'),
      orec('L2', 'stringValue', 'Same', 'Same'),
    ] };
    const args = applyOverridesToInstance(instance as any);
    expect(args).toEqual({ text_L1: 'Custom' });
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/generator/__tests__/overrides.test.ts
```

预期：因缺少模块而失败。

- [ ] **步骤 3：实现 overrides 映射器**

```ts
// src/generator/overrides.ts
import type { OverrideRecord } from '../ir/schema.js';

export interface PropSpec {
  name: string;
  type: 'string' | 'boolean' | 'number';
  optional: true;
  default: unknown;
}

const COLOR_FILL_RE = /^color:fill-(\d+)$/;
const COLOR_BORDER_RE = /^color:border-(\d+)$/;
const COLOR_SHADOW_RE = /^color:(?:inner)?shadow-(\d+)$/;

function pathSlug(path: string): string {
  return path.split('/').pop() ?? path;
}

function specForOverride(o: OverrideRecord): PropSpec | null {
  const slug = pathSlug(o.path);
  switch (o.property) {
    case 'stringValue':
      return { name: `text_${slug}`, type: 'string', optional: true, default: o.defaultValue };
    case 'isVisible':
      return { name: `visible_${slug}`, type: 'boolean', optional: true, default: o.defaultValue };
    case 'textColor':
      return { name: `textColor_${slug}`, type: 'string', optional: true, default: o.defaultValue };
    case 'textSize':
      return { name: `textSize_${slug}`, type: 'number', optional: true, default: o.defaultValue };
    case 'textWeight':
      return { name: `textWeight_${slug}`, type: 'number', optional: true, default: o.defaultValue };
    case 'fillColor':
      return { name: `tint_${slug}`, type: 'string', optional: true, default: o.defaultValue };
  }
  let m = COLOR_FILL_RE.exec(o.property);
  if (m) return { name: `fill${m[1]}_${slug}`, type: 'string', optional: true, default: o.defaultValue };
  m = COLOR_BORDER_RE.exec(o.property);
  if (m) return { name: `border${m[1]}_${slug}`, type: 'string', optional: true, default: o.defaultValue };
  m = COLOR_SHADOW_RE.exec(o.property);
  if (m) return { name: `shadow${m[1]}_${slug}`, type: 'string', optional: true, default: o.defaultValue };
  return null;
}

export function propsForOverrides(overrides: OverrideRecord[]): PropSpec[] {
  const out: PropSpec[] = [];
  const seen = new Set<string>();
  for (const o of overrides) {
    const spec = specForOverride(o);
    if (!spec || seen.has(spec.name)) continue;
    seen.add(spec.name);
    out.push(spec);
  }
  return out;
}

export function applyOverridesToInstance(instance: { overrides: OverrideRecord[] }): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const o of instance.overrides) {
    const spec = specForOverride(o);
    if (!spec) continue;
    if (o.value === o.defaultValue) continue;
    args[spec.name] = o.value;
  }
  return args;
}
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/generator/__tests__/overrides.test.ts
```

预期：5 个通过。

- [ ] **步骤 5：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): override → typed React prop mapping"
```

---

## 任务 10：普通节点的 TSX 发射器

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/generator/tsx.ts`
- 创建：`skills/sketch-to-component/scripts/src/generator/__tests__/tsx.test.ts`

- [ ] **步骤 1：编写失败测试**

```ts
// src/generator/__tests__/tsx.test.ts
import { describe, it, expect } from 'vitest';
import { emitNodeJsx } from '../tsx.js';
import type { NodeType } from '../../ir/schema.js';

const baseStyle = {
  fills: [], borders: [], shadows: [],
  corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  opacity: 1,
};

describe('emitNodeJsx', () => {
  it('renders a Text node with content', () => {
    const n: NodeType = {
      kind: 'Text', id: 'T1', name: 'title', visible: true,
      frame: { x: 0, y: 0, width: 100, height: 20 },
      content: 'Hi', fontFamily: 'PingFang SC', fontSize: 14, fontWeight: 400,
      color: '#000000FF', align: 'left', decoration: 'none',
    };
    const out = emitNodeJsx(n, 'cls');
    expect(out).toContain('<span className={cls.t_T1}>Hi</span>');
  });
  it('renders an Image node', () => {
    const n: NodeType = {
      kind: 'Image', id: 'I1', name: 'pic', visible: true,
      frame: { x: 0, y: 0, width: 100, height: 100 },
      assetId: 'asset_abc',
    };
    const out = emitNodeJsx(n, 'cls');
    expect(out).toContain('<img className={cls.i_I1}');
    expect(out).toContain('src={asset_abc}');
  });
  it('renders a Group with children wrapped in a div', () => {
    const n: NodeType = {
      kind: 'Group', id: 'G1', name: 'wrap', visible: true,
      frame: { x: 0, y: 0, width: 10, height: 10 }, style: baseStyle,
      children: [],
    };
    const out = emitNodeJsx(n, 'cls');
    expect(out).toContain('<div className={cls.g_G1}>');
    expect(out).toContain('</div>');
  });
  it('omits hidden nodes', () => {
    const n: NodeType = {
      kind: 'Text', id: 'T2', name: 'x', visible: false,
      frame: { x: 0, y: 0, width: 1, height: 1 },
      content: 'x', fontFamily: 'F', fontSize: 1, fontWeight: 400,
      color: '#000000FF', align: 'left', decoration: 'none',
    };
    expect(emitNodeJsx(n, 'cls')).toBe('');
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/generator/__tests__/tsx.test.ts
```

预期：因缺少模块而失败。

- [ ] **步骤 3：实现 tsx 发射器**

```ts
// src/generator/tsx.ts
import type { NodeType } from '../ir/schema.js';

function classPrefix(kind: NodeType['kind']): string {
  switch (kind) {
    case 'Text': return 't';
    case 'Image': return 'i';
    case 'Shape': return 's';
    case 'Group':
    case 'Frame': return 'g';
    case 'SymbolInstance': return 'si';
  }
}

export function emitNodeJsx(node: NodeType, classesIdent: string): string {
  if (!node.visible) return '';
  const cls = `${classesIdent}.${classPrefix(node.kind)}_${node.id}`;
  switch (node.kind) {
    case 'Text':
      return `<span className={${cls}}>${escapeJsxText(node.content)}</span>`;
    case 'Image':
      return `<img className={${cls}} src={asset_${node.assetId}} alt="${escapeAttr(node.name)}" />`;
    case 'Shape':
      return `<div className={${cls}} />`;
    case 'Group':
    case 'Frame': {
      const children = node.children.map(c => emitNodeJsx(c, classesIdent)).filter(Boolean).join('\n');
      return `<div className={${cls}}>\n${children}\n</div>`;
    }
    case 'SymbolInstance':
      return `<div className={${cls}}>{/* SymbolInstance ${node.masterId} */}</div>`;
  }
}

function escapeJsxText(s: string): string {
  return s.replace(/[<>{}]/g, ch => `{'${ch}'}`);
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/generator/__tests__/tsx.test.ts
```

预期：4 个通过。

- [ ] **步骤 5：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): TSX emitter for Text/Image/Shape/Group/Frame"
```

---

## 任务 11：Symbol Master 文件发射器

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/generator/symbols.ts`
- 创建：`skills/sketch-to-component/scripts/src/generator/__tests__/symbols.test.ts`

- [ ] **步骤 1：编写失败测试**

```ts
// src/generator/__tests__/symbols.test.ts
import { describe, it, expect } from 'vitest';
import { emitSymbolMaster } from '../symbols.js';
import type { SymbolMaster } from '../../ir/schema.js';

const baseStyle = {
  fills: [], borders: [], shadows: [],
  corners: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  opacity: 1,
};

describe('emitSymbolMaster', () => {
  it('emits a tsx + css module pair', () => {
    const master: SymbolMaster = {
      id: 'MID1', name: 'MyButton',
      frame: { x: 0, y: 0, width: 100, height: 40 },
      style: baseStyle,
      children: [{
        kind: 'Text', id: 'TLABEL', name: 'label', visible: true,
        frame: { x: 10, y: 10, width: 80, height: 20 },
        content: 'OK', fontFamily: 'PingFang SC', fontSize: 14, fontWeight: 400,
        color: '#000000FF', align: 'left', decoration: 'none',
      }],
    };
    const out = emitSymbolMaster(master, [
      { name: 'text_TLABEL', type: 'string', optional: true, default: 'OK' },
    ]);
    expect(out.componentName).toBe('MyButton');
    expect(out.tsxPath).toBe('MyButton.tsx');
    expect(out.cssPath).toBe('MyButton.module.css');
    expect(out.tsx).toContain('export interface MyButtonProps');
    expect(out.tsx).toContain('text_TLABEL?: string');
    expect(out.tsx).toContain("import classes from './MyButton.module.css'");
    expect(out.css).toContain('.t_TLABEL');
    expect(out.css).toContain('width: 80px');
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/generator/__tests__/symbols.test.ts
```

预期：因缺少模块而失败。

- [ ] **步骤 3：实现 symbol 发射器**

```ts
// src/generator/symbols.ts
import type { NodeType, SymbolMaster } from '../ir/schema.js';
import { emitLayoutRules, emitStyleRules } from './css.js';
import { emitNodeJsx } from './tsx.js';
import { toPascalIdentifier } from './naming.js';
import type { PropSpec } from './overrides.js';

export interface SymbolFiles {
  componentName: string;
  tsxPath: string;
  cssPath: string;
  tsx: string;
  css: string;
}

function collectCssRules(node: NodeType, out: string[]): void {
  if (!node.visible) return;
  const prefix = node.kind === 'Text' ? 't'
    : node.kind === 'Image' ? 'i'
    : node.kind === 'Shape' ? 's'
    : node.kind === 'SymbolInstance' ? 'si'
    : 'g';
  const rules: string[] = [...emitLayoutRules(node.frame)];
  if (node.kind === 'Text') {
    rules.push(`color: ${node.color}`);
    rules.push(`font-family: "${node.fontFamily}"`);
    rules.push(`font-size: ${node.fontSize}px`);
    rules.push(`font-weight: ${node.fontWeight}`);
    rules.push(`text-align: ${node.align}`);
    if (node.decoration !== 'none') rules.push(`text-decoration: ${node.decoration}`);
  } else if (node.kind === 'Group' || node.kind === 'Frame' || node.kind === 'Shape') {
    rules.push(...emitStyleRules(node.style));
  }
  out.push(`.${prefix}_${node.id} {\n  ${rules.join(';\n  ')};\n}`);
  if (node.kind === 'Group' || node.kind === 'Frame') {
    for (const c of node.children) collectCssRules(c, out);
  }
}

function defaultLiteral(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return 'undefined';
}

export function emitSymbolMaster(master: SymbolMaster, props: PropSpec[]): SymbolFiles {
  const componentName = toPascalIdentifier(master.name, master.id);
  const cssParts: string[] = [];
  cssParts.push(`.root {\n  position: relative;\n  width: ${master.frame.width}px;\n  height: ${master.frame.height}px;\n}`);
  for (const c of master.children) collectCssRules(c, cssParts);
  const childrenJsx = master.children.map(c => emitNodeJsx(c, 'classes')).filter(Boolean).join('\n      ');
  const propDecls = props.map(p => `  ${p.name}?: ${p.type};`).join('\n');
  const propDestructure = props.length
    ? `{ ${props.map(p => `${p.name} = ${defaultLiteral(p.default)}`).join(', ')} }`
    : '_props';
  const tsx = `import React from 'react';
import classes from './${componentName}.module.css';

export interface ${componentName}Props {
${propDecls}
}

export function ${componentName}(${propDestructure}: ${componentName}Props) {
  return (
    <div className={classes.root}>
      ${childrenJsx}
    </div>
  );
}
`;
  return {
    componentName,
    tsxPath: `${componentName}.tsx`,
    cssPath: `${componentName}.module.css`,
    tsx,
    css: cssParts.join('\n\n') + '\n',
  };
}
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/generator/__tests__/symbols.test.ts
```

预期：1 个通过（含 6 条断言）。

- [ ] **步骤 5：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): Symbol Master → tsx + CSS Module file pair"
```

---

## 任务 12：带 override 的 SymbolInstance TSX 发射器

**文件：**
- 修改：`skills/sketch-to-component/scripts/src/generator/tsx.ts`
- 修改：`skills/sketch-to-component/scripts/src/generator/__tests__/tsx.test.ts`

- [ ] **步骤 1：追加失败测试**

```ts
// 追加到 src/generator/__tests__/tsx.test.ts
import { emitSymbolInstanceJsx } from '../tsx.js';

describe('emitSymbolInstanceJsx', () => {
  it('renders <Component prop="value" />', () => {
    const out = emitSymbolInstanceJsx(
      { kind: 'SymbolInstance', id: 'I1', name: 'btn', visible: true,
        frame: { x: 0, y: 0, width: 100, height: 40 },
        masterId: 'M1', overrides: [
          { path: 'L1', property: 'stringValue', value: 'Hello', defaultValue: 'Default' },
        ],
      },
      { M1: 'MyButton' },
      'cls'
    );
    expect(out).toContain('<MyButton text_L1="Hello" />');
  });
  it('emits unknown master as commented-out placeholder', () => {
    const out = emitSymbolInstanceJsx(
      { kind: 'SymbolInstance', id: 'I2', name: 'x', visible: true,
        frame: { x: 0, y: 0, width: 1, height: 1 }, masterId: 'M_unknown', overrides: [] },
      {}, 'cls'
    );
    expect(out).toContain('{/* missing master M_unknown */}');
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/generator/__tests__/tsx.test.ts
```

预期：因缺少导出而失败。

- [ ] **步骤 3：在 `src/generator/tsx.ts` 中追加 `emitSymbolInstanceJsx`**

```ts
// 追加到 src/generator/tsx.ts
import { applyOverridesToInstance } from './overrides.js';

type Instance = Extract<NodeType, { kind: 'SymbolInstance' }>;

export function emitSymbolInstanceJsx(
  instance: Instance,
  masterIdToComponent: Record<string, string>,
  classesIdent: string,
): string {
  if (!instance.visible) return '';
  const componentName = masterIdToComponent[instance.masterId];
  const cls = `${classesIdent}.si_${instance.id}`;
  if (!componentName) {
    return `<div className={${cls}}>{/* missing master ${instance.masterId} */}</div>`;
  }
  const args = applyOverridesToInstance(instance);
  const propStr = Object.entries(args)
    .map(([k, v]) => `${k}=${jsxAttrValue(v)}`)
    .join(' ');
  return propStr
    ? `<${componentName} ${propStr} />`
    : `<${componentName} />`;
}

function jsxAttrValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean' || typeof v === 'number') return `{${v}}`;
  return `{${JSON.stringify(v)}}`;
}
```

- [ ] **步骤 4：替换 `emitNodeJsx` 内的 `SymbolInstance` 分支**

在 `src/generator/tsx.ts` 中查找：

```ts
    case 'SymbolInstance':
      return `<div className={${cls}}>{/* SymbolInstance ${node.masterId} */}</div>`;
```

替换为：

```ts
    case 'SymbolInstance':
      throw new Error('Use emitSymbolInstanceJsx for SymbolInstance nodes; emitNodeJsx does not have the master→component map');
```

（任务 10 的测试只覆盖非 instance 种类，因此仍会通过。任务 13 的顶层 `generate()` 将 SymbolInstance 节点路由到 `emitSymbolInstanceJsx`。）

- [ ] **步骤 5：运行测试，预期通过**

```bash
npx vitest run src/generator/__tests__/tsx.test.ts
```

预期：6 个通过。

- [ ] **步骤 6：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/
git commit -m "feat(sketch-to-component): TSX emitter for SymbolInstance with override props"
```

---

## 任务 13：顶层 generator（index）

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/generator/index.ts`
- 创建：`skills/sketch-to-component/scripts/src/generator/__tests__/index.test.ts`
- 创建：`skills/sketch-to-component/scripts/tests/fixtures/tiny-ir.json`

- [ ] **步骤 1：手写 tiny fixture**

```json
{
  "root": {
    "kind": "Frame", "id": "ROOT", "name": "Demo",
    "frame": { "x": 0, "y": 0, "width": 200, "height": 100 },
    "visible": true,
    "style": { "fills": [{"kind":"solid","color":"#FFFFFFFF","opacity":1}],
               "borders": [], "shadows": [],
               "corners": {"topLeft":0,"topRight":0,"bottomRight":0,"bottomLeft":0},
               "opacity": 1 },
    "children": [
      {
        "kind": "SymbolInstance", "id": "INS1", "name": "btn-A", "visible": true,
        "frame": { "x": 10, "y": 30, "width": 80, "height": 40 },
        "masterId": "MID_BTN",
        "overrides": [
          { "path": "LBL", "property": "stringValue", "value": "Click", "defaultValue": "OK" }
        ]
      }
    ]
  },
  "symbols": {
    "MID_BTN": {
      "id": "MID_BTN", "name": "MyButton",
      "frame": { "x": 0, "y": 0, "width": 80, "height": 40 },
      "style": { "fills": [], "borders": [], "shadows": [],
                 "corners": {"topLeft":0,"topRight":0,"bottomRight":0,"bottomLeft":0},
                 "opacity": 1 },
      "children": [
        {
          "kind": "Text", "id": "LBL", "name": "label", "visible": true,
          "frame": { "x": 0, "y": 10, "width": 80, "height": 20 },
          "content": "OK", "fontFamily": "PingFang SC",
          "fontSize": 14, "fontWeight": 400, "color": "#000000FF",
          "align": "center", "decoration": "none"
        }
      ]
    }
  },
  "assets": {},
  "colorVariables": {}
}
```

- [ ] **步骤 2：编写失败测试**

```ts
// src/generator/__tests__/index.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { generate } from '../index.js';
import { DocumentSchema } from '../../ir/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, '../../../tests/fixtures/tiny-ir.json'), 'utf8'));

describe('generate', () => {
  it('produces a Frame, a Symbol component, and a tokens file', () => {
    const doc = DocumentSchema.parse(fixture);
    const out = generate(doc);
    expect(Object.keys(out.files).sort()).toEqual([
      'Frame.module.css', 'Frame.tsx',
      'MyButton.module.css', 'MyButton.tsx',
      'tokens.css',
    ].sort());
    expect(out.files['Frame.tsx']).toContain('<MyButton text_LBL="Click" />');
    expect(out.files['MyButton.tsx']).toContain('export function MyButton');
  });
});
```

- [ ] **步骤 3：运行测试，预期失败**

```bash
npx vitest run src/generator/__tests__/index.test.ts
```

预期：因缺少模块而失败。

- [ ] **步骤 4：实现 generator 入口**

```ts
// src/generator/index.ts
import type { Document, NodeType, SymbolMaster, OverrideRecord } from '../ir/schema.js';
import { toPascalIdentifier } from './naming.js';
import { emitSymbolMaster } from './symbols.js';
import { emitNodeJsx, emitSymbolInstanceJsx } from './tsx.js';
import { propsForOverrides } from './overrides.js';
import { emitLayoutRules, emitStyleRules } from './css.js';

export interface GenerateResult {
  files: Record<string, string>;
}

function collectAllInstances(node: NodeType, out: Array<Extract<NodeType, {kind:'SymbolInstance'}>>): void {
  if (node.kind === 'SymbolInstance') { out.push(node); return; }
  if (node.kind === 'Group' || node.kind === 'Frame') for (const c of node.children) collectAllInstances(c, out);
}

function overridesByMaster(root: NodeType, symbols: Document['symbols']): Record<string, OverrideRecord[]> {
  const acc: Record<string, OverrideRecord[]> = {};
  const insts: Array<Extract<NodeType,{kind:'SymbolInstance'}>> = [];
  collectAllInstances(root, insts);
  for (const inst of insts) {
    if (!symbols[inst.masterId]) continue;
    (acc[inst.masterId] ||= []).push(...inst.overrides);
  }
  return acc;
}

function rootJsxFor(node: NodeType, masterMap: Record<string, string>): string {
  if (node.kind === 'SymbolInstance') return emitSymbolInstanceJsx(node, masterMap, 'classes');
  if (node.kind === 'Group' || node.kind === 'Frame') {
    const children = node.children.map(c => rootJsxFor(c, masterMap)).filter(Boolean).join('\n      ');
    return `<div className={classes.g_${node.id}}>\n      ${children}\n    </div>`;
  }
  return emitNodeJsx(node, 'classes');
}

function rootCssFor(node: NodeType, lines: string[]): void {
  if (!node.visible) return;
  if (node.kind === 'SymbolInstance') {
    lines.push(`.si_${node.id} {\n  ${emitLayoutRules(node.frame).join(';\n  ')};\n}`);
    return;
  }
  if (node.kind === 'Group' || node.kind === 'Frame') {
    const rules = [...emitLayoutRules(node.frame), ...emitStyleRules(node.style)];
    lines.push(`.g_${node.id} {\n  ${rules.join(';\n  ')};\n}`);
    for (const c of node.children) rootCssFor(c, lines);
    return;
  }
  // Plain leaf nodes handled inside symbol emitter when they appear as masters' children;
  // for root-level leaves we reuse the same emitter logic via a small inline branch:
  const layout = emitLayoutRules(node.frame);
  if (node.kind === 'Text') {
    lines.push(`.t_${node.id} {\n  ${[
      ...layout,
      `color: ${node.color}`,
      `font-family: "${node.fontFamily}"`,
      `font-size: ${node.fontSize}px`,
      `font-weight: ${node.fontWeight}`,
      `text-align: ${node.align}`,
    ].join(';\n  ')};\n}`);
  } else if (node.kind === 'Image') {
    lines.push(`.i_${node.id} {\n  ${layout.join(';\n  ')};\n  object-fit: cover;\n}`);
  } else if (node.kind === 'Shape') {
    lines.push(`.s_${node.id} {\n  ${[...layout, ...emitStyleRules(node.style)].join(';\n  ')};\n}`);
  }
}

function tokensCssFor(doc: Document): string {
  const lines: string[] = [':root {'];
  for (const v of Object.values(doc.colorVariables)) {
    lines.push(`  ${toCssVarName(v.name)}: ${v.color};`);
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

export function generate(doc: Document): GenerateResult {
  const files: Record<string, string> = {};
  const ovMap = overridesByMaster(doc.root, doc.symbols);

  const masterMap: Record<string, string> = {};
  for (const [mid, master] of Object.entries(doc.symbols)) {
    const props = propsForOverrides(ovMap[mid] ?? []);
    const out = emitSymbolMaster(master as SymbolMaster, props);
    masterMap[mid] = out.componentName;
    files[out.tsxPath] = out.tsx;
    files[out.cssPath] = out.css;
  }

  // Asset imports for Image nodes
  const assetImports = Object.keys(doc.assets)
    .map(a => `import asset_${a} from './assets/${a}.png';`)
    .join('\n');

  const rootCss: string[] = [];
  rootCssFor(doc.root, rootCss);
  const rootBody = rootJsxFor(doc.root, masterMap);
  files['Frame.tsx'] = `import React from 'react';
import classes from './Frame.module.css';
${assetImports}
${Object.values(masterMap).map(c => `import { ${c} } from './${c}.js';`).join('\n')}

export function Frame() {
  return (
    ${rootBody}
  );
}
`;
  files['Frame.module.css'] = rootCss.join('\n\n') + '\n';
  files['tokens.css'] = tokensCssFor(doc);
  return { files };
}
```

- [ ] **步骤 5：运行测试，预期通过**

```bash
npx vitest run src/generator/__tests__/index.test.ts
```

预期：1 个通过（含 3 条断言）。

- [ ] **步骤 6：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/generator/ skills/sketch-to-component/scripts/tests/fixtures/tiny-ir.json
git commit -m "feat(sketch-to-component): top-level generator assembling Frame + Symbols + tokens"
```

---

## 任务 14：Asset writer

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/assets/write-images.ts`
- 创建：`skills/sketch-to-component/scripts/src/assets/__tests__/write-images.test.ts`

- [ ] **步骤 1：编写失败测试**

```ts
// src/assets/__tests__/write-images.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeImages } from '../write-images.js';

describe('writeImages', () => {
  it('writes each base64 asset as a png', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sk-'));
    try {
      // 1x1 transparent PNG
      const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=';
      writeImages({ a: { id: 'a', format: 'png', base64: png1x1 } }, dir);
      const data = readFileSync(join(dir, 'a.png'));
      expect(data.length).toBeGreaterThan(50);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/assets/__tests__/write-images.test.ts
```

预期：因缺少模块而失败。

- [ ] **步骤 3：实现 asset writer**

```ts
// src/assets/write-images.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Document } from '../ir/schema.js';

export function writeImages(assets: Document['assets'], outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  for (const [id, asset] of Object.entries(assets)) {
    const buf = Buffer.from(asset.base64, 'base64');
    writeFileSync(join(outDir, `${id}.png`), buf);
  }
}
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/assets/__tests__/write-images.test.ts
```

预期：1 个通过。

- [ ] **步骤 5：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/assets/
git commit -m "feat(sketch-to-component): write base64 image assets to disk"
```

---

## 任务 15：MCP extractor 客户端

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/extractor/client.ts`
- 创建：`skills/sketch-to-component/scripts/src/extractor/__tests__/client.test.ts`

- [ ] **步骤 1：编写失败测试（mock fetch）**

```ts
// src/extractor/__tests__/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runCode } from '../client.js';

describe('runCode', () => {
  it('POSTs to /mcp and returns parsed text content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: { content: [{ type: 'text', text: "'{\"hello\":\"world\"}'" }], isError: false },
      }),
    });
    const result = await runCode({ url: 'http://x/mcp', script: 'console.log(1)', title: 't', fetchImpl: fetchMock as any });
    expect(result).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('run_code');
    expect(body.params.arguments.script).toBe('console.log(1)');
  });
  it('throws when the server reports isError', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'boom' }], isError: true } }),
    });
    await expect(runCode({ url: 'http://x/mcp', script: '', title: 't', fetchImpl: fetchMock as any }))
      .rejects.toThrow(/boom/);
  });
});
```

- [ ] **步骤 2：运行测试，预期失败**

```bash
npx vitest run src/extractor/__tests__/client.test.ts
```

预期：因缺少模块而失败。

- [ ] **步骤 3：实现 client**

```ts
// src/extractor/client.ts
export interface RunCodeOptions {
  url: string;
  script: string;
  title: string;
  fetchImpl?: typeof fetch;
}

interface McpResponse {
  result?: { content: Array<{ type: string; text: string }>; isError: boolean };
  error?: { message: string };
}

export async function runCode(opts: RunCodeOptions): Promise<unknown> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(opts.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'run_code', arguments: { title: opts.title, script: opts.script } },
    }),
  });
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
  const body = (await res.json()) as McpResponse;
  if (body.error) throw new Error(body.error.message);
  if (!body.result) throw new Error('no result');
  const text = body.result.content[0]?.text ?? '';
  if (body.result.isError) throw new Error(text);
  // SketchMCP wraps console.log output in single quotes; strip and parse JSON.
  const stripped = text.replace(/^'/, '').replace(/'$/, '');
  return JSON.parse(stripped);
}
```

- [ ] **步骤 4：运行测试，预期通过**

```bash
npx vitest run src/extractor/__tests__/client.test.ts
```

预期：2 个通过。

- [ ] **步骤 5：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/extractor/
git commit -m "feat(sketch-to-component): MCP run_code HTTP client with JSON unwrap"
```

---

## 任务 16：Extractor 脚本（在 Sketch 内运行）

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/extractor/extract.js`

- [ ] **步骤 1：编写 extractor JS 脚本体**

本脚本作为字符串嵌入并通过 `runCode` POST 出去。只能使用 `sketch` 模块（无 Node API）。它遍历选中图层、构建 IR，并对每个 Image 做 base64 导出。**本步骤不做单测** —— 只能针对真实 Sketch 做端到端演练。集成验证在任务 20 进行。

```js
// src/extractor/extract.js
// Sent verbatim as the `script` argument to MCP run_code.
// Output: console.log(JSON.stringify({ root, symbols, assets, colorVariables }))
// Then return null. (Single string output via console; in-memory image bytes go through
// a per-image second call — but for this MVP we use base64 read from imageLayer.image.base64,
// which avoids needing the `return … .toNSData()` channel.)
export const EXTRACTOR_JS = `
const sketch = require('sketch');
const doc = sketch.getSelectedDocument();
const sel = doc.selectedLayers.layers;
if (!sel.length) { console.log(JSON.stringify({error:'no selection'})); }
else {
  const root = sel[0];
  const symbols = {};
  const assets = {};
  const colorVariables = {};

  function colorOf(maybeColor) {
    if (!maybeColor) return null;
    if (typeof maybeColor === 'string') return maybeColor.length === 9 ? maybeColor.toUpperCase() : maybeColor;
    return null;
  }
  function recordSwatch(swatch, color) {
    if (!swatch || !swatch.name) return undefined;
    if (!colorVariables[swatch.name]) {
      colorVariables[swatch.name] = {
        name: swatch.name,
        color: color || '#00000000',
      };
    }
    return swatch.name;
  }
  function styleOf(layer) {
    const st = layer.style || {};
    const fills = (st.fills || []).filter(f => f.enabled !== false).map(f => ({
      kind: 'solid',
      color: colorOf(f.color) || '#00000000',
      opacity: 1,
      swatchName: recordSwatch(f.swatch, colorOf(f.color)),
    }));
    const borders = (st.borders || []).filter(b => b.enabled !== false).map(b => ({
      color: colorOf(b.color) || '#00000000',
      width: b.thickness || 1,
      position: (b.position || 'inside'),
      swatchName: recordSwatch(b.swatch, colorOf(b.color)),
    }));
    const shadows = ((st.shadows || []).concat(st.innerShadows || [])).filter(s => s.enabled !== false).map(s => ({
      kind: s.isInnerShadow ? 'inner' : 'outer',
      color: colorOf(s.color) || '#00000000',
      x: s.x || 0, y: s.y || 0, blur: s.blur || 0, spread: s.spread || 0,
      swatchName: recordSwatch(s.swatch, colorOf(s.color)),
    }));
    const c = (st.corners && st.corners.radii) || [0,0,0,0];
    return {
      fills, borders, shadows,
      corners: { topLeft: c[0]||0, topRight: c[1]||0, bottomRight: c[2]||0, bottomLeft: c[3]||0 },
      opacity: (layer.style && layer.style.opacity) != null ? layer.style.opacity : 1,
      sharedStyleName: layer.sharedStyle && layer.sharedStyle.name,
    };
  }
  function frameOf(layer) {
    return { x: layer.frame.x || 0, y: layer.frame.y || 0,
             width: layer.frame.width || 0, height: layer.frame.height || 0 };
  }
  function overrideOf(o) {
    return { path: o.path || '', property: o.property,
             value: o.value, defaultValue: o.defaultValue,
             swatchName: o.swatchValue && o.swatchValue.name };
  }
  function walk(layer) {
    if (!layer) return null;
    const id = layer.id;
    const base = { id, name: layer.name || '', frame: frameOf(layer), visible: !layer.hidden };
    const t = layer.type;
    if (t === 'Text') {
      return Object.assign(base, {
        kind: 'Text',
        content: layer.text || '',
        fontFamily: (layer.style && layer.style.fontFamily) || 'system-ui',
        fontSize: (layer.style && layer.style.fontSize) || 14,
        fontWeight: (layer.style && layer.style.fontWeight) || 400,
        color: colorOf(layer.style && layer.style.textColor) || '#000000FF',
        align: ((layer.style && layer.style.alignment) || 'left'),
        decoration: 'none',
      });
    }
    if (t === 'Image') {
      const assetId = 'img_' + id.replace(/[^A-Za-z0-9]/g,'').slice(0,12);
      try { if (layer.image && layer.image.base64) assets[assetId] = { id: assetId, format: 'png', base64: layer.image.base64 }; } catch (e) {}
      return Object.assign(base, { kind: 'Image', assetId });
    }
    if (t === 'SymbolInstance') {
      const masterId = layer.master && layer.master.id;
      if (masterId && !symbols[masterId]) {
        const m = layer.master;
        symbols[masterId] = {
          id: masterId, name: m.name || '',
          frame: { x: 0, y: 0, width: m.frame.width || 0, height: m.frame.height || 0 },
          style: styleOf(m),
          children: (m.layers || []).map(walk).filter(Boolean),
        };
      }
      return Object.assign(base, {
        kind: 'SymbolInstance', masterId: masterId || 'unknown',
        overrides: (layer.overrides || []).map(overrideOf),
      });
    }
    if (t === 'Group' || t === 'Artboard' || layer.isFrame || layer.isGraphicFrame) {
      return Object.assign(base, {
        kind: (t === 'Group' && !layer.isFrame) ? 'Group' : 'Frame',
        style: styleOf(layer),
        children: (layer.layers || []).map(walk).filter(Boolean),
      });
    }
    if (t === 'ShapePath' || t === 'Shape') {
      return Object.assign(base, { kind: 'Shape', style: styleOf(layer) });
    }
    return null;
  }

  const irRoot = walk(root);
  console.log(JSON.stringify({ root: irRoot, symbols, assets, colorVariables }));
}
`;
```

- [ ] **步骤 2：语法检查**

```bash
cd skills/sketch-to-component/scripts && npx tsc --noEmit
```

预期：无错误。

- [ ] **步骤 3：提交**

```bash
git add skills/sketch-to-component/scripts/src/extractor/extract.js
git commit -m "feat(sketch-to-component): in-Sketch extractor producing IR JSON"
```

---

## 任务 17：Config 加载器

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/config/load.ts`
- 创建：`skills/sketch-to-component/scripts/src/config/__tests__/load.test.ts`
- 创建：`skills/sketch-to-component/scripts/tests/fixtures/tiny-config.json`

- [ ] **步骤 1：编写 fixture config**

```json
{
  "mcpUrl": "http://localhost:31126/mcp",
  "irDir": "design/sketch-ir",
  "outDir": "src/generated/sketch",
  "frames": [
    { "name": "home", "ir": "home.json" }
  ]
}
```

- [ ] **步骤 2：编写失败测试**

```ts
// src/config/__tests__/load.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, resolveFrame } from '../load.js';

describe('config loader', () => {
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 's2c-cfg-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('reads config and resolves dirs relative to the config file', () => {
    const cfgPath = join(dir, 'sketch-to-component.config.json');
    writeFileSync(cfgPath, JSON.stringify({
      mcpUrl: 'http://h/mcp', irDir: 'd/ir', outDir: 'd/out',
      frames: [{ name: 'home', ir: 'home.json' }],
    }));
    const cfg = loadConfig(cfgPath);
    expect(cfg.mcpUrl).toBe('http://h/mcp');
    expect(cfg.irDir).toBe(join(dir, 'd/ir'));
    expect(cfg.outDir).toBe(join(dir, 'd/out'));
  });

  it('SKETCH_MCP_URL env overrides config mcpUrl', () => {
    const cfgPath = join(dir, 'c.json');
    writeFileSync(cfgPath, JSON.stringify({
      mcpUrl: 'http://from-file/mcp', irDir: '.', outDir: '.', frames: [],
    }));
    const prev = process.env.SKETCH_MCP_URL;
    process.env.SKETCH_MCP_URL = 'http://from-env/mcp';
    try {
      expect(loadConfig(cfgPath).mcpUrl).toBe('http://from-env/mcp');
    } finally {
      if (prev === undefined) delete process.env.SKETCH_MCP_URL;
      else process.env.SKETCH_MCP_URL = prev;
    }
  });

  it('resolveFrame finds a frame by name', () => {
    const cfgPath = join(dir, 'c.json');
    writeFileSync(cfgPath, JSON.stringify({
      mcpUrl: 'x', irDir: 'ir', outDir: 'out',
      frames: [{ name: 'home', ir: 'home.json' }],
    }));
    const cfg = loadConfig(cfgPath);
    const f = resolveFrame(cfg, 'home');
    expect(f.irPath).toBe(join(dir, 'ir/home.json'));
    expect(f.outPath).toBe(join(dir, 'out/home'));
  });

  it('resolveFrame throws on unknown name with helpful message', () => {
    const cfgPath = join(dir, 'c.json');
    writeFileSync(cfgPath, JSON.stringify({
      mcpUrl: 'x', irDir: 'ir', outDir: 'out',
      frames: [{ name: 'home', ir: 'home.json' }],
    }));
    const cfg = loadConfig(cfgPath);
    expect(() => resolveFrame(cfg, 'nope')).toThrow(/nope.*home/);
  });
});
```

- [ ] **步骤 3：运行测试，预期失败**

```bash
cd skills/sketch-to-component/scripts && npx vitest run src/config/__tests__/load.test.ts
```

预期：因缺少模块而失败。

- [ ] **步骤 4：实现 loader**

```ts
// src/config/load.ts
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

const FrameSchema = z.object({
  name: z.string().min(1),
  ir: z.string().min(1),
});

const ConfigFileSchema = z.object({
  mcpUrl: z.string().url(),
  irDir: z.string().min(1),
  outDir: z.string().min(1),
  frames: z.array(FrameSchema),
});

export interface ResolvedConfig {
  mcpUrl: string;
  irDir: string;
  outDir: string;
  frames: Array<{ name: string; ir: string }>;
}

export interface ResolvedFrame {
  name: string;
  irPath: string;
  outPath: string;
}

export function loadConfig(configPath: string): ResolvedConfig {
  const abs = resolve(configPath);
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  const parsed = ConfigFileSchema.parse(raw);
  const base = dirname(abs);
  const envUrl = process.env.SKETCH_MCP_URL;
  return {
    mcpUrl: envUrl && envUrl.length ? envUrl : parsed.mcpUrl,
    irDir: isAbsolute(parsed.irDir) ? parsed.irDir : join(base, parsed.irDir),
    outDir: isAbsolute(parsed.outDir) ? parsed.outDir : join(base, parsed.outDir),
    frames: parsed.frames,
  };
}

export function resolveFrame(cfg: ResolvedConfig, name: string): ResolvedFrame {
  const frame = cfg.frames.find(f => f.name === name);
  if (!frame) {
    const known = cfg.frames.map(f => f.name).join(', ') || '(none)';
    throw new Error(`Frame "${name}" not found in config. Known frames: ${known}`);
  }
  return {
    name: frame.name,
    irPath: join(cfg.irDir, frame.ir),
    outPath: join(cfg.outDir, frame.name),
  };
}
```

- [ ] **步骤 5：运行测试，预期通过**

```bash
npx vitest run src/config/__tests__/load.test.ts
```

预期：4 个通过。

- [ ] **步骤 6：提交**

```bash
git add -A skills/sketch-to-component/scripts/src/config skills/sketch-to-component/scripts/tests/fixtures/tiny-config.json
git commit -m "feat(sketch-to-component): config loader (file + SKETCH_MCP_URL env)"
```

---

## 任务 18：CLI 入口（sync / build / extract / generate）

**文件：**
- 创建：`skills/sketch-to-component/scripts/src/cli.ts`
- 修改：`skills/sketch-to-component/scripts/package.json`

- [ ] **步骤 1：实现 CLI**

```ts
// src/cli.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { DocumentSchema } from './ir/schema.js';
import { generate } from './generator/index.js';
import { writeImages } from './assets/write-images.js';
import { runCode } from './extractor/client.js';
import { EXTRACTOR_JS } from './extractor/extract.js';
import { loadConfig, resolveFrame } from './config/load.js';

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function extractToFile(irOutPath: string, url: string): Promise<void> {
  const ir = await runCode({ url, script: EXTRACTOR_JS, title: 'extract-selected-frame' });
  if ((ir as { error?: string }).error) throw new Error((ir as { error: string }).error);
  const validated = DocumentSchema.parse(ir);
  mkdirSync(dirname(irOutPath), { recursive: true });
  writeFileSync(irOutPath, JSON.stringify(validated, null, 2));
  console.log(`IR written: ${irOutPath}`);
}

function generateFromIr(irPath: string, outDir: string): void {
  const ir = DocumentSchema.parse(JSON.parse(readFileSync(irPath, 'utf8')));
  const { files } = generate(ir);
  mkdirSync(outDir, { recursive: true });
  for (const [p, content] of Object.entries(files)) {
    writeFileSync(join(outDir, p), content);
  }
  writeImages(ir.assets, join(outDir, 'assets'));
  console.log(`Wrote ${Object.keys(files).length} files + ${Object.keys(ir.assets).length} assets → ${outDir}`);
}

const USAGE = `Usage:
  cli sync     --name <frame> --config <path>     # designer: extract → write IR → generate
  cli build    --name <frame> --config <path>     # developer: read committed IR → generate
  cli extract  --out <path> [--url <mcpUrl>]      # low-level: extract only
  cli generate --ir <path> --out <dir>            # low-level: generate only`;

const cmd = process.argv[2];
(async () => {
  if (cmd === 'sync') {
    const cfg = loadConfig(arg('--config', './sketch-to-component.config.json')!);
    const frame = resolveFrame(cfg, arg('--name')!);
    await extractToFile(frame.irPath, cfg.mcpUrl);
    generateFromIr(frame.irPath, frame.outPath);
  } else if (cmd === 'build') {
    const cfg = loadConfig(arg('--config', './sketch-to-component.config.json')!);
    const frame = resolveFrame(cfg, arg('--name')!);
    generateFromIr(frame.irPath, frame.outPath);
  } else if (cmd === 'extract') {
    await extractToFile(resolve(arg('--out', './ir.json')!), arg('--url', 'http://localhost:31126/mcp')!);
  } else if (cmd === 'generate') {
    generateFromIr(resolve(arg('--ir', './ir.json')!), resolve(arg('--out', './out')!));
  } else {
    console.error(USAGE);
    process.exit(2);
  }
})().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **步骤 2：更新 package.json scripts**

将 `scripts` 节替换为：

```json
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "sync": "tsx src/cli.ts sync",
    "build": "tsx src/cli.ts build",
    "extract": "tsx src/cli.ts extract",
    "generate": "tsx src/cli.ts generate"
  },
```

- [ ] **步骤 3：健全性类型检查**

```bash
cd skills/sketch-to-component/scripts && npx tsc --noEmit
```

预期：无错误。

- [ ] **步骤 4：用 tiny fixture 冒烟测试 `generate` 路径**

```bash
rm -rf /tmp/s2c-out && npm run generate -- --ir tests/fixtures/tiny-ir.json --out /tmp/s2c-out && ls /tmp/s2c-out
```

预期输出（按字母序）：
```
Frame.module.css  Frame.tsx  MyButton.module.css  MyButton.tsx  assets  tokens.css
```

- [ ] **步骤 5：用临时 config 冒烟测试 `build` 路径**

```bash
mkdir -p /tmp/s2c-proj/design/ir && cp tests/fixtures/tiny-ir.json /tmp/s2c-proj/design/ir/home.json
cat > /tmp/s2c-proj/sketch-to-component.config.json <<'JSON'
{
  "mcpUrl": "http://localhost:31126/mcp",
  "irDir": "design/ir",
  "outDir": "out",
  "frames": [{ "name": "home", "ir": "home.json" }]
}
JSON
npm run build -- --name home --config /tmp/s2c-proj/sketch-to-component.config.json
ls /tmp/s2c-proj/out/home
```

预期：与步骤 4 列出的六项相同。

- [ ] **步骤 6：提交**

```bash
git add skills/sketch-to-component/scripts/src/cli.ts skills/sketch-to-component/scripts/package.json
git commit -m "feat(sketch-to-component): CLI with sync/build/extract/generate + config-driven flows"
```

---

## 任务 19：完整 Vitest 运行

**文件：**
- （无 —— 仅执行）

- [ ] **步骤 1：运行完整测试套件**

```bash
cd skills/sketch-to-component/scripts && npm test
```

预期：全部套件通过（schema 8、naming 5、css 6、overrides 5、tsx 6、symbols 1、index 1、write-images 1、extractor client 2、config 4，共 39 通过）。

- [ ] **步骤 2：若有失败则修复并重跑，然后提交**

```bash
git add -A skills/sketch-to-component/scripts
git commit -m "fix(sketch-to-component): align suites for full green run"
```

（若套件本已全绿则跳过此次提交。）

---

## 任务 20：针对真实 Sketch 文档的集成 POC

**文件：**
- 创建：`skills/sketch-to-component/scripts/tests/fixtures/frame-ir.json`（由本次运行写出）

**前置条件：**
- Sketch.app 已打开 `/Users/blade/Desktop/figma-mcp测试.sketch`
- 已选中 Frame（使用 Page 1 的 `2.0-1备份 21` Frame）
- MCP 对 `initialize` 探针有响应（见 SKILL.md）

- [ ] **步骤 1：提取**

```bash
cd skills/sketch-to-component/scripts && npm run extract -- --out tests/fixtures/frame-ir.json
```

预期输出：`IR written: …/tests/fixtures/frame-ir.json`

- [ ] **步骤 2：生成**

```bash
rm -rf /tmp/s2c-real && npm run generate -- --ir tests/fixtures/frame-ir.json --out /tmp/s2c-real
ls /tmp/s2c-real
```

预期：至少包含 `Frame.tsx`、`Frame.module.css`、`tokens.css`、`assets/`，以及每个唯一 Symbol Master 各一对 `.tsx`/`.module.css`（按 fixture 清单应有 9 对）。

- [ ] **步骤 3：确认无解析错误**

```bash
node --check /tmp/s2c-real/Frame.tsx 2>&1 || true
```

注意：`node --check` 不理解 TSX。请改用 TypeScript：

```bash
cd /tmp && cat > tsconfig.s2c.json <<'JSON'
{ "compilerOptions": { "jsx": "preserve", "target": "ES2022", "module": "ESNext",
  "moduleResolution": "Bundler", "esModuleInterop": true, "skipLibCheck": true,
  "noEmit": true, "allowImportingTsExtensions": false, "isolatedModules": true,
  "types": [] }, "include": ["s2c-real/**/*.tsx"] }
JSON
npx --yes typescript@5.8.3 -p tsconfig.s2c.json
```

预期：零错误（或仅有 `Cannot find module 'react'` —— 可接受，因未在 `/tmp` 安装 react；解析器形态才是相关信号）。

- [ ] **步骤 4：目视检查一个 Symbol 输出**

```bash
ls /tmp/s2c-real/*.tsx | head -3 | xargs head -40
```

预期：每个文件以 `import React from 'react'` 与 `import classes from './X.module.css'` 开头，然后是 `export interface XProps`，再是 `export function X(...)`。

- [ ] **步骤 5：提交 fixture 供后续回归测试**

```bash
cd /Users/blade/IdeaProjects/skill-collections
git add skills/sketch-to-component/scripts/tests/fixtures/frame-ir.json
git commit -m "test(sketch-to-component): commit real-document IR fixture from Page 1 Frame"
```

---

## 任务 21：文档 —— 工作流与契约

**文件：**
- 创建：`skills/sketch-to-component/workflows/designer-publish-ir.md`
- 创建：`skills/sketch-to-component/workflows/developer-build.md`
- 创建：`skills/sketch-to-component/workflows/verify-output.md`
- 创建：`skills/sketch-to-component/docs/ir-schema.md`
- 创建：`skills/sketch-to-component/docs/override-mapping.md`
- 创建：`skills/sketch-to-component/docs/deployment.md`
- 创建：`skills/sketch-to-component/protocols/mcp-extractor-contract.md`
- 创建：`skills/sketch-to-component/protocols/config-schema.md`

- [ ] **步骤 1：编写 `workflows/designer-publish-ir.md`**

```markdown
# 设计师：发布 IR

读者：已运行 Sketch.app 与 SketchMCP 的人员。

## 一键 sync（推荐）

1. 在 Sketch.app 中打开目标文档。
2. 选中要发布的 Frame。
3. 在消费方项目根目录：

   ```bash
   cd path/to/skills/sketch-to-component/scripts
   npm run sync -- --name home --config /path/to/your-project/sketch-to-component.config.json
   ```

   这会提取选中 Frame，将 IR 写入 `<irDir>/home.json`，并在 `<outDir>/home/` 生成 React 组件。

4. 同时提交 IR 与生成代码：

   ```bash
   cd /path/to/your-project
   git add design/sketch-ir/home.json src/generated/sketch/home
   git commit -m "design(home): publish IR + regenerate components"
   ```

## 排错

- `no selection` —— 在 Sketch 中点击 Frame 后重跑。
- `MCP HTTP 404` / connection refused —— 按 SKILL.md 前置条件验证 MCP 探针。
- `frames not found in config` —— 在 `sketch-to-component.config.json` 中列出预期 frames。
```

- [ ] **步骤 2：编写 `workflows/developer-build.md`**

```markdown
# 开发者：从已提交 IR 构建

读者：任意前端开发者。**无需安装 Sketch。**

1. 从仓库拉取最新 IR（`git pull`）。
2. 在 scripts 目录：

   ```bash
   cd path/to/skills/sketch-to-component/scripts
   npm install                         # 仅首次
   npm run build -- --name home --config /path/to/your-project/sketch-to-component.config.json
   ```

3. 生成器读取 `<irDir>/home.json`，将重新生成的代码写入 `<outDir>/home/`。若仓库把生成代码视为构建产物（即 `outDir` 被 gitignore），把 `npm run build -- --name <each frame>` 接入消费方项目的 build 步骤。

## 当 IR 已过时

若界面看起来不对：
1. 检查 `design/sketch-ir/` 中的 IR JSON —— 人类可读。
2. 若 IR 过时，请设计师重新运行 `npm run sync` 并提交更新后的 IR。
```

- [ ] **步骤 3：编写 `workflows/verify-output.md`**

```markdown
# 校验生成输出

机械检查（必须通过）：

```bash
# 对 stub 项目中的生成 TSX 做类型检查
npx --yes typescript@5.8.3 --noEmit --jsx preserve out/*.tsx
```

视觉检查（手动）：
1. 将 `out/` 复制到 React 项目（Vite 脚手架可用：`npm create vite@latest`）。
2. 在入口添加 `import './tokens.css';`，在 `App.tsx` 中 `import { Frame } from './Frame'`。
3. `npm run dev`，在浏览器打开，与 Sketch Frame 对比。

常见可预期差异：
- 若浏览器所在 OS 未安装 Sketch 字体，字体渲染可能不同。
- 绝对定位意味着不支持响应式缩放（范围外）。
- 尚未输出渐变填充（见 SKILL.md 的限制）。
```

- [ ] **步骤 4：编写 `docs/ir-schema.md`**

```markdown
# IR Schema 参考

权威来源：`scripts/src/ir/schema.ts`。

## 顶层

```ts
Document = { root: GroupNode; symbols: Record<id, SymbolMaster>;
             assets: Record<id, Asset>; colorVariables: Record<id, ColorVariable> }
```

## 节点种类

- `Text` — `content`, `fontFamily`, `fontSize`, `fontWeight`, `color`, `align`, `decoration`
- `Image` — `assetId` 引用 `Document.assets`
- `Shape` — 带 `style` 的叶子 shape
- `Group` / `Frame` — 容器，含 `children: NodeType[]` 与 `style`
- `SymbolInstance` — `masterId` 引用 `Document.symbols` + `overrides`

所有节点共有 `id`, `name`, `frame`, `visible`。

## 颜色

8 位 hex `#RRGGBBAA`。若来自 Color Variable，原始 swatch 名保留在 fill/border/shadow 的 `swatchName` 上，并在 `Document.colorVariables` 增加条目，供 CSS 发射器输出 `var(--swatch-…)`。

## Override

每个 override 为 `{ path, property, value, defaultValue, swatchName? }`。支持的属性集见 `docs/override-mapping.md`。
```

- [ ] **步骤 5：编写 `docs/override-mapping.md`**

```markdown
# Override → React Prop 映射

| Sketch override 属性 | React prop 类型 | 说明 |
|---|---|---|
| `stringValue` | `text_<slug>?: string` | 嵌套图层的文本内容 |
| `textColor` | `textColor_<slug>?: string` | 8 位 hex |
| `textSize` | `textSize_<slug>?: number` | px |
| `textWeight` | `textWeight_<slug>?: number` | 100–900 |
| `isVisible` | `visible_<slug>?: boolean` | |
| `color:fill-N` | `fillN_<slug>?: string` | 每个 fill 索引一条 |
| `color:border-N` | `borderN_<slug>?: string` | |
| `color:shadow-N` / `color:innershadow-N` | `shadowN_<slug>?: string` | |
| `fillColor` | `tint_<slug>?: string` | Group 着色 |
| `symbolID` | （尚未支持 —— 内联） | 嵌套 symbol 替换；延后 |
| `layerStyle` | （尚未支持 —— 内联） | 共享样式替换；延后 |
| `horizontalSizing` / `verticalSizing` | （不输出） | fixture 无 Stack 布局；延后 |

`<slug>` 是 override `path` 字段的末段。默认值来自 `defaultValue`。调用点处，生成器只输出 `value !== defaultValue` 的 props。
```

- [ ] **步骤 6：编写 `docs/deployment.md`**

```markdown
# 部署选项

IR JSON 是契约。选择其生产方式。

## 选项 A —— 设计师发布 IR（推荐）

设计师在 Mac 上运行 `npm run sync`（本地 Sketch + SketchMCP），将 IR JSON 提交到仓库。前端开发者只运行 `npm run build` —— 需要 Node，不需要 Sketch。

优点：可通过 PR review、可离线、无需运维在线服务、IR 是不可变历史。
缺点：设计变更后设计师需记得重新 sync。

## 选项 B —— 共享 MCP 服务（进阶）

指定一台 Mac 运行 Sketch + SketchMCP，端口经私有网络暴露（Tailscale、WireGuard、mTLS 前置反向代理）。设计师将 `SKETCH_MCP_URL` 指向它。

**安全警告：** SketchMCP 的 `run_code` 工具在宿主 Sketch 进程内执行任意 ES2020。能访问该 URL 的任何人可读或修改该机器上任何已打开的 Sketch 文档。不要暴露到公网。使用 Tailscale ACL 或 mTLS 前置代理。

优点：「实时」文件单一事实源。
缺点：宿主机器须保持 Sketch 运行且打开正确文件；MCP 本身无认证。

## 选项 C —— 无头 `.sketch` 解析（未实现）

未来提取器可直接解析 `.sketch` zip 并产出 IR，无需 Sketch.app。可完全消除 macOS 依赖，但会丢失运行时解析数据（Override 默认值、字体度量、栅格化图片）。本计划范围外。
```

- [ ] **步骤 7：编写 `protocols/mcp-extractor-contract.md`**

```markdown
# MCP Extractor 契约

提取器脚本体位于 `scripts/src/extractor/extract.js`，为模板字符串 `EXTRACTOR_JS`。原样发给 SketchMCP 的 `run_code` 工具。

## 输入

- `sketch.getSelectedDocument()` 须返回 document。
- `document.selectedLayers.layers[0]` 为提取根节点。

## 输出

恰好一次 `console.log(JSON.stringify(Document))`。

若无选中：`console.log(JSON.stringify({error:'no selection'}))`。

## 线缆格式

SketchMCP 将 `console.log` 输出包在 `result.content[0].text` 的单引号内。客户端（`src/extractor/client.ts`）在 `JSON.parse` 前剥掉外层引号。

## 为何用 JS 而非 TS

`run_code` 在 Sketch 内运行 ES2020 —— 无 Node、无 TS、无 import。保持零依赖。
```

- [ ] **步骤 8：编写 `protocols/config-schema.md`**

```markdown
# 配置 Schema

`sketch-to-component.config.json` 位于消费方仓库根目录。由 `scripts/src/config/load.ts`（Zod）校验。

| 字段 | 类型 | 说明 |
|---|---|---|
| `mcpUrl` | `string` (URL) | `sync`/`extract` 的默认端点。每次调用可用 `SKETCH_MCP_URL` 环境变量覆盖。 |
| `irDir` | `string` (path) | 已提交 IR JSON 所在目录。相对于配置文件目录解析。 |
| `outDir` | `string` (path) | 生成代码写入位置。每个 Frame 在 `<outDir>/<frame.name>/`。 |
| `frames` | `Array<{ name, ir }>` | Frame 清单。`name` 为 CLI 键（`--name <name>`）；`ir` 为 `irDir` 内文件名。 |

示例：

```json
{
  "mcpUrl": "http://localhost:31126/mcp",
  "irDir": "design/sketch-ir",
  "outDir": "src/generated/sketch",
  "frames": [
    { "name": "home", "ir": "home.json" },
    { "name": "settings", "ir": "settings.json" }
  ]
}
```

新增 Frame 需三步：(1) 设计师在 `frames` 增加条目；(2) `npm run sync --name <name>`；(3) 提交新 IR 与生成文件。
```

- [ ] **步骤 9：提交**

```bash
git add skills/sketch-to-component/workflows skills/sketch-to-component/docs skills/sketch-to-component/protocols
git commit -m "docs(sketch-to-component): designer/developer workflows, IR/override/deployment/config docs"
```

---

## 自检（执行者：宣布完成前请核对）

1. **规格覆盖** — fixture 直方图中的每个 Override 属性要么列在 `docs/override-mapping.md` 的支持行，要么在延后行；IR schema 为 fixture 直方图中的每种类型提供节点（Artboard→Frame、SymbolInstance、Group、ShapePath→Shape、Text、Image、Shape）；「开发者机器无需 Sketch」由任务 17（config loader）+ 任务 18 `build` 命令 + `workflows/developer-build.md` 满足。
2. **占位符扫描** — 计划或生成代码中无 "TODO"、"TBD"、"Add appropriate…"。每步都有确切的代码/命令。
3. **类型一致性** — `OverrideRecord`/`PropSpec`/`SymbolFiles`/`Document`/`ResolvedConfig`/`ResolvedFrame` 在测试与实现中签名一致。`masterIdToComponent` 在 `emitSymbolInstanceJsx` 与 generator 的 `masterMap` 中命名一致。`ColorVariableSchema` 仅含 `{name, color}`；`cssVarName` 由 generator 通过 `toCssVarName(name)` 派生 —— extractor 与 generator 对此一致。
4. **标识符冲突** — `naming.toPascalIdentifier` 对非 ASCII 名称追加短 hash；两个 ASCII token 相同的不同 Symbol Master 因 hash 使用 `master.id` 作稳定盐而得到不同文件名。
5. **Config/环境优先级** — `loadConfig` 优先使用 `SKETCH_MCP_URL` 而非配置文件中的 `mcpUrl`。在任务 17 步骤 2 中测试。

若任一项不满足，就地修复并重跑对应任务的 Vitest 目标。

---

## 执行交接

计划已完成并保存于 `docs/superpowers/plans/2026-05-19-sketch-to-component.md`。两种执行方式：

**1. 子 agent 驱动（推荐）** — 每个任务派一个新的子 agent；任务间 review；迭代快。使用 `superpowers:subagent-driven-development`。

**2. 会话内联执行** — 在本会话中带检查点执行任务。使用 `superpowers:executing-plans`。

选择哪种方式？
