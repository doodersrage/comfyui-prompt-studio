import { readBrowserValue, writeBrowserValue } from './browser-storage';

export const LOCAL_OBSERVABILITY_KEY = 'comfy-local-observability-v1';

export type LocalObservabilityCounters = {
  firstQueueSuccess: number;
  exactReplay: number;
  playbookCtaClick: number;
  updatedAt?: number;
};

const DEFAULT_COUNTERS: LocalObservabilityCounters = {
  firstQueueSuccess: 0,
  exactReplay: 0,
  playbookCtaClick: 0,
};

export function loadLocalObservability(): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS };
  }
  const raw = readBrowserValue<Partial<LocalObservabilityCounters>>(LOCAL_OBSERVABILITY_KEY);
  return {
    firstQueueSuccess: Math.max(0, Number(raw?.firstQueueSuccess) || 0),
    exactReplay: Math.max(0, Number(raw?.exactReplay) || 0),
    playbookCtaClick: Math.max(0, Number(raw?.playbookCtaClick) || 0),
    ...(typeof raw?.updatedAt === 'number' ? { updatedAt: raw.updatedAt } : {}),
  };
}

export function incrementLocalObservability(
  key: keyof Omit<LocalObservabilityCounters, 'updatedAt'>
): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS };
  }
  const base = loadLocalObservability();
  const stamped: LocalObservabilityCounters = {
    ...base,
    [key]: (base[key] ?? 0) + 1,
    updatedAt: Date.now(),
  };
  writeBrowserValue(LOCAL_OBSERVABILITY_KEY, stamped);
  return stamped;
}

export function noteFirstQueueSuccessMetric(): void {
  incrementLocalObservability('firstQueueSuccess');
}

export function noteExactReplayMetric(): void {
  incrementLocalObservability('exactReplay');
}

export function notePlaybookCtaClickMetric(): void {
  incrementLocalObservability('playbookCtaClick');
}
