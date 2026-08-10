'use client';

import type { RatedTokenStat } from '@/lib/rating-token-analytics';
import type { UserHistoryAnalytics } from '@/lib/user-analytics';
import type { GalleryStats } from '@/lib/gallery-stats';
import type { GalleryLineageGroup } from '@/lib/gallery-lineage-groups';
import { DEFAULT_NEGATIVE_PROFILES } from '@/lib/negative-profiles';
import { addAvoidedToken, addAvoidedTokens } from '@/lib/avoided-tokens';
import {
  buildUserSceneStarterFromHints,
  loadUserSceneStarterPresets,
  upsertUserSceneStarterPreset,
  type UserSceneStarterPreset,
} from '@/lib/user-scene-starter-presets';
import { ToolBlockGroup, ToolContentPanel, ToolSection } from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { scopeLabel } from '@/lib/user-scope';

export type StudioAnalyticsTabProps = {
  accent: ToolAccent;
  authEnabled: boolean;
  username?: string;
  historyAnalytics: UserHistoryAnalytics;
  galleryAnalytics: GalleryStats;
  ratingTokenStats: RatedTokenStat[];
  galleryLineageClusters: GalleryLineageGroup[];
  onBackupStatusChange: (status: string) => void;
  onUserSceneStartersChange: (presets: UserSceneStarterPreset[]) => void;
};

