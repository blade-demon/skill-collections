/**
 * Sketch `resizingConstraint` decoding and per-axis re-layout math.
 *
 * Background and full formula derivation: `docs/batch-2-symbol-scale-investigation.md`.
 *
 * Bit layout (matches `@sketch-hq/sketch-file-format-ts` `ResizingConstraint`):
 * a SET bit means free; a CLEARED bit means pinned (edges) or fixed (size).
 * 63 = None (everything free, the default).
 */

export const DEFAULT_RESIZING_CONSTRAINT = 63;

export interface ResizingFlags {
  rightFree: boolean;
  widthFlex: boolean;
  leftFree: boolean;
  topFree: boolean;
  heightFlex: boolean;
  bottomFree: boolean;
}

export function decodeResizingConstraint(value: unknown): ResizingFlags {
  const rc = typeof value === 'number' ? value : DEFAULT_RESIZING_CONSTRAINT;
  return {
    rightFree: (rc & 1) !== 0,
    widthFlex: (rc & 2) !== 0,
    leftFree: (rc & 4) !== 0,
    topFree: (rc & 8) !== 0,
    heightFlex: (rc & 16) !== 0,
    bottomFree: (rc & 32) !== 0,
  };
}

export interface AxisConstraint {
  startPin: boolean;
  endPin: boolean;
  sizeFixed: boolean;
}

/**
 * Re-lay one axis of a child layer when its container is resized from
 * `parentOld` to `parentNew`. Implements the 8-case table from the
 * investigation doc §4. Over-constrained (pin+pin+fix) resolves to
 * startPin wins. Returns the original (start, size) when `parentOld`
 * is non-positive so callers can emit a warning.
 */
export function applyConstraintAxis(
  parentOld: number,
  parentNew: number,
  start: number,
  size: number,
  flags: AxisConstraint,
): { start: number; size: number } {
  if (!Number.isFinite(parentOld) || parentOld <= 0) return { start, size };
  const { startPin, endPin, sizeFixed } = flags;
  const ratio = parentNew / parentOld;
  const tail = parentOld - start - size;

  if (startPin && endPin) {
    if (sizeFixed) return { start, size }; // over-constrained → startPin wins
    return { start, size: size + (parentNew - parentOld) };
  }
  if (startPin && !endPin) {
    return { start, size: sizeFixed ? size : size * ratio };
  }
  if (!startPin && endPin) {
    if (sizeFixed) return { start: parentNew - parentOld + start, size };
    const newSize = size * ratio;
    return { start: parentNew - tail - newSize, size: newSize };
  }
  // free + free
  if (sizeFixed) {
    return { start: (start + size / 2) * ratio - size / 2, size };
  }
  return { start: start * ratio, size: size * ratio };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContainerSize {
  width: number;
  height: number;
}

/**
 * Re-lay a child frame given its container resize. Each axis runs
 * `applyConstraintAxis` independently with flags decoded from the Sketch
 * `resizingConstraint` bitmask.
 */
export function applyConstraint(
  parentOld: ContainerSize,
  parentNew: ContainerSize,
  frame: Box,
  resizingConstraint: number = DEFAULT_RESIZING_CONSTRAINT,
): Box {
  const flags = decodeResizingConstraint(resizingConstraint);
  const x = applyConstraintAxis(parentOld.width, parentNew.width, frame.x, frame.width, {
    startPin: !flags.leftFree,
    endPin: !flags.rightFree,
    sizeFixed: !flags.widthFlex,
  });
  const y = applyConstraintAxis(parentOld.height, parentNew.height, frame.y, frame.height, {
    startPin: !flags.topFree,
    endPin: !flags.bottomFree,
    sizeFixed: !flags.heightFlex,
  });
  return { x: x.start, y: y.start, width: x.size, height: y.size };
}

/** Whether the container has changed size (float-tolerant). */
export function isResized(parentOld: ContainerSize, parentNew: ContainerSize): boolean {
  return (
    Math.abs(parentOld.width - parentNew.width) > 1e-6 ||
    Math.abs(parentOld.height - parentNew.height) > 1e-6
  );
}
