import { z } from 'zod';

const NonEmptyObjectSchema = z
  .record(z.unknown())
  .refine((value) => Object.keys(value).length > 0, {
    message: 'must be a non-empty object',
  });

export const SketchPageSchema = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1),
    data: z.record(z.unknown()),
  })
  .strict();
export type SketchPage = z.infer<typeof SketchPageSchema>;

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
export type SketchRawModel = z.infer<typeof SketchRawModelSchema>;
