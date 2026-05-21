# Stage 2 蓝图 — Sketch Provider Raw Extractor

> 本文是 [`../../../docs/design-source-to-component-implementation-plan.md`](../../../docs/design-source-to-component-implementation-plan.md)
> 中本轮工作的详细蓝图。已通过 review(2026-05-21),9 点评审意见已并入(见第 13 节)。

---

## 1. 定位与范围

**本轮 = Sketch provider 的 raw extraction 探针。** 把本地 `.sketch` 文件提取成 d2c-core 的
`RawArtifact`,产出 `raw-dsl.json`。

**这不代表 Sketch 已占定完整 pipeline。** Sketch 的 raw extraction 先行,是因为 `.sketch` 是公开、
本地、可检视的格式,`extractRaw` 能离线开发与测试、无需服务端往返 —— 这是一次**离线先行的去风险
探针**。MasterGo 仍是原定的首个完整 D2C 垂直切片;normalize → preview → codegen 由哪个 provider
承载,待 raw extraction 验证后再定。

**做**:`.sketch` → `RawArtifact` → CLI 写 `output/ir/raw-dsl.json`。
**不做**:`normalize`(Stage 3)、SketchMCP、`SketchProvider implements Provider` 完整类、
资源 / 参考帧导出、preview、codegen。

## 2. 为什么 Sketch raw extraction 先行

- MasterGo 的 DSL 转换在**服务端**,raw DSL 结构不可见,只能带 token 走服务端取 —— 与本项目
  TDD / 离线优先 / fixture 即真相的方法论冲突。
- `.sketch` 是**公开格式**:本质是 ZIP,内含 `document.json` / `meta.json` / `pages/*.json` 等。
  可解压、可检视、完全离线。
- d2c-core(Stage 1)provider 中立,谁先做都零浪费。

## 3. `.sketch` 格式(实测 `d2c.sketch`)

ZIP 包,关键条目:

```
document.json      文档级:页面引用、共享样式、symbol 引用
meta.json          元数据:版本、页面 / 画板索引
user.json          视图状态(基本无关)
pages/<id>.json    每页:图层树、画板、文本、形状
images/  fonts/  previews/   二进制资源
```

实测 `/Users/blade/Desktop/d2c.sketch`(5.3 MB,内嵌字体 2.8 MB 占大头):2 个 page —— `控件`
(26 个 `symbolMaster`,组件库)、`页面 1`(画板 `2.0-1备份 21`,375×1173,屏幕设计)。屏幕画板用
9 个 `symbolInstance`,其 `symbolID` 母版在 `控件` 页 —— **symbol 跨页引用,必须整文档采集**。
画板命名与早先 MasterGo 参考设计一致:这就是同一个「财资小助手对话页」的 Sketch 形态。

## 4. 包改造

现有 `skills/sketch-to-component/scripts/` 是旧脚手架,需先清理:

- 删 `src/ir/`(旧 `Color`/`Rect` IR,已被 d2c-core canonical IR 取代)及其测试。
- 删该包独立 `package-lock.json`。
- `package.json` 重命名为 scoped 名 **`@skill-collections/sketch-to-component-scripts`**;
  依赖 `@skill-collections/d2c-core`(workspace `*`)+ `fflate`;修正 `scripts`。
- 根 `package.json`:`workspaces` 加具体路径 `skills/sketch-to-component/scripts`;新增脚本
  `test:sketch` = `npm test --workspace @skill-collections/sketch-to-component-scripts`。
- 保留 `tsconfig.json` / `vitest.config.ts`(与 d2c-core 对齐)。

## 5. 采集缝(为后续 MCP 留)

```
extractRaw  =  acquire(输入)  →  SketchRawModel  →  包成 RawArtifact
                   ↑                  ↑
             策略,可替换         稳定契约,normalize 只认它
```

`extract-raw.ts` 内按判别联合切策略,Stage 2 仅 `'file'` 一个变体:

```ts
type SketchExtractInput = { source: 'file'; filePath: string };
// 以后接 MCP:加 | { source: 'mcp'; ... } + 一个 acquire-from-mcp.ts,normalize / d2c-core 不动
```

## 6. 模块与文件

```
src/
  errors.ts             ExtractError + 6 个错误码
  sketch-raw-model.ts   SketchRawModel 类型 + zod schema
  open-sketch-file.ts   filePath -> SketchArchive(解压;readFile 可注入)
  acquire-from-file.ts  SketchArchive -> SketchRawModel
  extract-raw.ts        SketchExtractInput -> RawArtifact(编排 + 校验)
  index.ts              barrel
  cli.ts                `extract` 命令
  __tests__/            3 个测试 + 合成 fixtures
```

类型就近放,不设 `types.ts`(d2c-core 同惯例)。

## 7. 核心类型契约

```ts
// sketch-raw-model.ts —— payload 的形状,normalize 唯一认它
interface SketchPage { id: string; path: string; data: Record<string, unknown> }
interface SketchAssetEntry { path: string; kind: 'image'|'font'|'preview'|'other'; byteLength: number }
interface SketchRawModel {
  meta:     Record<string, unknown>;   // meta.json
  document: Record<string, unknown>;   // document.json
  pages:    SketchPage[];              // 整文档全部页;含 zip 路径,按 path 排序
  assets:   SketchAssetEntry[];        // 二进制条目清单(不含字节),按 path 排序
}
// SketchRawModelSchema:.strict();meta/document 非空对象;pages ≥1;内层一律 record(unknown)
//   —— Stage 1 "顶层严、内层宽" 克制原则,_class 模型留给 Stage 3
```

`pages` 用数组(含 `id` + zip `path`),不用裸 `Record` —— 保留原始路径与稳定顺序,利于
normalize / diff / 错误定位。

