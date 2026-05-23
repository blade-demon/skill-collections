#!/usr/bin/env node
// Generate design-to-spec markdown outputs from YAML contracts.
//
// This script is intentionally conservative: contracts remain the single
// source of truth, and generated markdown only reflects fields present in
// those contracts.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadYaml } from './lib/yaml.js';
import { parseArgs, requireOpts } from './lib/cli.js';

const EVENT_PATTERN = /[a-z]+(?:-[a-z]+)+/g;

function pyStr(value) {
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  return String(value);
}

function pyBoolLower(value) {
  return value ? 'true' : 'false';
}

function pyRepr(value) {
  if (typeof value === 'string') return `'${value}'`;
  return pyStr(value);
}

function writeText(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const trimmed = content.replace(/\s+$/, '');
  writeFileSync(path, trimmed + '\n', 'utf8');
}

function kebabCase(value) {
  let v = String(value).replace(/([a-z0-9])([A-Z])/g, '$1-$2');
  v = v.replace(/[^A-Za-z0-9]+/g, '-');
  v = v.replace(/^-+|-+$/g, '').toLowerCase();
  return v || 'component';
}

function mdEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function tsType(field) {
  const fieldType = field.type ?? 'unknown';
  if (fieldType === 'array') {
    const itemType = field.item_type || 'unknown';
    return `${itemType}[]`;
  }
  if (field.enums && field.enums.length > 0) {
    return field.enums.map((item) => pyRepr(item)).join(' | ');
  }
  return String(fieldType);
}

function fieldNames(fields) {
  const names = fields.map((f) => f.name ?? '').join(', ');
  return names || '无';
}

function endpointLabel(endpoint) {
  if (!endpoint) return 'none';
  const method = endpoint.method ?? '';
  const url = endpoint.url ?? '';
  return `${method} ${url}`.trim();
}

function collectQuestions(api, mapping) {
  return [...(api.open_questions ?? []), ...(mapping.open_questions ?? [])];
}

function collectEventNames(mapping) {
  const events = [];
  for (const binding of mapping.bindings ?? []) {
    if (binding.direction !== 'ui_to_event') continue;
    for (const source of [binding.target_event ?? '', binding.transform ?? '']) {
      const matches = String(source).match(EVENT_PATTERN) ?? [];
      for (const event of matches) {
        if (!events.includes(event)) events.push(event);
      }
    }
  }
  return events;
}

function stateAssertions(ui) {
  const map = new Map();
  for (const state of ui.states ?? []) {
    if (state.id) map.set(state.id, state.render_assertion ?? '');
  }
  return map;
}

