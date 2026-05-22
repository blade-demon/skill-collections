// Draft-7 JSON Schema subset validator. Supports: $ref (internal), oneOf,
// type (string or array), const, enum, minLength, pattern, minItems, items,
// required, properties, additionalProperties (false). This intentionally
// matches the Python validate-contracts.py implementation behavior.

function formatPath(parts) {
  return parts.length === 0 ? '<root>' : parts.map(String).join('.');
}

function repr(value) {
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  return String(value);
}

function typeMatches(value, expected) {
  switch (expected) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number';
    default:
      return true;
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

export function validateJsonSchema(label, document, schema) {
  const errors = [];

  function resolveRef(ref) {
    if (!ref.startsWith('#/')) {
      throw new Error(`unsupported JSON Schema ref ${repr(ref)}`);
    }
    let node = schema;
    for (const part of ref.slice(2).split('/')) {
      node = node[part];
    }
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      throw new Error(`JSON Schema ref ${repr(ref)} does not point to an object`);
    }
    return node;
  }

  function check(value, node, path) {
    if ('$ref' in node) {
      check(value, resolveRef(node.$ref), path);
      return;
    }

    if ('oneOf' in node) {
      const matches = [];
      for (const option of node.oneOf) {
        const before = errors.length;
        const original = errors.slice();
        errors.length = 0;
        check(value, option, path);
        const localErrors = errors.slice();
        errors.length = 0;
        errors.push(...original);
        if (localErrors.length === 0 && errors.length === before) {
          matches.push(option);
        }
      }
      if (matches.length !== 1) {
        errors.push(
          `${label}: schema error at ${formatPath(path)}: value must match exactly one schema`,
        );
      }
      return;
    }

    const expectedType = node.type;
    if (Array.isArray(expectedType)) {
      if (!expectedType.some((t) => typeMatches(value, t))) {
        errors.push(
          `${label}: schema error at ${formatPath(path)}: expected one of [${expectedType.map((t) => `'${t}'`).join(', ')}]`,
        );
        return;
      }
    } else if (typeof expectedType === 'string' && !typeMatches(value, expectedType)) {
      errors.push(`${label}: schema error at ${formatPath(path)}: expected ${expectedType}`);
      return;
    }

    if ('const' in node && !deepEqual(value, node.const)) {
      errors.push(`${label}: schema error at ${formatPath(path)}: expected ${repr(node.const)}`);
    }
    if ('enum' in node && !node.enum.some((opt) => deepEqual(value, opt))) {
      errors.push(
        `${label}: schema error at ${formatPath(path)}: unsupported value ${repr(value)}`,
      );
    }

    if (typeof value === 'string') {
      if (value.length < (node.minLength ?? 0)) {
        errors.push(`${label}: schema error at ${formatPath(path)}: string is too short`);
      }
      if ('pattern' in node && !new RegExp(node.pattern).test(value)) {
        errors.push(
          `${label}: schema error at ${formatPath(path)}: does not match pattern ${repr(node.pattern)}`,
        );
      }
    }

    if (Array.isArray(value)) {
      if (value.length < (node.minItems ?? 0)) {
        errors.push(`${label}: schema error at ${formatPath(path)}: array has too few items`);
      }
      const itemSchema = node.items;
      if (itemSchema && typeof itemSchema === 'object' && !Array.isArray(itemSchema)) {
        value.forEach((item, index) => check(item, itemSchema, [...path, index]));
      }
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const required = node.required ?? [];
      for (const key of required) {
        if (!(key in value)) {
          errors.push(
            `${label}: schema error at ${formatPath([...path, key])}: missing required property`,
          );
        }
      }
      const properties = node.properties ?? {};
      const additional = node.additionalProperties ?? true;
      for (const [key, item] of Object.entries(value)) {
        if (key in properties) {
          check(item, properties[key], [...path, key]);
        } else if (additional === false) {
          errors.push(
            `${label}: schema error at ${formatPath([...path, key])}: additional property is not allowed`,
          );
        }
      }
    }
  }

  check(document, schema, []);
  return errors;
}
