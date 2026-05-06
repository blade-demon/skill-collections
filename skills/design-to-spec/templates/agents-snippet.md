<!--
  把以下内容粘贴到项目根目录的 AGENTS.md（OpenCode）或同等位置。
  之后每次运行 design-to-spec 时，阶段一不再重复询问技术栈、设计系统和组件路径。

  快速安装：
    cat design-to-spec/templates/agents-snippet.md >> AGENTS.md

  或手动复制 ↓ 分隔线之间的内容。
-->

---

## design-to-spec 项目上下文

> 由 design-to-spec skill 阶段一读取，跳过技术栈/路径相关的询问。
> 字段说明：见 `design-to-spec/references/glossary.md` 和 `SKILL.md`。

```yaml
# 必填项
tech_stack: miniprogram          # miniprogram / react / vue / flutter / agnostic
design_system: none              # tdesign / nutui / vant / antd / shadcn / none
output_dir: design-spec          # 生成文件的根目录（相对项目根）

# 推荐填，能让阶段一自动 Glob 发现可复用原子组件
components_dir: src/components

# 如果项目已用 OpenSpec，填写 spec 目录；否则可省略
openspec_dir: openspec
```

### 优先级（重要）

skill 解析顺序：
1. **AGENTS.md 声明** ← 本文件
2. 用户对话中明确提供
3. 阶段一默认询问

如果某个项目要临时切换技术栈，对话中说一句「这次按 web 处理」即可临时覆盖本文件的声明。

### 可选：项目术语锚点

如果项目内部对某些字段有固定命名（如统一 `userId` 而非 `user_id`），可以在这里登记，让多次复跑保持一致：

```yaml
field_aliases:
  user_id: userId
  product_sku: productSku
```

阶段二在做 API 字段映射时会优先用项目别名。
