'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChipButton, SelectInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { DetailLevel } from '@/lib/detail-level';
import { settingsTabHref } from '@/lib/settings-nav';
import {
  LLM_PUBLIC_PROVIDERS,
  filterOpenRouterFreeEntries,
  groupLlmCatalogEntries,
  normalizeSessionLlmProvider,
  type LlmCatalogEntry,
  type SessionLlmProvider,
} from '@/lib/llm-providers';

const DETAIL_OPTIONS: Array<{ id: DetailLevel; label: string; hint: string }> = [
  { id: 'concise', label: 'Concise', hint: 'Short, dense prompts' },
  { id: 'balanced', label: 'Balanced', hint: 'Default length' },
  { id: 'rich', label: 'Rich', hint: 'Longer layered prose' },
];

const CUSTOM_MODEL_VALUE = '__custom__';

type LlmCatalogResponse = {
  ok?: boolean;
  models?: string[];
  entries?: LlmCatalogEntry[];
  error?: string;
  source?: string;
  needsApiKey?: boolean;
};

function catalogEntriesFromPayload(payload: LlmCatalogResponse): LlmCatalogEntry[] {
  if (Array.isArray(payload.entries)) {
    return payload.entries;
  }
  if (!Array.isArray(payload.models)) {
    return [];
  }
  return payload.models
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    .map(id => ({ id, kind: 'text' as const }));
}

async function fetchLlmCatalog(
  provider: SessionLlmProvider,
  apiKey?: string
): Promise<LlmCatalogResponse> {
  const key = apiKey?.trim() ?? '';
  const response =
    provider === 'server'
      ? await fetch('/api/llm/models', { cache: 'no-store' })
      : await fetch('/api/llm/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            provider,
            ...(key ? { apiKey: key } : {}),
          }),
        });
  return (await response.json()) as LlmCatalogResponse;
}

function formatCatalogSource(source: string): string {
  if (source === 'openai') {
    return 'the LLM API';
  }
  if (source === 'ollama') {
    return 'Ollama';
  }
  if (source === 'anthropic') {
    return 'Anthropic';
  }
  if (source === 'openrouter') {
    return 'OpenRouter';
  }
  if (source === 'groq') {
    return 'Groq';
  }
  return source;
}

const TEMP_PRESETS: Array<{ label: string; value: number; hint: string }> = [
  { label: 'Focused', value: 0.4, hint: 'Tighter, more repeatable' },
  { label: 'Default', value: 0.95, hint: 'Matches typical server default' },
  { label: 'Creative', value: 1.35, hint: 'More variation / surprise' },
];

type ServerLlmSnapshot = {
  enabled?: boolean;
  ok?: boolean;
  model?: string;
  baseUrl?: string;
  error?: string;
  visionModel?: string;
  allowTemplateFallback?: boolean;
  serverTemperature?: string;
  embedModel?: string;
  inFlight?: number;
  maxInflight?: number;
  busy?: boolean;
  apiKeyConfigured?: boolean;
  visionModelConfigured?: boolean;
};

type SettingsLlmPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  server?: ServerLlmSnapshot | null;
  autoVisionTags?: boolean;
  onAutoVisionTagsChange?: (value: boolean) => void;
  onTestConnection?: () => void;
  testingConnection?: boolean;
};

