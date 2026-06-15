# Demo React Spring Auth Persistence Design

## 目标

修复 `demo-react-spring` 当前代码可证实的三个运行时问题：

1. 前端实际调用 `GET /api/user/profile`，用后端登录态初始化改密页用户名。
2. 登录 token 改为 HMAC 签名 token，服务重启后在密钥不变且 token 未过期时继续有效。
3. 改密成功后保留当前登录态，不清理 token、不跳转登录页。

同时将 H2 从内存库改为文件库，使用户与密码变更在后端重启后继续存在。

## 方案

### 签名 token

新增无 Spring 依赖的 `SignedTokenCodec`，token 格式为：

```text
base64url(username).expiresAtEpochMs.base64url(hmacSha256(payload))
```

签名覆盖用户名编码与过期时间。解析时先使用 `MessageDigest.isEqual` 验证签名，再解析用户名和过期时间。`SignedTokenService` 负责从 Spring 配置读取密钥与 TTL，并向 `AuthService`、`AuthInterceptor` 暴露 `issue` / `resolve`。

签名 token 不保存服务端会话，因此没有单 token 注销能力。按已确认的产品行为，改密不会使当前 token 失效；token 仅在过期、签名错误或格式错误时失效。

### H2 文件库

数据源改为：

```yaml
jdbc:h2:file:./data/demo
```

JPA 继续使用 `ddl-auto: update`。数据库文件相对后端进程工作目录创建，后端重启后继续使用同一文件。

### 前端交互

`auth.js` 新增 `getProfile()`，`ChangePasswordPage` 挂载时调用它获取当前用户名。请求仍通过公共 `http` 实例自动携带 `X-Token`。

改密成功后清空两个密码输入框并显示成功提示，但不调用 `clearSession()`，也不执行路由跳转。公共响应拦截器的 `401` 清理与跳转逻辑保持不变。

### 文档证据

重新检查 `docs/.analysis/` 与最终文档，更新旧的内存 token、内存 H2、profile 未调用和改密强制登出结论。交互架构 Mermaid 只绘制修改后代码可以直接证明的调用与状态变化。

