# 不同 harness 接入指南

> 你在用什么工具跑 LLM？这份文档告诉你怎么把 design-to-spec 接进去、怎么验证它真的被加载了。
>
> **还没装到项目里？** 先读 [ONBOARDING.md §6 接入到我的项目](../ONBOARDING.md)（决定 skill 文件放在哪个目录），再回来看这份。

design-to-spec 的核心是一份 `SKILL.md`（系统提示）+ 一组确定性脚本（Node.js）。不同 harness 加载 `SKILL.md` 的方式不一样，但脚本部分（`scripts/*.js` + `npm install`）所有 harness 都相同。

---

## 兼容性矩阵

| Harness | SKILL.md 自动加载 | 推荐安装位置 | 状态 |
|---|---|---|---|
| Claude Code | ✅（按 description 触发） | `~/.claude/skills/design-to-spec/` 或 `<project>/.claude/skills/design-to-spec/` | 推荐 |
| OpenCode | ✅（AGENTS.md 持久化项目上下文） | `<project>/design-to-spec/` + AGENTS.md 引用 | 推荐 |
| Cursor | ⚠️（需手动转 `.cursor/rules/`） | `<project>/.cursor/rules/design-to-spec.mdc` | 可用 |
| Cline | ⚠️（需手动写 `.clinerules`） | `<project>/.clinerules/design-to-spec.md` | 可用 |
| Continue | ⚠️（需手动配 system message） | `~/.continue/config.yaml` | 可用 |
| 其他 LLM 客户端 | ❌（手动复制 SKILL.md 当 system prompt） | 任意位置 | 降级 |

**核心区别**：✅ 表示 harness 会按 SKILL.md frontmatter 的 `description` 自动判断是否启用；⚠️ 表示需要你手动把 SKILL.md 转成该工具的"规则文件"格式；❌ 表示工具完全不支持 skill 概念，只能把 SKILL.md 复制粘贴当系统提示用。

---

## 通用前置：装好 Node 脚本

不论用哪个 harness，第四阶段的 `validate-contracts` / `generate-output` / `validate-output` 都是 Node 脚本，必须先跑通：

```bash
cd <project>/design-to-spec   # 或你选定的 skill 目录
npm install                    # 唯一依赖：js-yaml
npm test                       # 预期：33+ 项全过
```

如果 `npm test` 没过就别接 harness 了，先解决环境问题（Node 版本 ≥ 18，`which node`、`node -v` 检查）。

---

## Claude Code

### 安装

两种放法二选一：

**A. 用户级（个人多个项目共用）**
```bash
mkdir -p ~/.claude/skills
cp -r /path/to/design-to-spec ~/.claude/skills/design-to-spec
cd ~/.claude/skills/design-to-spec && npm install
```

**B. 项目级（团队共享，跟随仓库版本）**
```bash
mkdir -p <project>/.claude/skills
cp -r /path/to/design-to-spec <project>/.claude/skills/design-to-spec
cd <project>/.claude/skills/design-to-spec && npm install
```

**推荐 B**：团队成员 clone 仓库后 skill 自动可用，版本和代码绑定。submodule / subtree 也走 B 路径。

### 启用

Claude Code 会扫描 `~/.claude/skills/` 和 `<project>/.claude/skills/`，按 `SKILL.md` frontmatter 的 `description` 自动决定是否加载——**不需要手动 enable**。

### 冒烟测试

新开一个 Claude Code 会话，发送：

```
我有一张设计稿想转成实现规格。组件名 SearchPanel，目标技术栈 web。
[附设计稿截图]
```

**期望第一行输出包含**：

```
📐 design-to-spec 启动
─────────────────────────────────────────
流程：4 个阶段，每阶段你确认后才进入下一步
```

如果没看到启动话术，说明 skill 没被触发。最可能的原因：
- SKILL.md frontmatter 里 `description` 字段缺失或被改坏 → 检查 `head -10 SKILL.md`
- 安装位置不在 Claude Code 扫描路径 → `ls ~/.claude/skills/design-to-spec/SKILL.md` 应当存在
- 提示词里没有"设计稿"/"组件"等关键词 → 加上"想生成 OpenSpec / 实现规格"等措辞

