# 新手入门指南

## 快速开始

### 1. 环境准备

```bash
# 检查Node版本 (需要 >= 20)
node --version

# 克隆仓库
git clone <repository-url>
cd skill-collections

# 安装依赖
npm ci

# 安装fixture应用依赖
npm ci --prefix fixtures/apps/react-vite

# 安装Git hooks
npx lefthook install
```

### 2. 验证安装

```bash
# 运行完整检查
npm run check

# 分步验证
npm run lint          # 代码规范检查
npm run typecheck     # 类型检查
npm run test:all      # 运行所有测试
npm run build:samples # 构建示例项目
```

### 3. 试用核心功能

#### design-to-spec技能测试
```bash
# 验证示例契约
cd skills/design-to-spec
npm run smoke

# 运行完整测试套件  
npm test
```

#### html-article-to-markdown技能测试
```bash
# 转换示例HTML
cd skills/html-article-to-markdown
npm run build
npm test
```

## 项目结构导览

```
skill-collections/
├── packages/d2c-core/     # 共享核心库
├── skills/                # AI技能实现
│   ├── design-to-spec/    # UI设计稿→规格生成
│   ├── image-to-component/ # 截图→组件骨架  
│   ├── sketch-to-component/ # Sketch文件处理
│   └── html-article-to-markdown/ # HTML→Markdown
├── samples/               # 实战应用示例
│   └── design-to-spec/   
│       ├── search-panel/  # 搜索面板示例
│       └── feedback-form/ # 反馈表单示例
├── fixtures/              # 测试夹具应用
└── docs/                  # 文档目录
```

## 新增技能的最短路径

### 1. 创建技能目录结构
```bash
mkdir -p skills/your-skill/{src,tests,docs,examples}
cd skills/your-skill
```

### 2. 初始化package.json
```json
{
  "name": "your-skill",
  "version": "0.1.0", 
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js",
    "typecheck": "tsc --noEmit"
  }
}
```

### 3. 实现核心文件
- `SKILL.md` - Claude Code技能定义
- `README.md` - 人类阅读文档  
- `src/index.js` - 主要实现逻辑
- `tests/basic.test.js` - 基础测试用例

### 4. 集成到根workspace
在根`package.json`中添加相应的npm scripts：
```json
{
  "scripts": {
    "test:your-skill": "npm test --workspace your-skill"
  }
}
```

### 5. 验证集成
```bash
# 从根目录运行新技能测试
npm run test:your-skill

# 确保完整检查通过
npm run check
```

## 开发工作流

### 日常开发
```bash
# 代码修改后运行
npm run lint:fix      # 自动修复代码规范问题
npm run format        # 格式化代码
npm run typecheck     # 检查类型
npm run test:all      # 运行相关测试
```

### 提交前检查
```bash
# 完整质量门禁 (等价于CI检查)
npm run check:full
```

### 调试fixture应用
```bash
# 启动React测试应用
npm run dev:fixture:react
# 访问 http://localhost:5173
```

## 常见问题解决

### Node版本不兼容
```bash
# 升级到Node 20+
nvm install 20
nvm use 20
```

### 依赖安装失败
```bash  
# 清理缓存重新安装
rm -rf node_modules package-lock.json
npm ci
```

### 测试失败
```bash
# 检查基线状态 - 某些测试在Node 18下已知失败
# 参考 docs/architecture.md 中的技术债说明
```

## 进阶学习资源

- **设计到规格流程**：`skills/design-to-spec/ONBOARDING.md`
- **架构设计理念**：`docs/design-source-to-component-architecture.md`
- **实施计划追踪**：`docs/design-source-to-component-implementation-plan.md`
- **贡献指南**：`CONTRIBUTING.md`