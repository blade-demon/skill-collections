// Dedicated regression tests for validate-contracts.js error-detection paths.
//
// Strategy: build the smallest valid contract trio as a JS baseline, deep-clone
// it for each test, mutate exactly one field to introduce a single error, run
// validate-contracts.js as a subprocess, and assert on a stable fragment of the
// stderr output. This pins down each error code path so future refactors can't
// silently weaken validation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { runNodeScript, makeTmpDir } from './helpers.js';

function baseline() {
  return {
    ui: {
      ui: {
        name: 'TestComp',
        components: [
          {
            id: 'btn',
            parent_id: 'root',
            type: 'Button',
            role: 'action',
            label: 'Submit',
            interactive: true,
            confidence: 'identified',
            repeat_source: '',
            notes: '',
          },
        ],
        states: [
          {
            id: 'loading',
            trigger: 'props.loading === true',
            required: true,
            source: 'policy',
            confidence: 'identified',
            render_assertion: 'renders skeleton placeholder',
          },
          {
            id: 'empty',
            trigger: 'data === null',
            required: true,
            source: 'policy',
            confidence: 'identified',
            render_assertion: 'renders empty hint',
          },
          {
            id: 'success',
            trigger: 'data populated',
            required: true,
            source: 'visible',
            confidence: 'identified',
            render_assertion: 'renders Submit button',
          },
          {
            id: 'error',
            trigger: 'props.error !== null',
            required: true,
            source: 'policy',
            confidence: 'identified',
            render_assertion: 'renders error toast',
          },
        ],
        layout: { structure: 'vertical', notes: '' },
      },
    },
    api: {
      api: {
        endpoints: [
          {
            id: 'fetchAll',
            url: '/api/v1/all',
            method: 'GET',
            params: [{ name: 'keyword', type: 'string', required: true, notes: '' }],
            response_fields: [
              {
                name: 'items',
                type: 'array',
                nullable: false,
                enums: [],
                notes: '',
              },
            ],
          },
        ],
        open_questions: [],
      },
    },
    mapping: {
      mapping: {
        component: 'TestComp',
        data_fetching: {
          requests: [
            {
              id: 'main',
              trigger: 'on_mount',
              endpoint: 'fetchAll',
              call_type: 'on_mount',
              loading_state: true,
              depends_on: [],
            },
          ],
        },
        bindings: [
          {
            source_api: 'items',
            target_ui: 'btn',
            direction: 'api_to_ui',
            transform: '',
          },
        ],
        state_machine: [
          {
            from: 'loading',
            event: 'api_success',
            to: 'success',
          },
        ],
        open_questions: [],
      },
    },
  };
}

function runValidate(docs) {
  const dir = makeTmpDir();
  const paths = {
    ui: resolve(dir, 'ui-schema.yaml'),
    api: resolve(dir, 'api-schema.yaml'),
    mapping: resolve(dir, 'mapping-logic.yaml'),
  };
  writeFileSync(paths.ui, yaml.dump(docs.ui), 'utf8');
  writeFileSync(paths.api, yaml.dump(docs.api), 'utf8');
  writeFileSync(paths.mapping, yaml.dump(docs.mapping), 'utf8');
  return runNodeScript('validate-contracts.js', [
    '--ui',
    paths.ui,
    '--api',
    paths.api,
    '--mapping',
    paths.mapping,
  ]);
}