### 已知坑

- **Claude Code 用 `AskUserQuestion` 工具请求用户输入**，所以阶段一/二/三的"确认"步骤会显示为可选项 UI。这是正常的，不是 skill bug。
- skill 写文件时会触发 Claude Code 的写文件确认对话框，第一次跑会有几次连续的"允许写入吗"，可在 `.claude/settings.local.json` 加白名单：`"Write(<project>/design-spec/**)"`。

---

## OpenCode

### 安装

OpenCode 有原生 skill 支持，也支持 `AGENTS.md` 持久化项目上下文。推荐：

```bash
# 在项目根目录
cp -r /path/to/design-to-spec ./design-to-spec
cd design-to-spec && npm install
```

### 启用 + 持久化项目上下文

把以下片段加入项目根 `AGENTS.md`（首次配置一次，之后所有会话自动生效）：

```markdown
## design-to-spec 项目上下文

- skill_path: design-to-spec/SKILL.md
- tech_stack: web              # miniprogram / react / vue / flutter / agnostic
- design_system: none           # tdesign / nutui / vant / antd / shadcn / none
- output_dir: design-spec       # 生成文件的根目录
- components_dir: src/components # 现有原子组件目录
- openspec_dir: openspec        # OpenSpec 规格目录
```

skill 读取优先级：AGENTS.md 声明 > 用户对话中提供 > 阶段一默认询问。

### Plan mode 用法

OpenCode 通过 Tab 切换 Plan / Execute。建议：

| 阶段 | 模式 | 原因 |
|---|---|---|
| 阶段一/二/三 | **Plan** | 纯分析，不写文件 |
| 阶段四 | **Execute** | 需要写 contracts/ 和 3 份输出 |

### 冒烟测试

同 Claude Code，期望看到 `📐 design-to-spec 启动` 启动话术。

### 已知坑

- 阶段四中途中断（context 满 / 网络断开）：OpenCode 会话通过 SQLite 持久化，新会话发送 `design-spec/<组件名>/contracts/ 已落盘，从阶段四接续` 即可。
- AGENTS.md 配过的项目，阶段一不会再问技术栈，但**第一次配错了之后阶段一会按错误的栈走**，记得改完 AGENTS.md 后重启会话。

---

## Cursor

Cursor 没有 skill 概念，但有 `.cursor/rules/` 目录可以注入项目级提示。

### 安装

```bash
# 1. 把脚本和资源放进项目（任何路径都行，下面用 tools/）
cp -r /path/to/design-to-spec ./tools/design-to-spec
cd tools/design-to-spec && npm install

# 2. 把 SKILL.md 转成 Cursor rule
mkdir -p .cursor/rules
cp tools/design-to-spec/SKILL.md .cursor/rules/design-to-spec.mdc
```

### 改 rule frontmatter

`.cursor/rules/design-to-spec.mdc` 顶部把原 frontmatter 替换成 Cursor 格式：

```yaml
---
description: Use when a user provides a UI screenshot, mockup, wireframe, or component tree and wants implementation specs. See SKILL.md for full protocol.
globs:
  - "**/design-spec/**"
  - "**/*.svg"
  - "**/*.png"
alwaysApply: false
---
```

`alwaysApply: false` + `description` 让 Cursor 按内容触发；如果你想强制每次会话都加载，改 `alwaysApply: true`（会占用更多 token）。

### 冒烟测试

Cursor 会话发送同样的提示词，期望看到启动话术。如果没触发，先在聊天框 `@design-to-spec` 显式 mention 这条 rule。

### 已知坑

