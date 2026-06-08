# PR-3 实施计划：stack/inline layoutPlan → flex（column/row）

日期：2026-06-07
分支：`feat/react-codegen-layout`（off master `f6c7acd`）
Design spec：[`docs/superpowers/specs/2026-06-07-react-codegen-layout-design.md`](../specs/2026-06-07-react-codegen-layout-design.md)

> **For agentic workers:** REQUIRED SUB-SKILL：用 superpowers:subagent-driven-development
> （推荐）或 superpowers:executing-plans 逐任务实现。每个任务 TDD（先红后绿）、独立 commit，
> **提交前先跑 prettier `--write`**（避免格式化混入后续 docs commit）。步骤用 `- [ ]`。

**Goal:** 把已确认的 `stack` / `inline` `PlannedLayout` 投影为 flex CSS（容器 `display:flex`

- 方向，直接子项 flow）。**仅当用均值 gap 能在 0.5px 内复刻原绝对几何时才发 flex，否则回退
  absolute + 确定性 warning**。投影非推断。

**Architecture:** 纯函数 `projectStackInlineLayout(strategy, childrenRects)` 承载 mapping +
全部回退判定；`react/generate.ts` 的 `componentCss` 对命中 stack/inline 的容器（component
`.root` 或普通嵌套容器）调用它——flex 命中则容器写 flex、其直接子项写 flow
（`position:relative` + `flex:0 0 auto` + 显式宽高），否则维持 absolute；warning 入
`CodegenFilePlan.warnings`。CLI / golden / visual-harness 沿用 PR-2 形态，但**独立 fixture，
不碰 asset golden**。

**Tech Stack:** TypeScript, React, CSS Modules, Node fs, Vitest, Vite, Playwright, GitHub Actions。

## 范围

只做 stack/inline → flex 投影 + 其测试与门禁。**不做**：grid/overlay、上游 inference 扩展、
契约传 gap/轴、资产/命名/vector、**不动 PR-2 的 asset golden**。

## 锁定决策（来自 spec，已确认）

1. `stack` → `flex-direction: column`，`inline` → `row`（取自 strategy，不重判）。
2. 容器：`display:flex` + 方向 + `align-items: flex-start`（禁 stretch）+ `gap` + `padding`。
3. `gap` = 主轴相邻间距（`next.start − prev.end`）的**算术平均值**。
4. `padding-top = first.y`、`padding-left = first.x`（保留起始偏移；为负回退）。
5. 子项：`position: relative` + `flex: 0 0 auto` + 显式 `width/height`，无 `left/top`、无
   `position:absolute`（`relative` 保留 containing-block，嵌套子孙才不漂移）。
6. **保真即投影前提**：均值 gap 重建后任一子项主轴偏差 > 0.5px、或跨轴起点方差 > 0.5px → 回退。
7. 其它回退：负 gap / 缺节点 / DOM 顺序≠主轴顺序 / `<2` 子项 / 负 padding。**绝不抛错**。

## 文件结构

新增：

- `packages/d2c-core/src/codegen/react/layout.ts` — 纯投影 `projectStackInlineLayout`。
- `packages/d2c-core/src/codegen/__tests__/layout.test.ts` — 投影 + 回退穷举。
- `skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-layout-golden/`
  （`design-ir.json` + 真实重生成的 `design-spec/*.json`）。
- `skills/sketch-to-component/scripts/src/__tests__/codegen-layout-golden.test.ts`
- `fixtures/apps/react-vite/src/golden-layout/**`（重生成的 flex 包）
- `fixtures/apps/react-vite/visual-harness-layout.html` + `src/visual-harness/main-layout.tsx`

修改：

- `packages/d2c-core/src/codegen/react/generate.ts` — context + componentCss 三态消费投影。
- `packages/d2c-core/src/codegen/__tests__/codegen-fixtures.ts` — 加 `approvedStackInlineInput()`。
- `.../__tests__/generate-content.test.ts` / `generate.test.ts` — flex 断言（覆盖 .root + 嵌套）。
- `skills/sketch-to-component/scripts/src/visual-harness/codegen-golden.ts` — 参数化 `--fixture`。
- `skills/sketch-to-component/scripts/src/__tests__/visual-harness.test.ts` — flex 几何 + 负向。
- `.github/workflows/check.yml`、`.github/scripts/detect-visual-regression-changes.sh`、
  `fixtures/apps/react-vite/tests/visual-regression-ci.test.js`（CI 接线，Task 4）。
