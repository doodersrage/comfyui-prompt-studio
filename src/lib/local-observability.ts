import { readBrowserValue, writeBrowserValue } from './browser-storage';

export const LOCAL_OBSERVABILITY_KEY = 'comfy-local-observability-v1';

export type FirstQueueSetupStepId = 'storage' | 'comfy' | 'systemWorkflows';

export type LocalObservabilityCounters = {
  firstQueueSuccess: number;
  exactReplay: number;
  playbookCtaClick: number;
  queueFailures: number;
  firstQueueSetupShown: number;
  firstQueueSetupDismissed: number;
  firstQueueSetupCompleted: number;
  firstQueueSetupStepFails: Partial<Record<FirstQueueSetupStepId, number>>;
  lastFailureMessage?: string;
  lastFailureHref?: string;
  lastFailureAt?: number;
  lastBlockedSetupStep?: FirstQueueSetupStepId;
  updatedAt?: number;
};

const DEFAULT_COUNTERS: LocalObservabilityCounters = {
  firstQueueSuccess: 0,
  exactReplay: 0,
  playbookCtaClick: 0,
  queueFailures: 0,
  firstQueueSetupShown: 0,
  firstQueueSetupDismissed: 0,
  firstQueueSetupCompleted: 0,
  firstQueueSetupStepFails: {},
};

function normalizeStepFails(raw: unknown): Partial<Record<FirstQueueSetupStepId, number>> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const next: Partial<Record<FirstQueueSetupStepId, number>> = {};
  for (const key of ['storage', 'comfy', 'systemWorkflows'] as const) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value > 0) {
      next[key] = Math.floor(value);
    }
  }
  return next;
}

export function loadLocalObservability(): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {} };
  }
  const raw = readBrowserValue<Partial<LocalObservabilityCounters>>(LOCAL_OBSERVABILITY_KEY);
  return {
    firstQueueSuccess: Math.max(0, Number(raw?.firstQueueSuccess) || 0),
    exactReplay: Math.max(0, Number(raw?.exactReplay) || 0),
    playbookCtaClick: Math.max(0, Number(raw?.playbookCtaClick) || 0),
    queueFailures: Math.max(0, Number(raw?.queueFailures) || 0),
    firstQueueSetupShown: Math.max(0, Number(raw?.firstQueueSetupShown) || 0),
    firstQueueSetupDismissed: Math.max(0, Number(raw?.firstQueueSetupDismissed) || 0),
    firstQueueSetupCompleted: Math.max(0, Number(raw?.firstQueueSetupCompleted) || 0),
    firstQueueSetupStepFails: normalizeStepFails(raw?.firstQueueSetupStepFails),
    ...(typeof raw?.lastFailureMessage === 'string' && raw.lastFailureMessage.trim()
      ? { lastFailureMessage: raw.lastFailureMessage.trim().slice(0, 400) }
      : {}),
    ...(typeof raw?.lastFailureHref === 'string' && raw.lastFailureHref.trim()
      ? { lastFailureHref: raw.lastFailureHref.trim() }
      : {}),
    ...(typeof raw?.lastFailureAt === 'number' ? { lastFailureAt: raw.lastFailureAt } : {}),
    ...(raw?.lastBlockedSetupStep === 'storage' ||
    raw?.lastBlockedSetupStep === 'comfy' ||
    raw?.lastBlockedSetupStep === 'systemWorkflows'
      ? { lastBlockedSetupStep: raw.lastBlockedSetupStep }
      : {}),
    ...(typeof raw?.updatedAt === 'number' ? { updatedAt: raw.updatedAt } : {}),
  };
}

function persist(next: LocalObservabilityCounters): LocalObservabilityCounters {
  writeBrowserValue(LOCAL_OBSERVABILITY_KEY, next);
  return next;
}

export function incrementLocalObservability(
  key: keyof Pick<
    LocalObservabilityCounters,
    | 'firstQueueSuccess'
    | 'exactReplay'
    | 'playbookCtaClick'
    | 'queueFailures'
    | 'firstQueueSetupShown'
    | 'firstQueueSetupDismissed'
    | 'firstQueueSetupCompleted'
  >
): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {} };
  }
  const base = loadLocalObservability();
  return persist({
    ...base,
    [key]: (base[key] ?? 0) + 1,
    updatedAt: Date.now(),
  });
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

export function noteQueueFailureMetric(input: {
  message: string;
  href?: string;
}): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {} };
  }
  const base = loadLocalObservability();
  return persist({
    ...base,
    queueFailures: (base.queueFailures ?? 0) + 1,
    lastFailureMessage: input.message.trim().slice(0, 400) || 'Queue failed.',
    ...(input.href?.trim() ? { lastFailureHref: input.href.trim() } : {}),
    lastFailureAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export function noteFirstQueueSetupShownMetric(): void {
  incrementLocalObservability('firstQueueSetupShown');
}

export function noteFirstQueueSetupDismissedMetric(): void {
  incrementLocalObservability('firstQueueSetupDismissed');
}

export function noteFirstQueueSetupCompletedMetric(): void {
  incrementLocalObservability('firstQueueSetupCompleted');
}

/** Record which setup step is currently blocking (and bump its fail counter). */
export function noteFirstQueueSetupBlockedStep(
  step: FirstQueueSetupStepId
): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {} };
  }
  const base = loadLocalObservability();
  const fails = { ...base.firstQueueSetupStepFails };
  fails[step] = (fails[step] ?? 0) + 1;
  return persist({
    ...base,
    firstQueueSetupStepFails: fails,
    lastBlockedSetupStep: step,
    updatedAt: Date.now(),
  });
}

export function clearLocalObservability(): LocalObservabilityCounters {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {} };
  }
  return persist({ ...DEFAULT_COUNTERS, firstQueueSetupStepFails: {}, updatedAt: Date.now() });
}

export function exportLocalObservabilityJson(counters = loadLocalObservability()): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      counters,
      summary: summarizeLocalReliability(counters),
    },
    null,
    2
  );
}

export function downloadLocalObservabilityExport(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const blob = new Blob([exportLocalObservabilityJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `prompt-studio-reliability-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Compact reliability summary for Settings UI. */
export function summarizeLocalReliability(counters = loadLocalObservability()): {
  replayHitRate: number | null;
  playbookClickRate: number | null;
  setupCompletionRate: number | null;
  headline: string;
} {
  const failures = counters.queueFailures || 0;
  const successes = counters.firstQueueSuccess || 0;
  const replays = counters.exactReplay || 0;
  const cta = counters.playbookCtaClick || 0;
  const shown = counters.firstQueueSetupShown || 0;
  const completed = counters.firstQueueSetupCompleted || 0;
  const replayHitRate = successes + replays > 0 ? replays / (successes + replays) : null;
  const playbookClickRate = failures > 0 ? Math.min(1, cta / failures) : null;
  const setupCompletionRate = shown > 0 ? Math.min(1, completed / shown) : null;

  let headline = 'No local reliability events yet.';
  if (counters.lastFailureMessage) {
    headline = `Last failure: ${counters.lastFailureMessage}`;
  } else if (counters.lastBlockedSetupStep) {
    headline = `Setup often blocked on ${counters.lastBlockedSetupStep}.`;
  } else if (replays > 0) {
    headline = `${replays} exact replay${replays === 1 ? '' : 's'} used.`;
  } else if (successes > 0) {
    headline = `${successes} first-queue success event${successes === 1 ? '' : 's'}.`;
  }

  return { replayHitRate, playbookClickRate, setupCompletionRate, headline };
}
