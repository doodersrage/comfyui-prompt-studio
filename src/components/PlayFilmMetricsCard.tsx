'use client';

import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { StatCard, ToolSection } from '@/components/ui/ToolPageShell';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  loadLocalObservability,
  summarizePlayFunnel,
  type LocalObservabilityCounters,
} from '@/lib/local-observability';
import {
  daysFromCampaignStartToFirstFilmCut,
  firstFilmCutWithinDays,
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
  type PlayMetrics,
} from '@/lib/play-metrics';

function formatDays(days: number): string {
  if (days < 1) {
    return 'same day';
  }
  if (days < 1.05) {
    return '1 day';
  }
  return `${days.toFixed(days < 10 ? 1 : 0)} days`;
}

function formatRate(rate: number | null): string {
  if (rate == null) {
    return '—';
  }
  return `${Math.round(rate * 100)}%`;
}

export default function PlayFilmMetricsCard() {
  const [metrics, setMetrics] = useState<PlayMetrics>({ version: 1 });
  const [funnel, setFunnel] = useState<LocalObservabilityCounters | null>(null);

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => {
        setMetrics(loadPlayMetrics());
        setFunnel(loadLocalObservability());
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    };
  }, []);

  const rates = summarizePlayFunnel(funnel ?? undefined);
  const hasTiming = Boolean(metrics.firstPlayCampaignAt || metrics.firstFilmCutAt);
  const hasFunnel =
    (funnel?.firstPlayCampaign || 0) > 0 ||
    (funnel?.firstFilmCut || 0) > 0 ||
    (funnel?.keepTryOn || 0) > 0 ||
    (funnel?.saveToCast || 0) > 0;

  if (!hasTiming && !hasFunnel) {
    return null;
  }

  const days = daysFromCampaignStartToFirstFilmCut(metrics);
  const withinWeek = firstFilmCutWithinDays(7, metrics);
  const value =
    days === null ? (metrics.firstPlayCampaignAt ? 'Campaign started' : '—') : formatDays(days);
  const detail =
    days === null
      ? 'Cut a Day or Roleplay film to close the loop.'
      : withinWeek
        ? 'First film cut within a week of starting Play.'
        : 'First film cut after the first Play campaign.';

  return (
    <ToolSection
      title="Play film loop"
      description="Time and conversion from campaign start to Cut film / Save to Cast."
      data-testid="play-film-metrics"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Campaign → first film" value={value} detail={detail} />
        <StatCard
          label="First film cut"
          value={metrics.firstFilmCutAt ? 'Done' : 'Not yet'}
          detail={
            metrics.firstFilmCutAt
              ? new Date(metrics.firstFilmCutAt).toLocaleString()
              : 'Open Day or Roleplay and Cut film.'
          }
        />
        <StatCard label="Cut rate" value={formatRate(rates.cutRate)} detail={rates.headline} />
        <StatCard
          label="Save-to-Cast rate"
          value={formatRate(rates.saveRate)}
          detail={`Keep→cut ${formatRate(rates.keepToCutRate)} · ${funnel?.saveToCast ?? 0} saves`}
        />
      </div>
      <div className="mt-3">
        <ButtonLink href="/play" size="sm" variant="secondary">
          Open Play campaign
        </ButtonLink>
      </div>
    </ToolSection>
  );
}
