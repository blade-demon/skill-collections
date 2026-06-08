import { z } from 'zod';
import { TraceRefSchema } from '../ir/schema';
import type { DesignIR, Warning } from '../ir/schema';

/**
 * 原始设计数据的标准化包装结构。
 *
 * 该结构解决了"如何统一存储不同设计工具的原始数据"的问题。
 * payload字段故意不加约束，因为每个设计工具的原始格式完全不同
 * （Sketch的JSON vs Figma的API响应 vs MasterGo的DSL）。
 *
 * 持久化路径：管线会将此结构保存为 `ir/raw-dsl.json`
 * 追踪能力：ref字段确保每个处理阶段都可以追溯回原始数据源
 */
export const RawArtifactSchema = z
  .object({
    提供方: z.string().min(1),
    /** Tracing anchor — same shape as `DesignIR.source.ref`, non-empty. */
    ref: TraceRefSchema,
    /** Provider-specific raw DSL. Any value is allowed, but the key must be
     * present — a missing / `undefined` payload is rejected (see refine below). */
    payload: z.unknown(),
    /** ISO 8601 timestamp of when the raw DSL was captured. */
    capturedAt: z.string().datetime(),
  })
  .strict()
  .refine((data) => data.payload !== undefined, {
    message: 'payload is required',
    path: ['payload'],
  });
export type RawArtifact = z.infer<typeof RawArtifactSchema>;

export interface AssetExportResult {
  assets: Array<{ id: string; path: string }>;
  warnings: Warning[];
}

export interface ReferenceFrameResult {
  /** Path to the exported reference image, or `null` when unavailable. */
  imagePath: string | null;
  skipped: boolean;
  reason?: string;
}

/**
 * 设计源适配器的能力接口定义。
 *
 * 该接口是整个D2C管线的核心抽象层，解决了"如何将不同设计工具的专有格式
 * 统一为标准IR"的问题。通过Provider模式避免了N×M的格式适配复杂度。
 *
 * 设计目标：
 * - 隔离设计工具的复杂性（MasterGo、Figma、Sketch各有不同的数据结构）
 * - 确保输出的确定性（同一输入始终产生相同的IR）
 * - 支持渐进式能力扩展（exportAssets、exportReferenceFrame为可选能力）
 *
 * 必需能力：`extractRaw`(原始数据提取)、`normalize`(标准化为IR)
 * 可选能力：`exportAssets`(资源导出)、`exportReferenceFrame`(参考图生成)
 *
 * 契约要求：`normalize`必须是确定性的，输出必须通过`validateDesignIR()`验证
 */
export interface Provider<TInput = unknown> {
  readonly id: string;
  extractRaw(input: TInput): Promise<RawArtifact>;
  normalize(raw: RawArtifact): Promise<DesignIR>;
  exportAssets?(raw: RawArtifact): Promise<AssetExportResult>;
  exportReferenceFrame?(raw: RawArtifact): Promise<ReferenceFrameResult>;
}