- Cursor 的 rule 文件默认大小限制约 6000 行，SKILL.md（约 540 行）远低于上限。如果你做了大量定制导致超长，可以把 references/* 的内容拆成多个 rule 文件。
- Cursor 默认不读 `.cursor/rules/` 之外的 markdown，所以 SKILL.md 中提到的 `references/contracts.md` 等按需加载文件，**LLM 必须靠 file read 工具去取**——这是 Cursor 模式下的固有限制，无法像 Claude Code/OpenCode 那样 skill runtime 自动 lazy load。

---

## Cline

Cline 用 `.clinerules` 文件注入系统级行为。

### 安装

```bash
cp -r /path/to/design-to-spec ./tools/design-to-spec
cd tools/design-to-spec && npm install

# 把 SKILL.md 转成 .clinerules
mkdir -p .clinerules
cp tools/design-to-spec/SKILL.md .clinerules/design-to-spec.md
```

### 冒烟测试

同上，期望看到启动话术。Cline 会把 `.clinerules/` 下所有文件拼接进 system prompt。

### 已知坑

- Cline 没有触发匹配机制（不会按 description 决定是否加载），整份 SKILL.md 永远在 context 里，占约 8K token。如果你不想常驻，把 SKILL.md 改名为 `design-to-spec.md.disabled`，需要时再启用。

---

## Continue

Continue（VS Code 扩展）通过 `~/.continue/config.yaml` 配 system message。

### 安装

```bash
cp -r /path/to/design-to-spec ./tools/design-to-spec
cd tools/design-to-spec && npm install
```

### 配置

编辑 `~/.continue/config.yaml`，给希望启用 skill 的 model 加 `systemMessage`：

```yaml
models:
  - title: Claude with design-to-spec
    provider: anthropic
    model: claude-sonnet-4-5
    systemMessage: |
      你是一个前端规格生成助手。每次用户提供设计稿时，按 ./tools/design-to-spec/SKILL.md 中的 4 阶段协议执行。
      关键文件：
      - 协议主文档：./tools/design-to-spec/SKILL.md
      - 模板：./tools/design-to-spec/templates/
      - 校验脚本：./tools/design-to-spec/scripts/
```

### 冒烟测试

切换到上面那个 model，发送提示词，期望看到启动话术。

### 已知坑

- Continue 的 systemMessage 是字符串字段，不能引用文件——所以这里走的是"告诉 LLM 去读 SKILL.md"的间接路径，依赖 LLM 主动 file read。和 Cursor 类似的限制。
- 如果模型不主动读取 SKILL.md，可以把 SKILL.md 全文（约 28K 字符）粘进 systemMessage，但会占用每次请求的 token 配额。

---

## 其他 LLM 客户端（降级方案）

任何能自定义 system prompt 的 LLM 客户端（ChatGPT 自定义 GPT、Gemini Gem、文心一言知识库、自建 chat UI）都可以走降级方案：

1. 把 `SKILL.md` 全文复制粘贴进 system prompt 字段
2. 把 `templates/*.yaml` 和 `references/contracts.md` 也粘进去（如果 system prompt 容量允许）
3. 阶段四的脚本部分**只能在本地手动跑**，把生成的 YAML 给客户端，再手动跑 `node scripts/generate-output.js`

冒烟测试：发送提示词后期望看到启动话术。如果 LLM 没按 4 阶段走（比如直接给了一段 markdown spec），说明 system prompt 没生效或被模型忽略，检查 prompt 长度是否超限。

**这是降级路径**：失去了 lazy-load references 的能力，token 消耗翻倍，但能跑。

---

## 通用诊断 checklist

skill 装完跑不起来，按顺序排查：

1. `cd <skill-path> && npm test` 全过吗？没过 → 环境问题
2. `head -10 SKILL.md` 看到 `description: Use when ...` 那一行了吗？没看到 → SKILL.md 损坏
3. harness 配置文件里 skill path 写对了吗？`ls <配置中的 path>/SKILL.md` 应能看到文件
4. 提示词里有"设计稿/组件/规格/spec"等关键词吗？没有 → 加上
5. 启动话术第一行 `📐 design-to-spec 启动` 出现了吗？
   - 没有 → skill 没被触发，看上面 1-4
   - 有 → skill 已加载，问题在后续步骤（参考 SKILL.md §错误处理与重试）
