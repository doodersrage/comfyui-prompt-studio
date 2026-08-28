'use client';

import dynamic from 'next/dynamic';
import type { ComfyUiSettings } from '@/lib/comfyui-settings';
import type { SharedToolSettings } from '@/lib/settings-cache';
import {
  validateWorkflowJson,
  WORKFLOW_PARAM_TOKEN_HELP,
  type CustomWorkflowToken,
} from '@/lib/comfyui-config';
import { placeholderTokensFromSettings } from '@/lib/comfyui-settings';
import { DEFAULT_NEGATIVE_PROFILES, type NegativeProfile } from '@/lib/negative-profiles';
import { restartComfyUi } from '@/lib/comfyui-queue-control';
import { fetchWorkflowPreview } from '@/lib/comfyui-requeue';
import { isDesktopShellClient } from '@/lib/desktop-shell';
import type { ComfyUiSettingsSectionId } from '@/lib/settings-comfyui-nav';
import DiffusersWorkflowSupportHint from '@/components/DiffusersWorkflowSupportHint';
import ComfyClusterSettingsPanel from '@/components/settings/ComfyClusterSettingsPanel';
import QueueExportSettingsPanel from '@/components/settings/QueueExportSettingsPanel';
import SettingsConnectionFirstRun from '@/components/settings/SettingsConnectionFirstRun';
import {
  SETTINGS_TOOL_ACCENT,
  serverEnvFieldValue,
  type HealthResponse,
} from '@/components/settings/tabs/settings-tool-shared';
import {
  CollapsibleSection,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { FieldError, TextArea } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';

const ComfyWorkflowLibraryPanel = dynamic(() => import('@/components/ComfyWorkflowLibraryPanel'), {
  loading: () => null,
});
const WorkflowPreviewPanel = dynamic(() => import('@/components/WorkflowPreviewPanel'), {
  loading: () => null,
});
const WorkflowHealthPanel = dynamic(() => import('@/components/WorkflowHealthPanel'), {
  loading: () => null,
});
const WorkflowDiffPanel = dynamic(() => import('@/components/settings/WorkflowDiffPanel'), {
  loading: () => null,
});
const QueueParamsPanel = dynamic(() => import('@/components/QueueParamsPanel'), {
  loading: () => null,
});

const ACCENT = SETTINGS_TOOL_ACCENT;

export type SettingsComfyConnectionPanelProps = {
  slimSettings?: boolean;
  showAdvanced: boolean;
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  mounted: boolean;
  settings: ComfyUiSettings;
  updateSettings: (patch: Partial<ComfyUiSettings>) => void;
  workflowError: string | null;
  setWorkflowError: (value: string | null) => void;
  workflowValidation: ReturnType<typeof validateWorkflowJson> | null;
  previewPrompt: string;
  setPreviewPrompt: (value: string) => void;
  previewLoading: boolean;
  previewError: string | null;
  workflowPreview: Awaited<ReturnType<typeof fetchWorkflowPreview>> | null;
  handlePreviewWorkflow: () => void | Promise<void>;
  handleImportWorkflow: (file: File) => void | Promise<void>;
  notificationPermission: NotificationPermission | 'unsupported';
  handleEnableNotifications: () => void | Promise<void>;
  handleSaveComfySettings: () => void;
  handleResetComfySettings: () => void;
  refreshHealth: () => void | Promise<void>;
  health: HealthResponse | null;
  healBusy?: boolean;
  healProgress?: string | null;
  handleHealAndReady?: () => void | Promise<void>;
  workflowHealthRefresh: number;
  setWorkflowHealthRefresh: (value: number | ((previous: number) => number)) => void;
  setStatus: (status: string | null) => void;
  updateQueueParam: (key: 'seed' | 'width' | 'height' | 'cfg' | 'steps', value: string) => void;
  updateCustomToken: (index: number, patch: Partial<CustomWorkflowToken>) => void;
  addCustomToken: () => void;
  removeCustomToken: (index: number) => void;
  handleComfyUiSectionJump: (section: ComfyUiSettingsSectionId) => void;
};

export default function SettingsComfyConnectionPanel(props: SettingsComfyConnectionPanelProps) {
  const {
    slimSettings = false,
    showAdvanced,
    sharedSettings,
    sharedMounted,
    updateSharedSettings,
    mounted,
    settings,
    updateSettings,
    workflowError,
    setWorkflowError,
    workflowValidation,
    previewPrompt,
    setPreviewPrompt,
    previewLoading,
    previewError,
    workflowPreview,
    handlePreviewWorkflow,
    handleImportWorkflow,
    notificationPermission,
    handleEnableNotifications,
    handleSaveComfySettings,
    handleResetComfySettings,
    refreshHealth,
    health,
    healBusy = false,
    healProgress = null,
    handleHealAndReady,
    workflowHealthRefresh,
    setWorkflowHealthRefresh,
    setStatus,
    updateQueueParam,
    updateCustomToken,
    addCustomToken,
    removeCustomToken,
    handleComfyUiSectionJump,
  } = props;

  return (
    <ToolSection id="settings-comfyui-connection" title="ComfyUI connection & injection">
      {handleHealAndReady ? (
        <SettingsConnectionFirstRun
          health={health}
          systemWorkflowsEnabled={sharedSettings.useSystemWorkflows === true}
          healBusy={healBusy}
          healProgress={healProgress}
          onHealAndReady={handleHealAndReady}
        />
      ) : null}
      {isDesktopShellClient() ||
      serverEnvFieldValue(health?.serverEnv, 'PROMPT_DESKTOP') === 'true' ? (
        <div className="mb-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">Desktop app</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
            ComfyUI is not bundled. Leave <strong>Use server defaults</strong> on if ComfyUI is at{' '}
            <code className="ui-inline-code">http://127.0.0.1:8188</code>, or uncheck it and set the
            API URL below. Gallery, settings, and <code className="ui-inline-code">server.log</code>{' '}
            live in{' '}
            <code className="ui-inline-code">
              {serverEnvFieldValue(health?.serverEnv, 'PROMPT_DATA_DIR') || 'the app data folder'}
            </code>
            .
          </p>
        </div>
      ) : null}
      <p className="text-sm text-[var(--text-secondary)]">
        Override the server&apos;s <code className="ui-inline-code">COMFYUI_*</code> env vars for
        this browser: API URL, placeholder tokens, queue params, and an optional fallback workflow
        when no library file is selected.
      </p>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.useServerDefaults}
          onChange={event => updateSettings({ useServerDefaults: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Use server defaults (ignore local ComfyUI overrides)
      </label>

      <div
        className={`grid gap-4 ${settings.useServerDefaults ? 'pointer-events-none opacity-50' : ''}`}
      >
        <div className="space-y-1">
          <label htmlFor="comfy-url" className="text-xs text-[var(--text-secondary)]">
            ComfyUI API URL
          </label>
          <input
            id="comfy-url"
            value={settings.apiUrl ?? ''}
            onChange={event => updateSettings({ apiUrl: event.target.value })}
            placeholder="http://127.0.0.1:8188"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </div>

        <ComfyClusterSettingsPanel
          sharedSettings={sharedSettings}
          sharedMounted={sharedMounted}
          updateSharedSettings={updateSharedSettings}
          health={health}
          onRefreshHealth={refreshHealth}
        />
        <div className="space-y-1">
          <label htmlFor="positive-token" className="text-xs text-[var(--text-secondary)]">
            Positive placeholder token
          </label>
          <input
            id="positive-token"
            value={settings.positiveToken ?? ''}
            onChange={event => updateSettings({ positiveToken: event.target.value })}
            placeholder="{{POSITIVE}}"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="negative-token" className="text-xs text-[var(--text-secondary)]">
            Negative placeholder token (optional)
          </label>
          <input
            id="negative-token"
            value={settings.negativeToken ?? ''}
            onChange={event => updateSettings({ negativeToken: event.target.value })}
            placeholder="{{NEGATIVE}}"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">Queue parameter placeholders</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ['seed', 'Seed (empty = random per job)'],
                ['width', 'Width'],
                ['height', 'Height'],
                ['cfg', 'CFG'],
                ['steps', 'Steps'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs text-[var(--text-secondary)]">
                {label}
                <input
                  value={settings.queueParams?.[key]?.toString() ?? ''}
                  onChange={event => updateQueueParam(key, event.target.value)}
                  placeholder={
                    key === 'seed'
                      ? 'random'
                      : key === 'width' || key === 'height'
                        ? '1024'
                        : key === 'cfg'
                          ? '7'
                          : '20'
                  }
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Use tokens in workflow JSON:{' '}
            {WORKFLOW_PARAM_TOKEN_HELP.map(token => (
              <code key={token} className="mr-1 ui-inline-code">
                {token}
              </code>
            ))}
          </p>
        </div>

        <CollapsibleSection
          title="Custom tokens"
          summary="Named {{TOKEN}} placeholders for workflow injection."
          defaultOpen={false}
          persistKey="settings-custom-tokens-lora"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--text-secondary)]">Custom workflow tokens</p>
              <button type="button" onClick={addCustomToken} className="type-caption ui-text-link">
                Add token
              </button>
            </div>
            {(settings.customTokens ?? []).length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Optional placeholders like{' '}
                <code className="ui-inline-code">{'{{CHECKPOINT}}'}</code> or{' '}
                <code className="ui-inline-code">{'{{LORA}}'}</code>. LoRA files live in the{' '}
                <button
                  type="button"
                  onClick={() => handleComfyUiSectionJump('lora-library')}
                  className="ui-text-link"
                >
                  LoRA library
                </button>{' '}
                section.
              </p>
            ) : (
              <ul className="space-y-2">
                {(settings.customTokens ?? []).map((entry, index) => (
                  <li
                    key={`${entry.token}-${index}`}
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input
                      value={entry.token}
                      onChange={event => updateCustomToken(index, { token: event.target.value })}
                      placeholder="{{CHECKPOINT}}"
                      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
                    />
                    <input
                      value={entry.value}
                      onChange={event => updateCustomToken(index, { value: event.target.value })}
                      placeholder="flux1-dev.safetensors"
                      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => removeCustomToken(index)}
                      className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:border-[var(--tint-danger-border)] hover:text-[var(--tint-danger-text)]"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Fallback workflow & preview"
          summary="Optional JSON fallback and dry-run injection preview."
          defaultOpen={false}
          persistKey="settings-fallback-workflow"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="workflow-json" className="text-xs text-[var(--text-secondary)]">
                Fallback workflow JSON (optional)
              </label>
              <label className="cursor-pointer type-caption ui-text-link">
                Import into editor
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleImportWorkflow(file);
                    }
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Used only when no workflow file is selected in the library above. For multiple
              workflows, import them into the library instead.
            </p>
            <textarea
              id="workflow-json"
              value={settings.workflowJson ?? ''}
              onChange={event => {
                updateSettings({ workflowJson: event.target.value });
                setWorkflowError(null);
              }}
              rows={12}
              spellCheck={false}
              placeholder={`Paste exported ComfyUI API JSON here.\nUse ${settings.positiveToken ?? '{{POSITIVE}}'} and ${settings.negativeToken ?? '{{NEGATIVE}}'} anywhere prompts should be injected.`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            {sharedSettings.inferenceEngine === 'diffusers' ? (
              <DiffusersWorkflowSupportHint workflowJson={settings.workflowJson} className="mt-2" />
            ) : null}
            <FieldError>{workflowError}</FieldError>
            {workflowValidation && (
              <p className="text-xs text-[var(--text-muted)]">
                {workflowValidation.ok ? (
                  <>
                    Placeholders: {workflowValidation.placeholders?.positive ?? 0}×{' '}
                    {settings.positiveToken}
                    {(workflowValidation.placeholders?.negative ?? 0) > 0
                      ? ` · ${workflowValidation.placeholders?.negative}× ${settings.negativeToken}`
                      : ''}
                    {workflowValidation.nodeIds?.length
                      ? ` · nodes: ${workflowValidation.nodeIds.join(', ')}`
                      : ''}
                  </>
                ) : (
                  <span className="text-[var(--tint-warning-text)]">
                    {workflowValidation.error}
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="ui-recipe-shell space-y-3">
            <div className="space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--accent-text)]">
                Workflow dry-run preview
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Test placeholder injection without queueing a ComfyUI job. Uses the current settings
                above (save first if you changed them recently).
              </p>
            </div>
            <TextArea
              value={previewPrompt}
              onChange={event => setPreviewPrompt(event.target.value)}
              rows={3}
              className={accentFocusClass(ACCENT)}
            />
            <button
              type="button"
              disabled={previewLoading || !previewPrompt.trim()}
              onClick={() => void handlePreviewWorkflow()}
              className="rounded-lg border border-[var(--accent-border)] px-4 py-2 text-sm text-[var(--accent-text)] hover:border-[var(--accent)] disabled:opacity-50"
            >
              {previewLoading ? 'Previewing…' : 'Preview injection'}
            </button>
            <WorkflowPreviewPanel
              loading={previewLoading}
              error={previewError}
              preview={workflowPreview}
            />
          </div>
        </CollapsibleSection>
      </div>

      <QueueExportSettingsPanel />

      {showAdvanced ? (
        <>
          <ToolSection id="settings-comfyui-auto-improve" title="Auto-improve on gallery ratings">
            <p className="text-sm text-[var(--text-secondary)]">
              Rating-driven queue actions. Prefer the calm preset if you do not want surprise Max
              jobs.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  updateSettings({
                    autoRequeueFinalOnHighRating: true,
                    autoRequeueMaxOnFiveStar: false,
                    autoImg2imgRefineOnFiveStar: false,
                    autoMutateOnHighRating: false,
                    autoSeedExperimentOnHighRating: false,
                    autoRefineOnLowRating: true,
                  });
                  setStatus('Auto-improve preset: calm (Final on 4–5★, Max off).');
                }}
              >
                Calm preset
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  updateSettings({
                    autoRequeueFinalOnHighRating: true,
                    autoRequeueMaxOnFiveStar: true,
                    autoImg2imgRefineOnFiveStar: false,
                    autoMutateOnHighRating: false,
                    autoSeedExperimentOnHighRating: false,
                    autoRefineOnLowRating: true,
                  });
                  setStatus('Auto-improve preset: aggressive (Final + Max).');
                }}
              >
                Aggressive preset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  updateSettings({
                    autoRequeueFinalOnHighRating: false,
                    autoRequeueMaxOnFiveStar: false,
                    autoImg2imgRefineOnFiveStar: false,
                    autoMutateOnHighRating: false,
                    autoSeedExperimentOnHighRating: false,
                    autoRefineOnLowRating: false,
                  });
                  setStatus('Auto-improve disabled.');
                }}
              >
                Off
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.autoRequeueFinalOnHighRating !== false}
                onChange={event =>
                  updateSettings({ autoRequeueFinalOnHighRating: event.target.checked })
                }
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Auto improve 4–5★ → Final (upscale / moiré / Lightning re-seed)
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.autoRequeueMaxOnFiveStar !== false}
                onChange={event =>
                  updateSettings({ autoRequeueMaxOnFiveStar: event.target.checked })
                }
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Auto improve 5★ → Max
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.autoImg2imgRefineOnFiveStar === true}
                onChange={event =>
                  updateSettings({ autoImg2imgRefineOnFiveStar: event.target.checked })
                }
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              After 5★ upscale, also queue low-denoise refine (experimental)
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.autoRefineOnLowRating !== false}
                onChange={event => updateSettings({ autoRefineOnLowRating: event.target.checked })}
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Auto-open Refine when rated 1–2★
            </label>
          </ToolSection>

          <CollapsibleSection
            title="Queue automation & notifications"
            summary="Auto-save, mutate/seed fallbacks, WebSocket progress, and browser alerts."
            defaultOpen={false}
            persistKey="settings-queue-automation"
          >
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.autoSaveHistoryOnQueue !== false}
                onChange={event => updateSettings({ autoSaveHistoryOnQueue: event.target.checked })}
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Auto-save to history when queueing from result panels (skips if already saved)
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={sharedSettings.promptVersioningEnabled !== false}
                onChange={event =>
                  updateSharedSettings({
                    promptVersioningEnabled: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Named prompt versions (vN labels + lineage on history saves)
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.autoMutateOnHighRating ?? false}
                onChange={event => updateSettings({ autoMutateOnHighRating: event.target.checked })}
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Auto-queue mutations when a gallery output is rated 4–5★ (fallback when Final/Max
              improve is off or fails)
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.autoSeedExperimentOnHighRating ?? false}
                onChange={event =>
                  updateSettings({ autoSeedExperimentOnHighRating: event.target.checked })
                }
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Auto-queue seed experiments when a gallery output is rated 4–5★
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.autoSeedExperimentOnFavorite ?? false}
                onChange={event =>
                  updateSettings({ autoSeedExperimentOnFavorite: event.target.checked })
                }
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Auto-queue seed experiments when an output is favorited
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.autoNegativeOnQueue !== false}
                onChange={event => updateSettings({ autoNegativeOnQueue: event.target.checked })}
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Auto-generate negative prompt when queueing SD-family models
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.useWebSocketProgress !== false}
                onChange={event => updateSettings({ useWebSocketProgress: event.target.checked })}
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Use ComfyUI WebSocket for faster job progress updates
            </label>

            <div className="ui-surface-inset space-y-2">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Negative profile library
              </p>
              <select
                value={settings.selectedNegativeProfileId ?? 'general-sd'}
                onChange={event =>
                  updateSettings({ selectedNegativeProfileId: event.target.value })
                }
                className="ui-input w-full px-3 py-2 text-sm"
              >
                {(settings.negativeProfiles?.length
                  ? settings.negativeProfiles
                  : DEFAULT_NEGATIVE_PROFILES
                ).map((profile: NegativeProfile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  updateSettings({
                    negativeProfiles: DEFAULT_NEGATIVE_PROFILES,
                  })
                }
                className="type-caption ui-text-link"
              >
                Reset profiles to defaults
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.notifyOnComplete ?? false}
                disabled={notificationPermission === 'unsupported'}
                onChange={event => updateSettings({ notifyOnComplete: event.target.checked })}
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Notify when ComfyUI jobs complete
              {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={() => void handleEnableNotifications()}
                  className="type-caption ui-text-link"
                >
                  Enable permission
                </button>
              )}
            </label>
            {notificationPermission === 'unsupported' && (
              <p className="text-xs text-[var(--text-muted)]">
                Browser notifications are not supported in this environment.
              </p>
            )}

            <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.autoVisionTags !== false}
                onChange={event => updateSettings({ autoVisionTags: event.target.checked })}
                className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
              />
              Auto-tag completed and uploaded gallery images with vision LLM tags (also on LLM tab)
            </label>
          </CollapsibleSection>
        </>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm">
        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          disabled={!mounted}
          onClick={handleSaveComfySettings}
        >
          Save ComfyUI settings
        </PrimaryButton>
        <button
          type="button"
          onClick={() => void refreshHealth()}
          className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-primary)] hover:border-[var(--border-strong)]"
        >
          Test connection
        </button>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              setStatus('Sending ComfyUI restart…');
              const result = await restartComfyUi(settings.apiUrl?.trim() || undefined);
              if (!result.ok) {
                setStatus(result.error ?? 'ComfyUI restart failed.');
                return;
              }
              setStatus('ComfyUI restart requested. Wait a few seconds, then Test connection.');
            })();
          }}
          className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-primary)] hover:border-[var(--border-strong)]"
        >
          Restart ComfyUI
        </button>
        <button
          type="button"
          onClick={handleResetComfySettings}
          className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          Reset to server defaults
        </button>
      </div>
    </ToolSection>
  );
}
