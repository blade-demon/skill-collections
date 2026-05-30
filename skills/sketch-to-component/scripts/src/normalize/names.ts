import { createHash } from 'node:crypto';

const NAME_OVERRIDES = new Map<string, string>([
  ['财资小助手对话页', 'ChatAssistantPage'],
  ['财资小助手', 'ChatAssistant'],
  ['智能助手', 'SmartAssistant'],
  ['组件/系统/状态栏-亮底', 'StatusBar'],
  ['组件/系统/状态栏-亮', 'StatusBar'],
  ['组件/系统/屏幕指示器-亮底', 'HomeIndicator'],
  ['组件/导航栏0', 'NavigationBar'],
  ['底/键盘输入', 'KeyboardInputDock'],
  ['模块/输入/键盘', 'KeyboardInput'],
  ['组件/bubble/self', 'SelfBubble'],
  ['img/bg', 'BackgroundImage'],
  ['猜你想要', 'SuggestedPrompt'],
]);

/**
 * Build a deterministic `VisualNode.id` for a Sketch source node.
 *
 * `scope` is the chain of enclosing symbol-instance source ids (root → leaf).
 * Outside symbol expansion it is empty and we fall back to the original
 * normalize-the-uuid form, so single-instance trees keep byte-identical ids
 * (no churn for existing fixtures / goldens).
 *
 * Inside an expanded symbol the same master child uuid appears once per
 * instance, so we must scope it: hashing `scope.join('|') + '||' + sourceNodeId`
 * separates instances and prevents the `duplicate SemanticNode id` failure that
 * Stage 5A throws when two instances of the same master share children.
 *
 * The scoped hash is truncated to 16 hex chars (64 bits → ~2^32 ≈ 4·10^9
 * birthday-collision tolerance) to give Stage 5A's `assertSemanticViewIntegrity`
 * a comfortable safety margin on large Sketch files with many symbol-expanded
 * nodes. The earlier 40-bit slice only tolerated ~10^6 entries before the
 * birthday bound became a realistic risk.
 */
export function stableNodeId(sourceNodeId: string, scope: readonly string[] = []): string {
  if (scope.length > 0) {
    const key = scope.join('|') + '||' + sourceNodeId;
    return `node-${createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
  }
  const normalized = sourceNodeId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (normalized) return `node-${normalized}`;
  return `node-${createHash('sha1').update(sourceNodeId).digest('hex').slice(0, 10)}`;
}

export function stableAssetId(ref: string): string {
  return `asset-${createHash('sha1').update(ref).digest('hex').slice(0, 10)}`;
}

export function stableComponentName(rawName: string, fallbackId: string): string {
  const trimmed = rawName.trim();
  const override = NAME_OVERRIDES.get(trimmed);
  if (override) return override;

  const lastSegment = trimmed.split('/').filter(Boolean).at(-1) ?? trimmed;
  const asciiWords = lastSegment
    .replace(/备份\s*\d*/g, '')
    .replace(/\d+(\.\d+)?/g, ' ')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  if (asciiWords.length > 0) {
    return asciiWords.map(capitalize).join('');
  }

  const generic = inferGenericName(trimmed);
  if (generic) return generic;
  return `Node${createHash('sha1')
    .update(fallbackId || trimmed)
    .digest('hex')
    .slice(0, 8)}`;
}

function inferGenericName(name: string): string | undefined {
  if (name.includes('导航栏')) return 'NavigationBar';
  if (name.includes('状态栏')) return 'StatusBar';
  if (name.includes('屏幕指示器')) return 'HomeIndicator';
  if (name.includes('键盘')) return 'KeyboardInput';
  if (name.includes('箭头')) return 'ArrowIcon';
  if (name.toLowerCase().includes('icon') || name.includes('图标')) return 'Icon';
  if (name.includes('酒店')) return 'HotelCard';
  if (name.includes('推荐')) return 'Recommendation';
  if (name.includes('输入')) return 'Input';
  if (name.includes('背景')) return 'Background';
  if (name.includes('矩形')) return 'Rectangle';
  if (name.includes('编组')) return undefined;
  return undefined;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
