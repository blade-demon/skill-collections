import { z } from 'zod';

export const SemanticCandidateSchema = z
  .object({
    nodeId: z.string().min(1),
    candidateName: z.string().min(1),
    confidence: z.enum(['low', 'medium', 'high']),
    reason: z.string().min(1),
    symbolMasterId: z.string().optional(),
  })
  .strict();
export type SemanticCandidate = z.infer<typeof SemanticCandidateSchema>;

export const SemanticBlockSchema = z
  .object({
    candidates: z.array(SemanticCandidateSchema),
  })
  .strict();
export type SemanticBlock = z.infer<typeof SemanticBlockSchema>;
