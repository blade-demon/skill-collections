'use strict';

/*
 * validate-docs.js 冒烟测试（零依赖，node 直接跑）：
 *   node scripts/tests/validate-docs.test.js
 * 在临时目录造一个迷你项目 + 文档，断言：
 * ① 路径/符号存在性；② Mermaid 结构与数量；③ 图级 Evidence 声明；
 * ④ skill 模板明确要求 Mermaid 且 P8 不执行构建/测试/lint/typecheck。
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validate, extractPathRefs } = require('../validate-docs');

const skillRoot = path.resolve(__dirname, '../..');

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
  mk(
    tmp,
    'docs/.analysis/evidence-ledger.md',
    ['## Evidence: E-001', '', '## Evidence: E-002'].join('\n'),
  );

  // 普通文档：含真实路径、裸文件名、缺失路径
  mk(
    tmp,
    'docs/api-map.md',
    [
      '引用真实路径 `frontend/src/api/http.ts` 和 `frontend/package.json`。',
      '后缀匹配 `user/User.java`。',
      '裸文件名 `User.java`。',
      '缺失路径 `frontend/src/pages/Ghost.tsx`。',
    ].join('\n'),
  );
  mk(
    tmp,
    'docs/architecture.md',
    [
      '# 架构',
      '',
      '```mermaid',
      'flowchart LR',
      '  %% Evidence: E-001',
      '  user["用户"] --> api["API"]',
      '```',
    ].join('\n'),
  );
  mk(
    tmp,
    'docs/business-flows.md',
    [
      '# 核心业务链路',
      '',
      '## F-1 登录',
      '',
      '```mermaid',
      'flowchart LR',
      '  %% Evidence: E-002',
      '  page["登录页"] --> controller["Controller"]',
      '```',
    ].join('\n'),
  );

  const r = validate({ project: tmp, symbols: true });

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
  const symMiss = r.symbolMiss.map((x) => x.ref);
  assert.ok(!symMiss.includes('User'), 'User 符号应找到（词界，不被 UserContext 干扰判缺）');

  // ⑥ 合法 Mermaid：全景图 1 张、每条 F-N 链路 1 张，Evidence 均存在。
  assert.strictEqual(r.checkedMermaidBlocks, 2, '应核对 2 张 Mermaid 图');
  assert.deepStrictEqual(r.mermaidErrors, [], '合法 Mermaid 不应产生结构错误');
  assert.strictEqual(r.checkedEvidenceRefs, 2, '应核对 2 个图级 Evidence 引用');
  assert.deepStrictEqual(r.evidenceMiss, [], '图级 Evidence 均应在 ledger 中存在');

  // ⑦ 非 flowchart 声明应失败。
  mk(
    tmp,
    'docs/architecture.md',
    ['# 架构', '```mermaid', 'sequenceDiagram', '  A->>B: hello', '```'].join('\n'),
  );
  const badDiagram = validate({ project: tmp });
  assert.ok(
    badDiagram.mermaidErrors.some((x) => x.reason.includes('flowchart')),
    '非 flowchart Mermaid 应判结构错误',
  );

  // ⑧ architecture.md 必须恰好 1 张 Mermaid。
  mk(
    tmp,
    'docs/architecture.md',
    [
      '# 架构',
      '```mermaid',
      'flowchart LR',
      '  %% Evidence: E-001',
      '  A --> B',
      '```',
      '```mermaid',
      'flowchart LR',
      '  %% Evidence: E-001',
      '  C --> D',
      '```',
    ].join('\n'),
  );
  const duplicateArchitecture = validate({ project: tmp });
  assert.ok(
    duplicateArchitecture.mermaidErrors.some((x) => x.reason.includes('恰好 1 张')),
    'architecture.md 多图应失败',
  );

  // ⑨ business-flows.md 的 F-N 标题数必须等于 Mermaid 图数。
  mk(
    tmp,
    'docs/architecture.md',
    ['# 架构', '```mermaid', 'flowchart LR', '  %% Evidence: E-001', '  A --> B', '```'].join('\n'),
  );
  mk(
    tmp,
    'docs/business-flows.md',
    [
      '# 核心业务链路',
      '## F-1 登录',
      '## F-2 注册',
      '```mermaid',
      'flowchart LR',
      '  %% Evidence: E-002',
      '  A --> B',
      '```',
    ].join('\n'),
  );
  const flowCountMismatch = validate({ project: tmp });
  assert.ok(
    flowCountMismatch.mermaidErrors.some((x) => x.reason.includes('核心链路数量')),
    '业务链路标题数与图数不一致应失败',
  );

  // ⑩ 图级 Evidence 缺失应失败。
  mk(
    tmp,
    'docs/business-flows.md',
    [
      '# 核心业务链路',
      '## F-1 登录',
      '```mermaid',
      'flowchart LR',
      '  %% Evidence: E-999',
      '  A --> B',
      '```',
    ].join('\n'),
  );
  const missingEvidence = validate({ project: tmp });
  assert.deepStrictEqual(
    missingEvidence.evidenceMiss.map((x) => x.ref),
    ['E-999'],
    'ledger 中不存在的 Evidence 应被报告',
  );

  // ⑪ 未闭合 Mermaid fence 应失败。
  mk(
    tmp,
    'docs/architecture.md',
    ['# 架构', '```mermaid', 'flowchart LR', '  %% Evidence: E-001', '  A --> B'].join('\n'),
  );
  const unclosedFence = validate({ project: tmp });
  assert.ok(
    unclosedFence.mermaidErrors.some((x) => x.reason.includes('未闭合')),
    '未闭合 Mermaid fence 应失败',
  );

  // ⑫ 两份图形文档缺失时应失败。
  fs.rmSync(path.join(tmp, 'docs/architecture.md'));
  const missingArchitecture = validate({ project: tmp });
  assert.ok(
    missingArchitecture.mermaidErrors.some((x) => x.reason.includes('缺少 architecture.md')),
    '缺少 architecture.md 应失败',
  );
  fs.rmSync(path.join(tmp, 'docs/business-flows.md'));
  const missingBusinessFlows = validate({ project: tmp });
  assert.ok(
    missingBusinessFlows.mermaidErrors.some((x) => x.reason.includes('缺少 business-flows.md')),
    '缺少 business-flows.md 应失败',
  );

  // ⑬ 符号三档分类：defined（有定义）/ referenced（仅被引用，多为框架类型）/ absent（疑似幻觉）。
  mk(
    tmp,
    'backend/src/main/java/com/example/demo/order/OrderService.java',
    'import org.springframework.http.ResponseEntity;\nclass OrderService {}',
  );
  mk(
    tmp,
    'docs/data-model.md',
    [
      '已定义类 `OrderService`。', // defined：命中 class OrderService
      '框架类型 `ResponseEntity`（仅 import 引用）。', // referenced：出现但无定义
      '幻觉类 `GhostService`。', // absent：全仓不存在
    ].join('\n'),
  );
  const symClass = validate({ project: tmp, symbols: true });
  const miss = symClass.symbolMiss.map((x) => x.ref);
  const refOnly = symClass.symbolRefOnly.map((x) => x.ref);
  assert.ok(
    !miss.includes('OrderService') && !refOnly.includes('OrderService'),
    'OrderService 有定义，应判 defined（既不缺失也不仅引用）',
  );
  assert.ok(
    refOnly.includes('ResponseEntity'),
    'ResponseEntity 仅被引用、无定义，应判 referenced 而非静默通过',
  );
  assert.ok(miss.includes('GhostService'), 'GhostService 全仓不存在，应判 absent');

  // ⑭ skill 文档契约：P7 生成 Mermaid，P8 不执行项目命令。
  const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const p7 = fs.readFileSync(path.join(skillRoot, 'templates/07-doc-generation.md'), 'utf8');
  const p8 = fs.readFileSync(path.join(skillRoot, 'templates/08-validation.md'), 'utf8');
  assert.match(skill, /Mermaid/, 'SKILL.md 应明确 Mermaid 输出');
  assert.match(p7, /flowchart LR/, 'P7 模板应规定 flowchart LR');
  assert.doesNotMatch(p7, /ASCII[^\n]*架构图|架构图[^\n]*ASCII/, 'P7 模板不应再要求 ASCII 架构图');
  assert.doesNotMatch(
    p8,
    /实际运行.*(?:构建|测试|lint|typecheck)|命令可执行性/,
    'P8 模板不应要求执行构建/测试/lint/typecheck',
  );

  // ⑮ index.json 校验：缺失=absent（不算失败）；合法=ok；问题=error（硬失败）。
  const svc = 'backend/src/main/java/com/example/demo/order/OrderService.java'; // ⑬ 已创建
  const noIndex = validate({ project: tmp });
  assert.strictEqual(noIndex.indexJson.status, 'absent', '无 index.json 应为 absent，不算失败');

  const validIndex = {
    schemaVersion: '1.0',
    generatedAt: '2026-06-14',
    codeMap: {
      frontend: { apiClient: 'frontend/src/api/http.ts' },
      backend: { services: svc },
    },
    symbols: [{ name: 'OrderService', kind: 'service', file: svc, line: 2, evidence: 'E-001' }],
    api: [
      {
        id: 'API-001',
        method: 'GET',
        url: '/x',
        backend: { handler: 'OrderService.list', file: svc, line: 2 },
        status: 'matched',
        confidence: 'high',
        evidence: 'E-002',
      },
    ],
    flows: [{ id: 'F-1', name: 'x', completeness: 'complete', steps: [], evidence: 'E-001' }],
    dataModels: [
      {
        id: 'M-1',
        name: 'User',
        kind: 'entity',
        file: 'backend/src/main/java/com/example/demo/user/User.java',
        usedByApi: ['API-001'],
        usedByFlow: ['F-1'],
        evidence: 'E-002',
      },
    ],
    channels: [
      {
        id: 'CH-1',
        type: 'kafka-consumer',
        name: 'order.created',
        handler: 'OrderService.onMsg',
        file: svc,
        line: 2,
        evidence: 'E-001',
      },
    ],
    evidence: [
      { id: 'E-001', file: svc, line: 2, confidence: 'high', claim: 'x' },
      { id: 'E-002', file: 'frontend/src/api/http.ts', line: 1, confidence: 'high', claim: 'y' },
    ],
  };
  mk(tmp, 'docs/index.json', JSON.stringify(validIndex));
  const okIndex = validate({ project: tmp, symbols: true });
  assert.strictEqual(
    okIndex.indexJson.status,
    'ok',
    `合法 index.json 应通过，实际错误: ${JSON.stringify(okIndex.indexJson.errors)}`,
  );

  const brokenIndex = {
    schemaVersion: '1.0',
    generatedAt: '2026-06-14',
    codeMap: { frontend: {}, backend: {} },
    api: [{ id: 'API-001', evidence: 'E-999' }], // E-999 不在 evidence[]
    dataModels: [{ id: 'M-1', usedByApi: ['API-404'], evidence: 'E-777' }], // API-404 悬挂
    evidence: [{ id: 'E-777', file: 'frontend/src/ghost.ts', line: 1 }], // E-777 不在 ledger + 路径不存在
  };
  mk(tmp, 'docs/index.json', JSON.stringify(brokenIndex));
  const badIndex = validate({ project: tmp });
  assert.strictEqual(badIndex.indexJson.status, 'error', '问题 index.json 应为 error');
  const reasons = badIndex.indexJson.errors.map((e) => e.reason).join(' | ');
  assert.match(reasons, /API-404/, '应报告 usedByApi 悬挂引用');
  assert.match(reasons, /E-999/, '应报告 evidence 引用不在 evidence[] 内');
  assert.match(reasons, /ghost\.ts/, '应报告路径不存在');
  assert.match(reasons, /E-777.*ledger|ledger.*E-777/, '应报告 evidence 未在 ledger 定位');

  console.log('✅ validate-docs 冒烟测试通过');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
