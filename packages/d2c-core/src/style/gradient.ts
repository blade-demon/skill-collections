import type { Fill } from '../ir';

export function linearGradientCss(fill: Fill): string | undefined {
  const raw = fill.raw;
  if (!raw || typeof raw !== 'object') return undefined;
  const gradient = (raw as { gradient?: unknown }).gradient;
  if (!gradient || typeof gradient !== 'object') return undefined;
  const g = gradient as Record<string, unknown>;
  // gradientType: 0 = linear, 1 = radial, 2 = angular. Only linear supported here.
  if (g.gradientType !== 0) return undefined;

  const from = parseGradientPoint(g.from);
  const to = parseGradientPoint(g.to);
  if (!from || !to) return undefined;

  const stops = Array.isArray(g.stops) ? g.stops : undefined;
  if (!stops || stops.length === 0) return undefined;

  const ordered: Array<{ position: number; hex: string }> = [];
  for (const stop of stops) {
    if (!stop || typeof stop !== 'object') return undefined;
    const s = stop as Record<string, unknown>;
    const position =
      typeof s.position === 'number' && Number.isFinite(s.position) ? s.position : undefined;
    const hex = gradientStopColor(s.color);
    if (position === undefined || !hex) return undefined;
    ordered.push({ position, hex });
  }
  ordered.sort((a, b) => a.position - b.position);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return undefined;
  const angleDeg = roundTo((Math.atan2(dx, -dy) * 180) / Math.PI + 360, 100) % 360;
  const stopsCss = ordered
    .map(({ position, hex }) => `${hex} ${formatNumber(roundTo(position * 100, 100))}%`)
    .join(', ');

  return `linear-gradient(${formatNumber(angleDeg)}deg, ${stopsCss})`;
}

export function parseGradientPoint(value: unknown): { x: number; y: number } | undefined {
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

export function gradientStopColor(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const c = value as Record<string, unknown>;
  const r = colorChannel(c.red);
  const g = colorChannel(c.green);
  const b = colorChannel(c.blue);
  const a = colorChannel(c.alpha ?? 1);
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}${toHexByte(a)}`;
}

export function colorChannel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

export function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function roundTo(value: number, factor: number): number {
  return Math.round(value * factor) / factor;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}
