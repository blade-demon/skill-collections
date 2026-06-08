# 系统架构

## 概览

skill-collections是一个设计源到组件转换的AI工具集monorepo，实现从各种设计输入（UI稿、截图、Sketch文件、HTML）到可用组件的自动化转换。

## 系统分层架构

```mermaid
graph TB
    subgraph "CLI层"
        A1[d2s-validate-contracts]
        A2[d2s-generate-output]
        A3[html-article-to-markdown]
    end

    subgraph "Command层"
        B1[参数解析 cli.js]
        B2[输入验证]
        B3[错误处理]
    end

    subgraph "Service层"
        C1[设计解析服务]
        C2[规格生成服务]
        C3[组件合成服务]
        C4[预览服务]
    end

    subgraph "Core层 d2c-core"
        D1[Design IR]
        D2[Provider接口]
        D3[Contract定义]
        D4[Preview管线]
        D5[Codegen核心]
    end

    subgraph "Infrastructure层"
        E1[YAML处理]
        E2[JSON Schema验证]
        E3[文件系统操作]
        E4[工具库]
    end

    A1 --> B1
    A2 --> B1
    A3 --> B1
    B1 --> C1
    B2 --> C2
    B3 --> C3
    C1 --> D1
    C2 --> D2
    C3 --> D3
    C4 --> D4
    D1 --> E1
    D2 --> E2
    D3 --> E3
```

## 关键路径分析

### 设计到规格转换路径

`packages/d2c-core/src/index.ts:6` → IR模块 → Provider接口 → Contract生成

### 命令行处理路径

`skills/design-to-spec/scripts/lib/cli.js:1` → parseArgs → Service调用

### 预览生成路径

Preview模块 → HTML渲染 → 保真度验证

## 设计原则

1. **确定性管线**：每个阶段输出可预测，避免随机性
2. **分离关注点**：设计解析、业务逻辑、输出生成独立
3. **可测试性**：每层都有对应测试覆盖
4. **增量改进**：支持阶段性门禁和IR保真审计

## 技术债识别

基于madge依赖分析和代码审查，当前主要技术债：

1. **循环依赖**：未发现明显循环依赖
2. **重复逻辑**：多个skill中存在类似的CLI参数处理模式
3. **抽象层次**：Provider接口实现较为分散
4. **扩展瓶颈**：新skill接入需要较多样板代码