function generateNotes(ui, api, mapping, capability) {
  const component = ui.name ?? 'Component';
  const endpoints = api.endpoints ?? [];
  const endpointById = new Map(endpoints.map((e) => [e.id, e]));
  const questions = collectQuestions(api, mapping);
  const events = collectEventNames(mapping);

  const lines = [
    `# ${component} — 设计笔记`,
    '',
    '> 由 `design-to-spec/scripts/generate-output.js` 根据 YAML 契约生成。此文件是协作草稿，`needs_human_input` 和开放问题需要人类确认。',
    '>',
    '> **节标记说明**：`<!-- CONTRACT_DERIVED -->` 节由脚本从 YAML 契约机械生成，4B 阶段 **不得修改**字段名、类型、枚举值、trace anchor；`<!-- NARRATIVE -->` 节允许 LLM 补充背景、决策理由、项目上下文，但不得引入契约中不存在的组件、状态或接口。',
    '',
    '<!-- NARRATIVE -->',
    '## 为什么',
    '',
    `\`${component}\` 将设计稿中的可见结构、接口字段和交互状态固化为可实现规格。`,
    '',
    '<!-- NARRATIVE -->',
    '## 决策',
    '',
    '- **契约优先** — 本文仅使用 `contracts/*.yaml` 中的事实，不重新分析设计稿或接口文档。',
    '- **状态可测试** — `required: true` 的状态会进入 OpenSpec Scenario。',
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 数据契约',
    '',
    '```ts',
    `interface ${component}Data {`,
  ];

  const responseFields = [];
  const requestBodyFields = [];
  const errorShapes = [];
  for (const endpoint of endpoints) {
    responseFields.push(...(endpoint.response_fields ?? []));
    requestBodyFields.push(...(endpoint.request_body ?? []));
    errorShapes.push(...(endpoint.error_shape ?? []));
  }

  if (responseFields.length > 0) {
    for (const field of responseFields) {
      const nullable = field.nullable ? ' | null' : '';
      lines.push(
        `  // ${field.name}: ${tsType(field)}${nullable};  // source: api — ${field.notes ?? ''}`,
      );
    }
  } else {
    lines.push('  // No API response fields. Data is expected from props or parent context.');
  }
  lines.push('}', '```', '');

  if (responseFields.length > 0) {
    lines.push(
      '### 接口字段映射表',
      '',
      '| 接口字段名 | 接口类型 | 枚举值（全量） | UI 中展示为 | 来源标注 | 备注 |',
      '|-----------|---------|--------------|------------|---------|------|',
    );
    for (const field of responseFields) {
      const enums = (field.enums ?? []).map((i) => String(i)).join(' / ') || '—';
      lines.push(
        `| \`${mdEscape(field.name)}\` | \`${mdEscape(tsType(field))}\` | ${mdEscape(enums)} | ${mdEscape('由 Mapping_Logic.bindings 指定')} | \`api\` | ${mdEscape(field.notes ?? '')} |`,
      );
    }
    lines.push('');
  }

  if (requestBodyFields.length > 0) {
    lines.push(
      '### 请求体字段映射表',
      '',
      '| request_body 字段 | 类型 | 必填 | 可空 | 枚举值 | 说明 |',
      '| ----------------- | ---- | ---- | ---- | ------ | ---- |',
    );
    for (const field of requestBodyFields) {
      const enums = (field.enums ?? []).map((i) => String(i)).join(' / ') || '—';
      const required = field.required ? 'true' : 'false';
      const nullable = field.nullable ? 'true' : 'false';
      lines.push(
        `| \`${mdEscape(field.name)}\` | \`${mdEscape(tsType(field))}\` | ${required} | ${nullable} | ${mdEscape(enums)} | ${mdEscape(field.notes)} |`,
      );
    }
    lines.push('');
  }

  if (endpoints.length > 0) {
    lines.push(
      '### 接口元信息',
      '',
      '| endpoint | auth_required | cache_key_fields | pagination | status_codes |',
      '| -------- | ------------- | ---------------- | ---------- | ------------ |',
    );
    for (const endpoint of endpoints) {
      const pagination = endpoint.pagination ?? {};
      const paginationLabel = pagination.type ?? 'none';
      const cacheKeys = (endpoint.cache_key_fields ?? []).join(', ') || '—';
      const statusCodes = (endpoint.status_codes ?? []).map((c) => String(c)).join(', ') || '—';
      lines.push(
        `| \`${mdEscape(endpointLabel(endpoint))}\` | ${pyBoolLower(endpoint.auth_required)} | ${mdEscape(cacheKeys)} | ${mdEscape(paginationLabel)} | ${mdEscape(statusCodes)} |`,
      );
    }
    lines.push('');
  }

  if (errorShapes.length > 0) {
    lines.push(
      '### 错误结构映射表',
      '',
      '| code | message_field | retryable | ui_state | notes |',
      '| ---- | ------------- | --------- | -------- | ----- |',
    );
    for (const error of errorShapes) {
      lines.push(
        `| \`${mdEscape(error.code)}\` | \`${mdEscape(error.message_field)}\` | ${pyBoolLower(error.retryable)} | \`${mdEscape(error.ui_state)}\` | ${mdEscape(error.notes)} |`,
      );
    }
    lines.push('');
  }

  lines.push(
    '<!-- CONTRACT_DERIVED -->',
    '## 数据获取方式',
    '',
    '| 接口/方法名 | 调用时机 | 请求关键参数 | 响应关键字段 | 缓存策略 | 补充说明 |',
    '| --------- | ------- | ---------- | ---------- | ------- | ------- |',
  );
  const requests = mapping.data_fetching?.requests ?? [];
  if (requests.length > 0) {
    for (const request of requests) {
      const endpoint = endpointById.get(request.endpoint);
      const params = (endpoint?.params ?? []).map((p) => p.name ?? '').join(', ') || '无';
      const fields = fieldNames(endpoint?.response_fields ?? []);
      lines.push(
        `| \`${endpointLabel(endpoint)}\` | \`${mdEscape(request.trigger)}\` | ${mdEscape(params)} | ${mdEscape(fields)} | 待项目确认 | request \`${mdEscape(request.id)}\`, call_type \`${mdEscape(request.call_type)}\` |`,
      );
    }
  } else {
    lines.push('| 无直接请求 | — | — | — | — | 数据由父组件或宿主上下文传入 |');
  }
  lines.push('');

  lines.push(
    '<!-- CONTRACT_DERIVED -->',
    '## 状态枚举',
    '',
    '| 状态 | 触发条件 | UI 表现 | required | source | scope | scope_components | render_assertion |',
    '| ---- | -------- | ------- | -------- | ------ | ----- | ---------------- | ---------------- |',
  );
  for (const state of ui.states ?? []) {
    const scopeComponents = (state.scope_components ?? []).join(', ') || '—';
    lines.push(
      `| \`${mdEscape(state.id)}\` | ${mdEscape(state.trigger)} | ${mdEscape(state.confidence)} | ${pyBoolLower(state.required)} | ${mdEscape(state.source)} | ${mdEscape(state.scope ?? 'component')} | ${mdEscape(scopeComponents)} | ${mdEscape(state.render_assertion)} |`,
    );
  }
  lines.push('');

  lines.push(
    '<!-- CONTRACT_DERIVED -->',
    '## 组件分解',
    '',
    '| 组件 | type | semantic_type | parent_id | role | repeat_source | 目的 | 复用信号 |',
    '| ---- | ---- | ------------- | --------- | ---- | ------------- | ---- | -------- |',
  );
  for (const c of ui.components ?? []) {
    const reuse = c.repeat_source ? 'atom-candidate' : 'component-local';
    lines.push(
      `| \`${mdEscape(c.id)}\` | \`${mdEscape(c.type)}\` | \`${mdEscape(c.semantic_type ?? '')}\` | \`${mdEscape(c.parent_id)}\` | \`${mdEscape(c.role)}\` | \`${mdEscape(c.repeat_source)}\` | ${mdEscape(c.notes)} | ${reuse} |`,
    );
  }

  lines.push(
    '',
    '<!-- NARRATIVE -->',
    '## 布局陷阱',
    '',
    `- ${mdEscape(ui.layout?.notes ?? '按设计稿约束实现布局。')}`,
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 置信度地图',
    '',
    '| 元素 / 行为 | 状态 | 备注 |',
    '| ----------- | ---- | ---- |',
  );
  for (const c of ui.components ?? []) {
    lines.push(`| \`${mdEscape(c.id)}\` | ${mdEscape(c.confidence)} | ${mdEscape(c.notes)} |`);
  }
  for (const state of ui.states ?? []) {
    lines.push(
      `| \`${mdEscape(state.id)}\` | ${mdEscape(state.confidence)} | ${mdEscape(state.trigger)} |`,
    );
  }

  lines.push('', '<!-- CONTRACT_DERIVED -->', '## 开放问题', '');
  if (questions.length > 0) {
    questions.forEach((q, i) => {
      lines.push(`${i + 1}. [${mdEscape(q.priority)}] ${mdEscape(q.content)}`);
    });
  } else {
    lines.push('无。');
  }

  lines.push(
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 计划提示',
    '',
    '- `generated_from_contracts`',
    '- `validate_output_required`',
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 交叉引用',
    '',
    '- 输入契约：`./contracts/ui-schema.yaml`、`./contracts/api-schema.yaml`、`./contracts/mapping-logic.yaml`',
    `- 规格增量：\`./specs/${capability}/spec.md\``,
    '',
    '<!-- NARRATIVE -->',
    '## 建议的下一步',
    '',
    '将完整输出目录交给规划或实现流程；下游不应重新阅读原始设计稿，而应消费本目录和 `contracts/*.yaml`。',
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## Traceability',
    '',
    '| trace_id | kind | source | target | notes |',
    '| -------- | ---- | ------ | ------ | ----- |',
  );
  for (const c of ui.components ?? []) {
    const cid = c.id ?? '';
    lines.push(
      `| \`component:${mdEscape(cid)}\` | component | \`${mdEscape(cid)}\` | \`${mdEscape(c.parent_id)}\` | type \`${mdEscape(c.type)}\`, semantic \`${mdEscape(c.semantic_type ?? '')}\` |`,
    );
  }
  (mapping.bindings ?? []).forEach((binding, idx) => {
    const direction = binding.direction ?? '';
    let source;
    let target;
    if (direction === 'ui_to_api') {
      source = binding.source_ui ?? '';
      target = binding.target_api ?? '';
    } else if (direction === 'api_to_ui') {
      source = binding.source_api ?? '';
      target = binding.target_ui ?? '';
    } else {
      source = binding.source_ui ?? '';
      target = binding.target_event ?? '';
    }
    lines.push(
      `| \`binding:${idx + 1}:${mdEscape(direction)}\` | binding | \`${mdEscape(source)}\` | \`${mdEscape(target)}\` | transform \`${mdEscape(binding.transform ?? 'none')}\` |`,
    );
  });
  for (const state of ui.states ?? []) {
    const sid = state.id ?? '';
    const scopeComponents = (state.scope_components ?? []).join(', ') || 'component';
    lines.push(
      `| \`state:${mdEscape(sid)}\` | state | \`${mdEscape(sid)}\` | \`${mdEscape(scopeComponents)}\` | required \`${pyBoolLower(state.required)}\` |`,
    );
  }

  lines.push(
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 埋点锚点',
    '',
    '| 锚点 ID | 触发 Scenario（对应 spec.md 标题或 Requirement） | 类型 | 关键参数（语义层） | 备注 |',
    '| ------- | ----------------------------------------- | ---- | ---------------- | ---- |',
  );
  if (events.length > 0) {
    for (const event of events) {
      const eventType =
        event.startsWith('tap-') || event.startsWith('submit-') ? 'click' : 'exposure';
      lines.push(
        `| \`${event}\` | \`${event}\` | ${eventType} | 由事件 detail 决定 | 从 \`ui_to_event\` 绑定生成 |`,
      );
    }
  } else {
    lines.push('| `not-tracked` | 无交互事件 | not-tracked | — | 契约未声明 `ui_to_event` 绑定 |');
  }

  return lines.join('\n');
}

