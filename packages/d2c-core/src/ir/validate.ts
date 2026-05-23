import { z } from 'zod';

import { DesignIRSchema, type DesignIR } from './schema';
import { isCompatible } from './version';

export type ValidationResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; errors: string[] };

/** Format a `ZodError` into readable `path: message` strings. */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

/**
 * Validate an unknown value as a canonical Design IR:
 *
 *  1. structural check against `DesignIRSchema`;
 *  2. `schemaVersion` compatibility against this d2c-core build.
 *
 * Returns a result object (rather than throwing) so the pipeline runner can
 * branch on it. Use `assertDesignIR` when a throw is preferred.
 */
export function validateDesignIR(input: unknown): ValidationResult<DesignIR> {
  const parsed = DesignIRSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: formatZodIssues(parsed.error) };
  }

  const compat = isCompatible(parsed.data.schemaVersion);
  if (!compat.ok) {
    return { ok: false, errors: [`schemaVersion [${compat.code}]: ${compat.reason}`] };
  }

  return { ok: true, value: parsed.data, warnings: [] };
}

/** Throwing variant of {@link validateDesignIR}. */
export function assertDesignIR(input: unknown): DesignIR {
  const result = validateDesignIR(input);
  if (!result.ok) {
    throw new Error(`Invalid DesignIR:\n  - ${result.errors.join('\n  - ')}`);
  }
  return result.value;
}