- 文档（Task 5）。

## 数据 / 投影契约

```ts
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
type FlexProjection =
  | {
      kind: 'flex';
      direction: 'row' | 'column';
      gapPx: number;
      paddingTopPx: number;
      paddingLeftPx: number;
    }
  | { kind: 'absolute'; warning: string };

function projectStackInlineLayout(input: {
  containerNodeId: string;
  strategy: 'stack' | 'inline';
  children: (Rect | undefined)[]; // 按 childIds 顺序；undefined = 缺失几何
}): FlexProjection;
```

主轴：`stack` → y，`inline` → x。**回退优先级**（命中即回退，`warning` 精确串含
`containerNodeId` + 原因）：
`<2 子项` → 缺节点(任一 undefined) → DOM 顺序≠主轴排序 → 负 gap → 负 padding →
主轴重建偏差>0.5px → 跨轴方差>0.5px。
否则 `gap = mean(gaps)`、`paddingTop = first.y`、`paddingLeft = first.x` → `kind:'flex'`。
`kind:'absolute'` 只表示**直接子项继续使用 absolute positioning**，不表示容器自身一定为
`position:absolute`；容器自身定位始终由其父布局决定。

## 失败语义

投影 best-effort，**永不抛错**。回退时不发 flex flow 子布局：容器自身定位保持不变，直接子项
继续使用现有 absolute positioning，并向 `CodegenFilePlan.warnings` 追加 warning。

## Warning 契约（锁定）

**7 条精确模板**（`<id>` = 容器 `semanticNodeId`，`<s>` = `stack|inline`）：

1. `react codegen: layout <id> (<s>) has fewer than 2 children; kept absolute child positioning`
2. `react codegen: layout <id> (<s>) has a child without geometry; kept absolute child positioning`
3. `react codegen: layout <id> (<s>) child DOM order does not match main-axis order; kept absolute child positioning`
4. `react codegen: layout <id> (<s>) has overlapping children (negative gap); kept absolute child positioning`
5. `react codegen: layout <id> (<s>) mean-gap layout drifts >0.5px from absolute; kept absolute child positioning`
6. `react codegen: layout <id> (<s>) cross-axis start varies >0.5px; kept absolute child positioning`
7. `react codegen: layout <id> (<s>) has a negative lead offset; kept absolute child positioning`

- **去重 key**：`semanticNodeId`（每容器 ≤1 条；命中第一条即回退）。
- **排序**：`componentPlan.body.components` 顺序 → 组件内 `.root` 优先 → 嵌套节点按
  `semanticNodeId` 排序（与现有 CSS 发射顺序一致，[`generate.ts:425`](../../../packages/d2c-core/src/codegen/react/generate.ts)）。
- **返回方式**：`componentCss()` 由返回 `string` 改为 `{ content: string; warnings: string[] }`；
  `generate()` 按组件顺序汇入 `CodegenFilePlan.warnings`。

---

## Task 1：纯投影函数 + 单测（core）

**Files:** `react/layout.ts`（新）、`__tests__/layout.test.ts`（新）

- [ ] **Step 1**：写失败单测 `layout.test.ts`：
  - **flex（均匀）**：stack，children y=[12,42,72] 高 20（gaps [10,10]）→
    `direction:'column'`、`gapPx:10`、`paddingTopPx:12`、`paddingLeftPx:first.x`。
  - inline 同理 → `direction:'row'`。
  - **回退（非均匀，你的 [10,30] 用例）**：y=[0,30,80] 高 20（gaps [10,30]，mean 20）→ 重建中间
    项 40 vs 实际 30 = 10px > 0.5 → `kind:'absolute'`（**断言回退，非 flex**）。
  - **回退**：跨轴方差（stack 子项 x=[0,0,8]，另测 inline 子项 y=[0,0,8]）/ 负 gap /
    任一 `undefined` / DOM 顺序≠主轴排序 / `<2` 子项 / 负 padding —— 各
    `kind:'absolute'` 且 `warning` **精确字符串**匹配（含 `containerNodeId`）。
