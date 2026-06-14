# react-spring-project-doc — 使用指南

> 把一个 React 前端 + Java Spring/Spring Boot 后端的项目，分阶段、基于代码证据，转换成面向新人的项目文档。

**当前版本**：`0.1.0`

## 何时使用

适合：

- 你接手/维护一个 React + Spring 的中大型项目，想给新同事一套能照着上手的文档。
- 你希望文档**基于代码证据**，而不是模型对仓库的模糊印象。
- 你用的执行模型上下文受限或能力一般，需要把任务拆成可单独执行、单独恢复、单独校验的小步。

不适合：

- 只想要一棵目录树或单文件解释。
- 纯前端或纯后端、且不关心前后端链路对齐。
- 与代码库无关的写作。

## 它产出什么

在目标项目的 `docs/` 下生成 8 份最终文档：`onboarding` / `architecture` / `frontend` / `backend` / `api-map` / `business-flows` / `data-model` / `troubleshooting`，外加一份 `validation-report.md`（强校验报告）。过程中的中间产物落在 `docs/.analysis/`，可重跑、可删除。

## 工作原理：8 阶段流水线

```
P1 探索 → P2 前端索引 → P3 后端索引 → P4 API 映射 → P5 业务链路 → P6 数据模型 → P7 文档生成 → P8 强校验
```

- 每阶段**只做一件事、只看一组相关文件**，把结论落盘到 `docs/.analysis/`。
- 每条会进文档的重要结论登记进**证据账本** `docs/.analysis/evidence-ledger.md`，附路径/行号/置信度。
- 最终文档（P7）**只装配中间产物和证据账本**，不重新读代码、不引入未登记结论。
- P8 用 Glob/Grep/跑命令对最终文档做强校验，越级写成事实的结论会被打回。

设计动机：用确定性的分阶段状态机包住不确定的 LLM 推断，防止幻觉在链路里累积成「看起来权威的错误」。

## 怎么用

1. 在目标项目根目录调用本 skill。
2. 它会先探测 `docs/.analysis/` 判断从哪个阶段开始（首次从 P1）。
3. 每完成一个阶段会落盘并停下汇报，回复「继续」进入下一阶段，或「重跑 PN」修正某阶段。
4. 中途可关闭会话；新会话发送「从 Phase N 继续」即可接上（见 `references/phase-resume-guide.md`）。

## 关键约束

- **不修改业务代码、不重构、不新增运行时依赖**——只读代码、只写 `docs/`。
- 没有证据的内容不写成事实；推测标「（推测）」；无法确认的进「待确认项」。
- 全部输出简体中文，面向新入职同事。

## 目录结构

```
react-spring-project-doc/
  SKILL.md          # 主控：8 阶段流程 + 恢复协议 + 证据/置信度规则 + 资源清单
  templates/        # 01~08，每阶段产物的章节骨架
  schemas/          # evidence / api-map / business-flow / validation 记录格式
  examples/         # 填好的证据账本 / API 映射 / 业务链路样例
  references/       # 置信度纪律、中断恢复与取材策略
  README.md / CHANGELOG.md
```

## 当前状态（v0.1.0）

文档型最小可用版本：提供 SKILL.md + 模板 + 记录格式 + 样例 + 参考文档，P8 强校验由模型按 checklist 执行（Glob/Grep/跑命令）。**暂未提供独立校验脚本**——待骨架在真实项目跑通后再评估是否引入 `scripts/`。
