import {
  DESIGN_IR_SCHEMA_VERSION,
  RawArtifactSchema,
  validateDesignIR,
  type DesignIR,
  type RawArtifact,
  type Warning,
} from '@skill-collections/d2c-core';
import { safeParseSketchRawModel } from './sketch-raw-model.js';
import { selectArtboard, type SelectArtboardOptions } from './normalize/select-artboard.js';
import { deriveSemanticBlock } from './normalize/semantic.js';
import { buildSymbolIndex } from './normalize/symbols.js';
import { getNodeName } from './normalize/sketch-nodes.js';
import { buildVisualBlock } from './normalize/visual.js';

export type NormalizeSketchOptions = SelectArtboardOptions;

export async function normalizeSketchRaw(
  input: unknown,
  options: NormalizeSketchOptions = {},
): Promise<DesignIR> {
  const rawParsed = RawArtifactSchema.safeParse(input);
  if (!rawParsed.success) {
    throw new Error(`Invalid raw artifact: ${rawParsed.error.message}`);
  }
  return normalizeParsedSketchRaw(rawParsed.data, options);
}

export async function normalizeParsedSketchRaw(
  raw: RawArtifact,
  options: NormalizeSketchOptions = {},
): Promise<DesignIR> {
  if (raw.提供方 !== 'sketch') {
    throw new Error(`Sketch normalize expected provider "sketch", got "${raw.提供方}"`);
  }
  const modelParsed = safeParseSketchRawModel(raw.payload);
  if (!modelParsed.success) {
    throw new Error(`Invalid SketchRawModel payload: ${modelParsed.error.message}`);
  }

  const warnings: Warning[] = [];
  const selected = selectArtboard(modelParsed.data, options);
  warnings.push(...selected.warnings);
  const visual = buildVisualBlock({
    model: modelParsed.data,
    artboard: selected.artboard,
    symbols: buildSymbolIndex(modelParsed.data),
    warnings,
  });
  const semantic = deriveSemanticBlock(visual.root, warnings);

  const ir: DesignIR = {
    schemaVersion: DESIGN_IR_SCHEMA_VERSION,
    source: {
      提供方: 'sketch',
      ref: raw.ref,
      rootName: getNodeName(selected.artboard),
    },
    visual,
    semantic,
    interaction: { status: 'draft' },
    warnings: warnings.sort((a, b) =>
      `${a.stage ?? ''}:${a.code}:${a.sourceNodeId ?? ''}:${a.message}`.localeCompare(
        `${b.stage ?? ''}:${b.code}:${b.sourceNodeId ?? ''}:${b.message}`,
      ),
    ),
  };

  const result = validateDesignIR(ir);
  if (!result.ok) {
    throw new Error(
      `Sketch normalize produced invalid DesignIR:\n  - ${result.errors.join('\n  - ')}`,
    );
  }
  return result.value;
}