function generateDataFetching(ui, api, mapping) {
  const endpoints = api.endpoints ?? [];
  const endpointById = new Map(endpoints.map((e) => [e.id, e]));
  const requests = mapping.data_fetching?.requests ?? [];
  const questions = collectQuestions(api, mapping);

  const lines = [
    `# ${mapping.component ?? 'Component'} — 数据获取逻辑设计`,
    '',
    '> 由 `design-to-spec/scripts/generate-output.js` 根据 YAML 契约生成。',
    '>',
    '> **节标记说明**：`<!-- CONTRACT_DERIVED -->` 节由脚本从 YAML 契约机械生成，4B 阶段**不得修改**；`<!-- NARRATIVE -->` 节允许 LLM 补充数据流文字描述，但不得引入契约中不存在的请求或接口。',
    '',
    '<!-- NARRATIVE -->',
    '## 数据流向',
    '',
    '```',
    'contracts/api-schema.yaml',
    '  -> contracts/mapping-logic.yaml',
    '    -> component state / props',
    '      -> UI components',
    '```',
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 触发时机与条件',
    '',
    '| 触发事件 | 前提条件 | 备注 |',
    '|---------|---------|------|',
  ];

  if (requests.length > 0) {
    for (const request of requests) {
      lines.push(
        `| \`${mdEscape(request.trigger)}\` | endpoint \`${mdEscape(request.endpoint)}\` 可用 | call_type \`${mdEscape(request.call_type)}\` |`,
      );
    }
  } else {
    lines.push('| 无请求 | 数据由父组件通过 Props 传入 | 纯展示组件 |');
  }

  lines.push(
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 请求链路',
    '',
    '### 请求清单',
    '',
    '| request id | trace_id | 接口 | 触发时机 | call_type | 依赖 | 用途 |',
    '| ---------- | -------- | ---- | -------- | --------- | ---- | ---- |',
  );
  if (requests.length > 0) {
    for (const request of requests) {
      const endpoint = endpointById.get(request.endpoint);
      const dependsOn = (request.depends_on ?? []).join(', ') || '无';
      const pagination = endpoint?.pagination ?? {};
      let use = '主数据请求';
      if (pagination.type && pagination.type !== 'none') {
        use = `${pagination.type} pagination`;
      }
      lines.push(
        `| \`${mdEscape(request.id)}\` | \`request:${mdEscape(request.id)}\` | \`${mdEscape(endpointLabel(endpoint))}\` | \`${mdEscape(request.trigger)}\` | \`${mdEscape(request.call_type)}\` | ${mdEscape(dependsOn)} | ${mdEscape(use)} |`,
      );
    }
  } else {
    lines.push('| — | — | 无直接接口 | — | — | — | 父组件供数 |');
  }

  lines.push('', '### 请求参数', '');
  if (requests.length > 0) {
    for (const request of requests) {
      const endpoint = endpointById.get(request.endpoint);
      lines.push(
        `#### \`${mdEscape(request.id)}\``,
        '',
        '| 参数名 | 来源 | 类型 | 是否必传 | 说明 |',
        '|-------|------|------|---------|------|',
      );
      const params = endpoint?.params ?? [];
      if (params.length > 0) {
        for (const param of params) {
          const required = param.required ? '是' : '否';
          lines.push(
            `| \`${mdEscape(param.name)}\` | Mapping_Logic.bindings | \`${mdEscape(param.type)}\` | ${required} | ${mdEscape(param.notes)} |`,
          );
        }
      } else {
        lines.push('| — | — | — | — | 无请求参数 |');
      }
      const requestBody = endpoint?.request_body ?? [];
      if (requestBody.length > 0) {
        lines.push('', '**请求体字段**：', '');
        for (const bodyField of requestBody) {
          const required = bodyField.required ? 'required' : 'optional';
          lines.push(
            `- \`${mdEscape(bodyField.name)}\` (\`${mdEscape(tsType(bodyField))}\`, ${required}) — ${mdEscape(bodyField.notes)}`,
          );
        }
      }
      const fields = fieldNames(endpoint?.response_fields ?? []);
      lines.push('', `**响应关键字段**：${mdEscape(fields)}。`, '');
    }
  } else {
    lines.push('无请求参数。');
  }

  lines.push(
    '<!-- CONTRACT_DERIVED -->',
    '## 接口元信息',
    '',
    '| endpoint | auth_required | cache_key_fields | pagination | error_shape |',
    '| -------- | ------------- | ---------------- | ---------- | ----------- |',
  );
  if (endpoints.length > 0) {
    for (const endpoint of endpoints) {
      const pagination = endpoint.pagination ?? {};
      const cacheKeys = (endpoint.cache_key_fields ?? []).join(', ') || '—';
      const errs = (endpoint.error_shape ?? []).map((e) => e.code ?? '').join(', ') || '—';
      lines.push(
        `| \`${mdEscape(endpointLabel(endpoint))}\` | ${pyBoolLower(endpoint.auth_required)} | ${mdEscape(cacheKeys)} | ${mdEscape(pagination.type ?? 'none')} | ${mdEscape(errs)} |`,
      );
    }
  } else {
    lines.push('| — | false | — | none | — |');
  }

  lines.push('<!-- CONTRACT_DERIVED -->', '## 分页与无限滚动', '');
  const paginationRows = endpoints
    .map((endpoint) => [endpoint, endpoint.pagination ?? {}])
    .filter(([, pagination]) => pagination.type && pagination.type !== 'none');
  if (paginationRows.length > 0) {
    lines.push(
      '| endpoint | type | request_fields | response_fields | notes |',
      '| -------- | ---- | -------------- | --------------- | ----- |',
    );
    for (const [endpoint, pagination] of paginationRows) {
      const requestFields = (pagination.request_fields ?? []).join(', ') || '—';
      const responseFields = (pagination.response_fields ?? []).join(', ') || '—';
      lines.push(
        `| \`${mdEscape(endpointLabel(endpoint))}\` | ${mdEscape(pagination.type)} | ${mdEscape(requestFields)} | ${mdEscape(responseFields)} | ${mdEscape(pagination.notes ?? '')} |`,
      );
    }
  } else {
    lines.push('不涉及，除非契约中的请求或开放问题另有说明。');
  }

  const cachePolicy = mapping.data_fetching?.cache_policy ?? mapping.data_fetching?.cache ?? {};
  const retryPolicy = mapping.data_fetching?.retry_policy ?? {};
  const concurrencyPolicy = mapping.data_fetching?.concurrency_policy ?? {};

  lines.push('', '<!-- CONTRACT_DERIVED -->', '## 缓存与复用策略', '');
  if (Object.keys(cachePolicy).length > 0) {
    for (const [key, value] of Object.entries(cachePolicy)) {
      lines.push(`- **${mdEscape(key)}**: ${mdEscape(value)}`);
    }
  } else {
    lines.push('缓存策略未在契约中声明。');
  }

  lines.push('', '<!-- CONTRACT_DERIVED -->', '## 重试策略', '');
  if (Object.keys(retryPolicy).length > 0) {
    for (const [key, value] of Object.entries(retryPolicy)) {
      lines.push(`- **${mdEscape(key)}**: ${mdEscape(value)}`);
    }
  } else {
    lines.push('重试策略未在契约中声明。');
  }

  lines.push('', '<!-- CONTRACT_DERIVED -->', '## 竞态与并发处理', '');
  if (Object.keys(concurrencyPolicy).length > 0) {
    for (const [key, value] of Object.entries(concurrencyPolicy)) {
      lines.push(`- **${mdEscape(key)}**: ${mdEscape(value)}`);
    }
  } else {
    lines.push(
      '如存在多请求依赖，按 `depends_on` 串联；重复触发时应忽略过期响应或取消旧请求，具体策略进入开放问题确认。',
    );
  }

  lines.push(
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 错误分级与降级策略',
    '',
    '| 错误类型 | 触发条件 | UI 表现 | 是否可重试 | 备注 |',
    '|---------|---------|---------|----------|------|',
    '| 请求失败 | `api_error` 或 request reject | 进入 `error` 状态 | 是，若存在 retry 交互 | 以 Mapping_Logic.state_machine 为准 |',
    '| 数据为空 | `api_success` 但数据满足 empty 条件 | 进入 `empty` 状态 | — | 不作为错误处理 |',
  );
  for (const endpoint of endpoints) {
    for (const error of endpoint.error_shape ?? []) {
      const retryable = error.retryable ? '是' : '否';
      lines.push(
        `| \`${mdEscape(error.code)}\` | \`${mdEscape(error.message_field)}\` | \`${mdEscape(error.ui_state)}\` | ${retryable} | ${mdEscape(error.notes)} |`,
      );
    }
  }

  lines.push(
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 状态机',
    '',
    '| from | event | to | render_assertion |',
    '| ---- | ----- | -- | ---------------- |',
  );
  const stateFallback = stateAssertions(ui);
  const transitions = mapping.state_machine ?? [];
  for (const transition of transitions) {
    const assertion = transition.render_assertion || stateFallback.get(transition.to) || '';
    lines.push(
      `| \`${mdEscape(transition.from)}\` | ${mdEscape(transition.event)} | \`${mdEscape(transition.to)}\` | ${mdEscape(assertion)} |`,
    );
  }
  if (transitions.length === 0) {
    lines.push('| `idle` | 初始渲染 | `success` | renders main content |');
  }

  lines.push(
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 父组件约定',
    '',
    '若契约中无直接请求，父组件负责传入数据、loading、error 和交互回调。',
    '',
    '<!-- CONTRACT_DERIVED -->',
    '## 待确认项汇总',
    '',
    '| # | 待确认内容 | 需确认对象 | 优先级 |',
    '|---|-----------|----------|-------|',
  );
  if (questions.length > 0) {
    questions.forEach((q, i) => {
      lines.push(
        `| ${i + 1} | ${mdEscape(q.content)} | PM / 设计 / 后端 | ${mdEscape(q.priority)} |`,
      );
    });
  } else {
    lines.push('| — | 无 | — | — |');
  }
  return lines.join('\n');
}