- [ ] **Step 2**：跑红 —— `npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/layout.test.ts`，
  预期 RED：`projectStackInlineLayout` 未实现（模块/导出不存在）。
- [ ] **Step 3**：实现 `projectStackInlineLayout`（纯；按契约 + 上面回退优先级；含均值重建校验）。
- [ ] **Step 4**：转绿 —— 同上 focused 命令通过 + `npm run typecheck:d2c` 干净。
- [ ] **Step 5**：`prettier --write` 改动文件 → commit `feat(d2c): project stack/inline layout to flex (pure)`。

## Task 2：generator 消费投影（core，三态载体）

**Files:** `react/generate.ts`、`codegen-fixtures.ts`、`generate-content.test.ts`、`generate.test.ts`

- [ ] **Step 0**：核查现有 fixture 是否已产出 stack/inline plan（`approvedCodegenInput` /
  `approvedStubPropsInput` 等）。若有，其 generate 输出会从 absolute 变 flex（或回退）→ 同步
  更新对应断言并在 commit message/PR 记为预期变化。
- [ ] **Step 1**：加两组 approved 内存 fixture：
  - `approvedStackInlineInput()`：design-ir 构造
    **(a)** 一个 planned component，其 **`.root` 自身**是 3 垂直同类项（→stack）；
    **(b)** 一个**普通嵌套容器**是 3 水平同类项（→inline），且其直接子项**各带嵌套子孙**；
    顶层 component layout strategy 为 absolute（其 `.root` 保持 relative block）。走
    contract 链并 approve。该 fixture 覆盖嵌套 flex 容器的**父非 flex**情况。
  - `approvedNestedFlexContainersInput()`：小型、validator-valid 的 approved `CodegenInput`，
    component `.root` 为 stack，某直接子容器为 inline，使该嵌套 flex 容器的**父为 flex**。
  - 先断言两组输入中的目标 `layoutPlan` semantic id、strategy 与父子关系符合上述矩阵。
- [ ] **Step 2**：写失败 generate 测试：
  - **`.root` 载体**：该 component 的 `.root` CSS 含 `display:flex` / `flex-direction:column` /
    `align-items:flex-start` / `gap:` / `padding:`（不再是纯 `position:relative` block）。
  - **嵌套容器 + 父非 flex**：其 `.node_xxx` 含 `display:flex` / `row`，同时保留
    `position:absolute`、原 `left/top`。
  - **嵌套容器 + 父为 flex**：其 `.node_xxx` 同时是 flex 容器和 flow 子项，含
    `display:flex`、`position:relative`、`flex:0 0 auto`，且无 `left/top`。
  - 两者**直接子项** CSS 含 `position: relative` + `flex: 0 0 auto` + 显式宽高，且**不含**
    `position: absolute`、不含 `left:`/`top:`。
  - 嵌套子孙仍 absolute 且几何不变（containing-block 回归）。
  - 非目标节点仍 absolute；重复生成字节稳定；一个 `.root` 回退场景产出**精确** warning，
    `.root` 保持 relative block，其直接子项继续 absolute positioning。
- [ ] **Step 3**：跑红 —— `npm test --workspace @skill-collections/d2c-core -- src/codegen/__tests__/generate-content.test.ts src/codegen/__tests__/generate.test.ts`，
  预期 RED：`.root` 仍为 relative block、嵌套 `.node_xxx` 尚无 `display:flex`，且不存在
  “父 flex / 父非 flex”两套定位分支。
