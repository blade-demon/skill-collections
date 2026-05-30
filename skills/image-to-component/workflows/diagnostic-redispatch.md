# 诊断重派发工作流

在首次 signature 校验失败后的任何重派发之前使用本工作流。

> **校验由脚本驱动。** 手动检查返回 JSON 前，运行：
>
> ```bash
> echo '<subagent return JSON>' | npm run validate-signature -- --batch <batch-id> --expected-files <file1> <file2>
> ```
>
> 返回无效时脚本以 code 1 退出并打印 `{ "valid": false, "errors": [...] }`。将打印的 `errors` 数组作为注入重派发 fence 的具体校验错误。

## 触发条件

某 batch 首次返回的 signature 校验失败。

## 必需诊断

重派发前，主 agent 必须识别：

- 违反的确切规则。
- 确切的 slot 或行。
- 适用时的无效 token/operator/key。
- 给子 agent 的修正指令。

永不原样重发相同 prompt。

## 诊断格式

```text
Validation diagnosis:
- Rule: <validation rule name>
- Slot/line: <T/M/B/O/F/notes or full line>
- Invalid token: <token/operator/key or "n/a">
- Correction: <specific instruction>
```

## Dispatcher Instruction Fence

将修正严格放在 dispatcher-instructions fence 内：

```text
===dispatcher-instructions-begin===
Previous signature failed validation.

Validation diagnosis:
- Rule: <validation rule name>
- Slot/line: <T/M/B/O/F/notes or full line>
- Invalid token: <token/operator/key or "n/a">
- Correction: <specific instruction>

Return a corrected JSON object only. Do not explain the screenshot.
===dispatcher-instructions-end===
```

## 示例

| 失败                                                                            | 修正                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `overlay` 用作 role                                                             | 将 `overlay` 替换为允许的 O-slot 表达式，并在 notes 中包含 `overlay_type` |
| `status(error)`                                                                 | `status` 不能带括号；使用 bare `status`                                   |
| `card(title -> meta) -> media -> status` 疑似 card 内部断裂且用户确认 internals | 将 trailing `media` 与 `status` 放入 `card(...)` 容器内                   |
| `notes: bg=blue`                                                                | 移除 visual note 键；notes 键必须来自 allowlist                           |
| 不平衡的 `card(title -> meta`                                                   | 返回前平衡括号                                                            |

## 第二次失败

若重派发 batch 再次失败，停止并询问：

```text
Signature validation failed twice for this batch.

Bad return:
<json or raw output>

Validation errors:
<errors>

Please choose:
A. Provide corrected JSON for this batch manually
B. Skip this batch
C. Stop the workflow
```

## 退出

收到 corrected 有效 signature、跳过 batch 或停止工作流时退出。