`extractRaw` 产出的 `RawArtifact`(d2c-core 类型):

```ts
{
  provider: 'sketch',
  ref: { filePath, fileName, documentId },   // documentId 取自 document.do_objectID
  payload: <SketchRawModel>,
  capturedAt: <ISO>,                         // deps.now 可注入,测试确定性
}
```

`ref.filePath` 是本机绝对路径(会随 `raw-dsl.json` 落地)——同时带 `fileName`(basename)与
`documentId`;**真实 `raw-dsl.json` 含绝对路径,不要随意提交**(见第 8 节脱敏)。

`ExtractError`(全 fatal,6 码):

| code | 触发 |
|---|---|
| `file-not-found` | `.sketch` 路径不存在(ENOENT) |
| `read-failed` | 其他读文件失败:权限不足、路径是目录等(EACCES / EISDIR …) |
| `not-a-sketch-zip` | 不是 ZIP(无 `PK` magic) |
| `corrupt-archive` | 是 ZIP 但解压失败 |
| `missing-entry` | 缺 `document.json` / `meta.json` / 任何 `pages/*`(消息指明哪个) |
| `bad-entry` | 必需 JSON 解析失败 / `document.do_objectID` 缺失 / `SketchRawModel` 不过 schema |

## 8. `extractRaw` 编排 + 确定性

1. `acquire(input)` → `SketchRawModel`(解压 + 拼装)。
2. `SketchRawModelSchema` 校验;失败 → `ExtractError('bad-entry')`。
3. `documentId = document.do_objectID`,**强制非空**;缺失 → `ExtractError('bad-entry')`。
4. 组装 `RawArtifact`,过 d2c-core `RawArtifactSchema` 自检(失败抛内部 `Error` —— 属 bug)。
5. 返回。`extractRaw` **不写文件**。

**确定性**:zip 条目遍历、`pages`、`assets` 一律**按 path 排序后输出**,保证 `raw-dsl.json` 稳定可 diff。

fixture / 脱敏:参考文件 `/Users/blade/Desktop/d2c.sketch` 保持私有、git-ignored;真实
`raw-dsl.json`(含绝对路径与设计内容)同样不入库;提交的回归 fixture 用脱敏、最小化版本。
Stage 2 单测一律用**手工构造的合成 fixture**。

## 9. CLI

`extract --file <path> --out <dir>` —— **两者必填**(npm workspace 脚本 cwd 在包目录,默认输出
易落错地方,故不设默认 `--out`)。真实命令:

```
npm run extract -- --file /Users/blade/Desktop/d2c.sketch --out output
```

写 `<out>/ir/raw-dsl.json`(`mkdir -p`)。打印 **best-effort 摘要,只含 `SketchRawModel` schema
保证的字段**:provider、documentId、页数、资源数、`raw-dsl.json` 字节数 —— **不打印画板数**
(画板需解析 loose 的 page 数据,属 normalize 范畴)。捕 `ExtractError` → `[code] message` 到
stderr,exit 1。

## 10. 测试方案(全离线、不依赖 Sketch.app)

- `open-sketch-file.test.ts` —— `fflate.zipSync` 内存构造合成 `.sketch`,经注入 `readFile` 喂入;
  覆盖正常解压 + `file-not-found` / `read-failed` / `not-a-sketch-zip` / `corrupt-archive`。
- `acquire-from-file.test.ts` —— 合成 `SketchArchive` → 断言 `SketchRawModel`;缺 `document.json`/
  无页 → `missing-entry`;坏 JSON / 缺 `do_objectID` → `bad-entry`;`assets[]` 排序与 kind 正确。
- `extract-raw.test.ts` —— 全链路:合成 archive → `RawArtifact` **过 `RawArtifactSchema`**;
  `provider==='sketch'`、`ref` 三键齐全、注入 `now` 得确定性 `capturedAt`。

## 11. 验证

Sketch 只读本地文件,**无需 token,可端到端自验**:

- 离线单测 + `tsc --noEmit`。
- `npm run extract -- --file /Users/blade/Desktop/d2c.sketch --out output` → 真实
  `output/ir/raw-dsl.json`:含 2 页、资源清单,约 1.1 MB。

## 12. 出口标准

- 包清理完成,`npm install` 正常,根 `test:sketch` 通过。
- `open-sketch-file` / `acquire-from-file` / `extract-raw` 单测全过、离线、不依赖 Sketch.app;
  `tsc --noEmit` 干净。
- 6 个错误码各被对应测试命中。
- `extractRaw` 产物过 d2c-core `RawArtifactSchema`;`raw-dsl.json` 排序稳定。
- 真实 `d2c.sketch` 跑 CLI 产出合法 `raw-dsl.json`。

## 13. 已并入的 review 决策(2026-05-21,9 点)

1. **定位澄清** —— 本轮是 Sketch raw extraction 探针,非占定完整 pipeline;MasterGo 仍是原定首个
   完整垂直切片(见第 1 节)。
2. **`SketchRawModel.pages`** —— 用 `Array<{id,path,data}>`,保留 zip 路径与顺序。
3. **CLI `--out` 必填** —— 不设默认,避免落错目录。
4. **新增 `read-failed` 错误码** —— `file-not-found` 仅限 ENOENT。
5. **`document.do_objectID` 强制非空** —— 缺失 → `bad-entry`。
6. **排序保证确定性** —— zip 条目 / pages / assets 按 path 排序。
7. **CLI 摘要 best-effort** —— 只打 schema 保证字段,不打画板数。
8. **`RawArtifact.ref`** —— `{filePath,fileName,documentId}`;文档提醒真实 raw 输出含绝对路径,勿提交。
9. **scoped 包名** —— `@skill-collections/sketch-to-component-scripts`;根脚本 `test:sketch`。
