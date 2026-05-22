import { validateDesignIR, formatZodIssues, type ValidationResult } from '../ir/validate';
import type { DesignIR } from '../ir/schema';
import { RawArtifactSchema, type Provider, type RawArtifact } from './port';

/**
 * Run a provider's `normalize` and validate the whole hand-off:
 *
 *  1. the raw artifact is structurally valid (`RawArtifactSchema`);
 *  2. the raw artifact was produced by this provider (`raw.provider === provider.id`);
 *  3. `normalize` output is a valid canonical Design IR (`validateDesignIR`);
 *  4. the IR attributes itself to this provider (`source.provider === provider.id`).
 *
 * Steps 2 and 4 guard against trace-anchor drift — e.g. a Figma raw artifact
 * fed to the MasterGo provider, or a `normalize` that mislabels `source`.
 */
export async function normalizeAndValidate(
  provider: Provider,
  raw: RawArtifact,
): Promise<ValidationResult<DesignIR>> {
  const rawParsed = RawArtifactSchema.safeParse(raw);
  if (!rawParsed.success) {
    return { ok: false, errors: formatZodIssues(rawParsed.error) };
  }
  if (rawParsed.data.provider !== provider.id) {
    return {
      ok: false,
      errors: [
        `raw artifact provider "${rawParsed.data.provider}" does not match provider id "${provider.id}"`,
      ],
    };
  }

  const ir = await provider.normalize(rawParsed.data);
  const result = validateDesignIR(ir);
  if (!result.ok) return result;

  if (result.value.source.provider !== provider.id) {
    return {
      ok: false,
      errors: [
        `design IR source.provider "${result.value.source.provider}" does not match provider id "${provider.id}"`,
      ],
    };
  }
  return result;
}