- [ ] **Step 4**：实现：
  - context 加 `layoutPlanBySemanticId: Map<string, PlannedLayout>`。
  - `componentCss()` 返回 `{ content, warnings }`；三态**载体**分派（哪个 class 升级 flex）：
    ① `semanticNodeId === component.semanticNodeId` → `.root`；② 普通嵌套渲染节点 → `.node_xxx`；
    ③ child-component wrapper → 作父容器 flow 子项，**不**在父消费子组件 layoutPlan。
  - **容器自身定位与 `display:flex` 正交**（定位看父，flex 看自身计划）：
    - `.root`：`position:relative` 不变 + 叠加 flex。
    - 嵌套容器 + 父非 flex：保留 `position:absolute` + `left/top` + 叠加 flex。
    - 嵌套容器 + 父为 flex：自身 flow（`position:relative`+`flex:0 0 auto`+宽高、无 left/top）+ 叠加 flex。
  - flex 命中容器的**直接子项**走 flow（`position:relative`+`flex:0 0 auto`+宽高，跳过 absolute）；
    每个节点据「父是否 flex」选 flow vs absolute。回退时容器自身定位不变、直接子项继续
    absolute positioning，并 push warning（按「Warning 契约」模板/排序/去重）。
- [ ] **Step 5**：转绿 —— `npm run test:d2c` + `npm run typecheck:d2c`（含 Step 0 更新过的断言）。
- [ ] **Step 6**：`prettier --write` → commit `feat(d2c): emit flex CSS for stack/inline containers`。

## Task 3：codegen-layout-golden（独立 fixture；design-spec 是测试输入，先备好）

**Files:** `__tests__/fixtures/codegen-layout-golden/{design-ir.json, design-spec/*.json}`、
`codegen-layout-golden.test.ts`、`fixtures/apps/react-vite/src/golden-layout/**`

> 注：golden test 读 committed `design-spec/*.json`（测试**输入**），故必须**先生成**，否则
> 测试会因 design-spec ENOENT 而错误地红，而非因 golden-layout 包缺失/字节不符而正确地红。
> design-spec 是输入不是待实现行为，提前生成不违反 TDD。

- [ ] **Step 1**：写 `codegen-layout-golden/design-ir.json`（同 Task 2 fixture 形态：一个
      component-root stack + 一个嵌套 inline 容器，inline 子项各带嵌套子孙；顶层 component layout
      strategy 为 absolute，其 `.root` 保持 relative block）。
- [ ] **Step 2**：**先备 design-spec（测试输入）**，运行完整、确定性的真实链路：

  ```bash
  FIXTURE=skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-layout-golden
  npm run contract --workspace @skill-collections/sketch-to-component-scripts -- \
    --design-ir "$FIXTURE/design-ir.json" \
    --out "$FIXTURE" \
    --mode presentational \
    --interaction-mode omitted \
    --approval-reason "layout golden presentational approval" \
    --approved-by "codegen-layout-golden" \
    --approved-at "2026-06-07T00:00:00.000Z"
  npm run approve --workspace @skill-collections/sketch-to-component-scripts -- \
    --spec "$FIXTURE/design-spec" \
    --approved-by "codegen-layout-golden" \
    --approved-at "2026-06-07T00:00:00.000Z" \
    --acknowledge-behavior-stubbed
  ```

  预期：`$FIXTURE/design-spec/{visual-view,semantic-view,interaction-spec,component-plan,manifest}.json`
  生成且 component-plan 状态为 approved。

- [ ] **Step 3**：写 `codegen-layout-golden.test.ts` 并**跑红** ——
      `npm test --workspace @skill-collections/sketch-to-component-scripts -- src/__tests__/codegen-layout-golden.test.ts`，
      预期 RED：committed `golden-layout` 包**缺失/字节不符**（**不是** design-spec ENOENT）。断言：
      两容器 flex（column/row）、子项 `position:relative`、`assets:[]`、`warnings:[]`、纯文本字节稳定。
- [ ] **Step 4**：生成 committed 包（本 fixture 无资产，因此不传 `--assets`）：

  ```bash
  FIXTURE=skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-layout-golden
  npm run codegen --workspace @skill-collections/sketch-to-component-scripts -- \
    --spec "$FIXTURE/design-spec" \
    --design-ir "$FIXTURE/design-ir.json" \
    --out fixtures/apps/react-vite/src/golden-layout
  ```

  预期：CLI exit 0，输出 `assets: 0`、无 warning，并生成
  `fixtures/apps/react-vite/src/golden-layout/`。

