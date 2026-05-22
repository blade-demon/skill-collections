import { z } from 'zod';

const ColorSchema = z.string().regex(/^#[0-9A-Fa-f]{8}$/, {
  message: 'must be #RRGGBBAA',
});

export const LayoutSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict();
export type Layout = z.infer<typeof LayoutSchema>;

export const FillSchema = z
  .object({
    type: z.string().optional(),
    color: ColorSchema.optional(),
    opacity: z.number().min(0).max(1).optional(),
    raw: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type Fill = z.infer<typeof FillSchema>;

export const BorderSchema = z
  .object({
    type: z.string().optional(),
    color: ColorSchema.optional(),
    thickness: z.number().nonnegative().optional(),
    position: z.union([z.string(), z.number()]).optional(),
    raw: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type Border = z.infer<typeof BorderSchema>;

export const EffectSchema = z
  .object({
    type: z.string().optional(),
    color: ColorSchema.optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    blur: z.number().nonnegative().optional(),
    spread: z.number().optional(),
    raw: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type Effect = z.infer<typeof EffectSchema>;

export const RadiusSchema = z.union([
  z.number().nonnegative(),
  z
    .object({
      topLeft: z.number().nonnegative(),
      topRight: z.number().nonnegative(),
      bottomRight: z.number().nonnegative(),
      bottomLeft: z.number().nonnegative(),
    })
    .strict(),
]);
export type Radius = z.infer<typeof RadiusSchema>;

export const StyleSchema = z
  .object({
    fills: z.array(FillSchema).optional(),
    borders: z.array(BorderSchema).optional(),
    effects: z.array(EffectSchema).optional(),
    opacity: z.number().min(0).max(1).optional(),
    radius: RadiusSchema.optional(),
    raw: z.record(z.unknown()).optional(),
  })
  .strict();
export type Style = z.infer<typeof StyleSchema>;

export const TextContentSchema = z
  .object({
    content: z.string(),
    style: z
      .object({
        fontFamily: z.string().optional(),
        fontSize: z.number().positive().optional(),
        fontWeight: z.union([z.number(), z.string()]).optional(),
        lineHeight: z.number().positive().optional(),
        color: ColorSchema.optional(),
        textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TextContent = z.infer<typeof TextContentSchema>;

export const AssetEntrySchema = z
  .object({
    id: z.string().min(1),
    ref: z.string().min(1),
    kind: z.enum(['image', 'font', 'preview', 'other']),
    originalPath: z.string().optional(),
  })
  .strict();
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const VisualNodeKindSchema = z.enum(['frame', 'group', 'text', 'image', 'vector', 'shape']);
export type VisualNodeKind = z.infer<typeof VisualNodeKindSchema>;

export const SourceTraceSchema = z
  .object({
    nodeId: z.string().min(1),
    name: z.string().optional(),
    originalType: z.string().optional(),
    provider: z.string().optional(),
  })
  .strict();
export type SourceTrace = z.infer<typeof SourceTraceSchema>;

export const SymbolTraceSchema = z
  .object({
    instanceId: z.string().optional(),
    masterId: z.string().optional(),
    overrides: z
      .array(
        z
          .object({
            path: z.string().min(1),
            value: z.unknown(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type SymbolTrace = z.infer<typeof SymbolTraceSchema>;

export interface VisualNode {
  id: string;
  kind: VisualNodeKind;
  name: string;
  source: SourceTrace;
  layout: Layout;
  style?: Style;
  text?: TextContent;
  assetRef?: string;
  symbol?: SymbolTrace;
  children: VisualNode[];
}

export const VisualNodeSchema: z.ZodType<VisualNode> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      kind: VisualNodeKindSchema,
      name: z.string().min(1),
      source: SourceTraceSchema,
      layout: LayoutSchema,
      style: StyleSchema.optional(),
      text: TextContentSchema.optional(),
      assetRef: z.string().optional(),
      symbol: SymbolTraceSchema.optional(),
      children: z.array(VisualNodeSchema),
    })
    .strict(),
);

export const VisualBlockSchema = z
  .object({
    artboard: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .strict(),
    root: VisualNodeSchema,
    assets: z.array(AssetEntrySchema),
  })
  .strict();
export type VisualBlock = z.infer<typeof VisualBlockSchema>;
