# 架构分析与注释决策记录

本文档记录在自动化文档生成过程中的决策和假设。

## 架构理解决策

### 系统定位

**决策**：定义为"设计源到组件转换的AI工具集"
**备选**：通用前端开发工具、设计规格管理平台
**依据**：README.md:3描述"包含AI skills与动手samples的monorepo"，主要skill都围绕设计转换

### 核心模块分层

**决策**：采用CLI→Command→Service→Core→Infrastructure五层架构
**备选**：MVC三层、微服务架构
**依据**：观察到清晰的命令行入口(bin字段)→脚本层→核心包→工具库的调用链

### d2c-core定位

**决策**：作为设计转组件的共享内核和IR标准定义者
**备选**：普通工具库、业务逻辑集合
**依据**：packages/d2c-core/package.json:5描述"canonical IR schema, validators"

### 管线设计模式

**决策**：多阶段确定性管线（Extract→Normalize→IR→Preview→Contract→Codegen）
**备选**：单步转换、规则引擎
**依据**：skills/sketch-to-component/docs/多文档描述Stage 0-6的阶段式处理

## 注释策略决策

### 语言选择

**决策**：源码注释使用简体中文
**依据**：任务明确要求"文档与注释一律简体中文"

### 注释重点

**决策**：优先注释WHY而非WHAT，聚焦高价值节点
**备选**：详尽注释所有函数、仅注释公共API
**依据**：遵循任务要求，避免// 获取配置等无价值注释

### 覆盖范围

**决策**：仅覆盖CLI入口、Command、Service、Core层关键模块
**备选**：全量注释、仅注释复杂逻辑
**依据**：任务限制改动范围为高价值节点，避免无意义改动
