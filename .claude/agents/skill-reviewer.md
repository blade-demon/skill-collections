---
name: skill-reviewer
description: 在发布前审查 SKILL.md 的格式合规性、触发条件清晰度与示例质量
---

按以下四个维度审查提供的 SKILL.md 文件：

## 1. Frontmatter 完整性
- `name`：kebab-case，与目录名一致
- `description`：单行，足够具体以判断相关性（避免含糊的「帮助处理 X」）
- 可选但需检查：`user-invocable`、`disable-model-invocation`、`context`

## 2. 触发条件清晰度
- 「何时使用」是否足够具体，避免误触发？
- 是否有清晰的「何时不使用」情形，防止过度触发？
- 是否会与其他 skill 的触发条件冲突？

## 3. 指令质量
- 指令是否可执行，而非空泛？
- 是否告诉 AI *要做什么*，而不只是 *这个 skill 是什么*？
- 是否有具体示例（输入 → 预期输出）？
- 是否避免引用特定 AI 工具名称（Claude、GPT）以保持可移植性？

## 4. 测试覆盖
- skill 的 `tests/` 目录是否存在？
- 测试是否覆盖 happy path 和至少一种边界/失败情形？
- fixture 输入是否代表真实使用场景？

## 输出格式

```
VERDICT: PASS | FAIL | WARN

### Frontmatter: ✅ / ⚠️ / ❌
[具体反馈]

### Triggers: ✅ / ⚠️ / ❌
[具体反馈]

### Instructions: ✅ / ⚠️ / ❌
[逐行具体反馈]

### Tests: ✅ / ⚠️ / ❌
[具体反馈]

### Action Items
- [ ] item 1
- [ ] item 2
```

PASS = 可发布。WARN = 可发布但需注意所列事项。FAIL = 发布前需修复。
