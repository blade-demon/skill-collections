import { z } from 'zod';
import type FileFormat from '@sketch-hq/sketch-file-format-ts';

/**
 * Raw-model typing strategy
 * ------------------------
 * Zod schema and TypeScript interface are intentionally **layered**, not
 * derived from each other:
 *
 *   - `SketchRawModelSchema` is a shallow *runtime* guard. It only checks
 *     that values look like Sketch objects (non-empty objects, required
 *     top-level keys present, asset entries well-formed). It does NOT
 *     validate the deep Sketch schema — that would duplicate the work of
 *     `@sketch-hq/sketch-file-format-ts` at runtime cost.
 *
 *   - `SketchRawModel` is a *development-time* TypeScript interface that
 *     references the official `FileFormat.*` types so downstream code gets
 *     `_class` discriminated-union narrowing and field autocomplete.
 *
 * The two meet at the single boundary function `asSketchRawModel(value)`
 * — that is the *only* sanctioned cast across the zod/TS layer. If a real
 * Sketch file violates the FileFormat shape, downstream guards are
 * responsible for emitting warnings; the boundary function does not pretend
 * to enforce it.
 */

const NonEmptyObjectSchema = z
  .record(z.unknown())
  .refine((value) => Object.keys(value).length > 0, {
    message: 'must be a non-empty object',
  });

export const SketchPageSchema = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1),
    data: NonEmptyObjectSchema,
  })
  .strict();

export const SketchAssetEntrySchema = z
  .object({
    path: z.string().min(1),
    kind: z.enum(['image', 'font', 'preview', 'other']),
    byteLength: z.number().int().nonnegative(),
  })
  .strict();
export type SketchAssetEntry = z.infer<typeof SketchAssetEntrySchema>;

export const SketchRawModelSchema = z
  .object({
    meta: NonEmptyObjectSchema,
    document: NonEmptyObjectSchema,
    pages: z.array(SketchPageSchema).min(1),
    assets: z.array(SketchAssetEntrySchema),
  })
  .strict();

/**
 * Hand-written TS interface that gives downstream consumers full
 * `FileFormat.*` typing without lying about runtime validation.
 *
 * `document.pages` is `FileRef[]` (unexpanded `_ref` pointers) because
 * that matches the on-disk `document.json` shape — `acquire-from-file.ts`
 * does not follow refs. The expanded `Page[]` form lives on `pages[].data`.
 * `FileFormat.Document.pages` is already typed as `FileRef[]` upstream,
 * so no `Omit` rewrap is needed.
 */
export interface SketchRawPage {
  id: string;
  path: string;
  data: FileFormat.Page;
}

export interface SketchRawModel {
  meta: FileFormat.Meta;
  document: FileFormat.Document;
  pages: SketchRawPage[];
  assets: SketchAssetEntry[];
}

/**
 * Legacy alias retained so existing imports of `SketchPage` keep resolving.
 * Prefer `SketchRawPage` in new code.
 */
export type SketchPage = SketchRawPage;

/**
 * Pre-validation shape produced by `acquireFromFile`. Mirrors the structure
 * `SketchRawModel` enforces, but keeps the deep JSON slots as
 * `Record<string, unknown>` because at this stage we have only
 * `JSON.parse`'d objects — no guarantee yet that they conform to the
 * FileFormat schema. `extract-raw.ts` then runs `safeParseSketchRawModel`
 * to validate and cross over into the typed `SketchRawModel`.
 *
 * Keeping a separate input type makes the staging explicit:
 *
 *   acquireFromFile (loose) → safeParseSketchRawModel → SketchRawModel (typed)
 *
 * This avoids the temptation to read `FileFormat.*` fields before zod has
 * even confirmed they're objects.
 */
export interface SketchRawModelInput {
  meta: Record<string, unknown>;
  document: Record<string, unknown>;
  pages: Array<{ id: string; path: string; data: Record<string, unknown> }>;
  assets: SketchAssetEntry[];
}

/**
 * The one sanctioned cast that bridges zod's shallow runtime guarantees
 * and the deep `FileFormat.*` types we develop against. Any other place
 * that wants to treat `unknown` as `SketchRawModel` is doing the wrong
 * thing — route it through here.
 *
 * Throws the underlying `z.ZodError` on failure; callers wrap it in
 * `ExtractError` / `Error` to preserve existing error semantics.
 */
export function asSketchRawModel(value: unknown): SketchRawModel {
  // 1. Shallow runtime guard. Throws ZodError on shape mismatch.
  SketchRawModelSchema.parse(value);
  // 2. The lie is concentrated here: zod only guarantees "non-empty object"
  //    at the FileFormat.* slots; downstream code treats them as the deep
  //    typed shape. Downstream guards (sketch-types.ts in a later commit)
  //    are responsible for handling unknown / new Sketch fields gracefully.
  return value as SketchRawModel;
}

/**
 * Safe-parse variant mirroring `z.ZodType.safeParse` for callers that
 * prefer the `{ success, data | error }` discriminated union ergonomics
 * over try/catch. Used by `normalize.ts` to format the existing
 * "Invalid SketchRawModel payload" message.
 */
export function safeParseSketchRawModel(
  value: unknown,
):
  | { success: true; data: SketchRawModel }
  | { success: false; error: z.ZodError } {
  const parsed = SketchRawModelSchema.safeParse(value);
  if (!parsed.success) return { success: false, error: parsed.error };
  return { success: true, data: value as SketchRawModel };
}
