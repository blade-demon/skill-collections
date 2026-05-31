import type {
  AssetEntry,
  Border,
  Effect,
  Fill,
  Style,
  TextContent,
  VectorPath,
  VectorPoint,
  VisualBlock,
  VisualNode,
  VisualNodeKind,
  Warning,
} from '@skill-collections/d2c-core';
import type { SketchAssetEntry, SketchRawModel } from '../sketch-raw-model.js';
import { cleanChildren } from './clean-tree.js';
import { stableAssetId, stableComponentName, stableNodeId } from './names.js';
import {
  addWarning,
  getLayers,
  getNodeClass,
  getNodeId,
  getNodeName,
  isVisible,
  readFrame,
  readNumber,
  type SketchNode,
} from './sketch-nodes.js';
import {
  applyConstraint,
  DEFAULT_RESIZING_CONSTRAINT,
  isResized,
  type ContainerSize,
} from './symbol-scale.js';
import { extractOverrides, getMasterForInstance, type SymbolIndex } from './symbols.js';

/**
 * 构建视觉块的输入参数
 * 包含将 Sketch 原始模型转换为统一视觉树表示所需的全部信息
 */
export interface BuildVisualBlockInput {
  /** Sketch 文件的原始数据模型，包含资源、样式等全局元数据 */
  model: SketchRawModel;
  /** 当前导出的画布节点，作为视觉树的根节点 */
  artboard: SketchNode;
  /** 符号主控节点的索引，用于快速查找符号实例关联的主控 */
  symbols: SymbolIndex;
  /** 规范化过程中收集的警告列表，记录处理的异常或特殊情况 */
  warnings: Warning[];
}

/**
 * 规范化过程中的上下文对象
 * 用于在整个树遍历过程中共享全局状态，避免逐层传递重复参数
 */
interface VisualContext {
  /** Sketch 原始数据模型 */
  model: SketchRawModel;
  /** 符号索引，用于快速查询符号实例的主控节点 */
  symbols: SymbolIndex;
  /** 规范化警告列表的引用 */
  warnings: Warning[];
  /** 去重的资源映射表，防止同一资源被多次注册 */
  assetMap: Map<string, AssetEntry>;
}

/**
 * 将 Sketch 画布转换为统一的视觉树表示（VisualBlock）
 *
 * 核心职责：
 * 1. 遍历 Sketch 树，规范化每个节点的几何、样式、文本等属性
 * 2. 扩展符号实例为其主控节点的副本，处理尺寸缩放和覆盖项
 * 3. 过滤隐藏节点和裁剪遮罩层，并为受遮罩的父节点标记
 * 4. 搜集所有图像资源并去重
 *
 * @param input - 包含 Sketch 原始数据、画布节点和符号索引的输入
 * @returns 规范化后的视觉块，包含尺寸、根节点树和资源列表
 * @throws 当画布节点无法规范化时抛出错误
 */
