# 变更日志 — react-spring-project-doc

所有重要变更均记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本管理遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 子段约定

每个版本（包括 `[Unreleased]`）必须显式包含以下三个 **升级影响** 子段，即使内容是「无」：

- `### Breaking` — 不向后兼容的阶段产物结构 / 记录格式 / 输出文件变化。**为空写「无」**，不允许省略。
- `### Migration` — 旧版本升级到本版本的迁移步骤；与 Breaking 配对。无破坏性变更时也写「无」。
- `### Removed` — 删除的模板、schema、文件或字段。

升级者只需 grep 这三段即可判断是否安全升级。其余子段（`### Added` / `### Changed` / `### Fixed` / `### Deprecated`）按 Keep a Changelog 标准用法。

---

## [Unreleased]

### Breaking

无。

### Migration

无。

### Removed

无。

### Changed

- 基于一次真实 demo（React 16 JS/TS 混合 + Spring Boot 登录/注册/改密）的全流程试跑，加固 4 处模板：
  - `templates/05-business-flow.md`：强调每个环节 `path:line` 必须用 Grep/`rg` 现查现填，禁止凭记忆（试跑中记忆行号确有漂移）。
  - `templates/08-validation.md`：新增「工具核对本身要自检」提示，列出 `rg -o` 多文件前缀、`js` 抢匹配 `.json`、`class User` 子串命中 `UserContext` 三类常见误差，先复核命令再判「不通过」。
  - `templates/01-discovery.md`：构建命令表补「前端类型检查」一行。
  - `templates/04-api-map.md`：接口多时提示按模块分块或拆「核心+附录」表，改善宽表可读性。

---

## [0.1.0] — 2026-06-14

文档型最小可用版本（MVP）。

### Breaking

无（首个版本）。

### Migration

无（首个版本）。

### Removed

无。

### Added

- `SKILL.md` — 8 阶段流水线主控：阶段总览、中断恢复协议、证据账本与置信度规则、每阶段执行说明、汇报格式、资源清单、反模式。
- `templates/01-discovery.md` ~ `templates/08-validation.md` — 8 个阶段产物的章节骨架。
- `schemas/evidence-record.md` / `api-map-record.md` / `business-flow-record.md` / `validation-record.md` — 4 类记录的字段格式与规则。
- `examples/evidence-ledger-example.md` / `api-map-example.md` / `business-flow-example.md` — 共用「订单」虚构域的填好样例。
- `references/confidence-and-evidence.md` / `phase-resume-guide.md` — 置信度纪律与中断恢复/取材策略。
- `README.md` — 使用指南。

### 说明

- 本版本不含独立校验脚本；P8 强校验由模型按 `templates/08-validation.md` 的 checklist 用 Glob/Grep/运行命令执行。是否引入 `scripts/` 待真实项目跑通后评估。
