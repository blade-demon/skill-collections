import { z } from 'zod';

import { ContractStatusSchema } from './schema';
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

export const ComponentPlanSchema = z
  .object({
    kind: z.literal('component-plan'),
    generatedFrom: GeneratedFromSchema,
    status: ContractStatusSchema,
    body: z.record(z.unknown()),
  })
  .strict();
export type ComponentPlan = z.infer<typeof ComponentPlanSchema>;