function SessionLlmModelSelect({
  label,
  value,
  serverDefault,
  entries,
  loading,
  disabled,
  error,
  emptyLabel,
  onChange,
}: {
  label: string;
  value: string;
  serverDefault?: string;
  entries: LlmCatalogEntry[];
  loading: boolean;
  disabled: boolean;
  error?: string;
  emptyLabel: string;
  onChange: (next: string | undefined) => void;
}) {
  const models = entries.map(entry => entry.id);
  const listed = Boolean(value && models.includes(value));
  const [customOpen, setCustomOpen] = useState(false);
  const grouped = groupLlmCatalogEntries(entries);
  const showDropdown = loading || entries.length > 0;
  const showCustom = !showDropdown || customOpen || Boolean(value && !listed);
  const selectValue = showCustom && showDropdown ? CUSTOM_MODEL_VALUE : listed ? value : '';

  function renderGroup(title: string, items: LlmCatalogEntry[]) {
    if (items.length === 0) {
      return null;
    }
    return (
      <optgroup label={`${title} (${items.length})`}>
        {items.map(entry => (
          <option key={entry.id} value={entry.id}>
            {entry.id}
            {entry.sizeLabel ? ` · ${entry.sizeLabel}` : ''}
            {entry.contextLength ? ` · ${Math.round(entry.contextLength / 1024)}k` : ''}
          </option>
        ))}
      </optgroup>
    );
  }

  return (
    <label className="block space-y-1.5 text-sm">
      <span className="type-caption text-[var(--text-muted)]">{label}</span>
      {showDropdown ? (
        <SelectInput
          value={selectValue}
          disabled={disabled || loading}
          onChange={event => {
            const next = event.target.value;
            if (!next) {
              setCustomOpen(false);
              onChange(undefined);
              return;
            }
            if (next === CUSTOM_MODEL_VALUE) {
              setCustomOpen(true);
              if (listed) {
                onChange(undefined);
              }
              return;
            }
            setCustomOpen(false);
            onChange(next);
          }}
          className={`w-full font-mono text-sm ${accentFocusClass()}`}
        >
          <option value="">{loading ? 'Loading models…' : emptyLabel}</option>
          {renderGroup('Vision', grouped.vision)}
          {renderGroup('Text', grouped.text)}
          {renderGroup('Embeddings', grouped.embed)}
          <option value={CUSTOM_MODEL_VALUE}>Custom…</option>
        </SelectInput>
      ) : null}
      {showCustom ? (
        <input
          type="text"
          value={value}
          disabled={disabled}
          placeholder={
            error
              ? 'Could not list models — type an id'
              : serverDefault
                ? `Server: ${serverDefault}`
                : 'Model id'
          }
          onChange={event => onChange(event.target.value.trim() || undefined)}
          className={`ui-input w-full font-mono text-sm ${accentFocusClass()}`}
        />
      ) : null}
    </label>
  );
}

