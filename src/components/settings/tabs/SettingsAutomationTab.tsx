'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  addAvoidedToken,
  clearAvoidedTokens,
  downloadAvoidedTokensExport,
  importAvoidedTokensJson,
  removeAvoidedToken,
} from '@/lib/avoided-tokens';
import { clearWebhookLog, retryWebhookLogEntry, type WebhookLogEntry } from '@/lib/webhook-log';
import { saveScheduledBatchConfig, type ScheduledBatchConfig } from '@/lib/scheduled-batch';
import {
  saveWebhookSettings,
  WEBHOOK_EVENT_CATALOG,
  isWebhookEventEnabled,
  normalizeWebhookEnabledEvents,
  type WebhookSettings,
} from '@/lib/webhook-settings';
import type { ScheduledBatchServerStatus } from '@/lib/scheduled-batch-profile-sync';
import {
  checkEmbeddingSearchHealth,
  type EmbeddingSearchHealth,
} from '@/lib/embedding-search-health';
import { detailLevelLabel, type DetailLevel } from '@/lib/detail-level';
import { QUEUE_QUALITY_PROFILE_OPTIONS } from '@/lib/queue-quality-profile';
import { COMFY_IMAGE_MODELS } from '@/lib/comfy-models/client';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';
import { FieldLabel, TextArea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export type SettingsAutomationTabProps = {
  webhookSettings: WebhookSettings;
  setWebhookSettings: (value: WebhookSettings) => void;
  avoidedTokens: string[];
  avoidedTokenDraft: string;
  setAvoidedTokenDraft: (value: string) => void;
  avoidancePreviewPrompt: string;
  setAvoidancePreviewPrompt: (value: string) => void;
  avoidancePreview: {
    filtered: string;
    removedTokens: string[];
    instructionLine: string;
  } | null;
  setAvoidancePreview: (
    value: {
      filtered: string;
      removedTokens: string[];
      instructionLine: string;
    } | null
  ) => void;
  webhookLog: WebhookLogEntry[];
  webhookEventFilter: string;
  setWebhookEventFilter: (value: string) => void;
  expandedWebhookLogId: string | null;
  setExpandedWebhookLogId: (
    value: string | null | ((previous: string | null) => string | null)
  ) => void;
  scheduledBatch: ScheduledBatchConfig;
  setScheduledBatch: (value: ScheduledBatchConfig) => void;
  serverScheduledBatchStatus: ScheduledBatchServerStatus | null;
  sharedSettings: SharedToolSettings;
  setStatus: (status: string | null) => void;
};

export default function SettingsAutomationTab({
  webhookSettings,
  setWebhookSettings,
  avoidedTokens,
  avoidedTokenDraft,
  setAvoidedTokenDraft,
  avoidancePreviewPrompt,
  setAvoidancePreviewPrompt,
  avoidancePreview,
  setAvoidancePreview,
  webhookLog,
  webhookEventFilter,
  setWebhookEventFilter,
  expandedWebhookLogId,
  setExpandedWebhookLogId,
  scheduledBatch,
  setScheduledBatch,
  serverScheduledBatchStatus,
  sharedSettings,
  setStatus,
}: SettingsAutomationTabProps) {
  const [embeddingHealth, setEmbeddingHealth] = useState<EmbeddingSearchHealth | null>(null);

  useEffect(() => {
    void checkEmbeddingSearchHealth().then(setEmbeddingHealth);
  }, []);

  const filteredWebhookLog = useMemo(() => {
    if (webhookEventFilter === 'all') {
      return webhookLog;
    }
    return webhookLog.filter(entry => entry.event === webhookEventFilter);
  }, [webhookEventFilter, webhookLog]);

  const webhookEventOptions = useMemo(() => {
    const events = new Set(webhookLog.map(entry => entry.event));
    return [...events].sort();
  }, [webhookLog]);

  return (
    <>
      <ToolSection title="Automation hub">
        <p className="text-sm text-[var(--text-secondary)]">
          Webhooks, scheduled batch, and avoided tokens live here. Browser notifications,
          auto-improve, and ComfyUI queue defaults are under{' '}
          <Link href="/settings?tab=comfyui" className="text-[var(--accent-text)] hover:underline">
            ComfyUI settings
          </Link>
          . Email campaigns and best-of-N profile runs are under{' '}
          <Link href="/profile" className="text-[var(--accent-text)] hover:underline">
            Profile
          </Link>
          .
        </p>
        {embeddingHealth ? (
          <p
            className={`rounded-lg border px-3 py-2 text-xs ${
              embeddingHealth.available
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
            }`}
          >
            <span className="font-medium">Semantic gallery search · </span>
            {embeddingHealth.message}
          </p>
        ) : null}
      </ToolSection>

      <ToolSection title="Webhooks">
        <p className="text-sm text-[var(--text-secondary)]">
          POST queue, prompt, and session events to an external URL (via server proxy).
        </p>
        <details className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-3 text-xs text-[var(--text-secondary)]">
          <summary className="cursor-pointer font-medium text-[var(--text-primary)]">
            Supported events
          </summary>
          <ul className="mt-2 space-y-1.5">
            {WEBHOOK_EVENT_CATALOG.map(item => (
              <li key={item.event}>
                <code className="text-[var(--text-primary)]">{item.event}</code> —{' '}
                {item.description}
              </li>
            ))}
          </ul>
        </details>
        <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={webhookSettings.enabled}
            onChange={event => {
              const next = { ...webhookSettings, enabled: event.target.checked };
              setWebhookSettings(next);
              saveWebhookSettings(next);
            }}
            className={`h-4 w-4 rounded ${accentFocusClass()}`}
          />
          Enable webhooks
        </label>
        <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={Boolean(scheduledBatch.webhookAutoRetry)}
            disabled={!webhookSettings.enabled}
            onChange={event => {
              const next = {
                ...scheduledBatch,
                webhookAutoRetry: event.target.checked,
              };
              setScheduledBatch(next);
              saveScheduledBatchConfig(next);
            }}
            className={`h-4 w-4 rounded ${accentFocusClass()}`}
          />
          Auto-retry failed webhook deliveries (exponential backoff, browser tab open)
        </label>
        <FieldLabel htmlFor="webhook-url">Webhook URL</FieldLabel>
        <input
          id="webhook-url"
          value={webhookSettings.url ?? ''}
          onChange={event => {
            const next = { ...webhookSettings, url: event.target.value };
            setWebhookSettings(next);
            saveWebhookSettings(next);
          }}
          placeholder="https://example.com/hooks/comfyui"
          className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
        />
        <FieldLabel htmlFor="webhook-secret">Shared secret (optional)</FieldLabel>
        <input
          id="webhook-secret"
          value={webhookSettings.secret ?? ''}
          onChange={event => {
            const next = { ...webhookSettings, secret: event.target.value };
            setWebhookSettings(next);
            saveWebhookSettings(next);
          }}
          className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
        />
        <FieldLabel htmlFor="webhook-template">Payload template</FieldLabel>
        <select
          id="webhook-template"
          value={webhookSettings.template ?? 'generic'}
          onChange={event => {
            const next = {
              ...webhookSettings,
              template: event.target.value as WebhookSettings['template'],
            };
            setWebhookSettings(next);
            saveWebhookSettings(next);
          }}
          className="ui-input w-full max-w-xs"
        >
          <option value="generic">Generic JSON</option>
          <option value="discord">Discord embed</option>
          <option value="slack">Slack blocks</option>
        </select>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Leave all unchecked to receive every event. Check only the events you want dispatched.
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {WEBHOOK_EVENT_CATALOG.map(item => {
            const checked = isWebhookEventEnabled(webhookSettings, item.event);
            return (
              <li key={item.event}>
                <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={event => {
                      const allEvents = WEBHOOK_EVENT_CATALOG.map(entry => entry.event);
                      const current =
                        webhookSettings.enabledEvents === undefined
                          ? allEvents
                          : [...webhookSettings.enabledEvents];
                      const nextEvents = event.target.checked
                        ? [...new Set([...current, item.event])]
                        : current.filter(entry => entry !== item.event);
                      const next = {
                        ...webhookSettings,
                        enabledEvents: normalizeWebhookEnabledEvents(nextEvents),
                      };
                      setWebhookSettings(next);
                      saveWebhookSettings(next);
                    }}
                    className={`mt-0.5 h-4 w-4 rounded ${accentFocusClass()}`}
                  />
                  <span>
                    <code className="text-[var(--text-primary)]">{item.event}</code>
                    <span className="mt-0.5 block text-[var(--text-muted)]">
                      {item.description}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </ToolSection>

      <ToolSection title="Avoided tokens">
        <p className="text-sm text-[var(--text-secondary)]">
          Motifs to steer generators away from. Low gallery ratings append tokens automatically;
          manage the list here.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id="settings-avoided-token-draft"
            value={avoidedTokenDraft}
            onChange={event => setAvoidedTokenDraft(event.target.value)}
            placeholder="Add token"
            className="ui-input min-w-45 flex-1 px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
          <Button
            variant="secondary"
            disabled={!avoidedTokenDraft.trim()}
            onClick={() => {
              addAvoidedToken(avoidedTokenDraft);
              setAvoidedTokenDraft('');
              setStatus(`Added “${avoidedTokenDraft.trim()}” to avoided tokens.`);
            }}
          >
            Add
          </Button>
          <Button
            variant="secondary"
            disabled={avoidedTokens.length === 0}
            onClick={() => {
              clearAvoidedTokens();
              setStatus('Cleared avoided tokens.');
            }}
          >
            Clear all
          </Button>
          <Button
            variant="secondary"
            disabled={avoidedTokens.length === 0}
            onClick={() => {
              downloadAvoidedTokensExport();
              setStatus('Avoided tokens exported.');
            }}
          >
            Export JSON
          </Button>
          <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                void file.text().then(raw => {
                  const merge = window.confirm(
                    'Merge imported tokens into the list? Cancel replaces the full list.'
                  );
                  const count = importAvoidedTokensJson(raw, merge ? 'merge' : 'replace');
                  setStatus(`Imported ${count} avoided token(s).`);
                });
                event.target.value = '';
              }}
            />
          </label>
        </div>
        {avoidedTokens.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title="No avoided tokens yet"
            description="Add motifs to steer generators away from, or rate low Gallery outputs so tokens append automatically."
            action={{
              label: 'Add a token',
              onClick: () => {
                document.getElementById('settings-avoided-token-draft')?.focus();
              },
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {avoidedTokens.map(token => (
              <button
                key={token}
                type="button"
                onClick={() => {
                  removeAvoidedToken(token);
                  setStatus(`Removed “${token}”.`);
                }}
                className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-rose-500/60 hover:text-rose-200"
                title="Click to remove"
              >
                {token} ×
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 space-y-2">
          <FieldLabel htmlFor="avoidance-preview-prompt">Avoidance preview</FieldLabel>
          <TextArea
            id="avoidance-preview-prompt"
            rows={3}
            value={avoidancePreviewPrompt}
            onChange={event => setAvoidancePreviewPrompt(event.target.value)}
            placeholder="Paste a prompt to see which avoided tokens match and the LLM instruction line."
            className={accentFocusClass()}
          />
          <Button
            variant="secondary"
            disabled={!avoidancePreviewPrompt.trim()}
            onClick={() => {
              void fetch('/api/avoidance/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: avoidancePreviewPrompt }),
              })
                .then(response => response.json())
                .then(
                  (data: {
                    filtered?: string;
                    removedTokens?: string[];
                    instructionLine?: string;
                  }) => {
                    setAvoidancePreview({
                      filtered: data.filtered ?? '',
                      removedTokens: data.removedTokens ?? [],
                      instructionLine: data.instructionLine ?? '',
                    });
                  }
                )
                .catch(() => setAvoidancePreview(null));
            }}
          >
            Preview avoidance
          </Button>
          {avoidancePreview ? (
            <div className="ui-surface-inset type-caption">
              {avoidancePreview.removedTokens.length > 0 ? (
                <p className="text-amber-300">
                  Matched tokens: {avoidancePreview.removedTokens.join(', ')}
                </p>
              ) : (
                <p>No avoided tokens found in this prompt.</p>
              )}
              {avoidancePreview.instructionLine ? (
                <p className="mt-2 text-[var(--text-muted)]">{avoidancePreview.instructionLine}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </ToolSection>

      <ToolSection title="Webhook event log">
        <p className="text-sm text-[var(--text-secondary)]">
          Recent webhook dispatch attempts (newest first).
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="space-y-1 text-xs text-[var(--text-secondary)]">
            Event filter
            <select
              value={webhookEventFilter}
              onChange={event => setWebhookEventFilter(event.target.value)}
              className="block rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
            >
              <option value="all">All events</option>
              {webhookEventOptions.map(eventName => (
                <option key={eventName} value={eventName}>
                  {eventName}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            disabled={webhookLog.length === 0}
            onClick={() => {
              clearWebhookLog();
              setStatus('Cleared webhook log.');
            }}
          >
            Clear log
          </Button>
        </div>
        {filteredWebhookLog.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title={webhookLog.length === 0 ? 'No webhook events yet' : 'No events for this filter'}
            description={
              webhookLog.length === 0
                ? 'Dispatch attempts appear here once webhooks fire for queue, gallery, or storage events.'
                : 'Try another event type or clear the filter to see the full log.'
            }
            action={
              webhookLog.length > 0 && webhookEventFilter !== 'all'
                ? {
                    label: 'Show all events',
                    onClick: () => setWebhookEventFilter('all'),
                  }
                : undefined
            }
          />
        ) : (
          <ol className="space-y-2">
            {filteredWebhookLog.slice(0, 12).map(entry => (
              <li
                key={entry.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-3 text-xs text-[var(--text-secondary)]"
              >
                <p className={entry.ok ? 'text-emerald-300' : 'text-rose-300'}>
                  {entry.ok ? 'OK' : 'FAIL'} · {entry.event} ·{' '}
                  {new Date(entry.timestamp).toLocaleString()}
                </p>
                <p>{entry.message ?? entry.url}</p>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedWebhookLogId(previous => (previous === entry.id ? null : entry.id))
                  }
                  className="mt-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {expandedWebhookLogId === entry.id ? 'Hide payload' : 'Show payload'}
                </button>
                {expandedWebhookLogId === entry.id ? (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-2 text-[11px] text-[var(--text-secondary)]">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void retryWebhookLogEntry(entry).then(ok =>
                      setStatus(ok ? 'Webhook retry succeeded.' : 'Webhook retry failed.')
                    );
                  }}
                  className="mt-2 text-violet-300 hover:text-violet-200"
                >
                  Retry
                </button>
              </li>
            ))}
          </ol>
        )}
      </ToolSection>

      <ToolSection title="Scheduled batch">
        <p className="text-sm text-[var(--text-secondary)]">
          Two runners exist: a{' '}
          <strong className="font-medium text-[var(--text-secondary)]">browser</strong> scheduler
          (needs this tab open) and an optional{' '}
          <strong className="font-medium text-[var(--text-secondary)]">headless server</strong> cron
          gated by env.
        </p>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-3 text-xs text-[var(--text-secondary)]">
          <p className="mb-1 font-medium text-[var(--text-secondary)]">
            Headless server runner (env)
          </p>
          <p className="mb-2">
            Requires <code className="text-[var(--text-secondary)]">PROMPT_DATA_DIR</code> for
            durable profile storage, plus{' '}
            <code className="text-[var(--text-secondary)]">SERVER_SCHEDULED_BATCH=true</code>. The
            checkbox below only controls the in-browser runner.
          </p>
          {serverScheduledBatchStatus ? (
            <>
              <p>
                {serverScheduledBatchStatus.enabled
                  ? 'Active — server cron enabled (SERVER_SCHEDULED_BATCH=true).'
                  : 'Disabled — set SERVER_SCHEDULED_BATCH=true on the server to enable.'}{' '}
                {serverScheduledBatchStatus.persisted
                  ? 'Profile persisted to server storage.'
                  : 'Profile not persisted (set PROMPT_DATA_DIR to survive restarts).'}
              </p>
              <p className="mt-1">
                Using model{' '}
                <span className="text-[var(--text-primary)]">
                  {serverScheduledBatchStatus.profile.model}
                </span>{' '}
                · detail{' '}
                <span className="text-[var(--text-primary)]">
                  {serverScheduledBatchStatus.profile.detail}
                </span>{' '}
                · quality{' '}
                <span className="text-[var(--text-primary)]">
                  {serverScheduledBatchStatus.profile.qualityProfile}
                </span>
              </p>
              <p className="mt-1">
                Last run:{' '}
                {serverScheduledBatchStatus.lastRunAt
                  ? new Date(serverScheduledBatchStatus.lastRunAt).toLocaleString()
                  : 'never'}
              </p>
            </>
          ) : (
            <p>Checking server status…</p>
          )}
        </div>
        <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={scheduledBatch.enabled}
            onChange={event => {
              const next = { ...scheduledBatch, enabled: event.target.checked };
              setScheduledBatch(next);
              saveScheduledBatchConfig(next);
            }}
            className={`h-4 w-4 rounded ${accentFocusClass()}`}
          />
          Enable browser scheduled batch (tab must stay open)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="scheduled-interval">Interval (minutes)</FieldLabel>
            <input
              id="scheduled-interval"
              type="number"
              min={5}
              value={scheduledBatch.intervalMinutes}
              onChange={event => {
                const next = {
                  ...scheduledBatch,
                  intervalMinutes: Number(event.target.value) || 60,
                };
                setScheduledBatch(next);
                saveScheduledBatchConfig(next);
              }}
              className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
            />
          </div>
          <div>
            <FieldLabel htmlFor="scheduled-count">Prompt count</FieldLabel>
            <input
              id="scheduled-count"
              type="number"
              min={1}
              max={12}
              value={scheduledBatch.count}
              onChange={event => {
                const next = {
                  ...scheduledBatch,
                  count: Number(event.target.value) || 3,
                };
                setScheduledBatch(next);
                saveScheduledBatchConfig(next);
              }}
              className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
            />
          </div>
        </div>
        <FieldLabel htmlFor="scheduled-target">Target generator</FieldLabel>
        <select
          id="scheduled-target"
          value={scheduledBatch.target}
          onChange={event => {
            const next = {
              ...scheduledBatch,
              target: event.target.value as ScheduledBatchConfig['target'],
            };
            setScheduledBatch(next);
            saveScheduledBatchConfig(next);
          }}
          className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
        >
          <option value="random-scene">Random scene</option>
          <option value="topics">Topics batch</option>
          <option value="nsfw-generator">Adult generator</option>
        </select>
        <label className="mt-3 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={scheduledBatch.autoQueueComfyUi}
            onChange={event => {
              const next = {
                ...scheduledBatch,
                autoQueueComfyUi: event.target.checked,
              };
              setScheduledBatch(next);
              saveScheduledBatchConfig(next);
            }}
            className={`h-4 w-4 rounded ${accentFocusClass()}`}
          />
          Auto-queue to ComfyUI
        </label>
        <FieldLabel htmlFor="scheduled-genre">Genre/theme hint (optional)</FieldLabel>
        <input
          id="scheduled-genre"
          value={scheduledBatch.genre ?? ''}
          onChange={event => {
            const next = { ...scheduledBatch, genre: event.target.value || undefined };
            setScheduledBatch(next);
            saveScheduledBatchConfig(next);
          }}
          className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
        />
        <label className="mt-3 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={Boolean(scheduledBatch.overrideSharedSettings)}
            onChange={event => {
              const next = {
                ...scheduledBatch,
                overrideSharedSettings: event.target.checked,
                model: scheduledBatch.model ?? sharedSettings.model,
                detail: scheduledBatch.detail ?? sharedSettings.detail,
                qualityProfile: scheduledBatch.qualityProfile ?? sharedSettings.queueQualityProfile,
              };
              setScheduledBatch(next);
              saveScheduledBatchConfig(next);
            }}
            className={`h-4 w-4 rounded ${accentFocusClass()}`}
          />
          Override shared model / detail / quality for scheduled runs
        </label>
        {scheduledBatch.overrideSharedSettings ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor="scheduled-model">Model</FieldLabel>
              <select
                id="scheduled-model"
                value={scheduledBatch.model ?? sharedSettings.model}
                onChange={event => {
                  const next = { ...scheduledBatch, model: event.target.value };
                  setScheduledBatch(next);
                  saveScheduledBatchConfig(next);
                }}
                className="ui-input w-full"
              >
                {COMFY_IMAGE_MODELS.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="scheduled-detail">Detail</FieldLabel>
              <select
                id="scheduled-detail"
                value={scheduledBatch.detail ?? sharedSettings.detail}
                onChange={event => {
                  const next = {
                    ...scheduledBatch,
                    detail: event.target.value as DetailLevel,
                  };
                  setScheduledBatch(next);
                  saveScheduledBatchConfig(next);
                }}
                className="ui-input w-full"
              >
                {(['concise', 'balanced', 'rich'] as const).map(level => (
                  <option key={level} value={level}>
                    {detailLevelLabel(level)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="scheduled-quality">Quality profile</FieldLabel>
              <select
                id="scheduled-quality"
                value={scheduledBatch.qualityProfile ?? sharedSettings.queueQualityProfile}
                onChange={event => {
                  const next = {
                    ...scheduledBatch,
                    qualityProfile: event.target.value as SharedToolSettings['queueQualityProfile'],
                  };
                  setScheduledBatch(next);
                  saveScheduledBatchConfig(next);
                }}
                className="ui-input w-full"
              >
                {QUEUE_QUALITY_PROFILE_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Using shared model{' '}
            <span className="text-[var(--text-primary)]">{sharedSettings.model}</span> · detail{' '}
            {sharedSettings.detail} · quality {sharedSettings.queueQualityProfile}.
          </p>
        )}
        <div className="mt-3">
          <FieldLabel htmlFor="scheduled-best-of-n">Best-of-N ranking (LLM text rank)</FieldLabel>
          <select
            id="scheduled-best-of-n"
            value={scheduledBatch.bestOfN ?? 1}
            onChange={event => {
              const next = {
                ...scheduledBatch,
                bestOfN: Number(event.target.value) || 1,
              };
              setScheduledBatch(next);
              saveScheduledBatchConfig(next);
            }}
            className="ui-input w-full max-w-xs"
          >
            <option value={1}>Off — generate count only</option>
            <option value={2}>2× over-generate, rank to count</option>
            <option value={3}>3× over-generate, rank to count</option>
            <option value={4}>4× over-generate, rank to count</option>
          </select>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Generates count × N prompts, then LLM-picks the best before optional Comfy queue.
          </p>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={scheduledBatch.bestOfNVision ?? false}
            disabled={(scheduledBatch.bestOfN ?? 1) <= 1 || !scheduledBatch.autoQueueComfyUi}
            onChange={event => {
              const next = {
                ...scheduledBatch,
                bestOfNVision: event.target.checked,
              };
              setScheduledBatch(next);
              saveScheduledBatchConfig(next);
            }}
            className="h-4 w-4 rounded"
          />
          Vision-rank queued outputs after Comfy completes (needs LLM_VISION_MODEL)
        </label>
      </ToolSection>
    </>
  );
}
