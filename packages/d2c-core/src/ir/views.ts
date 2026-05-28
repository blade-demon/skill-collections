import { z } from 'zod';

import { VisualBlockSchema } from './visual';
import { GeneratedFromSchema } from './generated-from';
import { SemanticViewBodySchema } from '../semantic/schema';

export { GeneratedFromSchema, type GeneratedFrom } from './generated-from';

/* `visual-view` firms up in Stage 4 because preview rendering needs a real
 * VisualBlock. Later views remain envelope-only until their stages land. */

export const VisualViewSchema = z
  .object({
    kind: z.literal('visual-view'),
    generatedFrom: GeneratedFromSchema,
    body: VisualBlockSchema,
  })
  .strict();
export type VisualView = z.infer<typeof VisualViewSchema>;

export const SemanticViewSchema = z
  .object({
    kind: z.literal('semantic-view'),
    generatedFrom: GeneratedFromSchema,
    body: SemanticViewBodySchema,
  })
  .strict();
export type SemanticView = z.infer<typeof SemanticViewSchema>;

export {
  InteractionSpecSchema,
  type InteractionSpec,
  InteractionStatusSchema,
  type InteractionStatus,
} from '../contract/interaction-schema';

/**
 * Stage 5C — the canonical `ComponentPlanSchema` lives in
 * `../contract/component-plan-schema`. This file re-exports it (and the
 * `mode` enum) for the handful of legacy callers that imported the loose
 * `ir/views.ts` schema directly. The root barrel resolves
 * `ComponentPlanSchema` via `../contract`, so consumers reaching for it
 * through `index.ts` already pick up the canonical binding.
 */
export {
  ComponentPlanSchema,
  type ComponentPlan,
  ComponentPlanModeSchema,
  type ComponentPlanMode,
} from '../contract/component-plan-schema';
