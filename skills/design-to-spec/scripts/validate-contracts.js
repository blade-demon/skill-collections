#!/usr/bin/env node
// Validate design-to-spec YAML contracts: schema, uniqueness, and cross-refs.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadYaml } from './lib/yaml.js';
import { validateJsonSchema } from './lib/json-schema.js';
import { parseArgs, requireOpts } from './lib/cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolve(__dirname, '..', 'schemas');

function repr(value) {
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (value === null || value === undefined) return 'None';
  return String(value);
}

function loadJson(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`${path}: cannot read: ${err.message}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path}: invalid JSON: ${err.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${path}: top-level JSON must be a mapping`);
  }
  return data;
}

function validateSchema(label, document, schemaPath) {
  return validateJsonSchema(label, document, loadJson(schemaPath));
}

function findDuplicates(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    if (seen.has(item)) duplicates.add(item);
    else seen.add(item);
  }
  return duplicates;
}

function validateUniqueValues(label, values, errors) {
  const filtered = values.filter((v) => v);
  const dups = [...findDuplicates(filtered)].sort();
  for (const dup of dups) {
    errors.push(`${label} contains duplicate value ${repr(dup)}`);
  }
}

function collectApiIds(apiDoc) {
  const endpoints = apiDoc.api?.endpoints ?? [];
  const endpointIds = new Set();
  const params = new Set();
  const fields = new Set();
  for (const endpoint of endpoints) {
    if (endpoint.id) endpointIds.add(endpoint.id);
    for (const p of endpoint.params ?? []) {
      if (p.name) params.add(p.name);
    }
    for (const b of endpoint.request_body ?? []) {
      if (b.name) params.add(b.name);
    }
    for (const f of endpoint.response_fields ?? []) {
      if (f.name) fields.add(f.name);
    }
  }
  return { endpointIds, params, fields };
}

function validateUniqueness(ui, api, mapping) {
  const errors = [];
  const components = ui.components ?? [];
  const states = ui.states ?? [];
  validateUniqueValues(
    'ui.components[].id',
    components.map((i) => i.id),
    errors,
  );
  validateUniqueValues(
    'ui.states[].id',
    states.map((i) => i.id),
    errors,
  );

  const endpoints = api.endpoints ?? [];
  validateUniqueValues(
    'api.endpoints[].id',
    endpoints.map((i) => i.id),
    errors,
  );
  for (const endpoint of endpoints) {
    const eid = endpoint.id ?? '<unknown>';
    const label = `api.endpoints[${eid}]`;
    validateUniqueValues(
      `${label}.params[].name`,
      (endpoint.params ?? []).map((i) => i.name),
      errors,
    );
    validateUniqueValues(
      `${label}.response_fields[].name`,
      (endpoint.response_fields ?? []).map((i) => i.name),
      errors,
    );
  }

  validateUniqueValues(
    'api.open_questions[].id',
    (api.open_questions ?? []).map((i) => i.id),
    errors,
  );

  const requests = mapping.data_fetching?.requests ?? [];
  validateUniqueValues(
    'mapping.data_fetching.requests[].id',
    requests.map((i) => i.id),
    errors,
  );
  validateUniqueValues(
    'mapping.open_questions[].id',
    (mapping.open_questions ?? []).map((i) => i.id),
    errors,
  );

  return errors;
}

