# Coarse Signature 返回格式

仅用于 `workflows/large-directory.md` 的大目录 Stage A 预扫描。

目标是低成本分组，非最终组件建模。Coarse signature 不得替代完整 signature 用于 Step 6 对比、prop 定义、代码生成或覆盖表。

## 契约

仅返回 JSON。不要用 markdown、代码围栏、标题、注释或散文包裹。

```json
{
  "batch": "batch-1",
  "images": [
    {
      "filename": "pending.png",
      "coarse_signature": {
        "T": ["nav", "title"],
        "M": ["card"],
        "B": ["action"]
      },
      "needs_full_signature": true,
      "reason": "slot contains nested container"
    }
  ]
}
```

## 字段

| 字段                   | 必填 | 类型    | 规则                                        |
| ---------------------- | ---: | ------- | ------------------------------------------- |
| `batch`                |  yes | string  | 须匹配派发的 Stage A batch id。             |
| `images`               |  yes | array   | 每个输入路径恰好一个对象。                  |
| `filename`             |  yes | string  | 仅 basename。                               |
| `coarse_signature`     |  yes | object  | 恰好 `T`、`M`、`B`；Stage A 无 `O` 或 `F`。 |
| `needs_full_signature` |  yes | boolean | 该图须进入 Stage B 时为 `true`。            |
| `reason`               |  yes | string  | 下方 allowlisted reason 之一。              |

每个 `coarse_signature` slot 为仅含顶层 role 词的数组。不得含嵌套 role、运算符、容器、notes、文案或 visual 样式。

允许的 role 词与 `signature-spec.md` 相同：`nav`、`title`、`meta`、`media`、`form`、`list`、`card`、`action`、`status`、`hint`、`brand`、`empty`。

允许的 `reason` 值：

- `stable top-level skeleton`
- `slot contains nested container`
- `candidate group inconsistent`
- `user requested full signature`
- `uncertain top-level role`

## 校验

派发方经 `npm run validate-coarse` 运行 `scripts/src/validate-coarse.ts` 校验返回。确保输出为裸 JSON 且所有字段齐全即可。

## Stage B 选择

所有 Stage A batch 校验后，选择 Stage B 文件：

- 每个 `needs_full_signature: true` 的图。
- coarse signature 不一致的候选组中每张图。
- 用户显式请求的每个文件。
- 每个将生成代码的稳定 coarse 组至少一名代表。

仅 Stage B 完整 signature 进入 Step 6 及后续步骤。
