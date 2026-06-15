'use strict';

/*
 * assemble-index.js 冒烟测试（零依赖，node 直接跑）：
 *   node scripts/tests/assemble-index.test.js
 * 在临时目录造迷你前后端工程，跑 extract → assemble，断言：
 * ① URL 结构归一化与公共目录；② 前后端按方法+URL 精确匹配成 matched；
 * ③ 未匹配分别落 backend-only / frontend-only；④ needs-review 透传 + 进 openQuestions；
 * ⑤ codeMap 高信号字段被推断;⑥ 关键：装配出的骨架本身能通过 P8 validateIndexJson。
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { indexProject } = require('../lib/project-index');
const { extract } = require('../extract-endpoints');
const { normalizeForMatch, commonDir, assemble, buildCodeMap } = require('../assemble-index');
const { validateIndexJson, extractEvidenceIds } = require('../validate-docs');

function mk(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// ① 纯函数
assert.strictEqual(normalizeForMatch('/api/orders/${id}'), '/api/orders/:p', '${} → :p');
assert.strictEqual(normalizeForMatch('/api/orders/{id}'), '/api/orders/:p', '{} → :p');
assert.strictEqual(normalizeForMatch('/api/orders/123'), '/api/orders/:p', '数字段 → :p');
assert.strictEqual(normalizeForMatch('/api/orders/'), '/api/orders', '去尾斜杠');
assert.strictEqual(commonDir(['a/b/c/X.java', 'a/b/c/Y.java']), 'a/b/c', '同目录文件公共目录');
assert.strictEqual(commonDir(['a/b/X.java', 'a/c/Y.java']), 'a', '分叉取最近公共目录');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rspd-assemble-'));
try {
  // 后端：主类 + 两个接口（一个动态路径 needs-review）
  mk(
    tmp,
    'backend/src/main/java/com/example/DemoApplication.java',
    '@SpringBootApplication\npublic class DemoApplication {}\n',
  );
  mk(
    tmp,
    'backend/src/main/java/com/example/web/OrderController.java',
    [
      '@RestController',
      '@RequestMapping("/api/orders")',
      'public class OrderController {',
      '  @GetMapping("/{id}")',
      '  public Order get(@PathVariable Long id) { return null; }',
      '  @PostMapping',
      '  public Order create(@RequestBody OrderReq r) { return null; }',
      '}',
    ].join('\n'),
  );
  // 前端：一个匹配 GET /{id}（数字实参），一个无后端匹配
  mk(tmp, 'frontend/src/main.tsx', "import App from './App';\nexport default App;\n");
  mk(
    tmp,
    'frontend/src/api/order.ts',
    [
      "import axios from 'axios';",
      'export const getOrder = (id) => axios.get(`/api/orders/${id}`);',
      "export const listStats = () => axios.get('/api/stats');", // 无后端 → frontend-only
    ].join('\n'),
  );

  const seed = extract(tmp);
  const index = indexProject(tmp);
  const sk = assemble(tmp, seed, index);

  // 必填顶层键
  for (const key of ['schemaVersion', 'generatedAt', 'codeMap', 'api', 'evidence']) {
    assert.ok(key in sk, `骨架缺必填键 ${key}`);
  }

  // ② matched：GET /api/orders/{id} ↔ /api/orders/${id}
  const matched = sk.api.find((a) => a.status === 'matched');
  assert.ok(matched, '应有一条 matched');
  assert.ok(
    matched.backend && matched.backend.handler === 'OrderController.get',
    'matched 后端为 OrderController.get',
  );
  assert.ok(matched.frontend && matched.frontend.fn === 'axios.get', 'matched 带前端调用');
  assert.strictEqual(matched.backend.service, null, 'service 留给模型补');

  // ③ backend-only：POST create 无前端
  const backendOnly = sk.api.find((a) => a.status === 'backend-only');
  assert.ok(
    backendOnly && backendOnly.backend.handler === 'OrderController.create',
    'POST create 应为 backend-only',
  );
  // ③ frontend-only：/api/stats
  const frontOnly = sk.api.find((a) => a.status === 'frontend-only');
  assert.ok(frontOnly && frontOnly.url === '/api/stats', '/api/stats 应为 frontend-only');

  // ④ needs-review 透传：动态前端 URL 进 openQuestions
  assert.ok(
    sk.openQuestions.some((q) => q.includes('needs-review')),
    'needs-review 应登记进 openQuestions',
  );

  // ⑤ codeMap 高信号
  assert.ok(
    sk.codeMap.backend.controllers && sk.codeMap.backend.controllers.includes('web'),
    'controllers 目录应由 seed 推断',
  );
  assert.ok(
    sk.codeMap.backend.mainClass && sk.codeMap.backend.mainClass.includes('com/example'),
    'mainClass 目录应被定位',
  );
  assert.ok(sk.codeMap.frontend.entry === 'frontend/src/main.tsx', 'entry 应定位到 main.tsx');

  // ⑥ 关键：骨架写入 docs/ 后能通过 P8 validateIndexJson（含 --symbols）
  const docsDir = path.join(tmp, 'docs');
  fs.mkdirSync(path.join(docsDir, '.analysis'), { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'index.json'), JSON.stringify(sk, null, 2));
  fs.writeFileSync(path.join(docsDir, '.analysis', 'evidence-ledger.md'), '# 空账本\n');
  const idx2 = indexProject(tmp);
  idx2.codeContents = require('../lib/project-index').buildCodeContentCache(idx2, tmp);
  const res = validateIndexJson({
    docsDir,
    index: idx2,
    root: tmp,
    ledgerEvidence: extractEvidenceIds('# 空账本'),
    symbols: true,
  });
  assert.strictEqual(
    res.status,
    'ok',
    '装配出的骨架必须通过 P8（错误：' + JSON.stringify(res.errors) + '）',
  );

  // buildCodeMap 单独可调用
  assert.ok(buildCodeMap(seed, index).backend.controllers, 'buildCodeMap 可独立调用');

  console.log('✅ assemble-index 冒烟测试通过');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