- [ ] **Step 5**：golden test 转绿。
- [ ] **Step 6**：`npm run check:fixtures`（`tsc -b && vite build` 编译 golden-layout）。
- [ ] **Step 7**：`prettier --write` → commit `test(codegen): layout golden fixture (flex)`。

## Task 4：visual harness 纳入 flex + CI（先红后实现）

**Files:** `visual-harness/codegen-golden.ts`、`visual-harness.test.ts`、
`fixtures/apps/react-vite/visual-harness-layout.html` + `src/visual-harness/main-layout.tsx`、
`.github/workflows/check.yml`、`.github/scripts/detect-visual-regression-changes.sh`、
`fixtures/apps/react-vite/tests/visual-regression-ci.test.js`、
`fixtures/apps/react-vite/tests/golden-visual-harness-page.test.js`

- [ ] **Step 1（先红）**：写失败测试：
  - 为 `codegen-golden.ts` 锁定纯 CLI 契约：

    ```ts
    interface VisualHarnessCliArgs {
      fixtureDir: string;
      candidateUrl: string;
      outDir: string;
    }

    export function parseVisualHarnessArgs(
      argv: string[],
    ): VisualHarnessCliArgs | undefined;
    ```

    `visual-harness.test.ts` 通过 module namespace + `Record<string, unknown>` cast 检查该导出，
    避免“不存在的 named import”造成编译错误；断言仅传 `--candidate-url` 使用现有 asset
    fixture/default out，自定义 `--fixture`/`--out` 会 resolve，缺 candidate 或 flag 缺值返回
    `undefined`。

  - `visual-harness.test.ts`：flex 容器 + 直接子项 **+ 嵌套子孙**相对 x/y/w/h 在
    `assertComparableMetrics` 下零 failure；**负向**：破坏 candidate gap 或 flex-direction → 必
    产生 rect mismatch failure。几何 helper 用例可作为 characterization 立即通过，但 parser
    导出/行为断言必须 RED。
  - `visual-regression-ci.test.js`：断言 CI 会跑 **layout harness**（独立输出目录），且
    candidate URL 精确为 `http://127.0.0.1:5179/visual-harness-layout.html`；同时
    `detect-visual-regression-changes.sh` 路径探测覆盖 `golden-layout` 与新 HTML/page。
  - 扩展 `golden-visual-harness-page.test.js`：`visual-harness-layout.html` 挂载
    `golden-layout`、`data-d2c-harness="candidate"`。

- [ ] **Step 2**：跑红 —— `npm test --workspace @skill-collections/sketch-to-component-scripts -- src/__tests__/visual-harness.test.ts`
  + `npm test --prefix fixtures/apps/react-vite`（CI 接线/挂载页测试），预期 RED：
  `parseVisualHarnessArgs` 导出不存在、layout harness 未接入 CI、挂载页缺失。
- [ ] **Step 3**：实现：
  - 实现并导出 `parseVisualHarnessArgs(argv)`；`main()` 只消费解析结果。参数化
    `--fixture <dir>`（默认 asset fixture），同步更新 usage；复用 `assertComparableMetrics`
    的相对几何 0.5px 比对；
  - 加 react-vite 第二挂载页 `visual-harness-layout.html` + `main-layout.tsx`（hostile-scope）；
  - 改 `check.yml`：ready check 同时确认 `visual-harness.html` 与
    `visual-harness-layout.html` 可访问，然后执行两条独立 gate：

    ```bash
    npm run visual-harness:codegen \
      --workspace @skill-collections/sketch-to-component-scripts -- \
      --candidate-url http://127.0.0.1:5179/visual-harness.html \
      --out "$RUNNER_TEMP/codegen-visual-regression/asset"
    npm run visual-harness:codegen \
      --workspace @skill-collections/sketch-to-component-scripts -- \
      --fixture skills/sketch-to-component/scripts/src/__tests__/fixtures/codegen-layout-golden \
      --candidate-url http://127.0.0.1:5179/visual-harness-layout.html \
      --out "$RUNNER_TEMP/codegen-visual-regression/layout"
    ```

  - 改 `detect-visual-regression-changes.sh` 纳入 `golden-layout` 与新页路径；
  - 改 `visual-regression-ci.test.js` 适配。
