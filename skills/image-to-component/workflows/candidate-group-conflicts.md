# 候选组冲突

在所有 signature 收集完成后使用本工作流。不要在文件名预分组期间运行。

## 触发条件

存在冲突当：

- 两个及以上候选组具有不同结构 skeleton，且
- 每个冲突候选组含多于 1 张图。

单张孤立图不是冲突。按结构 skeleton 将单图匹配到最近候选组。若无组匹配，视为独立组件候选。

## 必需 Prompt

```text
Merging found multiple candidate groups with different structural skeletons; cannot auto-merge.

Candidate group 1 (N images): <filename list>  Structural skeleton: <skeleton signature>
Candidate group 2 (N images): <filename list>  Structural skeleton: <skeleton signature>

Please choose:
A. Split by component, generate independent code skeletons for each
B. Treat as a state set of the same component, force merge
C. Process only a specified subset of files. List filenames directly,
   e.g.: pending.png, used.png, expired.png
   The model will restart from file listing and only process these files.
```

## 结果

| 用户选择 | 动作                                                     |
| -------- | -------------------------------------------------------- |
| A        | 对每个候选组分别运行 prop 建模与代码生成                 |
| B        | 合并所有 signature，将所有差异建模为 props/status 并继续 |
| C        | 仅用用户列出的文件名重启文件列表处理                     |

## 护栏

- 不要静默合并冲突的多图组。
- 未经用户显式选择不要丢弃组。
- 除非所选结果需要重启子集，否则不要重新读图。
