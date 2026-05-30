> **覆盖表由脚本驱动。** 构建 `CoverageInput` JSON 对象，然后运行：
>
> ```bash
> echo '<CoverageInput JSON>' | npm run coverage-table
> ```
>
> **CoverageInput 形状：**
>
> ```json
> {
>   "entries": [
>     {
>       "signaturePath": "T",
>       "files": ["Header.tsx"],
>       "components": ["Header"],
>       "status": "covered"
>     },
>     {
>       "signaturePath": "O.modal",
>       "files": [],
>       "components": [],
>       "status": "pending",
>       "note": "out of scope"
>     }
>   ]
> }
> ```

# 输出与写入工作流

在代码生成规划之后使用。

## 目录树优先

在代码块或文件写入之前始终输出目录树。

规则：

- 每个文件行有 `#` 注释描述职责。
- 标记哪些文件随 `status`/`step` 变化、哪些静态。
- 将 Image Connect 复用组件提及为 import，非生成文件。
- 若 `asset-handling.md` 产出 pending 资源，包含 `asset-ledger.md`。
- 若 `style-connect.md` 产出 pending token 决策，包含 `token-ledger.md`。

## 覆盖表

树之后运行 `coverage-table.md` 并包含 signature 覆盖表。

## 输出模式

| 模式        | 动作                          |
| ----------- | ----------------------------- |
| Chat output | 直接打印 skeleton；不创建文件 |
| Write files | 写入前检查冲突                |
| Unspecified | 默认 chat output              |

写入任何文件前，检查目标是否已存在。若有冲突，询问：

```text
Existing files conflict with the planned output.
Please choose:
A. Overwrite all
B. Skip existing files and create only missing files
C. Cancel file writing and output to chat instead
```

## 可选渲染验证

仅在 write-file mode 下，当项目有 Storybook 或安全 Vite preview 路由且用户未要求跳过验证时，运行 `render-verification.md`。

## 退出

以以下之一退出：

- Chat 渲染的目录树、覆盖表、asset ledger（如有 pending）、token ledger（如有 pending）与 skeleton 代码；或
- 已写入文件、覆盖表、asset ledger 路径（如有 pending）、token ledger 路径（如有 pending）及可选渲染验证报告。