function validate(uiDoc, apiDoc, mappingDoc) {
  const errors = [];
  let ui = uiDoc.ui ?? {};
  let api = apiDoc.api ?? {};
  let mapping = mappingDoc.mapping ?? {};

  if (typeof ui !== 'object' || ui === null || Array.isArray(ui)) {
    errors.push('ui-schema: missing ui mapping');
    ui = {};
  }
  if (typeof api !== 'object' || api === null || Array.isArray(api)) {
    errors.push('api-schema: missing api mapping');
    api = {};
  }
  if (typeof mapping !== 'object' || mapping === null || Array.isArray(mapping)) {
    errors.push('mapping-logic: missing mapping mapping');
    mapping = {};
  }

  const componentName = ui.name;
  if (componentName && mapping.component && mapping.component !== componentName) {
    errors.push(
      `mapping.component ${repr(mapping.component)} does not match ui.name ${repr(componentName)}`,
    );
  }

  errors.push(...validateUniqueness(ui, api, mapping));

  const components = ui.components ?? [];
  const componentIds = new Set(components.map((i) => i.id).filter(Boolean));
  const states = ui.states ?? [];
  const stateIds = new Set(states.map((i) => i.id).filter(Boolean));
  const stateAssertions = new Map();
  for (const state of states) {
    if (state.id) stateAssertions.set(state.id, state.render_assertion);
  }

  for (const item of components) {
    const parentId = item.parent_id;
    if (parentId && parentId !== 'root' && !componentIds.has(parentId)) {
      errors.push(
        `ui.components[${item.id}].parent_id references missing component ${repr(parentId)}`,
      );
    }
  }

  for (const state of states) {
    for (const scoped of state.scope_components ?? []) {
      if (!componentIds.has(scoped)) {
        errors.push(
          `ui.states[${state.id}].scope_components references missing component ${repr(scoped)}`,
        );
      }
    }
  }

  const { endpointIds, params: paramNames, fields: responseFields } = collectApiIds(apiDoc);
  const requests = mapping.data_fetching?.requests ?? [];
  const requestIds = new Set(requests.map((i) => i.id).filter(Boolean));
  for (const request of requests) {
    const endpoint = request.endpoint;
    if (endpoint && endpointIds.size > 0 && !endpointIds.has(endpoint)) {
      errors.push(`request ${repr(request.id)} references missing endpoint ${repr(endpoint)}`);
    }
    for (const dep of request.depends_on ?? []) {
      if (!requestIds.has(dep)) {
        errors.push(`request ${repr(request.id)} depends on missing request ${repr(dep)}`);
      }
    }
  }

  for (const binding of mapping.bindings ?? []) {
    const direction = binding.direction;
    if (direction === 'ui_to_api') {
      if (!componentIds.has(binding.source_ui)) {
        errors.push(`binding source_ui references missing component ${repr(binding.source_ui)}`);
      }
      if (!paramNames.has(binding.target_api)) {
        errors.push(`binding target_api references missing API param ${repr(binding.target_api)}`);
      }
    } else if (direction === 'api_to_ui') {
      if (!responseFields.has(binding.source_api)) {
        errors.push(
          `binding source_api references missing response field ${repr(binding.source_api)}`,
        );
      }
      if (!componentIds.has(binding.target_ui)) {
        errors.push(`binding target_ui references missing component ${repr(binding.target_ui)}`);
      }
    } else if (direction === 'ui_to_event') {
      if (!componentIds.has(binding.source_ui)) {
        errors.push(`binding source_ui references missing component ${repr(binding.source_ui)}`);
      }
      if (!binding.target_event) {
        errors.push('ui_to_event binding is missing target_event');
      }
    } else {
      errors.push(`binding has unsupported direction ${repr(direction)}`);
    }
  }

  for (const transition of mapping.state_machine ?? []) {
    const toState = transition.to;
    if (!stateIds.has(toState)) {
      errors.push(`state_machine transition points to missing state ${repr(toState)}`);
    }
    if (!transition.render_assertion && !stateAssertions.get(toState)) {
      errors.push(`state_machine transition to ${repr(toState)} has no render_assertion fallback`);
    }
  }

  for (const state of states) {
    if (state.required === true && !state.render_assertion) {
      errors.push(`required state ${repr(state.id)} is missing render_assertion`);
    }
  }

  return errors;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), {
      options: ['ui', 'api', 'mapping', 'ui-schema', 'api-schema', 'mapping-schema'],
    });
    requireOpts(args, ['ui', 'api', 'mapping']);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const uiSchemaPath = args['ui-schema'] ?? resolve(SCHEMA_DIR, 'ui-schema.json');
  const apiSchemaPath = args['api-schema'] ?? resolve(SCHEMA_DIR, 'api-schema.json');
  const mappingSchemaPath = args['mapping-schema'] ?? resolve(SCHEMA_DIR, 'mapping-logic.json');

  let errors = [];
  try {
    const uiDoc = loadYaml(args.ui);
    const apiDoc = loadYaml(args.api);
    const mappingDoc = loadYaml(args.mapping);
    errors.push(...validateSchema('ui-schema', uiDoc, uiSchemaPath));
    errors.push(...validateSchema('api-schema', apiDoc, apiSchemaPath));
    errors.push(...validateSchema('mapping-logic', mappingDoc, mappingSchemaPath));
    if (errors.length === 0) {
      errors.push(...validate(uiDoc, apiDoc, mappingDoc));
    }
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    return 1;
  }

  console.log('OK: contracts are valid');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}

export { validate, validateUniqueness, validateSchema };