function scenarioName(transition) {
  const target = transition.to ?? 'state';
  let event = String(transition.event ?? '').trim();
  if (event.length > 48) {
    event = event.slice(0, 45) + '...';
  }
  return `${target} state after ${event}`;
}

function generateSpec(ui, api, mapping, capability) {
  const component = ui.name ?? 'Component';
  const assertions = stateAssertions(ui);
  const lines = [
    `# ${capability} — add-${capability} 的增量规格`,
    '',
    '<!-- CONTRACT_DERIVED: 此文件由 generate-output.js 从 YAML 契约机械生成。4B 阶段 LLM 不得添加契约中不存在的 Requirement 或 Scenario，不得修改 state: / request: trace anchor。-->',
    '',
    '## ADDED Requirements',
    '',
    `### Requirement: ${component} 状态覆盖`,
    '',
    'The system SHALL render each contract-defined required state with observable output.',
    '',
  ];

  const coveredStates = new Set();
  for (const transition of mapping.state_machine ?? []) {
    const toState = String(transition.to ?? 'state');
    coveredStates.add(toState);
    const assertion = transition.render_assertion || assertions.get(toState) || 'needs_human_input';
    lines.push(
      `#### Scenario: ${scenarioName(transition)}`,
      '',
      `- WHEN ${transition.event}`,
      `- THEN ${assertion} (\`${toState}\`)`,
      `- AND trace id \`state:${toState}\``,
      '',
    );
  }

  for (const state of ui.states ?? []) {
    const stateId = state.id;
    if (state.required === true && !coveredStates.has(stateId)) {
      lines.push(
        `#### Scenario: ${stateId} state fallback`,
        '',
        `- WHEN ${state.trigger}`,
        `- THEN ${state.render_assertion || 'needs_human_input'} (\`${stateId}\`)`,
        `- AND trace id \`state:${stateId}\``,
        '',
      );
    }
  }

  const events = collectEventNames(mapping);
  if (events.length > 0) {
    lines.push(
      `### Requirement: ${component} 事件输出`,
      '',
      'The system SHALL emit contract-defined UI events without inventing navigation or write-side effects.',
      '',
    );
    for (const event of events) {
      lines.push(
        `#### Scenario: ${event} event`,
        '',
        `- WHEN 用户触发 \`${event}\` 对应的 UI 行为`,
        `- THEN 组件派发 \`${event}\` 事件 1 次`,
        '',
      );
    }
  }

  const enumFields = [];
  for (const endpoint of api.endpoints ?? []) {
    for (const field of endpoint.response_fields ?? []) {
      if (field.enums && field.enums.length > 0) enumFields.push(field);
    }
  }
  if (enumFields.length > 0) {
    lines.push(
      `### Requirement: ${component} 枚举字段展示`,
      '',
      'The system SHALL preserve every API enum value as a distinct observable branch.',
      '',
    );
    for (const field of enumFields) {
      for (const enumValue of field.enums) {
        lines.push(
          `#### Scenario: ${field.name} equals ${enumValue}`,
          '',
          `- WHEN \`${field.name}\` equals \`${enumValue}\``,
          `- THEN renders the UI branch documented for \`${field.name}\` enum \`${enumValue}\``,
          '',
        );
      }
    }
  }

  if (
    (!mapping.state_machine || mapping.state_machine.length === 0) &&
    (!ui.states || ui.states.length === 0)
  ) {
    lines.push(
      '#### Scenario: default render',
      '',
      '- WHEN component receives valid props',
      '- THEN renders main content',
      '',
    );
  }
  return lines.join('\n');
}

