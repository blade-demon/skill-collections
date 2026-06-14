# Phase 1 — Discovery 报告模板

> 落盘到 `docs/.analysis/01-discovery-report.md`。
> 本阶段只**建立地图**：定位文件、记录技术栈与目录结构。不写最终文档，不改业务代码，不深入逐方法分析。
> 每一项「位置」都写**相对项目根的真实路径**；找不到就写「未发现」，不要编造。不确定的进「待确认项」。

## 1. 项目概览

- 项目名称：<从 README / package.json / pom.xml 读取>
- 一句话用途：<README 首段，或标注「README 未说明，推测：…」>
- 仓库形态：<单体 / 前后端同仓 / 多模块 / monorepo>
- 主要语言与版本：<前端 Node 版本（.nvmrc / engines）；后端 JDK 版本（pom/gradle）>

## 2. 技术栈

| 维度         | 技术                                    | 证据文件                 |
| ------------ | --------------------------------------- | ------------------------ |
| 前端框架     | <React 版本 / CRA / Vite / Next>        | `<path>`                 |
| 前端路由     | <react-router 版本 / 其他>              | `<path>`                 |
| 前端状态管理 | <Redux / Zustand / Context / 其他 / 无> | `<path>`                 |
| 前端请求库   | <axios / fetch 封装 / 其他>             | `<path>`                 |
| 后端框架     | <Spring Boot 版本>                      | `pom.xml`/`build.gradle` |
| 持久层       | <MyBatis / JPA / JdbcTemplate>          | `<path>`                 |
| 数据库       | <MySQL / PostgreSQL / 其他，能确认时>   | `<配置文件 path>`        |
| 构建工具     | <前端 npm/pnpm/yarn；后端 maven/gradle> | `<path>`                 |

## 3. 关键文件定位

> 只定位与速读，不逐行分析。每行给真实路径。

### 前端

- 入口：`<src/main.tsx / src/index.js>`
- 路由定义：`<path>`
- API 封装/请求实例：`<path（axios 实例、baseURL、拦截器所在）>`
- 状态管理入口：`<path 或「无」>`
- 环境变量/构建配置：`<.env* / vite.config / package.json scripts>`

### 后端

- Spring Boot 启动类：`<…Application.java>`
- Controller 目录：`<path>`
- Service 目录：`<path>`
- Repository/Mapper/DAO 目录：`<path>`
- Entity/DTO/VO 目录：`<path>`
- Config/Interceptor/Filter/ExceptionHandler：`<path 列表>`
- 配置文件：`<application.yml / application.properties / bootstrap.yml>`

## 4. 测试与质量

- 前端测试目录/框架：`<path / 框架 / 「未发现」>`
- 后端测试目录/框架：`<src/test/... / JUnit 版本 / 「未发现」>`
- Lint / typecheck / format 配置：`<eslint / tsconfig / checkstyle / spotless / 「未发现」>`

## 5. 构建与运行命令（先记录，P8 再验证可执行性）

| 用途     | 命令                                | 来源                     |
| -------- | ----------------------------------- | ------------------------ |
| 前端安装 | `<npm install / pnpm i>`            | `package.json`           |
| 前端启动 | `<npm run dev>`                     | `package.json` scripts   |
| 前端构建 | `<npm run build>`                   | `package.json` scripts   |
| 后端构建 | `<mvn package / gradle build>`      | `pom.xml`/`build.gradle` |
| 后端启动 | `<mvn spring-boot:run / java -jar>` | <来源>                   |

## 6. 部署与环境

- 部署方式：<Dockerfile / docker-compose / k8s / Jenkinsfile / CI 配置 / 「未发现」>
- 环境区分：<dev/test/prod profile 来源，或「未发现」>
- 前后端联调方式：<前端 proxy / nginx / 网关前缀，或「待确认」>

## 7. 初步业务模块猜测

> 仅根据目录/命名做**初步**猜测，标注为推测，供 P2/P3 细化。不在此处下结论。

- <模块猜测 1> —— 推测依据：<目录名/路由名/包名>
- <模块猜测 2> —— 推测依据：<…>

## 8. 待确认项

1. <Phase 1 无法确认、需后续阶段或人工澄清的点>
2. <…>