export default function StudioAnalyticsTab({
  authEnabled,
  username,
  historyAnalytics,
  galleryAnalytics,
  ratingTokenStats,
  galleryLineageClusters,
  onBackupStatusChange,
  onUserSceneStartersChange,
}: StudioAnalyticsTabProps) {
  return (
    <>
      <ToolSection title="Your activity">
        <p className="text-sm text-[var(--text-secondary)]">
          {authEnabled
            ? `Scoped to ${username ?? scopeLabel()}. History and gallery stats reflect only this account’s browser data.`
            : 'Shared browser session — enable login to scope history and analytics per user.'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'History', value: historyAnalytics.total },
            {
              label: 'History rated',
              value: historyAnalytics.rated,
            },
            {
              label: 'History favorites',
              value: historyAnalytics.favorites,
            },
            {
              label: 'Avg history rating',
              value: historyAnalytics.avgRating != null ? `${historyAnalytics.avgRating}★` : '—',
            },
            { label: 'Gallery', value: galleryAnalytics.total },
            {
              label: 'Gallery rated',
              value: Math.max(0, galleryAnalytics.completed - galleryAnalytics.unreviewed),
            },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)]/50 px-3 py-2"
            >
              <p className="type-caption text-[var(--text-muted)]">{stat.label}</p>
              <p className="type-heading tabular-nums text-[var(--text-primary)]">{stat.value}</p>
            </div>
          ))}
        </div>
        {historyAnalytics.byTool.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {historyAnalytics.byTool.map(entry => (
              <span
                key={entry.tool}
                className="rounded-full border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-1 text-xs text-[var(--text-secondary)]"
              >
                {entry.tool} · {entry.count}
              </span>
            ))}
          </div>
        ) : null}
      </ToolSection>

      <ToolSection title="Gallery rating analytics">
        <p className="text-sm text-[var(--text-secondary)]">
          Tokens that correlate with high (4–5★) or low (1–2★) gallery ratings. Rate outputs in
          Gallery review mode to grow this list.
        </p>
        {ratingTokenStats.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                void import('@/lib/rating-token-analytics').then(({ negativeScoringTokens }) => {
                  const added = addAvoidedTokens(negativeScoringTokens(ratingTokenStats));
                  onBackupStatusChange(
                    added > 0
                      ? `Added ${added} negative-scoring token(s) to avoided list.`
                      : 'No new negative-scoring tokens to add.'
                  );
                });
              }}
            >
              Add negative tokens to avoidance
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void (async () => {
                  const [
                    { negativeScoringTokens },
                    { appendTokensToNegativeProfileExtra },
                    settingsMod,
                  ] = await Promise.all([
                    import('@/lib/rating-token-analytics'),
                    import('@/lib/negative-profiles'),
                    import('@/lib/comfyui-settings'),
                  ]);
                  const tokens = negativeScoringTokens(ratingTokenStats);
                  if (tokens.length === 0) {
                    onBackupStatusChange('No negative-scoring tokens to append yet.');
                    return;
                  }
                  const settings = settingsMod.loadComfyUiSettings();
                  const profiles =
                    (settings.negativeProfiles?.length ?? 0) > 0
                      ? [...settings.negativeProfiles!]
                      : [...DEFAULT_NEGATIVE_PROFILES];
                  const profileId =
                    settings.selectedNegativeProfileId ?? profiles[0]?.id ?? 'general-sd';
                  const profileLabel =
                    profiles.find(entry => entry.id === profileId)?.label ?? profileId;
                  const { profiles: nextProfiles, added } = appendTokensToNegativeProfileExtra(
                    profiles,
                    profileId,
                    tokens
                  );
                  settingsMod.saveComfyUiSettings({
                    ...settings,
                    negativeProfiles: nextProfiles,
                  });
                  onBackupStatusChange(
                    added > 0
                      ? `Appended ${added} token(s) to negative profile “${profileLabel}”.`
                      : `Negative profile “${profileLabel}” already includes those tokens.`
                  );
                })();
              }}
            >
              Apply negatives to profile
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void import('@/lib/rating-token-analytics').then(
                  ({ positiveScoringTokens, buildSceneHintsFromPositiveTokens }) => {
                    const tokens = positiveScoringTokens(ratingTokenStats);
                    if (tokens.length === 0) {
                      onBackupStatusChange('No positive-scoring tokens to promote yet.');
                      return;
                    }
                    const hints = buildSceneHintsFromPositiveTokens(tokens);
                    const preset = buildUserSceneStarterFromHints({
                      label: `Gallery tokens (${tokens.slice(0, 3).join(', ')})`,
                      hints,
                      category: 'lifestyle',
                      source: 'promoted',
                    });
                    upsertUserSceneStarterPreset(preset);
                    onUserSceneStartersChange(loadUserSceneStarterPresets());
                    onBackupStatusChange(
                      `Saved scene starter preset from ${tokens.length} high-scoring token(s).`
                    );
                  }
                );
              }}
            >
              Promote top tokens to scene preset
            </Button>
          </div>
        ) : null}
        {ratingTokenStats.length === 0 ? (
          <EmptyState
            icon="diff"
            title="Not enough rated gallery entries"
            description="Complete ComfyUI jobs, rate them in Gallery review mode, then return here."
          />
        ) : (
          <ToolBlockGroup className="mt-[var(--block-gap)]">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ratingTokenStats.map(stat => (
                <ToolContentPanel key={stat.token} className="ui-block-group">
                  <p className="type-title">{stat.token}</p>
                  <p className="type-caption text-[var(--text-muted)]">
                    score {stat.score > 0 ? '+' : ''}
                    {stat.score} · {stat.highCount} high · {stat.lowCount} low
                  </p>
                  {stat.score < 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        addAvoidedToken(stat.token);
                        onBackupStatusChange(`Added “${stat.token}” to avoided tokens.`);
                      }}
                      className="type-caption text-rose-300 hover:text-rose-200"
                    >
                      Add to avoided
                    </button>
                  ) : null}
                  {stat.score > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const preset = buildUserSceneStarterFromHints({
                          label: `Motif: ${stat.token}`,
                          hints: stat.token,
                          category: 'lifestyle',
                          source: 'promoted',
                        });
                        upsertUserSceneStarterPreset(preset);
                        onUserSceneStartersChange(loadUserSceneStarterPresets());
                        onBackupStatusChange(`Saved scene starter preset for “${stat.token}”.`);
                      }}
                      className="type-caption text-emerald-300 hover:text-emerald-200"
                    >
                      Save as scene preset
                    </button>
                  ) : null}
                </ToolContentPanel>
              ))}
            </div>
          </ToolBlockGroup>
        )}
      </ToolSection>

      <ToolSection title="Gallery lineage clusters">
        <p className="text-sm text-[var(--text-secondary)]">
          Parent outputs with upscale, refine, or variation derivatives. Open Gallery to act on a
          cluster.
        </p>
        {galleryLineageClusters.length === 0 ? (
          <EmptyState
            icon="diff"
            title="No lineage clusters yet"
            description="Upscale, refine, or re-queue variations from Gallery to build derivative trees."
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {galleryLineageClusters.map(group => (
              <li
                key={group.root.id}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/35 px-3 py-2"
              >
                <p className="type-caption text-[var(--text-muted)]">
                  {group.root.model ?? group.root.tool} · {group.derivatives.length} derivative
                  {group.derivatives.length === 1 ? '' : 's'}
                  {group.root.reviewRating ? ` · ${group.root.reviewRating}★ root` : ''}
                </p>
                <p className="type-body ui-truncate-2 text-[var(--text-primary)]">
                  {group.root.prompt}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {group.derivatives.slice(0, 4).map(derivative => (
                    <span
                      key={derivative.id}
                      className="rounded-full border border-violet-500/20 bg-violet-500/5 px-2 py-0.5 text-[10px] text-violet-200/90"
                    >
                      {derivative.derivedKind ?? 'derived'}
                      {derivative.reviewRating ? ` · ${derivative.reviewRating}★` : ''}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ToolSection>
    </>
  );
}
