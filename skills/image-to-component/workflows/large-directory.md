# 大目录工作流

在列出目标目录之后、派发任何 signature 子 agent 之前使用本工作流。

## 触发条件

- 0 张图：停止并请求含截图的目录。
- 1–20 张：正常分批继续。
- 21–50 张：除非用户过滤为更小子集，否则使用分阶段读取。
- 超过 50 张：永不自动对整目录做扁平全量 pass。须过滤子集或经用户确认的分阶段计划。

## 21–50 张：两阶段读取

询问：

```text
The directory contains <N> images. Please choose:
A. Proceed with staged analysis for all <N> images.
B. Provide a filtered subset (list filenames, comma-separated; e.g., pending.png, used.png, expired.png).
C. Cancel.
```

若用户选 A，运行：

| Stage   | 范围       | Signature 深度                 | 目的                   |
| ------- | ---------- | ------------------------------ | ---------------------- |
| Stage A | 每张图     | 仅 T/M/B 顶层 role；不展开容器 | 低成本构建 coarse 组   |
| Stage B | 仅选定图片 | 完整 signature-spec signature  | 消解歧义并支持代码生成 |

Stage B 仅包括：

- 不一致的 coarse 组。
- 嵌套容器不清晰的 coarse signature。
- 用户显式请求的文件。
- 每个将生成代码的稳定 coarse 组至少一名代表。

Stage A 派发使用 `../prompts/coarse-signature-prompt.md`，用 `protocols/coarse-signature-format.md` 校验。Stage A 仅返回 `T`/`M`/`B` 顶层 role 数组及 `needs_full_signature`；不得返回完整 slot 表达式。

不要将 Stage A coarse signature 当作最终证据对比。它们仅决定哪些文件需要完整 signature。

## 超过 50 张

询问：

```text
The directory contains <N> images, which is too large for automatic full-directory processing.
Please choose:
A. Provide a filtered subset (list filenames, comma-separated; e.g., pending.png, used.png, expired.png).
B. Approve a staged plan: coarse scan all files, then full signatures only for ambiguous groups and selected representatives.
C. Cancel.
```

若用户选 B，重述分阶段计划及预期 batch 数，派发前等待确认。

## 文件名预分组

超过 5 张选定图片时，分批前预分组文件名：

| 规则                                                                     | 分组方法       |
| ------------------------------------------------------------------------ | -------------- |
| 文件名含状态关键词（`pending`、`used`、`expired`、`active`、`disabled`） | 同一候选状态组 |
| 文件名含序列关键词（`page1`、`page2`、`step1`、`step2`）                 | 同一候选序列组 |
| 其他所有文件                                                             | 字母序填充     |

候选组为语义提示。读取 batch 为最多 5 张图的运营单元。若候选组超过 5 张，拆成多个读取 batch，但保留一个候选组标签。

## 退出

以以下之一退出本工作流：

- 过滤后的文件名集，或
- 已确认的分阶段计划，或
- 取消。

然后继续 signature 派发。