export function buildVisualBlock(input: BuildVisualBlockInput): VisualBlock {
  const context: VisualContext = {
    model: input.model,
    symbols: input.symbols,
    warnings: input.warnings,
    assetMap: new Map(),
  };
  const frame = readFrame(input.artboard);
  const root = normalizeNode(input.artboard, context, {
    isRoot: true,
    visitedSymbols: new Set(),
    instancePath: [],
  });
  if (!root) {
    throw new Error('Selected artboard could not be normalized');
  }
  return {
    artboard: { width: frame.width, height: frame.height },
    root,
    // 按 ID 排序资源，确保输出稳定性（便于测试和版本控制比较）
    assets: [...context.assetMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * 单个节点规范化的选项
 * 用于控制节点树遍历过程中的上下文状态
 */
interface NormalizeNodeOptions {
  /** 是否为视觉树的根节点（根节点的坐标强制设置为 (0,0)） */
  isRoot?: boolean;
  /**
   * 已访问的符号 ID 集合，用于检测符号展开过程中的循环引用
   * 当符号实例嵌套引用自身时，停止递归展开并发出警告
   */
  visitedSymbols: Set<string>;
  /**
   * 容器尺寸变化信息，仅在父容器被调整尺寸时设置
   *
   * 使用场景：符号实例的尺寸与其主控节点不同时，其子节点的布局
   * 需要根据 resizingConstraint 重新计算。这避免了主控节点内部
   * 的布局逻辑依赖于特定的符号实例尺寸。
   *
   * 详见 symbol-scale.ts 和相关设计文档
   */
  containerResize?: { old: ContainerSize; new: ContainerSize };
  /**
   * 符号实例源 ID 的链路，从根到叶（示例：[master-id1, master-id2]）
   *
   * 当展开符号实例时，该实例的子节点需要被作用域化，以确保不同
   * 实例的同名子节点不会产生 ID 碰撞（Stage 5A 完整性检查）。
   * 此链路在 stableNodeId 中被使用。
   *
   * 符号外部的节点使用空列表；符号内部的节点包含所有父符号实例的 ID
   */
  instancePath: readonly string[];
}

/**
 * 规范化单个 Sketch 节点为 VisualNode
 *
 * 核心逻辑：
 * 1. 过滤隐藏节点和裁剪遮罩
 * 2. 对于符号实例，展开其主控节点的内容
 * 3. 对于常规节点，提取几何、样式、文本等属性
 * 4. 递归处理子节点，支持容器尺寸变化时的约束重算
 *
 * @param node - Sketch 原始节点
 * @param context - 共享的规范化上下文（模型、符号、警告、资源）
 * @param options - 控制树遍历的选项
 * @returns 规范化后的视觉节点，若节点被过滤则返回 undefined
 */
function normalizeNode(
  node: SketchNode,
  context: VisualContext,
  options: NormalizeNodeOptions,
): VisualNode | undefined {
  // 隐藏节点直接跳过，记录信息级警告供审阅者参考
  if (!isVisible(node)) {
    addWarning(
      context.warnings,
      'hidden-node-skipped',
      `Skipped hidden node "${getNodeName(node)}"`,
      node,
      'info',
    );
    return undefined;
  }

  /* Sketch 的裁剪遮罩层（hasClippingMask: true）为兄弟节点定义几何裁剪
   * 在 Sketch 中它们不可见。如果作为普通形状发出，会在被裁剪的兄弟上方
   * 绘制一个灰色框（例如聊天气泡的尾部）。
   *
   * 处理策略：
   * - 跳过遮罩层本身
   * - 在父节点检测是否有遮罩子节点
   * - 父节点标记 style.raw.maskedContent
   * - 预览/代码生成器用 overflow: hidden 近似裁剪效果
   */
  if (node.hasClippingMask === true) {
    addWarning(
      context.warnings,
      'clipping-mask-skipped',
      `Skipped clipping-mask layer "${getNodeName(node)}" — masking semantics not rendered; parent will use overflow:hidden to approximate clipping`,
      node,
      'info',
    );
    return undefined;
  }

  const nodeClass = getNodeClass(node);
  // 符号实例使用专门的展开逻辑
  if (nodeClass === 'symbolInstance') {
    return normalizeSymbolInstance(node, context, options);
  }

  const kind = mapKind(nodeClass, context.warnings, node);
  const rawFrame = readFrame(node);
  const rc = readNumber(node.resizingConstraint, DEFAULT_RESIZING_CONSTRAINT);
  // 当父容器被调整尺寸时，应用约束算法重算节点位置和尺寸
  const newFrame = options.containerResize
    ? applyConstraint(options.containerResize.old, options.containerResize.new, rawFrame, rc)
    : rawFrame;
  // 若在调整尺寸的符号内部节点有旋转或翻转，平面约束无法完美处理
  if (options.containerResize && hasUnsupportedTransform(node)) {
    addWarning(
      context.warnings,
      'unsupported-symbol-transform',
      `Layer "${getNodeName(node)}" has rotation/flip inside a resized symbol; layout uses planar transform only`,
      node,
    );
  }

  // 检测当前节点的尺寸是否被调整，若是，子节点需要应用约束重算
  const childContainerResize = isResized(
    { width: rawFrame.width, height: rawFrame.height },
    { width: newFrame.width, height: newFrame.height },
  )
    ? {
        old: { width: rawFrame.width, height: rawFrame.height },
        new: { width: newFrame.width, height: newFrame.height },
      }
    : undefined;
  const directChildren = getLayers(node);
  // 在规范化之前检测裁剪遮罩子节点
  // （遮罩层规范化时返回 undefined，所以必须在递归前检测）
  const hadClippingMaskChild = directChildren.some((c) => c.hasClippingMask === true);
  const rawChildren = directChildren
    .map((child) =>
      normalizeNode(child, context, {
        visitedSymbols: new Set(options.visitedSymbols),
        containerResize: childContainerResize,
        instancePath: options.instancePath,
      }),
    )
    .filter((child): child is VisualNode => Boolean(child));
  // 清理子节点，合并临近的文本和移除空白组（见 clean-tree.ts）
  const children = cleanChildren(rawChildren, context.warnings);

  const visualNode: VisualNode = {
    // 使用 instancePath 为节点 ID 添加前缀，以避免符号实例间的碰撞
    id: stableNodeId(getNodeId(node), options.instancePath),
    kind,
    // 组件名称基于原始节点名称，使用稳定哈希便于去重
    name: stableComponentName(getNodeName(node), getNodeId(node)),
    // 保留原始 Sketch 源信息，便于双向链接和问题追溯
    source: {
      nodeId: getNodeId(node),
      name: getNodeName(node),
      originalType: nodeClass,
      provider: 'sketch',
    },
    // 根节点坐标强制设为 (0,0)；其他节点保留相对位置
    layout: options.isRoot
      ? { x: 0, y: 0, width: newFrame.width, height: newFrame.height }
      : newFrame,
    children,
  };

  // 提取并附加样式信息（填充、边框、效果、透明度等）
  const style = extractStyle(node, kind, context);
  if (style) visualNode.style = style;
  // 标记父节点为有裁剪内容，供后续处理
  if (hadClippingMaskChild) markMaskedContent(visualNode);
  // 文本节点提取文本内容和字体信息
  if (kind === 'text') visualNode.text = extractText(node);
  // 图像节点注册资源并建立引用
  if (kind === 'image') {
    const asset = registerImageAsset(node, context);
    visualNode.assetRef = asset.id;
  }
  // 矢量形状(shapePath)保留贝塞尔路径几何,供 preview/codegen 还原真实轮廓
  const vector = extractVectorPath(node, nodeClass);
  if (vector) visualNode.vector = vector;

  return visualNode;
}

/**
 * 为父节点标记裁剪内容标志
 *
 * 设置 style.raw.maskedContent = true，使预览/代码生成器知道该节点
 * 拥有被裁剪的子内容，应该应用 overflow: hidden
 *
 * @param visualNode - 需要标记的视觉节点
 */
function markMaskedContent(visualNode: VisualNode): void {
  // 懒初始化 style 和 raw，以免为无其他样式的节点增加额外开销
  if (!visualNode.style) visualNode.style = {};
  if (!visualNode.style.raw) visualNode.style.raw = {};
  visualNode.style.raw.maskedContent = true;
}

/**
 * 规范化符号实例节点
 *
 * 符号实例的核心行为：
 * 1. 从符号索引查找对应的主控节点
 * 2. 根据实例尺寸和主控尺寸计算缩放关系
 * 3. 展开主控节点的内容作为实例的子节点
 * 4. 使用 instancePath 为子节点添加作用域，避免多个实例产生 ID 碰撞
 * 5. 提取并保存覆盖项（颜色、文本等自定义）
 * 6. 检测循环引用（符号自嵌套）并停止展开
 *
 * @param node - 符号实例节点
 * @param context - 共享的规范化上下文
 * @param options - 树遍历选项
 * @returns 规范化后的符号实例节点（始终返回，不过滤）
 */
function normalizeSymbolInstance(
  node: SketchNode,
  context: VisualContext,
  options: NormalizeNodeOptions,
): VisualNode {
  const symbolId = typeof node.symbolID === 'string' ? node.symbolID : undefined;
  const master = getMasterForInstance(node, context.symbols, context.warnings);
  const rawFrame = readFrame(node);
  const rc = readNumber(node.resizingConstraint, DEFAULT_RESIZING_CONSTRAINT);
  // 应用约束算法计算实例的最终尺寸
  const newFrame = options.containerResize
    ? applyConstraint(options.containerResize.old, options.containerResize.new, rawFrame, rc)
    : rawFrame;
  // 警告：若实例内存在旋转/翻转且在调整尺寸的容器中，布局可能不准确
  if (options.containerResize && hasUnsupportedTransform(node)) {
    addWarning(
      context.warnings,
      'unsupported-symbol-transform',
      `Symbol instance "${getNodeName(node)}" has rotation/flip inside a resized container; layout uses planar transform only`,
      node,
    );
  }
  let children: VisualNode[] = [];
  // 在主控节点的直接子层中检测裁剪遮罩
  // （必须在展开前检测，以便符号实例节点能标记 style.raw.maskedContent）
  let hadClippingMaskChild = false;

  // 检测循环符号展开：若当前符号已在访问路径中，停止展开
  if (symbolId && options.visitedSymbols.has(symbolId)) {
    addWarning(
      context.warnings,
      'symbol-cycle',
      `Stopped cyclic symbol expansion for ${symbolId}`,
      node,
    );
  } else if (master) {
    const nextVisited = new Set(options.visitedSymbols);
    if (symbolId) nextVisited.add(symbolId);
    const masterFrame = readFrame(master);
    const masterSize: ContainerSize = { width: masterFrame.width, height: masterFrame.height };
    const instanceSize: ContainerSize = { width: newFrame.width, height: newFrame.height };
    // 只有当主控和实例尺寸不同时，才计算容器缩放关系
    const masterContainerResize = isResized(masterSize, instanceSize)
      ? { old: masterSize, new: instanceSize }
      : undefined;
    /* 为展开自主控节点的所有子节点添加作用域
     * 避免同一主控节点的不同实例产生子节点 ID 碰撞
     * （在 Stage 5A 完整性检查中这会导致错误）
     */
    const childInstancePath = [...options.instancePath, getNodeId(node)];
    const masterChildren = getLayers(master);
    hadClippingMaskChild = masterChildren.some((c) => c.hasClippingMask === true);
    children = cleanChildren(
      masterChildren
        .map((child) =>
          normalizeNode(child, context, {
            visitedSymbols: nextVisited,
            containerResize: masterContainerResize,
            instancePath: childInstancePath,
          }),
        )
        .filter((child): child is VisualNode => Boolean(child)),
      context.warnings,
    );
  }

  // 使用主控节点的类型来确定实例的 kind，若无主控则默认为 frame
  const kind: VisualNodeKind = master
    ? mapKind(getNodeClass(master), context.warnings, master)
    : 'frame';
  const visualNode: VisualNode = {
    id: stableNodeId(getNodeId(node), options.instancePath),
    kind,
    name: stableComponentName(getNodeName(node), getNodeId(node)),
    source: {
      nodeId: getNodeId(node),
      name: getNodeName(node),
      originalType: 'symbolInstance',
      provider: 'sketch',
    },
    layout: newFrame,
    // 保留符号实例的元数据，包括主控 ID、实例 ID 和覆盖项
    symbol: {
      instanceId: getNodeId(node),
      masterId: symbolId,
      overrides: extractOverrides(node),
    },
    children,
  };
  const style = extractStyle(node, kind, context);
  if (style) visualNode.style = style;
  // 标记实例节点为有裁剪内容
  if (hadClippingMaskChild) markMaskedContent(visualNode);
  return visualNode;
}

/**
 * 检测节点是否存在无法在调整尺寸约束中处理的变换
 *
 * applyConstraint 使用平面变换（仅水平和垂直），无法处理旋转和翻转。
 * 在调整尺寸的容器内包含这些变换的节点其几何可能不准确。
 *
 * @param node - 要检查的节点
 * @returns 若存在旋转或翻转返回 true
 */
function hasUnsupportedTransform(node: SketchNode): boolean {
  // 检测旋转（Sketch 中非零旋转值表示有旋转变换）
  if (typeof node.rotation === 'number' && node.rotation !== 0) return true;
  // 检测水平或垂直翻转
  if (node.isFlippedHorizontal === true || node.isFlippedVertical === true) return true;
  return false;
}

/**
 * 将 Sketch 节点类型名称映射为通用的 VisualNodeKind
 *
 * 映射关系：
 * - artboard/frame/symbolMaster → frame（容器）
 * - group → group（分组，逻辑组织）
 * - text → text（文本）
 * - bitmap → image（光栅图像）
 * - shapePath/oval/rectangle/shapeGroup → shape（矢量形状）
 * - svg/path → vector（路径/矢量）
 * - 其他 → group + 警告（fallback）
 *
 * @param nodeClass - Sketch 节点类型字符串
 * @param warnings - 警告列表，记录未知类型
 * @param node - 原始 Sketch 节点，用于警告上下文
 * @returns 映射后的视觉节点类型
 */
function mapKind(nodeClass: string, warnings: Warning[], node: SketchNode): VisualNodeKind {
  if (nodeClass === 'artboard' || nodeClass === 'frame' || nodeClass === 'symbolMaster')
    return 'frame';
  if (nodeClass === 'group') return 'group';
  if (nodeClass === 'text') return 'text';
  if (nodeClass === 'bitmap') return 'image';
  if (['shapePath', 'oval', 'rectangle', 'shapeGroup'].includes(nodeClass)) return 'shape';
  if (nodeClass.startsWith('svg') || nodeClass === 'path') return 'vector';
  // 未知的 Sketch 类型映射为 group，发出警告
  addWarning(
    warnings,
    'unknown-node-class',
    `Mapped unknown Sketch class "${nodeClass}" to group`,
    node,
  );
  return 'group';
}

/**
 * 注册图像资源并添加到去重的资源映射表
 *
 * 处理流程：
 * 1. 从节点的 image 属性提取资源引用 (_ref)
 * 2. 在模型资源列表中查找对应的资源元数据
 * 3. 若未找到，记录缺失资源警告
 * 4. 使用稳定 ID 对资源去重，防止重复注册
 *
 * @param node - 包含图像的节点
 * @param context - 共享上下文，包含模型和资源映射
 * @returns 注册后的资源条目（ID、原始路径、类型等）
 */
function registerImageAsset(node: SketchNode, context: VisualContext): AssetEntry {
  // 从节点解析图像对象和资源引用
  const image =
    node.image && typeof node.image === 'object' ? (node.image as Record<string, unknown>) : {};
  const ref = typeof image._ref === 'string' ? image._ref : `missing-image/${getNodeId(node)}`;
  // 在模型资源列表中查找资源元数据
  const rawAsset = context.model.assets.find((asset) => asset.path === ref);
  if (!rawAsset) {
    addWarning(context.warnings, 'missing-asset', `Image asset not found for ${ref}`, node);
  }
  const id = stableAssetId(ref);
  // 懒初始化资源条目，避免重复注册相同资源
  if (!context.assetMap.has(id)) {
    const asset: SketchAssetEntry | undefined = rawAsset;
    context.assetMap.set(id, {
      id,
      ref,
      kind: asset?.kind ?? 'image',
      originalPath: asset?.path ?? ref,
    });
  }
  return context.assetMap.get(id)!;
}

/**
 * 提取文本节点的内容和样式
 *
 * 从 Sketch 的 attributedString 结构解析：
 * 1. 文本内容（通常为 attributedString.string）
 * 2. 字体信息（系列、粗细）
 * 3. 字体大小
 * 4. 文本颜色（来自属性或层级填充）
 * 5. 对齐方式（left/right/center/justify）
 * 6. 行高（固定值来自 paragraphStyle）
 *
 * @param node - 文本类型的节点
 * @returns 文本内容和样式信息的对象
 */
function extractText(node: SketchNode): TextContent {
  // 安全地访问 attributedString，处理可能不存在或类型错误的情况
  const attributedString =
    node.attributedString && typeof node.attributedString === 'object'
      ? (node.attributedString as Record<string, unknown>)
      : {};
  // 文本内容优先使用 attributedString.string，回退使用节点名称
  const content =
    typeof attributedString.string === 'string' ? attributedString.string : getNodeName(node);
  const encoded = getTextAttributes(node);
  const textStyle: NonNullable<TextContent['style']> = {};
  // 解析字体信息（系列和粗细）
  const font = encoded.MSAttributedStringFontAttribute as Record<string, unknown> | undefined;
  const fontAttrs = font?.attributes as Record<string, unknown> | undefined;
  if (typeof fontAttrs?.name === 'string') {
    const { family, weight } = parseFontName(fontAttrs.name);
    textStyle.fontFamily = family;
    if (weight !== undefined) textStyle.fontWeight = weight;
  }
  // 字体大小
  if (typeof fontAttrs?.size === 'number') textStyle.fontSize = fontAttrs.size;
  // 文本颜色优先使用属性，回退使用层级填充（见 layerTextColor）
  const color = colorToHex(encoded.MSAttributedStringColorAttribute) ?? layerTextColor(node);
  if (color) textStyle.color = color;
  // 段落样式：对齐方式
  const paragraph = encoded.paragraphStyle as Record<string, unknown> | undefined;
  const alignment = readNumber(paragraph?.alignment, 0);
  const alignmentMap = ['left', 'right', 'center', 'justify'] as const;
  textStyle.textAlign = alignmentMap[alignment] ?? 'left';
  // 行高（仅限固定行高，自动行高不提取）
  const lineHeight = readLineHeight(paragraph);
  if (lineHeight !== undefined) textStyle.lineHeight = lineHeight;
  // 仅当存在样式属性时才返回 style 对象
  return Object.keys(textStyle).length > 0 ? { content, style: textStyle } : { content };
}

/**
 * 从文本节点提取编码属性
 *
 * Sketch 的属性存储在嵌套的 attributedString 结构中：
 * - attributedString.attributes[0].attributes（第一段落的属性）
 * 或者回退到：
 * - style.textStyle.encodedAttributes
 *
 * @param node - 文本节点
 * @returns 编码属性对象（字体、颜色、段落等）
 */
function getTextAttributes(node: SketchNode): Record<string, unknown> {
  // 尝试从 attributedString 提取属性
  const attributedString =
    node.attributedString && typeof node.attributedString === 'object'
      ? (node.attributedString as Record<string, unknown>)
      : {};
  const attributes = Array.isArray(attributedString.attributes)
    ? (attributedString.attributes[0] as Record<string, unknown> | undefined)
    : undefined;
  if (attributes?.attributes && typeof attributes.attributes === 'object') {
    return attributes.attributes as Record<string, unknown>;
  }
  // 回退到 style.textStyle.encodedAttributes
  const style = node.style && typeof node.style === 'object' ? node.style : {};
  const textStyle =
    style.textStyle && typeof style.textStyle === 'object'
      ? (style.textStyle as Record<string, unknown>)
      : {};
  return textStyle.encodedAttributes && typeof textStyle.encodedAttributes === 'object'
    ? (textStyle.encodedAttributes as Record<string, unknown>)
    : {};
}

/**
 * Sketch 字体粗细权重映射
 * Sketch 在字体名称后用 `-<Weight>` 后缀编码粗细
 * 例如："Helvetica-Bold" → family: "Helvetica", weight: 700
 */
const FONT_WEIGHTS: Record<string, number> = {
  thin: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  heavy: 800,
  black: 900,
};

/**
 * 解析 Sketch 字体名称为字体族和数值粗细
 *
 * Sketch 在字体名称末尾用 `-<Weight>` 段编码粗细。此函数仅提取
 * 末尾完全匹配已知粗细词的情况；其他名称原样返回，不进行品牌别名
 * 猜测（详见 Batch 1 A2 设计原则）。
 *
 * 示例：
 * - "Helvetica-Bold" → { family: "Helvetica", weight: 700 }
 * - "Inconsolata" → { family: "Inconsolata" }
 * - "Roboto-Regular" → { family: "Roboto", weight: 400 }
 *
 * @param name - Sketch 字体名称
 * @returns 包含字体族和可选粗细值的对象
 */
function parseFontName(name: string): { family: string; weight?: number } {
  const dash = name.lastIndexOf('-');
  // 只有在末尾包含 '-' 时才尝试提取粗细
  if (dash > 0) {
    const weight = FONT_WEIGHTS[name.slice(dash + 1).toLowerCase()];
    if (weight !== undefined) return { family: name.slice(0, dash), weight };
  }
  return { family: name };
}

/**
 * 从 Sketch 段落样式读取固定行高
 *
 * Sketch 在 paragraphStyle 的 maximumLineHeight / minimumLineHeight 中
 * 存储固定行高；若两者都不存在或为 0，则表示自动行高（不提取）。
 *
 * @param paragraph - 段落样式对象
 * @returns 固定行高值，或 undefined（表示自动行高）
 */
function readLineHeight(paragraph: Record<string, unknown> | undefined): number | undefined {
  const max = paragraph?.maximumLineHeight;
  if (typeof max === 'number' && max > 0) return max;
  const min = paragraph?.minimumLineHeight;
  if (typeof min === 'number' && min > 0) return min;
  return undefined;
}

/**
 * 从 Sketch 文本层的层级填充读取文本颜色
 *
 * 在 Sketch 中，文本节点的文本颜色存储在层级的填充（fill）中。
 * 这不同于其他节点的填充，其他节点的填充是背景色。
 * 此函数用作 extractText 的回退，以便获取文本颜色。
 *
 * @param node - 文本节点
 * @returns 文本颜色的十六进制值，或 undefined
 */
function layerTextColor(node: SketchNode): string | undefined {
  const style = node.style && typeof node.style === 'object' ? node.style : undefined;
  if (!style) return undefined;
  return normalizeFills(style.fills)[0]?.color;
}

/**
 * 从 Sketch 节点提取样式信息
 *
 * 包括：
 * - 填充（背景色、渐变等）— 对于文本节点跳过，因为文本节点的填充是文本颜色
 * - 边框（颜色、厚度、位置）
 * - 效果（阴影、内阴影）
 * - 透明度（opacity）
 * - 圆角（统一或四角分别）
 * - 原始元数据（Sketch 样式 ID）
 *
 * @param node - 节点
 * @param kind - 节点类型（用于判断是否跳过填充）
 * @returns 样式对象，或 undefined（无样式属性）
 */
function extractStyle(
  node: SketchNode,
  kind: VisualNodeKind,
  context: VisualContext,
): Style | undefined {
  const style = node.style && typeof node.style === 'object' ? node.style : undefined;
  if (!style) return undefined;
  const result: Style = {};
  /* Sketch 文本节点的 style.fills 编码的是"文本颜色"而非背景色
   * 为避免预览/代码生成器将文本节点画成实色块（见 Gate-1 审阅缺陷 2026-05-22），
   * 文本节点的填充被跳过。文本颜色已通过 extractText 的 text.style.color 捕获。
   */
  if (kind !== 'text') {
    const fills = normalizeFills(style.fills);
    if (fills.length > 0) result.fills = fills;
  }
  const borders = normalizeBorders(style.borders);
  if (borders.length > 0) result.borders = borders;
  const effects = normalizeEffects(style.shadows, style.innerShadows);
  if (effects.length > 0) result.effects = effects;
  // 透明度（contextSettings.opacity）
  const contextSettings = style.contextSettings as Record<string, unknown> | undefined;
  if (typeof contextSettings?.opacity === 'number') result.opacity = contextSettings.opacity;
  // 圆角
  const radius = extractRadius(node, context);
  if (radius !== undefined) result.radius = radius;
  // 保留 Sketch 样式 ID 以备后续处理
  if (typeof style.do_objectID === 'string') result.raw = { sketchStyleId: style.do_objectID };
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 解析 Sketch curvePoint 的 `point: '{x, y}'` 字符串为数值坐标
 *
 * Sketch 把每个曲线点的位置编码为本地矩形的归一化坐标字符串
 * （0..1 范围），形如 `'{0, 0}'` 或 `'{0.5, 1}'`。该解析器复用
 * `packages/d2c-core/src/preview/generate-preview.ts:parseGradientPoint`
 * 的正则模式，兼容负数和科学计数法以保持一致。
 */
function parseCurvePointCoord(value: unknown): { x: number; y: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const match =
    /^\{\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*\}$/i.exec(
      value.trim(),
    );
  if (!match || match[1] === undefined || match[2] === undefined) return undefined;
  const x = Number.parseFloat(match[1]);
  const y = Number.parseFloat(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
}

/**
 * 从归一化坐标分类至矩形角位
 *
 * 用一个小容差（~0.01）容纳浮点误差。仅接受四个单位顶点
 * `{0,0}` `{1,0}` `{1,1}` `{0,1}`；其它取值（例如形状路径上的
 * 中间锚点）返回 undefined，由上层降级处理。
 */
function classifyCorner(
  x: number,
  y: number,
): 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft' | undefined {
  const EPS = 0.01;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;
  if (near(x, 0) && near(y, 0)) return 'topLeft';
  if (near(x, 1) && near(y, 0)) return 'topRight';
  if (near(x, 1) && near(y, 1)) return 'bottomRight';
  if (near(x, 0) && near(y, 1)) return 'bottomLeft';
  return undefined;
}

/**
 * 从 Sketch 节点提取圆角信息
 *
 * Sketch 在 points[i].cornerRadius 中存储四个角的圆角值。常规矩形
 * 的 points 数组顺序为：top-left → top-right → bottom-right → bottom-left
 * （对应节点本地矩形顶点 `{0,0} {1,0} {1,1} {0,1}`），但 ShapePath
 * 编辑或手动操作会改变数组顺序。因此优先根据每个 curvePoint 的
 * `point` 坐标判断角位，仅在解析失败时回退到数组顺序。
 *
 * 处理策略：
 * 1. 优先按 `point: '{x, y}'` 坐标将四个 curvePoint 分配到四个角
 * 2. 若四个角都相等，返回单个数值（统一圆角）
 * 3. 否则返回四个角分别的对象（不同圆角）
 * 4. 若所有角都为 0，返回 undefined（无圆角）
 * 5. 若坐标缺失/重复/非单位顶点，回退到原有数组顺序并发出告警
 * 6. 若无 points，回退到 node.fixedRadius（仅在统一圆角时存在）
 *
 * 注意：node.fixedRadius 只在用户设置统一圆角时非零；
 * 用户分别设置角时为 0（常见于聊天气泡形状）
 *
 * @param node - 节点
 * @param context - 规范化上下文（用于在降级时发出告警）
 * @returns 统一圆角值、四角对象或 undefined
 */
function extractRadius(
  node: SketchNode,
  context: VisualContext,
): NonNullable<Style['radius']> | undefined {
  const points = Array.isArray(node.points)
    ? (node.points as Array<Record<string, unknown>>)
    : undefined;
  if (points && points.length === 4) {
    // 提取四个角的圆角值，缺失或负数视为 0
    const corners = points.map((p) =>
      typeof p.cornerRadius === 'number' && p.cornerRadius >= 0 ? p.cornerRadius : 0,
    );

    // 优先按每个 curvePoint 的 point 坐标将圆角值分配到对应角位，
    // 这样即使数组顺序被改变（ShapePath 编辑/手动操作）也能得到正确结果。
    const byCorner: Partial<Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', number>> =
      {};
    let resolvedAll = true;
    for (let i = 0; i < points.length; i++) {
      const coord = parseCurvePointCoord(points[i]?.point);
      if (!coord) {
        resolvedAll = false;
        break;
      }
      const corner = classifyCorner(coord.x, coord.y);
      if (!corner || byCorner[corner] !== undefined) {
        // 非单位顶点或重复角位 → 视为解析失败
        resolvedAll = false;
        break;
      }
      byCorner[corner] = corners[i] ?? 0;
    }

    let tl: number;
    let tr: number;
    let br: number;
    let bl: number;
    if (
      resolvedAll &&
      byCorner.topLeft !== undefined &&
      byCorner.topRight !== undefined &&
      byCorner.bottomRight !== undefined &&
      byCorner.bottomLeft !== undefined
    ) {
      tl = byCorner.topLeft;
      tr = byCorner.topRight;
      br = byCorner.bottomRight;
      bl = byCorner.bottomLeft;
    } else {
      // 降级：按数组顺序读取并发出 info 级告警，便于排查
      addWarning(
        context.warnings,
        'radius-point-order-ambiguous',
        `Could not resolve per-corner radius from curvePoint coordinates on "${getNodeName(node)}"; falling back to array order (top-left → top-right → bottom-right → bottom-left)`,
        node,
        'info',
      );
      [tl, tr, br, bl] = corners as [number, number, number, number];
    }

    // 若所有角都为 0，则无圆角
    const anyPositive = tl > 0 || tr > 0 || br > 0 || bl > 0;
    if (!anyPositive) return undefined;
    // 若四个角相等，返回单值
    if (tl === tr && tr === br && br === bl) return tl;
    // 四个角不同，返回对象形式
    return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
  }
  // 回退到 fixedRadius（仅表示统一圆角）
  if (typeof node.fixedRadius === 'number' && node.fixedRadius >= 0) {
    return node.fixedRadius;
  }
  return undefined;
}

/**
 * 从 Sketch shapePath 提取归一化贝塞尔路径几何
 *
 * shapePath 的每个 curvePoint 含:
 * - point: '{x, y}' 锚点(本地矩形 0..1 归一化)
 * - curveFrom / curveTo: '{x, y}' 三次贝塞尔控制点(同样 0..1)
 * - hasCurveFrom / hasCurveTo: 该侧是否为曲线段
 * 外加 node.isClosed 表示路径是否闭合。
 *
 * 仅处理 shapePath(带显式 points 的矢量轮廓):oval/rectangle 已由
 * 圆角/盒模型渲染,shapeGroup 由其 shapePath 子层各自携带几何。
 * 坐标四舍五入到 6 位小数以保持产物确定性(byte-stable golden)。
 *
 * @param node - Sketch 节点
 * @param nodeClass - 节点类型字符串
 * @returns VectorPath,或 undefined(非 shapePath / 点数不足 / 解析失败)
 */
function extractVectorPath(node: SketchNode, nodeClass: string): VectorPath | undefined {
  if (nodeClass !== 'shapePath') return undefined;
  const rawPoints = Array.isArray(node.points)
    ? (node.points as Array<Record<string, unknown>>)
    : undefined;
  if (!rawPoints || rawPoints.length < 2) return undefined;

  const points: VectorPoint[] = [];
  for (const p of rawPoints) {
    if (!p || typeof p !== 'object') return undefined;
    const anchor = parseCurvePointCoord(p.point);
    if (!anchor) return undefined;
    const point: VectorPoint = { x: round6(anchor.x), y: round6(anchor.y) };
    // 仅在该侧标记为曲线时保留控制点;直线段不带控制点。
    if (p.hasCurveFrom === true) {
      const cf = parseCurvePointCoord(p.curveFrom);
      if (cf) point.curveFrom = { x: round6(cf.x), y: round6(cf.y) };
    }
    if (p.hasCurveTo === true) {
      const ct = parseCurvePointCoord(p.curveTo);
      if (ct) point.curveTo = { x: round6(ct.x), y: round6(ct.y) };
    }
    points.push(point);
  }
  return { points, closed: node.isClosed === true };
}

/** 四舍五入到 6 位小数,保证矢量坐标在产物中确定且紧凑。 */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * 规范化 Sketch 填充（fill）数组
 *
 * 处理步骤：
 * 1. 过滤禁用的填充（isEnabled !== false）
 * 2. 提取填充类型、颜色和原始 Sketch 数据
 * 3. 对于渐变填充，保留原始渐变数据（待 Fill 模型支持渐变时使用）
 *
 * @param value - 来自 Sketch 的原始填充数组
 * @returns 规范化后的填充对象数组
 */
function normalizeFills(value: unknown): Fill[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (fill) =>
        fill && typeof fill === 'object' && (fill as Record<string, unknown>).isEnabled !== false,
    )
    .map((fill) => {
      const f = fill as Record<string, unknown>;
      // 渐变填充暂时折叠为单一颜色；保留原始渐变数据以备后用
      // （等待 Fill 类型支持渐变，见 Batch 1 A3）
      const raw: Record<string, unknown> = { fillType: f.fillType };
      if (f.gradient && typeof f.gradient === 'object') raw.gradient = f.gradient;
      return {
        type: fillTypeName(f.fillType),
        color: colorToHex(f.color),
        raw,
      };
    });
}

/**
 * 规范化 Sketch 边框（border）数组
 *
 * 处理步骤：
 * 1. 过滤禁用的边框
 * 2. 提取颜色、厚度、位置等属性
 * 3. 保留原始 Sketch 填充类型
 *
 * @param value - 来自 Sketch 的原始边框数组
 * @returns 规范化后的边框对象数组
 */
function normalizeBorders(value: unknown): Border[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (border) =>
        border &&
        typeof border === 'object' &&
        (border as Record<string, unknown>).isEnabled !== false,
    )
    .map((border) => {
      const b = border as Record<string, unknown>;
      return {
        color: colorToHex(b.color),
        thickness: typeof b.thickness === 'number' ? b.thickness : undefined,
        position: typeof b.position === 'number' ? b.position : undefined,
        raw: { fillType: b.fillType },
      };
    });
}

/**
 * 规范化 Sketch 效果（阴影）数组
 *
 * 处理步骤：
 * 1. 分别处理外阴影和内阴影
 * 2. 过滤禁用的效果
 * 3. 提取颜色、偏移、模糊、扩展等属性
 *
 * @param shadows - 来自 Sketch 的外阴影数组
 * @param innerShadows - 来自 Sketch 的内阴影数组
 * @returns 规范化后的效果对象数组
 */
function normalizeEffects(shadows: unknown, innerShadows: unknown): Effect[] {
  const effects: Effect[] = [];
  // 同时处理两种阴影类型
  for (const [type, value] of [
    ['shadow', shadows],
    ['innerShadow', innerShadows],
  ] as const) {
    if (!Array.isArray(value)) continue;
    for (const effect of value) {
      if (!effect || typeof effect !== 'object') continue;
      const raw = effect as Record<string, unknown>;
      // 跳过禁用的效果
      if (raw.isEnabled === false) continue;
      effects.push({
        type,
        color: colorToHex(raw.color),
        x: typeof raw.offsetX === 'number' ? raw.offsetX : undefined,
        y: typeof raw.offsetY === 'number' ? raw.offsetY : undefined,
        blur: typeof raw.blurRadius === 'number' ? raw.blurRadius : undefined,
        spread: typeof raw.spread === 'number' ? raw.spread : undefined,
      });
    }
  }
  return effects;
}

/**
 * 将 Sketch 填充类型码转换为可读名称
 *
 * Sketch 填充类型：
 * - 0 → 'color'（纯色）
 * - 1 → 'gradient'（渐变）
 * - 4 → 'image'（图像填充）
 * - 其他 → 'sketch-fill-<number>'（未知类型，保留 Sketch 数值）
 *
 * @param value - Sketch 填充类型码
 * @returns 填充类型名称，或 undefined
 */
function fillTypeName(value: unknown): string | undefined {
  if (value === 0) return 'color';
  if (value === 1) return 'gradient';
  if (value === 4) return 'image';
  return typeof value === 'number' ? `sketch-fill-${value}` : undefined;
}

/**
 * 将 Sketch 颜色对象转换为 8 位十六进制字符串
 *
 * Sketch 颜色使用 0-1 范围的浮点值表示 RGBA。
 * 转换为 0-255 范围的整数，再转换为十六进制。
 * 格式：#RRGGBBAA
 *
 * 示例：
 * - { red: 1, green: 0, blue: 0, alpha: 1 } → '#FF0000FF'（不透明红）
 * - { red: 0, green: 0, blue: 0, alpha: 0.5 } → '#00000080'（半透明黑）
 *
 * @param value - Sketch 颜色对象
 * @returns 十六进制颜色字符串，或 undefined
 */
function colorToHex(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const color = value as Record<string, unknown>;
  // 提取 RGBA 分量，缺失时默认为 0（或 alpha 默认为 1）
  const r = colorChannel(color.red);
  const g = colorChannel(color.green);
  const b = colorChannel(color.blue);
  const a = colorChannel(color.alpha ?? 1);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
}

/**
 * 从 0-1 范围的浮点数转换为 0-255 范围的整数
 *
 * Sketch 颜色通道使用 0-1 浮点表示。此函数转换为 0-255 整数，
 * 处理无效值（NaN、Infinity）和超出范围的值。
 *
 * @param value - 0-1 范围的浮点数
 * @returns 0-255 范围的整数
 */
function colorChannel(value: unknown): number {
  // 非数值或非有限数视为 0
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  // 缩放到 0-255，四舍五入，夹限在 0-255
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

/**
 * 将 0-255 整数转换为两位十六进制字符串
 *
 * 使用大写字母，不足两位时左侧补 '0'。
 * 例如：15 → '0F'，255 → 'FF'
 *
 * @param value - 0-255 范围的整数
 * @returns 两位十六进制字符串（大写）
 */
function toHex(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}
