# Demo React Spring Auth Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 demo 的内存鉴权改为可跨重启验证的签名 token 与 H2 文件库，并让前端调用 profile、改密后保持登录态。

**Architecture:** 使用纯 Java `SignedTokenCodec` 完成 HMAC-SHA256 token 的签发与校验，由 Spring `SignedTokenService` 负责配置注入。前端通过现有 Axios 实例加载 profile，改密成功只更新页面状态；所有文档随后根据新代码证据重建。

**Tech Stack:** Java 8、Spring Boot 2.7、JCA `Mac`、H2、React 16、TypeScript、Axios、Jest、Mermaid

---

### Task 1: 签名 token 回归测试

**Files:**
- Create: `demo-react-spring/backend/src/test/java/com/example/demo/auth/SignedTokenCodecTest.java`
- Create: `demo-react-spring/backend/src/main/java/com/example/demo/auth/SignedTokenCodec.java`

- [x] **Step 1: 写入失败测试**

测试固定时钟下的签发/解析、过期、篡改和重启后用相同密钥解析。

- [x] **Step 2: 验证测试因实现缺失而失败**

Run:

```bash
mvn -f demo-react-spring/backend/pom.xml \
  -Dtest=SignedTokenCodecTest test
```

Expected: FAIL，因为 `SignedTokenCodec.java` 尚不存在。

- [x] **Step 3: 实现最小 token codec**

使用 URL-safe Base64、`HmacSHA256` 与常量时间签名比较；格式错误、签名错误和过期均返回 `null`。

- [x] **Step 4: 编译并运行测试**

Run:

```bash
mvn -f demo-react-spring/backend/pom.xml \
  -Dtest=SignedTokenCodecTest test
```

Expected: 4 个 `SignedTokenCodecTest` 用例通过。

### Task 2: Spring 鉴权与 H2 持久化

**Files:**
- Delete: `demo-react-spring/backend/src/main/java/com/example/demo/auth/TokenStore.java`
- Create: `demo-react-spring/backend/src/main/java/com/example/demo/auth/SignedTokenService.java`
- Modify: `demo-react-spring/backend/src/main/java/com/example/demo/auth/AuthService.java`
- Modify: `demo-react-spring/backend/src/main/java/com/example/demo/config/AuthInterceptor.java`
- Modify: `demo-react-spring/backend/src/main/resources/application.yml`

- [x] **Step 1: 用 `SignedTokenService` 包装 codec**

构造函数从 `demo.auth.token-secret` 和 `demo.auth.token-ttl-ms` 注入配置，保留现有 `issue` / `resolve` 调用形状。

- [x] **Step 2: 替换依赖**

`AuthService` 和 `AuthInterceptor` 改为依赖 `SignedTokenService`，删除内存 `TokenStore`。

- [x] **Step 3: 改为 H2 文件 URL**

配置 `jdbc:h2:file:./data/demo`，并为本地 demo 提供可由 `DEMO_AUTH_TOKEN_SECRET` 覆盖的固定开发密钥。

- [x] **Step 4: 编译后端**

优先使用系统或 IDE 内置 Maven：

```bash
mvn -f demo-react-spring/backend/pom.xml test
```

若环境无 Maven，则明确记录无法执行后端测试。

### Task 3: 前端 profile 与改密登录态

**Files:**
- Create: `demo-react-spring/frontend/src/api/auth.test.js`
- Modify: `demo-react-spring/frontend/src/api/auth.js`
- Modify: `demo-react-spring/frontend/src/pages/ChangePasswordPage.tsx`

- [x] **Step 1: 写入失败的 profile API 测试**

断言 `getProfile()` 调用 `http.get('/user/profile')` 并返回其结果。

- [x] **Step 2: 验证测试因导出缺失而失败**

Run:

```bash
CI=true npm test -- --watchAll=false src/api/auth.test.js
```

Workdir: `demo-react-spring/frontend`

Expected: FAIL，提示 `getProfile is not a function`。

- [x] **Step 3: 实现 profile API 与页面行为**

页面挂载调用 `getProfile()`；改密成功清空密码输入框并显示“修改成功，当前登录态已保留”，不调用 `clearSession` 或路由跳转。

- [x] **Step 4: 运行前端测试与构建**

Run:

```bash
CI=true npm test -- --watchAll=false src/api/auth.test.js
npm run build
```

Expected: 测试和构建均成功。

### Task 4: 重建代码证据与 Mermaid

**Files:**
- Modify: `demo-react-spring/README.md`
- Modify: `demo-react-spring/docs/.analysis/*.md`
- Modify: `demo-react-spring/docs/*.md`

- [x] **Step 1: 更新分析证据**

将 profile 映射到 `ChangePasswordPage → getProfile → GET /api/user/profile`；将 token 结论更新为 HMAC 签名校验；将数据源更新为 H2 文件库；将改密成功路径更新为保留登录态。

- [x] **Step 2: 更新完整运行时交互 Mermaid**

架构图绘制浏览器、前端 API/状态、Controller、Interceptor、Service、签名校验和 H2 文件库之间代码可证实的运行时调用，不添加部署或外部系统推测。

- [x] **Step 3: 严格校验文档**

Run:

```bash
node skills/react-spring-project-doc/scripts/validate-docs.js \
  --project demo-react-spring \
  --symbols \
  --strict
```

Expected: Mermaid、路径、符号和 Evidence 校验通过。

### Task 5: 浏览器验证

**Files:**
- Verify only

- [x] **Step 1: 启动可运行的前后端**

使用项目已有启动命令；如已有服务运行，则刷新到最新代码。

- [x] **Step 2: 验证 profile 与改密流程**

注册或登录后进入改密页，确认页面请求 profile；改密成功后仍停留在改密页且 token 保留；刷新页面仍可读取 profile。

- [x] **Step 3: 验证重启持久化**

重启后端后，用原 token 请求 profile，并用新密码重新登录；确认 token 与 H2 用户数据均跨重启保留。
