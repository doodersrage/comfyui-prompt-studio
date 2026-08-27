'use client';

import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { StatCard, ToolSection } from '@/components/ui/ToolPageShell';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  daysFromCampaignStartToFirstFilmCut,
  firstFilmCutWithinDays,
  loadPlayMetrics,
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

export default function PlayFilmMetricsCard() {
  const [metrics, setMetrics] = useState<PlayMetrics>({ version: 1 });

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => setMetrics(loadPlayMetrics()));
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  if (!metrics.firstPlayCampaignAt && !metrics.firstFilmCutAt) {
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
      description="Time from first campaign start to first Cut film."
      data-testid="play-film-metrics"
    >
      <div className="grid gap-3 sm:grid-cols-2">
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
      </div>
      <div className="mt-3">
        <ButtonLink href="/play" size="sm" variant="secondary">
          Open Play campaign
        </ButtonLink>
      </div>
    </ToolSection>
  );
}
