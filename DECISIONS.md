# 架构分析与注释决策记录

本文档记录在自动化文档生成过程中的决策和假设。

## 环境探测结果

**包管理器**：npm (检测到 package-lock.json)
**Monorepo工具**：npm workspaces (package.json workspaces 字段)
**脚本命令**：

- lint: `npm run lint`
- typecheck: `npm run typecheck`
- test: `npm run test:all`
- format: `npm run format` / `npm run format:check`

## 架构理解决策

### 系统定位

**决策**：定义为"设计源到组件转换的AI工具集"
**备选**：通用前端开发工具、设计规格管理平台
**依据**：README.md:3描述"包含AI skills与动手samples的monorepo"，主要skill都围绕设计转换

### 核心模块分层

**决策**：采用CLI→Provider→Core→IR→Utils五层架构
**备选**：MVC三层、微服务架构
**依据**：packages/d2c-core/src/index.ts:6-12 明确导出 ir/provider/preview/semantic/contract/codegen/utils 分层模块

### d2c-core定位

**决策**：作为设计转组件的共享内核和IR标准定义者
**备选**：普通工具库、业务逻辑集合
**依据**：packages/d2c-core/README.md:16 "provider 中立的契约与确定性共享管线辅助工具"

### 管线设计模式

**决策**：六阶段确定性管线（Stage 0-6: Extract→Normalize→IR→Preview→Contract→Codegen）
**备选**：单步转换、规则引擎
**依据**：d2c-core/README.md 详细描述各阶段职责，skills/sketch-to-component 实现了完整管线

### 技术栈与依赖

**决策**：TypeScript + Zod + Vitest 为主栈，支持多框架（React/Vue）输出
**依据**：

- 多个 package.json 显示 TypeScript、Zod 依赖
- d2c-core/README.md 明确提到 Zod 校验器
- scripts 目录使用 vitest 测试框架

## 注释策略决策

### 语言选择

**决策**：源码注释使用简体中文
**依据**：任务明确要求"文档与注释一律简体中文"

### 注释重点

**决策**：优先注释WHY而非WHAT，聚焦高价值节点
**备选**：详尽注释所有函数、仅注释公共API
**依据**：遵循任务要求，避免// 获取配置等无价值注释

### 覆盖范围

**决策**：仅覆盖CLI入口、Provider、Core层关键模块
**备选**：全量注释、仅注释复杂逻辑
**依据**：任务限制改动范围为高价值节点，避免无意义改动

## 基线问题记录

**原有失败**：

- design-to-spec/package-hygiene.test.js：Node.js 18 兼容性问题 (node:fs/promises glob API)
- html-article-to-markdown 测试文件缺失问题
  **决策**：按全局约束，不修复原有问题，仅在 PR Risks 中记录
