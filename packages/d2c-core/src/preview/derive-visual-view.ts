import {
  assertDesignIR,
  VisualViewSchema,
  type DesignIR,
  type VisualView,
  type Warning,
} from '../ir';
import { applySymbolOverrides, type OverrideStats } from './apply-overrides';
import { stableJson, stableSha256 } from '../utils/stable-json';

export interface DeriveVisualViewResult {
  visualView: VisualView;
  warnings: Warning[];
  stats: OverrideStats;
}

export function deriveVisualView(input: DesignIR): DeriveVisualViewResult {
  const designIr = assertDesignIR(input);
  const overrideResult = applySymbolOverrides(designIr.visual);
  const visualView: VisualView = {
    kind: 'visual-view',
    generatedFrom: {
      schemaVersion: designIr.schemaVersion,
      sourceRef: designIr.source.ref,
      designIrHash: stableSha256(stableJson(designIr)),
    },
    body: overrideResult.visual,
  };

  const parsed = VisualViewSchema.safeParse(visualView);
  if (!parsed.success) {
    throw new Error(
      `Invalid VisualView:\n  - ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n  - ')}`,
    );
  }

  return {
    visualView: parsed.data,
    warnings: [...designIr.warnings, ...overrideResult.warnings],
    stats: overrideResult.stats,
  };
}
