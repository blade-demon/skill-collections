'use strict';

/*
 * extract-endpoints.js 冒烟测试（零依赖，node 直接跑）：
 *   node scripts/tests/extract-endpoints.test.js
 * 在临时目录造迷你 Controller + 前端调用，断言：
 * ① 类级前缀 + 方法级路径拼接；② 五种 HTTP 注解；③ @RequestMapping 方法判定；
 * ④ 动态路径/URL 进 needs-review；⑤ axios/实例/fetch 调用抽取；⑥ file:line；⑦ 测试文件被跳过。
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  joinUrl,
  extractMappingPath,
  requestMappingMethod,
  isTestPath,
  parseJavaFile,
  extract,
} = require('../extract-endpoints');

function mk(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// 纯函数单测
assert.strictEqual(joinUrl('/api/orders', '{id}'), '/api/orders/{id}', 'URL 拼接应规范化斜杠');
assert.strictEqual(joinUrl('', '/login'), '/login', '空前缀拼接');
assert.deepStrictEqual(extractMappingPath('"/x"'), { path: '/x', dynamic: false });
assert.deepStrictEqual(
  extractMappingPath('ORDER_PATH'),
  { path: '', dynamic: true },
  '常量路径=动态',
);
assert.deepStrictEqual(extractMappingPath('"/x/${v}"').dynamic, true, '含 ${} 为动态');
assert.strictEqual(requestMappingMethod('method = RequestMethod.POST'), 'POST');
assert.strictEqual(requestMappingMethod('"/x"'), 'ANY', '无单一方法 → ANY');
assert.ok(isTestPath('frontend/src/api/http.test.ts'), '*.test.ts 应判为测试文件');
assert.ok(!isTestPath('frontend/src/api/http.ts'), '普通源码不应判为测试文件');

// parseJavaFile 直测：类前缀 + 方法路径 + 行号
const javaSrc = [
  '@RestController',
  '@RequestMapping("/api/orders")',
  'public class OrderController {',
  '  @GetMapping',
  '  public List<Order> list() { return null; }',
  '',
  '  @PostMapping("/create")',
  '  public Order create(@RequestBody OrderRequest req) { return null; }',
  '}',
].join('\n');
const javaOut = parseJavaFile('backend/OrderController.java', javaSrc);
const list = javaOut.find((x) => x.handler === 'OrderController.list');
const create = javaOut.find((x) => x.handler === 'OrderController.create');
assert.ok(list && list.method === 'GET' && list.url === '/api/orders', 'GET list 拼到类前缀');
assert.ok(
  create && create.method === 'POST' && create.url === '/api/orders/create',
  'POST create 拼前缀+方法路径',
);
assert.strictEqual(create.line, 7, 'create 的行号应为注解所在行');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rspd-extract-'));
try {
  // 后端：含一个动态路径接口
  mk(
    tmp,
    'backend/src/main/java/com/example/UserController.java',
    [
      '@RestController',
      '@RequestMapping("/api/users")',
      'public class UserController {',
      '  @GetMapping("/{id}")',
      '  public User get(@PathVariable Long id) { return null; }',
      '  @DeleteMapping(USER_PATH)',
      '  public void remove() {}',
      '}',
    ].join('\n'),
  );
  // 前端：axios.get / 实例 / fetch / 模板字符串(动态)
  mk(
    tmp,
    'frontend/src/api/user.ts',
    [
      "import axios from 'axios';",
      "export const getUsers = () => axios.get('/api/users');",
      'export const getUser = (id) => http.get(`/api/users/${id}`);',
      "export const delUser = (id) => fetch('/api/users/' + id, { method: 'DELETE' });",
      "const noise = map.get('key');", // 非 URL，应被忽略
    ].join('\n'),
  );
  // 测试文件应被跳过
  mk(tmp, 'frontend/src/api/user.test.ts', "axios.get('/should/be/ignored');");

  const data = extract(tmp);

  // ② 五种注解之 GET/DELETE + ④ 动态路径
  const userGet = data.backend.find((x) => x.handler === 'UserController.get');
  assert.ok(
    userGet && userGet.url === '/api/users/{id}' && userGet.method === 'GET',
    'GET /{id} 抽取',
  );
  const userDel = data.backend.find((x) => x.handler === 'UserController.remove');
  assert.ok(userDel && userDel.confidence === 'needs-review', '常量路径接口应 needs-review');

  // ⑤ 前端调用
  const fe = data.frontend;
  assert.ok(
    fe.some((x) => x.call === 'axios.get' && x.url === '/api/users' && x.confidence === 'high'),
    'axios.get 静态 URL 应 high',
  );
  const tmpl = fe.find((x) => x.url.includes('${id}'));
  assert.ok(tmpl && tmpl.confidence === 'needs-review', '模板字符串 URL 应 needs-review');
  assert.ok(
    fe.some((x) => x.call === 'fetch' && x.method === 'DELETE'),
    'fetch 的 method 选项应被解析为 DELETE',
  );
  assert.ok(!fe.some((x) => x.url === 'key'), 'map.get(非 URL) 应被忽略');

  // ⑦ 测试文件被跳过
  assert.ok(!fe.some((x) => x.url === '/should/be/ignored'), '测试文件内的调用应被跳过');

  // summary 一致
  assert.strictEqual(data.summary.backend, data.backend.length);
  assert.strictEqual(data.summary.frontend, data.frontend.length);

  console.log('✅ extract-endpoints 冒烟测试通过');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
