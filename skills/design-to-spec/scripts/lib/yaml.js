import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

export function loadYaml(path) {
  const text = readFileSync(path, 'utf8');
  let data;
  try {
    data = yaml.load(text);
  } catch (err) {
    throw new Error(`${path}: invalid YAML: ${err.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${path}: top-level YAML must be a mapping`);
  }
  return data;
}
