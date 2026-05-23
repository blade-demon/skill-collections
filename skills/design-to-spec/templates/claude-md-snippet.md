<!--
  把以下内容粘贴到项目根目录的 CLAUDE.md（Claude Code）或同等位置。
  之后每次 Claude Code 加载本项目时，自动获得 design-to-spec 的项目上下文。

  快速安装：
    cat design-to-spec/templates/claude-md-snippet.md >> CLAUDE.md

  或手动复制 ↓ 分隔线之间的内容。
-->

---

## design-to-spec — UI 规格生成

本项目集成了 [design-to-spec](./design-to-spec/) skill：把 UI 设计稿 + 接口文档 + 交互描述
转成 4 阶段（视觉提纯 → 接口提纯 → 逻辑映射 → 规格组装）的可评审规格包。

### 项目上下文（skill 阶段一会读取）

```yaml
tech_stack: miniprogram # miniprogram / react / vue / flutter / agnostic
design_system: none # tdesign / nutui / vant / antd / shadcn / none
output_dir: design-spec # 生成文件的根目录（相对项目根）
components_dir: src/components # 现有原子组件目录（阶段一 Glob 发现可复用组件）
openspec_dir: openspec # OpenSpec 规格目录（无则可省略）
```

### 触发方式

向 Claude 发送类似指令：

```
帮我把这张设计稿做成规格。组件名 SearchPanel，目标技术栈 web。
[附上 1 张设计稿截图]
```

skill 会进入阶段一并产出 ASCII 图表 + 组件清单等你确认。
完整 5 分钟跑通示例见 [design-to-spec/ONBOARDING.md](./design-to-spec/ONBOARDING.md)。

### 输出位置

```
design-spec/<component-name>/
├── contracts/        ← 三份事实契约（YAML）
├── notes.md          ← 设计决策 + 数据契约 + 开放问题
├── data-fetching.md  ← 请求链路（开发者直接入口）
└── specs/<cap>/spec.md  ← OpenSpec 行为规格
```

### 提交前必跑校验

```bash
cd design-to-spec
node scripts/validate-output.js --strict \
  --ui ../design-spec/<component>/contracts/ui-schema.yaml \
  --api ../design-spec/<component>/contracts/api-schema.yaml \
  --mapping ../design-spec/<component>/contracts/mapping-logic.yaml \
  --notes ../design-spec/<component>/notes.md \
  --data-fetching ../design-spec/<component>/data-fetching.md \
  --spec ../design-spec/<component>/specs/<cap>/spec.md
```

校验通过才进入 PR / coding。如果失败，先查 `design-to-spec/references/troubleshooting.md`。

### 关键纪律

- **契约是事实源**：要改字段直接改 `contracts/*.yaml`，重跑 `node design-to-spec/scripts/generate-output.js`，**不要手动改 markdown**。
- **`open_questions` 中 P0 未关闭，禁止进入 coding**。
- **trace 锚点（`<!-- trace: state:loading -->`）不是装饰，不要删**。

### 跑不通时

按顺序查：

1. `design-to-spec/references/troubleshooting.md` — 按症状 grep
2. `design-to-spec/references/glossary.md` — 术语速查
3. `design-to-spec/references/operator-guide.md` — 真实场景策略（多视觉稿、context 受限等）
