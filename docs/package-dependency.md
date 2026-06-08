# 包依赖关系

## Workspace结构

基于npm workspaces的monorepo组织，包含以下workspace：

```mermaid
graph TB
    subgraph "Root Workspace"
        A[skill-collections]
    end
    
    subgraph "Core Packages"
        B[@skill-collections/d2c-core]
    end
    
    subgraph "Skills"
        C[design-to-spec]
        D[html-article-to-markdown] 
        E[image-to-component-scripts]
        F[@skill-collections/sketch-to-component-scripts]
    end
    
    subgraph "Samples"
        G[search-panel]
        H[feedback-form]
    end
    
    subgraph "Fixtures"
        I[react-vite]
    end
    
    A --> B
    A --> C
    A --> D
    A --> E
    A --> F
    A --> G
    A --> H
    A --> I
```

## 依赖分析

基于madge工具生成的实际依赖关系：

### design-to-spec模块依赖
```
validate-contracts.js
├── lib/cli.js (参数解析)
├── lib/json-schema.js (Schema验证)
└── lib/yaml.js (YAML处理)

generate-output.js  
├── lib/cli.js
└── lib/yaml.js

validate-output.js
├── lib/cli.js
└── lib/yaml.js
```

### html-article-to-markdown模块依赖
```
cli.js
├── fetcher/fetchUrl.js
├── index.js (主处理逻辑)
├── verify/formatVerification.js
└── verify/verifyMarkdown.js

index.js
├── images/imageResolver.js
├── markdown/htmlToMarkdown.js
├── metadata.js
├── utils/html.js
└── utils/slug.js
```

## 依赖类型分析

### 直接依赖
- **生产依赖**：js-yaml, zod (核心运行时)
- **开发依赖**：typescript, vitest, eslint (开发工具链)

### 内部依赖
- **d2c-core** → 其他skill包的共享依赖
- **utils模块** → 各skill内部的工具函数复用

### 外部依赖
- **Node.js内置模块**：fs, path, url等
- **第三方包**：最小依赖原则，避免重型框架

## 依赖管理策略

1. **版本锁定**：使用package-lock.json确保一致性
2. **workspace提升**：公共依赖在root级别管理  
3. **按需安装**：各skill仅包含必要依赖
4. **兼容性约束**：Node ≥18/20要求

## 潜在依赖问题

1. **版本冲突**：不同skill对同一包的版本要求
2. **循环依赖**：当前分析未发现，需持续监控
3. **依赖膨胀**：随skill增加可能引入重复功能的包