function expectFailContains(result, fragment) {
  assert.notEqual(
    result.status,
    0,
    `expected non-zero exit; stdout=${result.stdout} stderr=${result.stderr}`,
  );
  assert.ok(
    result.stderr.includes(fragment),
    `expected stderr to contain "${fragment}"\n\nactual stderr:\n${result.stderr}`,
  );
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('baseline contracts validate cleanly', () => {
  const result = runValidate(baseline());
  assert.equal(
    result.status,
    0,
    `expected success; stdout=${result.stdout} stderr=${result.stderr}`,
  );
  assert.match(result.stdout, /OK: contracts are valid/);
});

// ---------------------------------------------------------------------------
// Cross-reference errors (validate function)
// ---------------------------------------------------------------------------

test('mapping.component must match ui.name', () => {
  const docs = baseline();
  docs.mapping.mapping.component = 'OtherComp';
  expectFailContains(runValidate(docs), 'does not match ui.name');
});

test('component parent_id references missing component', () => {
  const docs = baseline();
  docs.ui.ui.components[0].parent_id = 'ghostParent';
  expectFailContains(runValidate(docs), "references missing component 'ghostParent'");
});

test('state scope_components references missing component', () => {
  const docs = baseline();
  docs.ui.ui.states[0].scope_components = ['nonExistentBtn'];
  expectFailContains(
    runValidate(docs),
    "scope_components references missing component 'nonExistentBtn'",
  );
});

test('request endpoint references missing endpoint', () => {
  const docs = baseline();
  docs.mapping.mapping.data_fetching.requests[0].endpoint = 'nonExistentEp';
  expectFailContains(runValidate(docs), "references missing endpoint 'nonExistentEp'");
});

test('request depends_on references missing request', () => {
  const docs = baseline();
  docs.mapping.mapping.data_fetching.requests[0].depends_on = ['ghostReq'];
  expectFailContains(runValidate(docs), "depends on missing request 'ghostReq'");
});

test('ui_to_api binding source_ui references missing component', () => {
  const docs = baseline();
  docs.mapping.mapping.bindings = [
    {
      source_ui: 'ghostBtn',
      target_api: 'keyword',
      direction: 'ui_to_api',
      transform: '',
    },
  ];
  expectFailContains(
    runValidate(docs),
    "binding source_ui references missing component 'ghostBtn'",
  );
});

test('ui_to_api binding target_api references missing param', () => {
  const docs = baseline();
  docs.mapping.mapping.bindings = [
    {
      source_ui: 'btn',
      target_api: 'ghostParam',
      direction: 'ui_to_api',
      transform: '',
    },
  ];
  expectFailContains(
    runValidate(docs),
    "binding target_api references missing API param 'ghostParam'",
  );
});

test('api_to_ui binding source_api references missing field', () => {
  const docs = baseline();
  docs.mapping.mapping.bindings[0].source_api = 'ghostField';
  expectFailContains(
    runValidate(docs),
    "binding source_api references missing response field 'ghostField'",
  );
});

test('api_to_ui binding target_ui references missing component', () => {
  const docs = baseline();
  docs.mapping.mapping.bindings[0].target_ui = 'ghostBtn';
  expectFailContains(
    runValidate(docs),
    "binding target_ui references missing component 'ghostBtn'",
  );
});

test('ui_to_event binding source_ui references missing component', () => {
  const docs = baseline();
  docs.mapping.mapping.bindings = [
    {
      source_ui: 'ghostBtn',
      target_event: 'tap-submit',
      direction: 'ui_to_event',
      transform: '',
    },
  ];
  expectFailContains(
    runValidate(docs),
    "binding source_ui references missing component 'ghostBtn'",
  );
});

test('state_machine transition points to missing state', () => {
  const docs = baseline();
  docs.mapping.mapping.state_machine[0].to = 'ghostState';
  expectFailContains(runValidate(docs), "transition points to missing state 'ghostState'");
});

test('state_machine transition lacks render_assertion fallback', () => {
  const docs = baseline();
  // state_machine transition has no render_assertion AND target state's
  // render_assertion is wiped out, so no fallback exists.
  docs.ui.ui.states.find((s) => s.id === 'success').render_assertion = '';
  expectFailContains(runValidate(docs), 'has no render_assertion fallback');
});

test('required state missing render_assertion', () => {
  const docs = baseline();
  docs.ui.ui.states.find((s) => s.id === 'empty').render_assertion = '';
  expectFailContains(runValidate(docs), "required state 'empty' is missing render_assertion");
});

// ---------------------------------------------------------------------------
// Uniqueness errors
// ---------------------------------------------------------------------------

test('duplicate component id is rejected', () => {
  const docs = baseline();
  docs.ui.ui.components.push({
    ...docs.ui.ui.components[0],
    parent_id: 'root',
  });
  expectFailContains(runValidate(docs), "ui.components[].id contains duplicate value 'btn'");
});

test('duplicate state id is rejected', () => {
  const docs = baseline();
  docs.ui.ui.states.push({ ...docs.ui.ui.states[0] });
  expectFailContains(runValidate(docs), "ui.states[].id contains duplicate value 'loading'");
});

test('duplicate endpoint id is rejected', () => {
  const docs = baseline();
  docs.api.api.endpoints.push({ ...docs.api.api.endpoints[0] });
  expectFailContains(runValidate(docs), "api.endpoints[].id contains duplicate value 'fetchAll'");
});

test('duplicate request id is rejected', () => {
  const docs = baseline();
  docs.mapping.mapping.data_fetching.requests.push({
    ...docs.mapping.mapping.data_fetching.requests[0],
  });
  expectFailContains(
    runValidate(docs),
    "mapping.data_fetching.requests[].id contains duplicate value 'main'",
  );
});

test('duplicate response field name within an endpoint is rejected', () => {
  const docs = baseline();
  docs.api.api.endpoints[0].response_fields.push({
    ...docs.api.api.endpoints[0].response_fields[0],
  });
  expectFailContains(
    runValidate(docs),
    "api.endpoints[fetchAll].response_fields[].name contains duplicate value 'items'",
  );
});

// ---------------------------------------------------------------------------
// JSON Schema enforcement (representative samples)
// ---------------------------------------------------------------------------

test('missing required ui field is rejected by schema', () => {
  const docs = baseline();
  delete docs.ui.ui.name;
  expectFailContains(runValidate(docs), 'missing required property');
});

test('type mismatch on boolean field is rejected by schema', () => {
  const docs = baseline();
  docs.ui.ui.components[0].interactive = 'yes'; // expected boolean
  expectFailContains(runValidate(docs), 'expected boolean');
});

test('enum violation on role is rejected by schema', () => {
  const docs = baseline();
  docs.ui.ui.components[0].role = 'primary-action'; // not in enum
  expectFailContains(runValidate(docs), 'unsupported value');
});

test('pattern violation on component id is rejected by schema', () => {
  const docs = baseline();
  docs.ui.ui.components[0].id = 'Bad-ID'; // violates ^[a-z][A-Za-z0-9]*$
  expectFailContains(runValidate(docs), 'does not match pattern');
});

test('oneOf violation on binding direction is rejected by schema', () => {
  const docs = baseline();
  docs.mapping.mapping.bindings = [
    {
      source_ui: 'btn',
      target_event: 'tap-x',
      direction: 'ui_to_unknown', // not one of the three
      transform: '',
    },
  ];
  expectFailContains(runValidate(docs), 'must match exactly one schema');
});
