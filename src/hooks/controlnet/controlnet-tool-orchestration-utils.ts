import { normalizeControlNetMode, type ControlNetMode } from '@/lib/controlnet-prompt';

export function normalizeSlotStrengths(raw: unknown): number[] {
  const fallback = [1, 1, 1, 1];
  if (!Array.isArray(raw)) {
    return fallback;
  }
  return fallback.map((_, index) => {
    const value = Number(raw[index]);
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.min(2, Math.max(0, value));
  });
}

export function normalizeSlotModes(raw: unknown, primary: ControlNetMode): ControlNetMode[] {
  const fallback: ControlNetMode[] = [primary, primary, primary, primary];
  if (!Array.isArray(raw)) {
    return fallback;
  }
  return fallback.map((_, index) =>
    normalizeControlNetMode(raw[index] ?? (index === 0 ? primary : 'depth'))
  );
}
