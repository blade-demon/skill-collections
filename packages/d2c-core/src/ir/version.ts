/**
 * Schema family and current version for the canonical Design IR.
 *
 * A `schemaVersion` string has the shape `<family>/v<major>.<minor>.<patch>`,
 * e.g. `d2c.design-ir/v0.1.0`.
 */
export const DESIGN_IR_SCHEMA_FAMILY = 'd2c.design-ir';
export const DESIGN_IR_SCHEMA_VERSION = `${DESIGN_IR_SCHEMA_FAMILY}/v0.1.0` as const;

const SUPPORTED_MAJOR = 0;
const SUPPORTED_MINOR = 1;

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

/** Granular outcome of a `schemaVersion` compatibility check. */
export type SchemaVersionCheck =
  | { ok: true; version: SemVer }
  | {
      ok: false;
      code: 'malformed' | 'family-mismatch' | 'major-incompatible' | 'minor-incompatible';
      reason: string;
    };

/**
 * Regex for the `<family>/v<major>.<minor>.<patch>` format. Used both to parse
 * versions here and to structurally validate `DesignIR.schemaVersion`.
 */
export const SCHEMA_VERSION_FORMAT = /^(.+)\/v(\d+)\.(\d+)\.(\d+)$/;

/** Parse a `<family>/v<major>.<minor>.<patch>` string, or `null` if malformed. */
export function parseSchemaVersion(
  value: string,
): { family: string; version: SemVer } | null {
  const m = SCHEMA_VERSION_FORMAT.exec(value);
  if (!m) return null;
  return {
    family: m[1]!,
    version: { major: Number(m[2]), minor: Number(m[3]), patch: Number(m[4]) },
  };
}

/**
 * Decide whether a `schemaVersion` string is compatible with this d2c-core
 * build. Failures are classified so providers get an actionable message:
 *
 * - `malformed`           — not a `<family>/v<x>.<y>.<z>` string;
 * - `family-mismatch`     — wrong schema family;
 * - `major-incompatible`  — different major version;
 * - `minor-incompatible`  — pre-1.0 minor mismatch (minor bumps are breaking
 *                           while major is 0).
 *
 * `patch` differences are always accepted.
 */
export function isCompatible(value: string): SchemaVersionCheck {
  const parsed = parseSchemaVersion(value);
  if (!parsed) {
    return {
      ok: false,
      code: 'malformed',
      reason: `not a "<family>/v<major>.<minor>.<patch>" string: "${value}"`,
    };
  }
  if (parsed.family !== DESIGN_IR_SCHEMA_FAMILY) {
    return {
      ok: false,
      code: 'family-mismatch',
      reason: `expected family "${DESIGN_IR_SCHEMA_FAMILY}", got "${parsed.family}"`,
    };
  }
  const { major, minor } = parsed.version;
  if (major !== SUPPORTED_MAJOR) {
    return {
      ok: false,
      code: 'major-incompatible',
      reason: `this build supports major v${SUPPORTED_MAJOR}, got v${major}`,
    };
  }
  if (minor !== SUPPORTED_MINOR) {
    return {
      ok: false,
      code: 'minor-incompatible',
      reason: `pre-1.0 minor must match exactly: this build supports v${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}, got v${major}.${minor}`,
    };
  }
  return { ok: true, version: parsed.version };
}
