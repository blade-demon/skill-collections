# image-to-component 回归测试

这些 fixture 服务两类读者：

- **Golden demo**：评估 skill 的人可查看真实业务截图与预期输出形状。
- **回归清单**：编辑 `SKILL.md`、`../protocols/signature-spec.md`、`../prompts/subagent-prompt.md` 或模板的人可重跑案例并验证行为契约。

预期输出是**行为契约**，非字节级快照。模板措辞、注释与格式可演进而无需改这些文件。仅在意图 skill 行为变化时更新预期文件。

所有输入截图为 ToC 金融 App 的真实业务页面。

## 案例

| 案例                                                      | 图片数 | 覆盖的 skill 行为                                              |
| --------------------------------------------------------- | -----: | -------------------------------------------------------------- |
| [case-1-risk-assessment](case-1-risk-assessment/)         |      1 | 单页结果：nav + card + footer action，props 来自动态额度数据   |
| [case-2-fund-recommendation](case-2-fund-recommendation/) |      1 | 区块级列表：sparkline media、收藏 toggle、可变收益周期标签     |
| [case-3-index-fund](case-3-index-fund/)                   |      1 | 含 tab 导航的区块：M 中 nav slot，每行双 action（申购 + 收藏） |

## 覆盖缺口

当前案例均为单截图 → 均判为独立组件。**同一组件多状态判断**（Step 6 状态 variant 逻辑）尚未覆盖。有真实多状态截图时补充案例。

## 手动回归运行

对每个案例：

1. 在该案例的 `input/` 目录触发 `image-to-component` skill。
2. 选择：
   - Framework：React
   - Output：chat output
   - Language：TypeScript
   - Style stack：CSS Modules
3. 将生成的结构化 JSON signature 返回与 `expected-signatures.md` 对比。
4. 将结果与 `expected-output.md` 行为契约对比。

核心检查：

- [ ] 结构决策与预期一致（同一/不同组件数量）
- [ ] Signature 返回为仅 JSON，含 `batch`、`images`、`signature`、`notes`
- [ ] Props 接口匹配 must-contain 契约
- [ ] 目录树文件数与命名与预期一致
- [ ] must-not-contain 项不在输出中出现

预估时间：每案例 2–3 分钟。
