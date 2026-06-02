import type FileFormat from '@sketch-hq/sketch-file-format-ts';

/**
 * Typed boundary helpers for Sketch layer classification.
 *
 * Design rationale
 * ----------------
 * `SketchRawModel` (post-validation) types deep fields as `FileFormat.*`,
 * but real-world Sketch files may carry:
 *
 *   - layers whose `_class` is missing or non-string (corrupt file)
 *   - layers whose `_class` is a string we don't yet know about (Sketch
 *     added a new node type in a release newer than `@sketch-hq/sketch-file-format-ts`)
 *   - layers that nominally match a known `_class` but omit "required"
 *     fields the official type marks as non-optional
 *
 * This module is the **only sanctioned bridge from `unknown` to
 * `FileFormat.*`**. Downstream normalize code is expected to flow values
 * through `asAnyLayer` (entry) and then narrow with `is*` guards.
 *
 * The boundary is intentionally **two-layer**:
 *
 *   1. `SketchLayerLike` — accepts anything object-shaped with a probable
 *      `_class` / `do_objectID`. This keeps unknown-but-layer-looking
 *      nodes alive so callers can still emit a meaningful warning
 *      ("unknown-node-class" with the actual `_class` string) instead of
 *      having them swallowed at the type boundary.
 *
 *   2. `is*` type guards — collapse known `_class` strings into the
 *      corresponding `FileFormat.*` discriminated-union member, so
 *      downstream code can read `FileFormat.SymbolInstance` fields
 *      without `as any`.
 *
 * Adding new guards is cheap; do it as downstream callers need them
 * rather than pre-populating speculatively.
 */

// ─────────────────────────────────────────────────────────────────────────
// Sentinels
// ─────────────────────────────────────────────────────────────────────────

/** Returned by `getLayerClass` when the layer has no `_class` field at all. */
export const MISSING_CLASS_SENTINEL = '<missing-class>';
/** Returned by `getLayerClass` when `_class` exists but is not a string. */
export const INVALID_CLASS_SENTINEL = '<invalid-class>';
/** Returned by `getLayerId` when the layer has no `do_objectID` field. */
export const MISSING_ID_SENTINEL = '<missing-id>';
/** Returned by `getLayerId` when `do_objectID` exists but is not a non-empty string. */
export const INVALID_ID_SENTINEL = '<invalid-id>';

/**
 * Convenience predicate: true when the layer class string is one of the
 * two corrupt-file sentinels (not just an unknown-but-real class).
 */
export function isCorruptClass(klass: string): boolean {
  return klass === MISSING_CLASS_SENTINEL || klass === INVALID_CLASS_SENTINEL;
}

// ─────────────────────────────────────────────────────────────────────────
// Entry-boundary type
// ─────────────────────────────────────────────────────────────────────────

/**
 * The "looks like a Sketch layer" shape. Use as the input to `is*` guards
 * so unknown `_class` strings still flow through (and produce warnings)
 * instead of being silently dropped at the type boundary.
 *
 * Intersecting `Record<string, unknown>` preserves bag-of-fields access for
 * incremental migration: downstream code can still read fields that
 * `FileFormat.*` doesn't declare yet, with an explicit cast at the call site.
 */
export type SketchLayerLike = Record<string, unknown> & {
  _class?: string;
  do_objectID?: string;
  name?: string;
};

/**
 * Narrow an `unknown` to a "layer-like" object. Returns `undefined` for
 * anything that isn't a plain object (null, primitives, arrays). Does NOT
 * verify that `_class` is present — callers use `getLayerClass` to read
 * it and decide whether to emit a corruption warning.
 */
export function asAnyLayer(value: unknown): SketchLayerLike | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as SketchLayerLike;
}

// ─────────────────────────────────────────────────────────────────────────
// Stable string extractors with sentinel returns
// ─────────────────────────────────────────────────────────────────────────

/**
 * Read the layer's `_class`. Returns a real `_class` string when present
 * (which may or may not match a known `FileFormat.*` member — that's
 * deliberate: unknown classes flow through), or one of the corruption
 * sentinels if the field is missing or wrong type.
 *
 * `MISSING_CLASS_SENTINEL` vs `INVALID_CLASS_SENTINEL` lets callers
 * distinguish "Sketch file is corrupt" from "Sketch shipped a new
 * field type" in their warning messages.
 */
export function getLayerClass(value: unknown): string {
  const layer = asAnyLayer(value);
  if (!layer) return MISSING_CLASS_SENTINEL;
  if (!('_class' in layer)) return MISSING_CLASS_SENTINEL;
  const klass = layer._class;
  if (typeof klass !== 'string') return INVALID_CLASS_SENTINEL;
  return klass;
}

/**
 * Read the layer's `do_objectID`. Returns the real id when present and
 * non-empty, otherwise a sentinel. Mirrors `getLayerClass` semantics for
 * symmetry; callers should not feed sentinels back into other Sketch APIs.
 */
export function getLayerId(value: unknown): string {
  const layer = asAnyLayer(value);
  if (!layer) return MISSING_ID_SENTINEL;
  if (!('do_objectID' in layer)) return MISSING_ID_SENTINEL;
  const id = layer.do_objectID;
  if (typeof id !== 'string' || id.length === 0) return INVALID_ID_SENTINEL;
  return id;
}

// ─────────────────────────────────────────────────────────────────────────
// Type guards — narrow SketchLayerLike to a FileFormat.* discriminated union
// ─────────────────────────────────────────────────────────────────────────
//
// Add new guards lazily. Each guard checks only `_class` — the rest of
// the FileFormat shape is trusted because we passed through the
// `asSketchRawModel` boundary upstream. If a real file violates the
// shape (e.g. missing required field), downstream code crashes the
// normalize for that layer and produces a warning, which is the
// behaviour we want for "type lie at the boundary".

export function isSymbolMaster(layer: SketchLayerLike): layer is FileFormat.SymbolMaster {
  return layer._class === 'symbolMaster';
}

export function isSymbolInstance(layer: SketchLayerLike): layer is FileFormat.SymbolInstance {
  return layer._class === 'symbolInstance';
}

export function isArtboard(layer: SketchLayerLike): layer is FileFormat.Artboard {
  return layer._class === 'artboard';
}

export function isGroup(layer: SketchLayerLike): layer is FileFormat.Group {
  return layer._class === 'group';
}

export function isText(layer: SketchLayerLike): layer is FileFormat.Text {
  return layer._class === 'text';
}

export function isBitmap(layer: SketchLayerLike): layer is FileFormat.Bitmap {
  return layer._class === 'bitmap';
}

export function isShapeGroup(layer: SketchLayerLike): layer is FileFormat.ShapeGroup {
  return layer._class === 'shapeGroup';
}

export function isShapePath(layer: SketchLayerLike): layer is FileFormat.ShapePath {
  return layer._class === 'shapePath';
}
