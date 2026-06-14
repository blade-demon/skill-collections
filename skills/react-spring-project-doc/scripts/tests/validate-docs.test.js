'use strict';

/*
 * validate-docs.js 冒烟测试（零依赖，node 直接跑）：
 *   node scripts/tests/validate-docs.test.js
 * 在临时目录造一个迷你项目 + 一份文档，断言：① 真实路径通过；② 缺失路径被抓为硬失败；
 * ③ 规避 `.json` 被 `js` 抢匹配、`UserContext` 子串误命中两类坑。
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validate, extractPathRefs } = require('../validate-docs');

function mk(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rspd-validate-'));
try {
  // 迷你项目
  mk(tmp, 'frontend/package.json', '{}');
  mk(tmp, 'frontend/src/api/http.ts', 'export const http = 1;');
  mk(tmp, 'backend/src/main/java/com/example/demo/user/User.java', 'class User {}');
  mk(tmp, 'backend/src/main/java/com/example/demo/common/UserContext.java', 'class UserContext {}');

  // 文档：含真实路径、裸文件名、缺失路径
  mk(
    tmp,
    'docs/api-map.md',
    [
      '引用真实路径 `frontend/src/api/http.ts` 和 `frontend/package.json`。',
      '后缀匹配 `user/User.java`。',
      '裸文件名 `User.java`。',
      '缺失路径 `frontend/src/pages/Ghost.tsx`。',
    ].join('\n')
  );

  const r = validate({ project: tmp });

  // ① package.json 未被 js 抢匹配（扩展名按集合判定）
  const refs = extractPathRefs('see `frontend/package.json` here');
  assert.ok(refs.has('frontend/package.json'), 'package.json 应被完整抽取，不应截成 package.js');

  // ①b glob 写法 `*Request.java` 不应被当字面文件名
  const globRefs = extractPathRefs('DTO 列表 `*Request.java` 见 dto/');
  assert.ok(!globRefs.has('Request.java'), 'glob 前缀 * 的 token 应被跳过');

  // ② 真实路径 + 后缀匹配 → 不进硬失败
  const hardRefs = r.hardMiss.map((x) => x.ref);
  assert.ok(!hardRefs.includes('frontend/src/api/http.ts'), 'http.ts 真实存在');
  assert.ok(!hardRefs.includes('user/User.java'), 'user/User.java 应后缀匹配通过');

  // ③ 缺失路径被抓为硬失败
  assert.ok(hardRefs.includes('frontend/src/pages/Ghost.tsx'), 'Ghost.tsx 应被判缺失');
  assert.strictEqual(r.hardMiss.length, 1, '仅 1 处硬失败');

  // ④ 裸文件名 User.java 命中 basename → 不进硬失败/软失败
  const softRefs = r.softMiss.map((x) => x.ref);
  assert.ok(!softRefs.includes('User.java'), 'User.java 裸名应命中索引');

  // ⑤ 符号校验：User 词界匹配，命中 User.java 而非仅 UserContext
  const r2 = validate({ project: tmp, symbols: true });
  const symMiss = r2.symbolMiss.map((x) => x.ref);
  assert.ok(!symMiss.includes('User'), 'User 符号应找到（词界，不被 UserContext 干扰判缺）');

  console.log('✅ validate-docs 冒烟测试通过');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
