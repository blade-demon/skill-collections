import { z } from 'zod';

export const ColorSchema = z.string().regex(/^#[0-9A-Fa-f]{8}$/);
export type Color = z.infer<typeof ColorSchema>;

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Rect = z.infer<typeof RectSchema>;