export default function SettingsLlmPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  server,
  autoVisionTags = true,
  onAutoVisionTagsChange,
  onTestConnection,
  testingConnection = false,
}: SettingsLlmPanelProps) {
  const detail = sharedSettings.detail ?? 'balanced';
  const tempOverride = sharedSettings.sessionLlmTemperature;
  const fallbackOverride = sharedSettings.sessionAllowTemplateFallback;
  const sessionProvider = normalizeSessionLlmProvider(sharedSettings.sessionLlmProvider);
  const hostedPreset = sessionProvider === 'server' ? null : LLM_PUBLIC_PROVIDERS[sessionProvider];
  const [catalogEntries, setCatalogEntries] = useState<LlmCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | undefined>();
  const [catalogSource, setCatalogSource] = useState<string | undefined>();
  const [catalogNeedsKey, setCatalogNeedsKey] = useState(false);
  const [showOpenRouterAll, setShowOpenRouterAll] = useState(false);
  const [llmUsage, setLlmUsage] = useState<{
    last24h: number;
    last24hTokens: number;
    avgDurationMs: number;
    byModel: Record<string, number>;
  } | null>(null);

  const applyCatalogResponse = useCallback((payload: LlmCatalogResponse) => {
    setCatalogEntries(catalogEntriesFromPayload(payload));
    setCatalogSource(payload.source && payload.source !== 'none' ? payload.source : undefined);
    setCatalogNeedsKey(payload.needsApiKey === true);
    setCatalogError(payload.ok === false ? payload.error || 'Could not list models' : undefined);
  }, []);

  const applyCatalogFailure = useCallback((error: unknown) => {
    setCatalogEntries([]);
    setCatalogSource(undefined);
    setCatalogNeedsKey(false);
    setCatalogError(error instanceof Error ? error.message : 'Could not list models');
  }, []);

  const loadCatalog = useCallback(
    async (apiKey?: string) => {
      setCatalogLoading(true);
      try {
        applyCatalogResponse(await fetchLlmCatalog(sessionProvider, apiKey));
      } catch (error) {
        applyCatalogFailure(error);
      } finally {
        setCatalogLoading(false);
      }
    },
    [applyCatalogFailure, applyCatalogResponse, sessionProvider]
  );

  useEffect(() => {
    let cancelled = false;
    fetchLlmCatalog(sessionProvider)
      .then(payload => {
        if (!cancelled) {
          applyCatalogResponse(payload);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          applyCatalogFailure(error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyCatalogFailure, applyCatalogResponse, sessionProvider]);

  useEffect(() => {
    void fetch('/api/auth/llm-usage')
      .then(response => (response.status === 401 ? null : response.ok ? response.json() : null))
      .then(
        (
          data: {
            summary?: {
              last24h: number;
              last24hTokens: number;
              avgDurationMs: number;
              byModel: Record<string, number>;
            };
          } | null
        ) => setLlmUsage(data?.summary ?? null)
      )
      .catch(() => setLlmUsage(null));
  }, []);

  const visibleEntries =
    sessionProvider === 'openrouter' && !showOpenRouterAll
      ? filterOpenRouterFreeEntries(catalogEntries)
      : catalogEntries;
  const selectedIds = [
    sharedSettings.sessionLlmModel,
    sharedSettings.sessionLlmVisionModel,
    sharedSettings.sessionLlmEmbedModel,
  ].filter((id): id is string => Boolean(id?.trim()));
  const catalogForSelect = (() => {
    if (visibleEntries.length === catalogEntries.length) {
      return catalogEntries;
    }
    const extra = catalogEntries.filter(
      entry => selectedIds.includes(entry.id) && !visibleEntries.some(item => item.id === entry.id)
    );
    return extra.length > 0 ? [...visibleEntries, ...extra] : visibleEntries;
  })();
  const sessionKeySet = Boolean(sharedSettings.sessionLlmApiKey?.trim());
  const serverVisionFallback =
    sessionProvider === 'server' && server?.visionModelConfigured === false;
  const hostedVisionMissing =
    sessionProvider !== 'server' && !sharedSettings.sessionLlmVisionModel?.trim();
  const hostedModelMissing =
    sessionProvider !== 'server' && !sharedSettings.sessionLlmModel?.trim();
  const hostedKeyMissing = Boolean(hostedPreset) && !sessionKeySet;

  function setSessionProvider(next: SessionLlmProvider) {
    if (next === sessionProvider) {
      return;
    }
    updateSharedSettings({
      sessionLlmProvider: next === 'server' ? undefined : next,
      sessionLlmModel: undefined,
      sessionLlmVisionModel: undefined,
      sessionLlmEmbedModel: undefined,
    });
    setCatalogLoading(true);
    if (next !== 'openrouter') {
      setShowOpenRouterAll(false);
    }
  }

  const statusLabel =
    server?.enabled === false
      ? 'Disabled'
      : server?.ok
        ? 'Connected'
        : server?.error
          ? `Error · ${server.error}`
          : 'Unknown';

  return (
    <>
      <ToolSection title="Server LLM (read-only)">
        <p className="text-sm text-[var(--text-muted)]">
          Configured via server env (<code className="text-[var(--text-secondary)]">LLM_*</code>).
          Edit <code className="text-[var(--text-secondary)]">.env.local</code> and restart to
          change models. Full catalog lives on{' '}
          <Link
            href={settingsTabHref('overview')}
            className="text-[var(--accent-text)] underline-offset-2 hover:underline"
          >
            Overview → Server environment
          </Link>
          .
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="type-caption text-[var(--text-muted)]">Status</dt>
            <dd className="text-[var(--text-primary)]">{statusLabel}</dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">Text model</dt>
            <dd className="truncate text-[var(--text-primary)]">{server?.model ?? '—'}</dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">Vision model</dt>
            <dd className="truncate text-[var(--text-primary)]">
              {server?.visionModelConfigured === false
                ? `${server?.visionModel ?? '—'} (text fallback)`
                : (server?.visionModel ?? '—')}
            </dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">API key</dt>
            <dd className="text-[var(--text-primary)]">
              {server?.apiKeyConfigured ? 'Configured on server' : 'Not set (LLM_API_KEY)'}
            </dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">API base URL</dt>
            <dd className="truncate text-[var(--text-primary)]">{server?.baseUrl ?? '—'}</dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">Server temperature</dt>
            <dd className="text-[var(--text-primary)]">{server?.serverTemperature ?? '—'}</dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">
              Max concurrent (LLM_MAX_INFLIGHT)
            </dt>
            <dd
              className={
                server?.busy
                  ? 'font-medium text-[var(--tint-warning-text)]'
                  : 'text-[var(--text-primary)]'
              }
            >
              {typeof server?.inFlight === 'number'
                ? `${server.inFlight} in flight / ${server.maxInflight ?? 2} max`
                : typeof server?.maxInflight === 'number'
                  ? `${server.maxInflight} max`
                  : '—'}
            </dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">Server template fallback</dt>
            <dd className="text-[var(--text-primary)]">
              {server?.allowTemplateFallback === undefined
                ? '—'
                : server.allowTemplateFallback
                  ? 'Allowed'
                  : 'Disabled'}
            </dd>
          </div>
          {server?.embedModel ? (
            <div className="sm:col-span-2">
              <dt className="type-caption text-[var(--text-muted)]">Embed model</dt>
              <dd className="truncate text-[var(--text-primary)]">{server.embedModel}</dd>
            </div>
          ) : null}
        </dl>
        {serverVisionFallback ? (
          <p className="type-caption text-[var(--tint-warning-text)]">
            LLM_VISION_MODEL is unset. Image → Prompt still uses the text model above, which will
            fail on vision tools. Set a vision id in .env.local or pick a session vision model.
          </p>
        ) : null}
        {llmUsage ? (
          <p className="type-caption text-[var(--text-muted)]">
            Last 24h: {llmUsage.last24h} call{llmUsage.last24h === 1 ? '' : 's'}
            {llmUsage.last24hTokens > 0 ? ` · ~${llmUsage.last24hTokens} tokens` : ''}
            {llmUsage.avgDurationMs > 0 ? ` · ${llmUsage.avgDurationMs} ms avg` : ''}
            {Object.keys(llmUsage.byModel).length > 0
              ? ` · ${Object.entries(llmUsage.byModel)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([id, count]) => `${id} ×${count}`)
                  .join(', ')}`
              : ''}
          </p>
        ) : null}
        {onTestConnection ? (
          <div className="pt-1">
            <Button
              variant="secondary"
              size="sm"
              loading={testingConnection}
              loadingLabel="Testing LLM connection"
              onClick={() => onTestConnection()}
            >
              Test LLM connection
            </Button>
          </div>
        ) : null}
      </ToolSection>

      <ToolSection title="Session LLM preferences">
        <p className="text-sm text-[var(--text-muted)]">
          Browser overrides sent with generation requests. OpenRouter and Groq use your own key — no
          local Ollama/LM Studio required. Leave provider on Local server to use env defaults.
          {catalogSource ? ` Model list from ${formatCatalogSource(catalogSource)}.` : ''}
        </p>

        <fieldset className="space-y-2">
          <legend className="type-caption text-[var(--text-muted)]">
            Provider for this browser
          </legend>
          <div className="flex flex-wrap gap-1.5">
            <ChipButton
              active={sessionProvider === 'server'}
              disabled={!sharedMounted}
              onClick={() => setSessionProvider('server')}
            >
              Local server
            </ChipButton>
            {(Object.keys(LLM_PUBLIC_PROVIDERS) as Array<keyof typeof LLM_PUBLIC_PROVIDERS>).map(
              id => (
                <ChipButton
                  key={id}
                  active={sessionProvider === id}
                  disabled={!sharedMounted}
                  onClick={() => setSessionProvider(id)}
                >
                  {LLM_PUBLIC_PROVIDERS[id].label}
                </ChipButton>
              )
            )}
          </div>
          {hostedPreset ? (
            <p className="type-caption text-[var(--text-muted)]">{hostedPreset.hint}</p>
          ) : (
            <p className="type-caption text-[var(--text-muted)]">
              Uses LLM_API_BASE_URL from the server (Ollama, LM Studio, or another OpenAI-compatible
              host).
            </p>
          )}
        </fieldset>

        {hostedPreset ? (
          <label className="block space-y-1.5 text-sm">
            <span className="type-caption text-[var(--text-muted)]">
              {hostedPreset.label} API key
            </span>
            <input
              type="password"
              autoComplete="off"
              value={sharedSettings.sessionLlmApiKey ?? ''}
              disabled={!sharedMounted}
              placeholder={`Paste ${hostedPreset.label} key`}
              onChange={event =>
                updateSharedSettings({
                  sessionLlmApiKey: event.target.value || undefined,
                })
              }
              className={`ui-input w-full font-mono text-sm ${accentFocusClass()}`}
            />
            <p className="type-caption text-[var(--text-muted)]">
              Stored in this browser&apos;s settings. Chat needs a key
              {hostedPreset.listWithoutKey ? '; the model list can load without one' : ''}.{' '}
              <a
                href={hostedPreset.keysUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent-text)] underline-offset-2 hover:underline"
              >
                Get a key
              </a>
              . Click Reload after pasting.
            </p>
            {hostedKeyMissing ? (
              <p className="type-caption text-[var(--tint-warning-text)]">
                Paste an API key or generation will fail against {hostedPreset.label}.
              </p>
            ) : null}
          </label>
        ) : null}

        {hostedModelMissing ? (
          <p className="type-caption text-[var(--tint-warning-text)]">
            Pick a text model below. Local server default ids will 404 on{' '}
            {hostedPreset?.label ?? 'this provider'}.
          </p>
        ) : null}
        {hostedVisionMissing ? (
          <p className="type-caption text-[var(--tint-warning-text)]">
            Image → Prompt needs a vision model selected for this hosted provider.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={catalogLoading}
            loadingLabel="Loading models"
            disabled={!sharedMounted}
            onClick={() => void loadCatalog(sharedSettings.sessionLlmApiKey)}
          >
            Reload model list
          </Button>
          {sessionProvider === 'openrouter' && catalogEntries.length > 0 ? (
            <ChipButton
              active={!showOpenRouterAll}
              disabled={!sharedMounted}
              onClick={() => setShowOpenRouterAll(current => !current)}
            >
              Free models only
            </ChipButton>
          ) : null}
          {catalogError ? (
            <p className="type-caption text-[var(--tint-warning-text)]">
              {catalogError}
              {catalogNeedsKey ? ' Paste a key, then Reload.' : ''}
            </p>
          ) : catalogForSelect.length > 0 ? (
            <p className="type-caption text-[var(--text-muted)]">
              {catalogForSelect.length} model{catalogForSelect.length === 1 ? '' : 's'}
              {sessionProvider === 'openrouter' && !showOpenRouterAll ? ' (free)' : ''} available
            </p>
          ) : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="type-caption text-[var(--text-muted)]">
            LLM path for this browser
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { value: undefined, label: 'Server default' },
                { value: true, label: 'Force LLM on' },
                { value: false, label: 'Template only' },
              ] as const
            ).map(option => (
              <ChipButton
                key={String(option.value)}
                active={sharedSettings.sessionLlmEnabled === option.value}
                disabled={!sharedMounted}
                onClick={() => updateSharedSettings({ sessionLlmEnabled: option.value })}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            Template only skips the LLM for this browser even when the server has it enabled —
            useful offline or when Ollama is down.
          </p>
        </fieldset>

        <SessionLlmModelSelect
          label="Session text model override"
          value={sharedSettings.sessionLlmModel ?? ''}
          serverDefault={sessionProvider === 'server' ? server?.model : undefined}
          entries={catalogForSelect}
          loading={catalogLoading}
          disabled={!sharedMounted}
          error={catalogError}
          emptyLabel={
            sessionProvider === 'server'
              ? server?.model
                ? `Server default (${server.model})`
                : 'Server default'
              : 'Select a model'
          }
          onChange={sessionLlmModel => updateSharedSettings({ sessionLlmModel })}
        />

        <SessionLlmModelSelect
          label="Session vision model override"
          value={sharedSettings.sessionLlmVisionModel ?? ''}
          serverDefault={sessionProvider === 'server' ? server?.visionModel : undefined}
          entries={catalogForSelect}
          loading={catalogLoading}
          disabled={!sharedMounted}
          error={catalogError}
          emptyLabel={
            sessionProvider === 'server'
              ? server?.visionModel
                ? `Server default (${server.visionModel})`
                : 'Server default'
              : 'Select a vision model'
          }
          onChange={sessionLlmVisionModel => updateSharedSettings({ sessionLlmVisionModel })}
        />

        <SessionLlmModelSelect
          label="Session embed model override"
          value={sharedSettings.sessionLlmEmbedModel ?? ''}
          serverDefault={sessionProvider === 'server' ? server?.embedModel : undefined}
          entries={catalogForSelect}
          loading={catalogLoading}
          disabled={!sharedMounted}
          error={catalogError}
          emptyLabel={
            sessionProvider === 'server'
              ? server?.embedModel
                ? `Server default (${server.embedModel})`
                : 'Server default'
              : 'Select an embed model (optional)'
          }
          onChange={sessionLlmEmbedModel => updateSharedSettings({ sessionLlmEmbedModel })}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>LLM temperature</span>
            <span className="font-medium text-[var(--text-primary)]">
              {typeof tempOverride === 'number' ? tempOverride.toFixed(2) : 'server default'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TEMP_PRESETS.map(preset => (
              <ChipButton
                key={preset.label}
                active={
                  typeof tempOverride === 'number' && Math.abs(tempOverride - preset.value) < 0.001
                }
                disabled={!sharedMounted}
                title={preset.hint}
                onClick={() => updateSharedSettings({ sessionLlmTemperature: preset.value })}
              >
                {preset.label}
              </ChipButton>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={tempOverride ?? 1}
            onChange={event =>
              updateSharedSettings({
                sessionLlmTemperature: Number(event.target.value),
              })
            }
            disabled={!sharedMounted}
            className="h-2 w-full accent-[var(--accent)]"
          />
          <div className="flex justify-between text-xs text-[var(--text-muted)]">
            <span>0 · focused</span>
            <span>1</span>
            <span>2 · wild</span>
          </div>
          {typeof tempOverride === 'number' ? (
            <button
              type="button"
              disabled={!sharedMounted}
              onClick={() => updateSharedSettings({ sessionLlmTemperature: undefined })}
              className="text-xs text-[var(--accent-text)] hover:underline disabled:opacity-50"
            >
              Reset temperature to server default
            </button>
          ) : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="type-caption text-[var(--text-muted)]">
            Template fallback when LLM fails
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { value: undefined, label: 'Server default' },
                { value: true, label: 'Force allow' },
                { value: false, label: 'Force disable' },
              ] as const
            ).map(option => (
              <ChipButton
                key={String(option.value)}
                active={fallbackOverride === option.value}
                disabled={!sharedMounted}
                onClick={() =>
                  updateSharedSettings({
                    sessionAllowTemplateFallback: option.value,
                  })
                }
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            Generators may use template output if the LLM errors or times out.
          </p>
        </fieldset>

        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Default prompt detail</p>
          <div className="flex flex-wrap gap-1.5">
            {DETAIL_OPTIONS.map(option => (
              <ChipButton
                key={option.id}
                active={detail === option.id}
                disabled={!sharedMounted}
                onClick={() => updateSharedSettings({ detail: option.id })}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            {DETAIL_OPTIONS.find(entry => entry.id === detail)?.hint}. Also available under ComfyUI
            → Prompt quality.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={sharedSettings.autoFixRules !== false}
            disabled={!sharedMounted}
            onChange={event => updateSharedSettings({ autoFixRules: event.target.checked })}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block font-medium text-[var(--text-primary)]">
              Auto-fix lint rule errors after generation
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Applies safe prompt-lint fixes (e.g. sport gear / duo consistency) when diagnostics
              report errors.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={sharedSettings.seedLlmWithIngredients !== false}
            disabled={!sharedMounted}
            onChange={event =>
              updateSharedSettings({
                seedLlmWithIngredients: event.target.checked,
              })
            }
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block font-medium text-[var(--text-primary)]">
              Seed LLM with location & wardrobe ingredients
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              When on, generators inject rolled location / outfit / environment seeds and few-shot
              examples. Turn off for completionist local models — only your keywords or hints are
              sent.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={sharedSettings.alwaysIncludeClothing !== false}
            disabled={!sharedMounted || sharedSettings.seedLlmWithIngredients === false}
            onChange={event =>
              updateSharedSettings({ alwaysIncludeClothing: event.target.checked })
            }
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block font-medium text-[var(--text-primary)]">
              Always include clothing / wardrobe in people prompts
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Generators inject wardrobe beats even when hints omit outfit details. Requires
              ingredient seeding above.
            </span>
          </span>
        </label>
      </ToolSection>

      <ToolSection title="Vision LLM">
        <p className="text-sm text-[var(--text-muted)]">
          For the local server, set{' '}
          <code className="text-[var(--text-secondary)]">LLM_VISION_MODEL</code> in{' '}
          <code className="text-[var(--text-secondary)]">.env.local</code> (e.g.{' '}
          <code className="text-[var(--text-secondary)]">qwen3-vl:latest</code>). Hosted OpenRouter
          / Groq sessions need a vision model picked above — they do not use the server env id.
          Falls back to <code className="text-[var(--text-secondary)]">LLM_MODEL</code> when the env
          vision id is unset — text-only models will fail Image → Prompt, Refine critique, and
          gallery tagging. Restart the server after changing env.
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={autoVisionTags !== false}
            disabled={!onAutoVisionTagsChange}
            onChange={event => onAutoVisionTagsChange?.(event.target.checked)}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block font-medium text-[var(--text-primary)]">
              Auto-tag completed gallery images
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              After ComfyUI jobs finish or you upload stills, run a light vision pass for searchable
              tags. Uploads with only a filename as the prompt also get a caption. Requires a
              vision-capable model.
            </span>
          </span>
        </label>
      </ToolSection>
    </>
  );
}
