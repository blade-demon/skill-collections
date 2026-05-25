import { createHash } from 'node:crypto';

export function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function stableSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortValue((value as Record<string, unknown>)[key]);
  }
  return sorted;
}