- [ ] **Step 4**：单测转绿；**原 asset visual gate 测试继续通过**。
- [ ] **Step 5**：本地真实浏览器跑（主会话）：layout candidate vs baseline 两容器 flex 排布
  0.5px 内一致，exit 0；同时重跑原 asset gate；破坏 gap/方向变红、恢复回绿；截图人工确认。
- [ ] **Step 6**：`test:sketch` + `typecheck:sketch` 绿 → `prettier --write` → commit
  `test(codegen): visual-gate flex layout`。

## Task 5：文档 + 全量 gate

**Files:** `docs/stages/stage-6-codegen-plan.md`、`docs/reports/codegen-react-bottleneck-audit-2026-06-06.md`、
`packages/d2c-core/README.md`，并把本次 **spec + plan** 一并纳入本 commit。

- [ ] **Step 1**：文档更新 —— layout 现状：stack/inline 已投影为 flex（column/row，含 0.5px
  保真回退）、absolute strategy 仍使用 absolute 子项定位、grid/overlay 仍 out；审计问题 3
  标记 PR-3 部分解决（消费已有计划，未扩 inference）。
- [ ] **Step 2**：完整本地 sketch 链路验收：extract→…→codegen，断言原 1 stack + 1 inline 现
  产出 flex 且无位置回归（本地全量 harness 跑通；任一被 0.5px 挡下则记录并按需回退）。
- [ ] **Step 3**：`prettier --write` 改动文件（含 spec/plan）。
- [ ] **Step 4**：`npm run check:full` + `git diff --check` + `git status --short`
  （**应无本任务遗漏的未提交文件**；忽略既有未跟踪的 `.superpowers/`）。
- [ ] **Step 5**：commit `docs: describe React codegen flex layout`（含 spec + plan + 三文档）。

## Merge 验收清单

- [ ] component **`.root` 自身**命中 stack → `.root` 升级 `display:flex; flex-direction:column;
  align-items:flex-start` + mean gap + 首项 padding；**普通嵌套容器**命中 inline 同理 → `row`。
- [ ] flex 子项 `position:relative` + `flex:0 0 auto` + 显式宽高，无 absolute / 无 left/top；
  其嵌套子孙几何不漂移。
- [ ] 非目标节点仍 absolute；component `.root` 默认 `position:relative`，目标 `.root` 可为 flex。
- [ ] **嵌套 flex 容器自身定位由父决定**（与 `display:flex` 正交）：父非 flex → 保留
  `position:absolute`+`left/top`+叠加 flex；父为 flex → 自身 flow（`relative`+`flex:0 0 auto`，
  无 left/top）+叠加 flex（不丢定位被挪到 (0,0)）；两种情况都有 generate 回归测试。
- [ ] warning 命中「Warning 契约」7 条精确模板；去重 key=`semanticNodeId`；排序=组件序→`.root`→
  semantic-id；`componentCss()` 返回 `{ content, warnings }`。
- [ ] 回退（<2 / 缺节点 / 顺序不匹配 / 负 gap / 负 padding / 主轴漂移>0.5px / 跨轴方差>0.5px）→
  容器自身定位不变、直接子项继续 absolute positioning + **精确、不重复、顺序确定**的 warning，
  无抛错；`[10,30]` 类非均匀间距走回退。
- [ ] `gap` = 相邻间距算术平均；flex 仅在 0.5px 内复刻原几何时发出。
- [ ] codegen-layout-golden 文本字节稳定，过 `tsc -b && vite build`。
- [ ] visual harness：flex 容器 + 子项 + 嵌套子孙 0.5px 内一致；破坏 gap/方向必变红（负向存在）；
      `parseVisualHarnessArgs` 覆盖默认/自定义 fixture 与缺参；CI 跑 asset + layout 两套且
      **asset gate 继续通过**。
- [ ] 真实 `d2c.sketch` 1 stack + 1 inline 投影为 flex，无位置回归。
- [ ] asset golden（PR-2）零改动；无 layoutPlan/坐标外的行为变更。
- [ ] `check:full` + `git diff --check` 干净。
