import { z } from 'zod'

// ── Slot roles ──────────────────────────────────────────────────────────────

export const ROLE_WORDS = ['nav','title','meta','media','form','list','card','action','status','hint','brand','empty'] as const
export type RoleWord = typeof ROLE_WORDS[number]

export const CONTAINER_ROLES = ['nav','list','card','form'] as const
export type ContainerRole = typeof CONTAINER_ROLES[number]

export const OVERLAY_TYPES = ['modal','drawer','toast','sheet'] as const
export const FLOAT_ANCHORS = ['br','bl','tr','tl'] as const
export const DIVIDER_STYLES = ['dashed','solid','dotted'] as const

// ── Full Signature ───────────────────────────────────────────────────────────

export const SignatureSlotSchema = z.string().min(1)

export const SignatureObjectSchema = z.object({
  T: SignatureSlotSchema,
  M: SignatureSlotSchema,
  B: SignatureSlotSchema,
  O: SignatureSlotSchema,
  F: SignatureSlotSchema,
}).strict()

export const NotesSchema = z.object({
  overlay_type: z.enum(OVERLAY_TYPES).nullable().optional(),
  float_anchor: z.enum(FLOAT_ANCHORS).nullable().optional(),
  occluded: z.array(z.string()).nullable().optional(),
  divider: z.enum(DIVIDER_STYLES).nullable().optional(),
  tab_active: z.string().nullable().optional(),
  list_count: z.union([z.number().int(), z.string().regex(/^[≥>=]\d+$/)]).nullable().optional(),
}).strict()

export const ImageResultSchema = z.object({
  filename: z.string().min(1),
  signature: SignatureObjectSchema,
  notes: NotesSchema,
})

export const BatchResultSchema = z.object({
  batch: z.string().min(1),
  images: z.array(ImageResultSchema).min(1),
})

export type BatchResult = z.infer<typeof BatchResultSchema>
export type ImageResult = z.infer<typeof ImageResultSchema>
export type SignatureObject = z.infer<typeof SignatureObjectSchema>

// ── Coarse Signature ─────────────────────────────────────────────────────────

const COARSE_REASONS = [
  'stable top-level skeleton',
  'slot contains nested container',
  'candidate group inconsistent',
  'user requested full signature',
  'uncertain top-level role',
] as const

export const CoarseSignatureSlotSchema = z.array(z.enum(ROLE_WORDS))

export const CoarseImageResultSchema = z.object({
  filename: z.string().min(1),
  coarse_signature: z.object({ T: CoarseSignatureSlotSchema, M: CoarseSignatureSlotSchema, B: CoarseSignatureSlotSchema }).strict(),
  needs_full_signature: z.boolean(),
  reason: z.enum(COARSE_REASONS),
})

export const CoarseBatchResultSchema = z.object({
  batch: z.string().min(1),
  images: z.array(CoarseImageResultSchema).min(1),
})

export type CoarseBatchResult = z.infer<typeof CoarseBatchResultSchema>

// ── Coverage Table ────────────────────────────────────────────────────────────

export const CoverageStatusSchema = z.enum(['covered','reused','pending'])

export const CoverageEntrySchema = z.object({
  signaturePath: z.string().min(1),
  files: z.array(z.string()),
  components: z.array(z.string()),
  status: CoverageStatusSchema,
  note: z.string().optional(),
})

export const CoverageInputSchema = z.object({
  entries: z.array(CoverageEntrySchema),
})

export type CoverageEntry = z.infer<typeof CoverageEntrySchema>
export type CoverageInput = z.infer<typeof CoverageInputSchema>

// ── Skeleton Config ───────────────────────────────────────────────────────────

export const PropDefSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
})

export const DiscriminatorDefSchema = z.object({
  propName: z.string(),
  type: z.string(),
  variants: z.array(z.string()).min(2),
})

// ComponentNode interface is the output shape (after defaults are applied)
export interface ComponentNode {
  name: string
  element: string
  props: z.infer<typeof PropDefSchema>[]
  discriminator?: z.infer<typeof DiscriminatorDefSchema>
  children: ComponentNode[]
}

// ComponentNodeInput is the input shape (before defaults are applied)
export interface ComponentNodeInput {
  name: string
  element?: string
  props?: z.infer<typeof PropDefSchema>[]
  discriminator?: z.infer<typeof DiscriminatorDefSchema>
  children?: ComponentNodeInput[]
}

export const ComponentNodeSchema: z.ZodType<ComponentNode, z.ZodTypeDef, ComponentNodeInput> = z.lazy(() =>
  z.object({
    name: z.string().regex(/^[A-Z]/),
    element: z.string().default('div'),
    props: z.array(PropDefSchema).default([]),
    discriminator: DiscriminatorDefSchema.optional(),
    children: z.array(ComponentNodeSchema).default([]),
  })
)

export const SkeletonConfigSchema = z.object({
  framework: z.enum(['react','vue3','vue2']),
  lang: z.enum(['ts','js']),
  style: z.enum(['css-modules','bem']),
  rootComponent: ComponentNodeSchema,
})

export type SkeletonConfig = z.infer<typeof SkeletonConfigSchema>
export type PropDef = z.infer<typeof PropDefSchema>
export type DiscriminatorDef = z.infer<typeof DiscriminatorDefSchema>

export interface GeneratedFile {
  path: string
  content: string
}
