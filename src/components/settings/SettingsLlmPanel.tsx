'use client';

import Link from 'next/link';
import { ChipButton } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { DetailLevel } from '@/lib/detail-level';
import { settingsTabHref } from '@/lib/settings-nav';

const DETAIL_OPTIONS: Array<{ id: DetailLevel; label: string; hint: string }> = [
  { id: 'concise', label: 'Concise', hint: 'Short, dense prompts' },
  { id: 'balanced', label: 'Balanced', hint: 'Default length' },
  { id: 'rich', label: 'Rich', hint: 'Longer layered prose' },
];

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
            <dd className="truncate text-[var(--text-primary)]">{server?.visionModel ?? '—'}</dd>
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
            <dt className="type-caption text-[var(--text-muted)]">LLM concurrency</dt>
            <dd
              className={server?.busy ? 'font-medium text-amber-400' : 'text-[var(--text-primary)]'}
            >
              {typeof server?.inFlight === 'number'
                ? `LLM busy: ${server.inFlight}/${server.maxInflight ?? '?'} in flight`
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
          Browser overrides sent with generation requests. Leave unset to use server defaults.
        </p>

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

        <label className="block space-y-1.5 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Session text model override</span>
          <input
            type="text"
            value={sharedSettings.sessionLlmModel ?? ''}
            disabled={!sharedMounted}
            placeholder={server?.model ? `Server: ${server.model}` : 'e.g. dolphin-llama3'}
            onChange={event =>
              updateSharedSettings({
                sessionLlmModel: event.target.value.trim() || undefined,
              })
            }
            className={`ui-input w-full font-mono text-sm ${accentFocusClass()}`}
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="type-caption text-[var(--text-muted)]">
            Session vision model override
          </span>
          <input
            type="text"
            value={sharedSettings.sessionLlmVisionModel ?? ''}
            disabled={!sharedMounted}
            placeholder={
              server?.visionModel ? `Server: ${server.visionModel}` : 'e.g. qwen3-vl:latest'
            }
            onChange={event =>
              updateSharedSettings({
                sessionLlmVisionModel: event.target.value.trim() || undefined,
              })
            }
            className={`ui-input w-full font-mono text-sm ${accentFocusClass()}`}
          />
        </label>

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
          Set <code className="text-[var(--text-secondary)]">LLM_VISION_MODEL</code> in{' '}
          <code className="text-[var(--text-secondary)]">.env.local</code> (e.g.{' '}
          <code className="text-[var(--text-secondary)]">qwen3-vl:latest</code>) for Image → Prompt,
          Refine critique, and optional gallery tagging. Falls back to{' '}
          <code className="text-[var(--text-secondary)]">LLM_MODEL</code> when unset — text-only
          models will fail vision tools. Restart the server after changing env.
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
              After ComfyUI jobs finish, run a light vision pass for searchable tags. Requires a
              vision-capable model.
            </span>
          </span>
        </label>
      </ToolSection>
    </>
  );
}