function copyContracts(uiPath, apiPath, mappingPath, outDir) {
  const contractsDir = resolve(outDir, 'contracts');
  mkdirSync(contractsDir, { recursive: true });
  const targets = [
    resolve(contractsDir, 'ui-schema.yaml'),
    resolve(contractsDir, 'api-schema.yaml'),
    resolve(contractsDir, 'mapping-logic.yaml'),
  ];
  const sources = [resolve(uiPath), resolve(apiPath), resolve(mappingPath)];
  for (let i = 0; i < sources.length; i++) {
    if (sources[i] !== targets[i]) {
      copyFileSync(sources[i], targets[i]);
    }
  }
  return targets;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), {
      options: ['ui', 'api', 'mapping', 'out-dir', 'capability'],
    });
    requireOpts(args, ['ui', 'api', 'mapping', 'out-dir']);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  let uiDoc;
  let apiDoc;
  let mappingDoc;
  try {
    uiDoc = loadYaml(args.ui);
    apiDoc = loadYaml(args.api);
    mappingDoc = loadYaml(args.mapping);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const ui = uiDoc.ui ?? {};
  const api = apiDoc.api ?? {};
  const mapping = mappingDoc.mapping ?? {};
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(ui) || !isObj(api) || !isObj(mapping)) {
    console.error('contracts must contain ui, api, and mapping objects');
    return 1;
  }

  const capability =
    args.capability || kebabCase(String(ui.name || mapping.component || 'component'));
  const outDir = resolve(args['out-dir']);
  copyContracts(args.ui, args.api, args.mapping, outDir);
  writeText(resolve(outDir, 'notes.md'), generateNotes(ui, api, mapping, capability));
  writeText(resolve(outDir, 'data-fetching.md'), generateDataFetching(ui, api, mapping));
  writeText(
    resolve(outDir, 'specs', capability, 'spec.md'),
    generateSpec(ui, api, mapping, capability),
  );

  console.log(`OK: generated design spec at ${args['out-dir']}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}

export {
  generateNotes,
  generateDataFetching,
  generateSpec,
  collectEventNames,
  collectQuestions,
  kebabCase,
};
