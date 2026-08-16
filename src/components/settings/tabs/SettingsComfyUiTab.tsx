'use client';

import { Fragment, useState } from 'react';
import dynamic from 'next/dynamic';
import ComfyUiSettingsJumpNav from '@/components/settings/ComfyUiSettingsJumpNav';
import SettingsBrowserPresetsPanel from '@/components/settings/SettingsBrowserPresetsPanel';
import CompactDraftSavesStatus from '@/components/settings/CompactDraftSavesStatus';
import ToolQualityProfilesSettings from '@/components/settings/ToolQualityProfilesSettings';
import FaceDetailerHealthChip from '@/components/settings/FaceDetailerHealthChip';
import IdentityPackHealthChips from '@/components/settings/IdentityPackHealthChips';
import WildcardListsEditor from '@/components/settings/WildcardListsEditor';
import WorkflowHealthPanel from '@/components/WorkflowHealthPanel';
import WorkflowDiffPanel from '@/components/settings/WorkflowDiffPanel';
import LoraLibrarySettingsPanel from '@/components/settings/LoraLibrarySettingsPanel';
import LoraTrainPanel from '@/components/settings/LoraTrainPanel';
import QueueParamsPanel from '@/components/QueueParamsPanel';
import WorkflowPreviewPanel from '@/components/WorkflowPreviewPanel';
import DiffusersWorkflowSupportHint from '@/components/DiffusersWorkflowSupportHint';
import SettingsPromptQualityPanel from '@/components/settings/SettingsPromptQualityPanel';
import ComfyModelAssetsPanel from '@/components/settings/ComfyModelAssetsPanel';
import ComfyClusterSettingsPanel from '@/components/settings/ComfyClusterSettingsPanel';
import QueueExportSettingsPanel from '@/components/settings/QueueExportSettingsPanel';
import {
  validateWorkflowJson,
  WORKFLOW_PARAM_TOKEN_HELP,
  type CustomWorkflowToken,
} from '@/lib/comfyui-config';
import { placeholderTokensFromSettings } from '@/lib/comfyui-settings';
import type { ComfyUiSettings } from '@/lib/comfyui-settings';
import { DEFAULT_NEGATIVE_PROFILES, type NegativeProfile } from '@/lib/negative-profiles';
import {
  formatModelCheckpointMap,
  parseModelCheckpointMap,
  formatModelVaeMap,
  parseModelVaeMap,
  parseModelRefinerMap,
} from '@/lib/model-checkpoint-map';
import { formatModelUpscaleMap, parseModelUpscaleMap } from '@/lib/model-upscale-map';
import { parseModelControlNetMap } from '@/lib/model-controlnet-map';
import { parseModelLoraMap } from '@/lib/model-lora-map';
import { uploadComfyInputImage } from '@/lib/comfyui-image-upload';
import {
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
} from '@/lib/ipadapter-workflow-patch';
import { loadComfyWorkflowFiles } from '@/lib/comfyui-workflow-files';
import {
  countMappedModels,
  mergeModelWorkflowMap,
  suggestWorkflowDefaultsByCategory,
} from '@/lib/workflow-category-defaults';
import { loadSettingsCache, setUseSystemWorkflowsPref } from '@/lib/settings-cache';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { markOnboardingSystemWorkflowsEnabled } from '@/lib/onboarding-hooks';
import { fetchWorkflowPreview } from '@/lib/comfyui-requeue';
import type { ComfyUiSettingsSectionId } from '@/lib/settings-comfyui-nav';
import { CLOUD_ENGINE_OPTIONS, normalizeEngineId, parseEngineId } from '@/lib/engine/capabilities';
import {
  SETTINGS_TOOL_ACCENT,
  formatModelWorkflowMap,
  parseModelWorkflowMap,
  serverEnvFieldValue,
  type HealthResponse,
} from '@/components/settings/tabs/settings-tool-shared';
import {
  CollapsibleSection,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';
import { FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { restartComfyUi } from '@/lib/comfyui-queue-control';
import { isDesktopShellClient } from '@/lib/desktop-shell';

const ComfyWorkflowLibraryPanel = dynamic(() => import('@/components/ComfyWorkflowLibraryPanel'), {
  ssr: false,
  loading: () => <p className="text-sm text-[var(--text-muted)]">Loading workflow library…</p>,
});

const ACCENT = SETTINGS_TOOL_ACCENT;

export type SettingsComfyUiTabProps = {
  slimSettings?: boolean;
  onShowAllSettings?: () => void;
  comfyUiSection: ComfyUiSettingsSectionId | null;
  handleComfyUiSectionJump: (section: ComfyUiSettingsSectionId) => void;
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  mounted: boolean;
  settings: ComfyUiSettings;
  updateSettings: (patch: Partial<ComfyUiSettings>) => void;
  modelWorkflowMapText: string;
  setModelWorkflowMapText: (value: string) => void;
  modelCheckpointMapText: string;
  setModelCheckpointMapText: (value: string) => void;
  modelVaeMapText: string;
  setModelVaeMapText: (value: string) => void;
  modelRefinerMapText: string;
  setModelRefinerMapText: (value: string) => void;
  modelUpscaleMapText: string;
  setModelUpscaleMapText: (value: string) => void;
  modelControlNetMapText: string;
  setModelControlNetMapText: (value: string) => void;
  modelLoraMapText: string;
  setModelLoraMapText: (value: string) => void;
  loaderMapMergeHint: string | null;
  ipAdapterUploadStatus: string | null;
  ipAdapterUploading: boolean;
  setIpAdapterUploading: (value: boolean) => void;
  setIpAdapterUploadStatus: (value: string | null) => void;
  workflowHealthRefresh: number;
  setWorkflowHealthRefresh: (value: number | ((previous: number) => number)) => void;
  setStatus: (status: string | null) => void;
  applySuggestedLoaderMaps: () => void;
  syncLoaderMapsFromComfyInventory: () => void | Promise<void>;
  updateQueueParam: (key: 'seed' | 'width' | 'height' | 'cfg' | 'steps', value: string) => void;
  updateCustomToken: (index: number, patch: Partial<CustomWorkflowToken>) => void;
  addCustomToken: () => void;
  removeCustomToken: (index: number) => void;
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
};

export default function SettingsComfyUiTab({
  slimSettings = false,
  onShowAllSettings,
  comfyUiSection,
  handleComfyUiSectionJump,
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  mounted,
  settings,
  updateSettings,
  modelWorkflowMapText,
  setModelWorkflowMapText,
  modelCheckpointMapText,
  setModelCheckpointMapText,
  modelVaeMapText,
  setModelVaeMapText,
  modelRefinerMapText,
  setModelRefinerMapText,
  modelUpscaleMapText,
  setModelUpscaleMapText,
  modelControlNetMapText,
  setModelControlNetMapText,
  modelLoraMapText,
  setModelLoraMapText,
  loaderMapMergeHint,
  ipAdapterUploadStatus,
  ipAdapterUploading,
  setIpAdapterUploading,
  setIpAdapterUploadStatus,
  workflowHealthRefresh,
  setWorkflowHealthRefresh,
  setStatus,
  applySuggestedLoaderMaps,
  syncLoaderMapsFromComfyInventory,
  updateQueueParam,
  updateCustomToken,
  addCustomToken,
  removeCustomToken,
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
}: SettingsComfyUiTabProps) {
  const [systemWorkflowsSaveHint, setSystemWorkflowsSaveHint] = useState<string | null>(null);
  const [systemWorkflowsSaving, setSystemWorkflowsSaving] = useState(false);
  const showAdvanced = !slimSettings;

  return (
    <>
      <ComfyUiSettingsJumpNav
        activeSection={comfyUiSection}
        onJump={handleComfyUiSectionJump}
        essentialsOnly={slimSettings}
      />
      {slimSettings ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] px-4 py-3 shadow-[inset_0_1px_0_rgb(255_255_255_/0.03)]">
          <p className="type-caption text-[var(--text-secondary)]">
            Essentials view — connection, workflow map, model downloads, and queue basics.
          </p>
          {onShowAllSettings ? (
            <Button type="button" variant="secondary" size="sm" onClick={onShowAllSettings}>
              Show all ComfyUI settings
            </Button>
          ) : null}
        </div>
      ) : null}
      <ToolSection
        id="settings-comfyui-inference-engine"
        title="Inference engine"
        description="ComfyUI is the default generate path (Qwen Lightning bf16, Final/Max enrich, specialty graphs). Diffusers is optional local txt2img. Cloud engines (Fal, Replicate, ChatGPT, Gemini, Grok) are prompt + optional reference image — no workflows, LoRAs, or live latents."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="inference-engine" className="text-xs text-[var(--text-secondary)]">
              Active engine
            </label>
            <select
              id="inference-engine"
              value={parseEngineId(sharedSettings.inferenceEngine) ?? 'comfyui'}
              onChange={event =>
                updateSharedSettings({
                  inferenceEngine: normalizeEngineId(event.target.value),
                })
              }
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-inner transition focus-visible:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              <option value="comfyui">ComfyUI (primary generate)</option>
              <option value="diffusers">Diffusers (optional / experimental)</option>
              {CLOUD_ENGINE_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="diffusers-url" className="text-xs text-[var(--text-secondary)]">
              Diffusers API URL
            </label>
            <input
              id="diffusers-url"
              value={sharedSettings.diffusersApiUrl ?? ''}
              onChange={event => updateSharedSettings({ diffusersApiUrl: event.target.value })}
              placeholder="http://127.0.0.1:8190"
              disabled={sharedSettings.inferenceEngine !== 'diffusers'}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-inner transition focus-visible:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <label
            className={`flex cursor-pointer items-start gap-3 sm:col-span-2 ${
              sharedSettings.inferenceEngine !== 'diffusers' ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={sharedSettings.diffusersAutoStart !== false}
              onChange={event =>
                updateSharedSettings({
                  diffusersAutoStart: event.target.checked,
                })
              }
              disabled={sharedSettings.inferenceEngine !== 'diffusers'}
              className="mt-0.5 rounded border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-primary)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed"
            />
            <span className="space-y-0.5">
              <span className="block text-sm text-[var(--text-primary)]">
                Auto-start Diffusers when offline
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                Spawns{' '}
                <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
                  services/diffusers-engine
                </code>{' '}
                for localhost URLs when Diffusers is the active engine. Server kill-switch:{' '}
                <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
                  DIFFUSERS_AUTOSTART=0
                </code>
                .
              </span>
            </span>
          </label>
          <div className="space-y-1 sm:col-span-2">
            <label
              htmlFor="diffusers-workshop-crop"
              className="text-xs text-[var(--text-secondary)]"
            >
              Workshop crop (hide hands)
            </label>
            <select
              id="diffusers-workshop-crop"
              value={sharedSettings.diffusersWorkshopCrop ?? 'auto'}
              onChange={event => {
                const value = event.target.value;
                updateSharedSettings({
                  diffusersWorkshopCrop: value === 'always' || value === 'never' ? value : 'auto',
                });
              }}
              disabled={sharedSettings.inferenceEngine !== 'diffusers'}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-inner transition focus-visible:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="auto">Auto (glassblower / blacksmith / …)</option>
              <option value="always">Always crop hands</option>
              <option value="never">Allow hands in frame</option>
            </select>
          </div>
          {CLOUD_ENGINE_OPTIONS.map(option => {
            const active = sharedSettings.inferenceEngine === option.id;
            const tokenValue = sharedSettings[option.sessionTokenField] ?? '';
            const modelValue = sharedSettings[option.modelField] ?? '';
            const img2imgValue = sharedSettings[option.img2imgField] ?? '';
            const listId = `${option.id}-model-presets`;
            return (
              <Fragment key={option.id}>
                <div className="space-y-1 sm:col-span-2">
                  <label
                    htmlFor={`${option.id}-api-token`}
                    className="text-xs text-[var(--text-secondary)]"
                  >
                    {option.tokenLabel}
                  </label>
                  <input
                    id={`${option.id}-api-token`}
                    type="password"
                    autoComplete="off"
                    value={tokenValue}
                    onChange={event =>
                      updateSharedSettings({
                        [option.sessionTokenField]: event.target.value.trim() || undefined,
                      })
                    }
                    placeholder={option.tokenPlaceholder}
                    disabled={!active}
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-inner transition focus-visible:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor={`${option.id}-model`}
                    className="text-xs text-[var(--text-secondary)]"
                  >
                    {option.shortLabel} txt2img model
                  </label>
                  <input
                    id={`${option.id}-model`}
                    list={listId}
                    value={modelValue}
                    onChange={event =>
                      updateSharedSettings({
                        [option.modelField]: event.target.value,
                      })
                    }
                    placeholder={option.defaultTxt2Img}
                    disabled={!active}
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-inner transition focus-visible:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <datalist id={listId}>
                    {option.presets.map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor={`${option.id}-img2img-model`}
                    className="text-xs text-[var(--text-secondary)]"
                  >
                    {option.shortLabel} image-to-image model
                  </label>
                  <input
                    id={`${option.id}-img2img-model`}
                    list={listId}
                    value={img2imgValue}
                    onChange={event =>
                      updateSharedSettings({
                        [option.img2imgField]: event.target.value,
                      })
                    }
                    placeholder={option.defaultImg2Img}
                    disabled={!active}
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-inner transition focus-visible:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </Fragment>
            );
          })}
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Default Generate uses ComfyUI (Dynamic VRAM / bf16 Lightning). Diffusers remains available
          for experiments — run{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            cd services/diffusers-engine && ./run.sh
          </code>{' '}
          or enable auto-start when that engine is selected. Cloud engines queue{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            prompt + optional Image 1
          </code>{' '}
          through{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            /api/fal
          </code>
          ,{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            /api/replicate
          </code>
          ,{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            /api/openai
          </code>
          ,{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            /api/gemini
          </code>
          , and{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            /api/grok
          </code>
          ; keys from Settings or{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            FAL_KEY
          </code>
          {' / '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            REPLICATE_API_TOKEN
          </code>
          {' / '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            OPENAI_API_KEY
          </code>
          {' / '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            GEMINI_API_KEY
          </code>
          {' / '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            XAI_API_KEY
          </code>
          . Server proxy uses{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            DIFFUSERS_API_URL
          </code>
          ; default engine via{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 text-[var(--text-secondary)]">
            PROMPT_ENGINE
          </code>
          .
        </p>
      </ToolSection>
      {showAdvanced ? (
        <SettingsBrowserPresetsPanel
          disabled={!sharedMounted || !mounted}
          onApply={preset => {
            updateSharedSettings(preset.shared);
            updateSettings(preset.comfyUi);
            setStatus(`Applied ${preset.label} browser preset.`);
          }}
        />
      ) : null}
      <ToolSection id="settings-comfyui-workflow-map" title="Model → workflow map">
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.useSystemWorkflows === true}
            onChange={event => {
              const enabled = event.target.checked;
              const qualityPatch: Partial<Pick<SharedToolSettings, 'queueQualityProfile'>> =
                enabled &&
                (sharedSettings.queueQualityProfile === 'followSettings' ||
                  sharedSettings.queueQualityProfile == null)
                  ? { queueQualityProfile: 'final' }
                  : {};
              updateSharedSettings({
                useSystemWorkflows: enabled,
                ...qualityPatch,
              });
              void (async () => {
                setSystemWorkflowsSaving(true);
                setSystemWorkflowsSaveHint('Saving…');
                try {
                  await setUseSystemWorkflowsPref(enabled, qualityPatch);
                  setSystemWorkflowsSaveHint(
                    enabled ? 'Saved — stays on after refresh.' : 'Saved — system workflows off.'
                  );
                  void import('@/lib/app-toast').then(({ pushAppToast }) => {
                    pushAppToast({
                      text: enabled
                        ? 'Saved — system workflows on'
                        : 'Saved — system workflows off',
                      tone: 'success',
                      ttlMs: 2500,
                    });
                  });
                } catch {
                  setSystemWorkflowsSaveHint(
                    'Could not save. Your browser may be blocking storage.'
                  );
                  updateSharedSettings({ useSystemWorkflows: !enabled });
                  return;
                } finally {
                  setSystemWorkflowsSaving(false);
                }
                if (enabled) {
                  markOnboardingSystemWorkflowsEnabled();
                  setSystemWorkflowsSaveHint('Saved — scanning ComfyUI inventory…');
                  const { scanAndAdaptSystemWorkflowInventory } =
                    await import('@/lib/comfyui-runtime-for-model');
                  const models = await scanAndAdaptSystemWorkflowInventory({
                    comfyUrl: settings.apiUrl || undefined,
                    persist: true,
                  });
                  if (!models) {
                    setSystemWorkflowsSaveHint(
                      'Saved — ComfyUI not reachable yet; scaffolds adapt on next queue.'
                    );
                    return;
                  }
                  const adapted = loadSettingsCache().shared;
                  updateSharedSettings({
                    modelCheckpointMap: adapted.modelCheckpointMap,
                    modelVaeMap: adapted.modelVaeMap,
                    modelUpscaleMap: adapted.modelUpscaleMap,
                    modelControlNetMap: adapted.modelControlNetMap,
                  });
                  setModelCheckpointMapText(formatModelCheckpointMap(adapted.modelCheckpointMap));
                  setModelVaeMapText(formatModelVaeMap(adapted.modelVaeMap));
                  setModelUpscaleMapText(formatModelUpscaleMap(adapted.modelUpscaleMap));
                  setSystemWorkflowsSaveHint('Saved — loader maps adapted from ComfyUI.');
                  setWorkflowHealthRefresh(n => n + 1);
                }
              })();
            }}
            disabled={systemWorkflowsSaving}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                Use system workflows
              </span>
              {!sharedMounted ? (
                <span className="text-xs text-[var(--text-muted)]">Loading saved settings…</span>
              ) : null}
              {systemWorkflowsSaveHint ? (
                <span
                  className={`text-xs ${
                    systemWorkflowsSaveHint.startsWith('Could not')
                      ? 'ui-status-danger'
                      : systemWorkflowsSaveHint.startsWith('Saved')
                        ? 'ui-status-success'
                        : 'text-[var(--text-muted)]'
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {systemWorkflowsSaveHint}
                </span>
              ) : null}
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Queue from the best matching library pack when one scores well, otherwise a built-in
              scaffold. Fast / Good / Best still drive sampler, resolution, and polish (same
              pipelines as Draft / Final / Max). Checkpoint/VAE maps still apply. For FLUX / Qwen /
              video, hides the workflow picker while enabled. Enabling scans ComfyUI inventory and
              adapts checkpoint/VAE/upscale maps.
            </span>
          </span>
        </label>

        {sharedSettings.useSystemWorkflows === true ? (
          <label className="mb-3 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={sharedSettings.systemWorkflowsLimitPicker !== false}
              onChange={event =>
                updateSharedSettings({
                  systemWorkflowsLimitPicker: event.target.checked,
                })
              }
              disabled={!sharedMounted}
              className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                Limit picker to FLUX / Qwen / video
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                On (default): snap the model list to system-supported families. Off (hybrid): keep
                SDXL and other models — they use mapped/manual workflows while FLUX/Qwen/video still
                use the system path.
              </span>
            </span>
          </label>
        ) : null}

        {sharedSettings.useSystemWorkflows === true ? (
          <p className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-3 text-xs leading-relaxed text-[var(--text-muted)]">
            Explicit model→workflow map entries still win at queue time. When a model has no map
            entry, matching pack graphs in your library are preferred automatically, otherwise a
            built-in scaffold is used. Expand below to edit the map or pin{' '}
            <code className="ui-inline-code">faceDetailer=</code> for Gallery → Face detail.
          </p>
        ) : (
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            One mapping per line: <code className="ui-inline-code">modelId=workflowFileId</code>.
            When you change the target model in a generator, the mapped workflow file is selected
            automatically.
          </p>
        )}

        {sharedSettings.useSystemWorkflows !== true ? (
          <>
            <label className="mb-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.autoSelectWorkflowForModel !== false}
                onChange={event =>
                  updateSharedSettings({
                    autoSelectWorkflowForModel: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Auto-select workflow when target model changes
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Uses the map below, or filename-based defaults when no line exists. You can still
                  pick a different workflow manually to override for the session.
                </span>
              </span>
            </label>
            <label className="mb-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.limitModelsToAvailableWorkflows !== false}
                onChange={event =>
                  updateSharedSettings({
                    limitModelsToAvailableWorkflows: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Limit model picker to available workflows
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Generators only list models that have a workflow in your library or assignment
                  map. Use &quot;Show all models&quot; in a tool sidebar to override temporarily.
                </span>
              </span>
            </label>
          </>
        ) : null}

        {sharedSettings.useSystemWorkflows === true ? (
          <CollapsibleSection
            title="Library map (advanced)"
            summary={
              sharedSettings.systemWorkflowsLimitPicker === false
                ? 'SDXL/other hybrid maps, FaceDetailer pin, and explicit overrides.'
                : 'FaceDetailer pin and explicit model→workflow overrides.'
            }
            defaultOpen={sharedSettings.systemWorkflowsLimitPicker === false}
            persistKey="settings-system-workflow-map-advanced"
          >
            <textarea
              value={modelWorkflowMapText}
              onChange={event => {
                const text = event.target.value;
                setModelWorkflowMapText(text);
                updateSharedSettings({
                  modelWorkflowMap: parseModelWorkflowMap(text),
                });
              }}
              rows={4}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`faceDetailer=my-facedetailer-workflow.json`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Pin a FaceDetailer/ReActor graph with{' '}
              <code className="ui-inline-code">faceDetailer=&lt;workflowId&gt;</code>.
            </p>
          </CollapsibleSection>
        ) : (
          <>
            <textarea
              value={modelWorkflowMapText}
              onChange={event => {
                const text = event.target.value;
                setModelWorkflowMapText(text);
                updateSharedSettings({
                  modelWorkflowMap: parseModelWorkflowMap(text),
                });
              }}
              rows={6}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`qwen-image-2512=my-qwen-workflow.json\nflux-2-klein=flux-klein-default.json\nfaceDetailer=my-facedetailer-workflow.json`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            <p className="text-xs text-[var(--text-muted)]">
              Pin a FaceDetailer/ReActor graph with{' '}
              <code className="ui-inline-code">faceDetailer=&lt;workflowId&gt;</code> (required for
              Gallery → Face detail).
            </p>
            <button
              type="button"
              disabled={!sharedMounted}
              onClick={() => {
                const suggested = suggestWorkflowDefaultsByCategory(loadComfyWorkflowFiles());
                const merged = mergeModelWorkflowMap(
                  loadSettingsCache().shared.modelWorkflowMap,
                  suggested,
                  false
                );
                updateSharedSettings({ modelWorkflowMap: merged });
                setModelWorkflowMapText(formatModelWorkflowMap(merged));
                setStatus(
                  `Applied ${countMappedModels(merged)} model→workflow mappings from workflow filenames.`
                );
              }}
              className="mt-3 rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] transition hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.99]"
            >
              Apply smart defaults by category
            </button>
          </>
        )}
      </ToolSection>

      <ToolSection id="settings-comfyui-model-assets" title="Model assets">
        <ComfyModelAssetsPanel
          onStatus={setStatus}
          onInstalled={() => {
            void syncLoaderMapsFromComfyInventory();
          }}
        />
      </ToolSection>

      {showAdvanced ? (
        <>
          <ToolSection
            id="settings-comfyui-workflow-patching"
            title="Workflow patching & checkpoints"
          >
            <p className="text-sm text-[var(--text-secondary)]">
              Direct patching updates <code className="ui-inline-code">EmptyLatentImage</code> and
              loader nodes at queue time even when placeholders are missing. Disable to compare
              against raw workflow JSON.
            </p>
            <label className="mb-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.directWorkflowPatching !== false}
                onChange={event =>
                  updateSharedSettings({
                    directWorkflowPatching: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Direct workflow patching on queue
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Patches latent size and checkpoint/UNET/VAE loader filenames from model defaults
                  below. KSampler and model-sampling nodes are always patched when params are
                  resolved.
                </span>
              </span>
            </label>
            <label className="mb-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.syncWorkflowLoadersToModel === true}
                onChange={event =>
                  updateSharedSettings({
                    syncWorkflowLoadersToModel: event.target.checked,
                  })
                }
                disabled={!sharedMounted || sharedSettings.directWorkflowPatching === false}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Sync loaders to model on queue
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Overwrites hardcoded checkpoint/UNET/VAE/CLIP filenames with the target model at
                  queue time. Use when switching model families on an imported workflow — otherwise
                  leave off to preserve hand-picked weights inside the JSON.
                </span>
              </span>
            </label>
            <label className="mb-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.workflowQueueOptimize !== false}
                onChange={event =>
                  updateSharedSettings({
                    workflowQueueOptimize: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Optimize workflows on queue
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Auto-binds missing placeholders (prompt, latent, sampler, loaders) on imported
                  workflows before injection — turns community JSON into app-controlled templates.
                  Use{' '}
                  <strong className="font-medium text-[var(--text-secondary)]">
                    Optimize &amp; save copy
                  </strong>{' '}
                  in the workflow library to persist the result.
                </span>
              </span>
            </label>
            <label className="mb-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.compactDraftSaves !== false}
                onChange={event =>
                  updateSharedSettings({
                    compactDraftSaves: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Compact Draft saves (WebP when available)
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  On <strong className="font-medium text-[var(--text-secondary)]">Draft</strong>,
                  rewrite SaveImage to a WebP-capable custom node when ComfyUI has one installed
                  (e.g. SaveImageExtended).{' '}
                  <strong className="font-medium text-[var(--text-secondary)]">Final/Max</strong>{' '}
                  stay PNG for keepers. Stock SaveImage alone cannot emit WebP — install a save
                  custom node to shrink draft files on disk.
                </span>
              </span>
            </label>
            <CompactDraftSavesStatus
              enabled={sharedMounted && sharedSettings.compactDraftSaves !== false}
            />
            <label className="mb-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.workflowGraphEnrich !== false}
                onChange={event =>
                  updateSharedSettings({
                    workflowGraphEnrich: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Insert model-sampling nodes on queue
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  For FLUX and SD3-family workflows, inserts{' '}
                  <code className="ui-inline-code">ModelSamplingFlux</code> or shift patch nodes
                  when a loader connects directly to KSampler. On{' '}
                  <strong className="font-medium text-[var(--text-secondary)]">Final/Max</strong>,
                  SDXL may get a latent refiner pass and Flux a soft latent detail pass (vanilla
                  Qwen skips that — anatomy guard); outputs then get neural or Lanczos upscale
                  capped to ~1.25×/1.5× net (vanilla 2512 stays Lanczos-only; Max Lanczos polish +
                  Max sharpen when enabled).
                </span>
              </span>
            </label>
            {sharedSettings.workflowGraphEnrich !== false ? (
              <div className="mb-4 ml-7 space-y-2 border-l border-[var(--border-subtle)] pl-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={sharedSettings.workflowSdxlRefinerEnrich !== false}
                    onChange={event =>
                      updateSharedSettings({
                        workflowSdxlRefinerEnrich: event.target.checked,
                      })
                    }
                    disabled={!sharedMounted}
                    className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
                  />
                  <span className="space-y-1">
                    <span className="block text-sm text-[var(--text-secondary)]">
                      SDXL refiner pass (Final/Max)
                    </span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      Latent upscale + refiner KSampler before VAEDecode when a refiner map is
                      configured.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={sharedSettings.workflowNeuralUpscalePolish !== false}
                    onChange={event =>
                      updateSharedSettings({
                        workflowNeuralUpscalePolish: event.target.checked,
                      })
                    }
                    disabled={!sharedMounted}
                    className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
                  />
                  <span className="space-y-1">
                    <span className="block text-sm text-[var(--text-secondary)]">
                      Lanczos polish after neural upscale (Max)
                    </span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      Chains a 1.05× Lanczos pass after UpscaleModel on Max profile.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={sharedSettings.workflowSharpenAfterUpscale === true}
                    onChange={event =>
                      updateSharedSettings({
                        workflowSharpenAfterUpscale: event.target.checked,
                      })
                    }
                    disabled={!sharedMounted}
                    className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
                  />
                  <span className="space-y-1">
                    <span className="block text-sm text-[var(--text-secondary)]">
                      Subtle sharpen after upscale (Max)
                    </span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      ImageSharpen after neural UpscaleModel on Max quality (not Lanczos-only). On
                      by default for Max; uncheck if edges look waxy. Qwen/Klein use a lighter
                      alpha.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={sharedSettings.useLibraryUpscaleWorkflow === true}
                    onChange={event =>
                      updateSharedSettings({
                        useLibraryUpscaleWorkflow: event.target.checked,
                      })
                    }
                    disabled={!sharedMounted}
                    className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
                  />
                  <span className="space-y-1">
                    <span className="block text-sm text-[var(--text-secondary)]">
                      Prefer library upscale workflows
                    </span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      Gallery upscale actions use a mapped library workflow with UpscaleModel nodes
                      when available instead of the minimal scaffold.
                    </span>
                  </span>
                </label>
                <label className="block space-y-2">
                  <span className="block text-sm text-[var(--text-secondary)]">
                    Neural upscale tile size (Max)
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    Only applied when ComfyUI’s ImageUpscaleWithModel declares tile_size. Set 0 to
                    disable.
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={2048}
                    step={64}
                    value={sharedSettings.neuralUpscaleTileSize ?? 512}
                    onChange={event =>
                      updateSharedSettings({
                        neuralUpscaleTileSize: Number(event.target.value),
                      })
                    }
                    disabled={!sharedMounted}
                    className={`ui-input w-32 ${accentFocusClass(ACCENT)}`}
                  />
                </label>
              </div>
            ) : null}
            <div className="mb-4 space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Per-tool queue quality
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Set default Fast / Good / Best profiles for individual tools. Overrides the global
                sidebar profile when that tool queues to ComfyUI.
              </p>
              <ToolQualityProfilesSettings
                profiles={sharedSettings.toolQueueQualityProfiles ?? {}}
                disabled={!sharedMounted}
                onChange={toolQueueQualityProfiles =>
                  updateSharedSettings({ toolQueueQualityProfiles })
                }
              />
            </div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">
              Checkpoint map — one line per model:{' '}
              <code className="ui-inline-code">modelId=filename.safetensors</code>. Used for both
              CheckpointLoader and UNETLoader when a workflow has those nodes.
            </p>
            <textarea
              value={modelCheckpointMapText}
              onChange={event => {
                const text = event.target.value;
                setModelCheckpointMapText(text);
                updateSharedSettings({
                  modelCheckpointMap: parseModelCheckpointMap(text),
                });
              }}
              rows={5}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`qwen-image-2512=qwen_image_2512_bf16.safetensors\nflux-2-klein-9b=flux-2-klein-9b.safetensors`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!sharedMounted}
                onClick={applySuggestedLoaderMaps}
                className={`ui-chip px-3 py-1.5 text-xs ${accentFocusClass(ACCENT)}`}
              >
                Merge suggested loader maps
              </button>
              <button
                type="button"
                disabled={!sharedMounted}
                onClick={() => void syncLoaderMapsFromComfyInventory()}
                className={`rounded-lg border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-1.5 text-xs text-[var(--tint-success-text)] transition hover:bg-[var(--tint-success-bg)] ${accentFocusClass(ACCENT)}`}
              >
                Sync from ComfyUI inventory
              </button>
            </div>
            {loaderMapMergeHint ? (
              <p className="mt-2 text-xs leading-relaxed text-[var(--tint-success-text)]">
                {loaderMapMergeHint}
              </p>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                Suggested maps are applied automatically on load. Use this button after clearing a
                map or on a new install — feedback appears here.
              </p>
            )}
            <p className="mb-2 mt-4 text-sm text-[var(--text-secondary)]">
              VAE map — override <code className="ui-inline-code">{'{{VAE}}'}</code> /{' '}
              <code className="ui-inline-code">VAELoader</code> filenames per model.{' '}
              <code className="ui-inline-code">ae.safetensors</code> is UltraReal Fine-Tune v4 only
              — do not set it as <code className="ui-inline-code">default</code> or on Qwen. FLUX
              Klein workflows need <code className="ui-inline-code">flux2-vae.safetensors</code>.
            </p>
            <textarea
              value={modelVaeMapText}
              onChange={event => {
                const text = event.target.value;
                setModelVaeMapText(text);
                updateSharedSettings({
                  modelVaeMap: parseModelVaeMap(text),
                });
              }}
              rows={3}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`flux-2-klein-9b=flux2-vae.safetensors\ndefault=flux2-vae.safetensors`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            <p className="mb-2 mt-4 text-sm text-[var(--text-secondary)]">
              SDXL refiner map — checkpoint for the hi-res refiner pass on{' '}
              <strong className="font-medium text-[var(--text-secondary)]">Final/Max</strong> SDXL
              queues (<code className="ui-inline-code">sd_xl_refiner_1.0.safetensors</code> by
              default). Inserts latent upscale + refiner KSampler before VAEDecode on single-pass
              base workflows.
            </p>
            <textarea
              value={modelRefinerMapText}
              onChange={event => {
                const text = event.target.value;
                setModelRefinerMapText(text);
                updateSharedSettings({
                  modelRefinerMap: parseModelRefinerMap(text),
                });
              }}
              rows={3}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`sdxl=sd_xl_refiner_1.0.safetensors\ndefault=sd_xl_refiner_1.0.safetensors`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            <p className="mb-2 mt-4 text-sm text-[var(--text-secondary)]">
              Upscale model map — optional. Leave empty to use Lanczos upscale on Final/Max. Set{' '}
              <code className="ui-inline-code">default=your-model.pth</code> only when the file
              exists in ComfyUI <code className="ui-inline-code">models/upscale_models/</code>.
              Patches <code className="ui-inline-code">UpscaleModel</code> nodes and replaces{' '}
              <code className="ui-inline-code">{'{{UPSCALE_MODEL}}'}</code> placeholders at queue
              time.
            </p>
            <textarea
              value={modelUpscaleMapText}
              onChange={event => {
                const text = event.target.value;
                setModelUpscaleMapText(text);
                updateSharedSettings({
                  modelUpscaleMap: parseModelUpscaleMap(text),
                });
              }}
              rows={3}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`# Final/Max neural upscale (must exist in models/upscale_models/)\ndefault=4x-UltraSharp.pth\nqwen-image-2512=4x_NMKD-Siax_200k.pth\nflux-dev=4x-UltraSharp.pth`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            <p className="mb-2 mt-4 text-sm text-[var(--text-secondary)]">
              ControlNet model map — optional. Patches{' '}
              <code className="ui-inline-code">ControlNetLoader</code> nodes and replaces{' '}
              <code className="ui-inline-code">{'{{CONTROLNET_MODEL}}'}</code> at queue time.
            </p>
            <textarea
              value={modelControlNetMapText}
              onChange={event => {
                const text = event.target.value;
                setModelControlNetMapText(text);
                updateSharedSettings({
                  modelControlNetMap: parseModelControlNetMap(text),
                });
              }}
              rows={3}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`# optional — file in ComfyUI models/controlnet/\ndefault=control_v11p_sd15_openpose.pth`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            <p className="mb-2 mt-4 text-sm text-[var(--text-secondary)]">
              Model LoRA map — default library entries per model:{' '}
              <code className="ui-inline-code">modelId=loraId1,loraId2</code>. Values are{' '}
              <strong className="font-medium text-[var(--text-secondary)]">library ids</strong> from
              the LoRA library panel (not filenames). Empty value (
              <code className="ui-inline-code">modelId=</code>) means no LoRAs for that model.
              Applied when the session picker is still following defaults.
            </p>
            <textarea
              value={modelLoraMapText}
              onChange={event => {
                const text = event.target.value;
                setModelLoraMapText(text);
                updateSharedSettings({
                  modelLoraMap: parseModelLoraMap(text),
                });
              }}
              rows={4}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`# library ids from Settings → LoRA library\nwan-video=skin,motion\nflux-dev=`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            <label className="mb-3 mt-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.autoSelectLorasForModel !== false}
                onChange={event =>
                  updateSharedSettings({
                    autoSelectLorasForModel: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Auto-select LoRAs for model
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  When you change the target model, load that model&apos;s stored LoRA picks (or the
                  map above). Explicit picks are remembered per model and never overwrite another
                  model&apos;s stack.
                </span>
              </span>
            </label>
            <label className="mt-4 block space-y-2">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                Edit denoise strength
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                Applied when queueing with an input image or from Refine / Image → Prompt. FLUX
                Inpaint uses 0.75 by default; other edit flows use this value (0.05–1).
              </span>
              <input
                type="number"
                min={0.05}
                max={1}
                step={0.05}
                value={sharedSettings.editDenoiseStrength ?? 0.65}
                onChange={event =>
                  updateSharedSettings({
                    editDenoiseStrength: Number(event.target.value),
                  })
                }
                disabled={!sharedMounted}
                className={`ui-input w-32 ${accentFocusClass(ACCENT)}`}
              />
            </label>
            <label className="mt-4 block space-y-2">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                Face detail denoise
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                Gallery → Face detail strength for{' '}
                <code className="ui-inline-code">{'{{FACE_DETAIL_DENOISE}}'}</code> (0.05–1).
                Requires a pinned FaceDetailer/ReActor workflow.
              </span>
              <input
                type="number"
                min={0.05}
                max={1}
                step={0.05}
                value={sharedSettings.faceDetailerDenoise ?? 0.35}
                onChange={event =>
                  updateSharedSettings({
                    faceDetailerDenoise: Number(event.target.value),
                  })
                }
                disabled={!sharedMounted}
                className={`ui-input w-32 ${accentFocusClass(ACCENT)}`}
              />
            </label>
            <FaceDetailerHealthChip refreshKey={workflowHealthRefresh} />
            <IdentityPackHealthChips refreshKey={workflowHealthRefresh} />
          </ToolSection>

          <ToolSection id="settings-comfyui-ipadapter" title="IP-Adapter identity reference">
            <p className="text-sm text-[var(--text-secondary)]">
              Session-wide identity/style reference (not Image → Prompt&apos;s text multi-ref). At
              queue time, with a reference image set, the app updates existing{' '}
              <code className="ui-inline-code">{DEFAULT_IPADAPTER_IMAGE_TOKEN}</code>
              {' / '}
              <code className="ui-inline-code">{DEFAULT_IPADAPTER_STRENGTH_TOKEN}</code>
              {' / '}
              <code className="ui-inline-code">{DEFAULT_IPADAPTER_MODEL_TOKEN}</code> tokens{' '}
              <strong className="font-medium text-[var(--text-secondary)]">or auto-inserts</strong>{' '}
              a minimal LoadImage → IPAdapterModelLoader → IPAdapterAdvanced chain when none exist.
              Requires ComfyUI-IPAdapter-Plus-class nodes installed. Extra reference filenames stack
              additional Apply nodes. When IP-Adapter Plus is missing but InstantID/PuLID nodes are
              installed, Studio falls back to auto-inserting those instead. You can also import a
              BYO InstantID / PuLID scaffold from the Workflow library.
            </p>

            <div className="space-y-2">
              <FieldLabel htmlFor="settings-ipadapter-image">Reference image filename</FieldLabel>
              <input
                id="settings-ipadapter-image"
                value={sharedSettings.ipAdapterImageFilename ?? ''}
                onChange={event =>
                  updateSharedSettings({ ipAdapterImageFilename: event.target.value })
                }
                placeholder="already-uploaded-file.png (or upload below)"
                disabled={!sharedMounted}
                className={`ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body ${accentFocusClass(ACCENT)}`}
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
                  {ipAdapterUploading ? 'Uploading…' : 'Upload reference image'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={!sharedMounted || ipAdapterUploading}
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      setIpAdapterUploading(true);
                      setIpAdapterUploadStatus(null);
                      void uploadComfyInputImage({ file, model: sharedSettings.model })
                        .then(uploaded => {
                          updateSharedSettings({ ipAdapterImageFilename: uploaded.name });
                          setIpAdapterUploadStatus(`Uploaded as ${uploaded.name}.`);
                        })
                        .catch(err => {
                          setIpAdapterUploadStatus(
                            err instanceof Error ? err.message : 'Upload failed.'
                          );
                        })
                        .finally(() => setIpAdapterUploading(false));
                    }}
                  />
                </label>
                {ipAdapterUploadStatus ? (
                  <span className="text-xs text-[var(--text-muted)]">{ipAdapterUploadStatus}</span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <FieldLabel htmlFor="settings-ipadapter-extra">
                Extra reference filenames (multi-ref stack)
              </FieldLabel>
              <input
                id="settings-ipadapter-extra"
                value={(sharedSettings.ipAdapterImageFilenames ?? []).join(', ')}
                onChange={event => {
                  const names = event.target.value
                    .split(',')
                    .map(entry => entry.trim())
                    .filter(Boolean);
                  updateSharedSettings({
                    ipAdapterImageFilenames: names.length > 0 ? names : undefined,
                    ...(names[0] && !sharedSettings.ipAdapterImageFilename?.trim()
                      ? { ipAdapterImageFilename: names[0] }
                      : {}),
                  });
                }}
                placeholder="ref-a.png, ref-b.png (comma-separated; index 0 can mirror the primary)"
                disabled={!sharedMounted}
                className={`ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body ${accentFocusClass(ACCENT)}`}
              />
              <p className="text-xs text-[var(--text-muted)]">
                Two or more filenames stack additional IPAdapterAdvanced nodes onto the sampler
                model chain at queue time.
              </p>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                Strength — {(sharedSettings.ipAdapterStrength ?? 0.6).toFixed(2)}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sharedSettings.ipAdapterStrength ?? 0.6}
                onChange={event =>
                  updateSharedSettings({ ipAdapterStrength: Number(event.target.value) })
                }
                disabled={!sharedMounted}
                className={`w-full accent-[var(--accent)] ${accentFocusClass(ACCENT)}`}
              />
            </label>

            <div className="mt-4 space-y-2">
              <FieldLabel htmlFor="settings-ipadapter-model">
                IP-Adapter model filename (optional)
              </FieldLabel>
              <input
                id="settings-ipadapter-model"
                value={sharedSettings.ipAdapterModelFilename ?? ''}
                onChange={event =>
                  updateSharedSettings({ ipAdapterModelFilename: event.target.value })
                }
                placeholder="ip-adapter-plus_sdxl.safetensors (leave blank to keep the workflow's default)"
                disabled={!sharedMounted}
                className={`ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body ${accentFocusClass(ACCENT)}`}
              />
            </div>
          </ToolSection>

          <ToolSection id="settings-comfyui-wildcards" title="Custom wildcard lists">
            <WildcardListsEditor
              lists={sharedSettings.wildcardLists}
              disabled={!sharedMounted}
              focusClassName={accentFocusClass(ACCENT)}
              onChange={wildcardLists =>
                updateSharedSettings({
                  wildcardLists: Object.keys(wildcardLists).length > 0 ? wildcardLists : undefined,
                })
              }
            />
          </ToolSection>

          <div id="settings-comfyui-workflow-library" className="scroll-mt-28 space-y-6">
            <ComfyWorkflowLibraryPanel
              placeholderTokens={placeholderTokensFromSettings(settings)}
              onStatus={msg => {
                setStatus(msg);
                setWorkflowHealthRefresh(n => n + 1);
              }}
            />

            <WorkflowHealthPanel refreshKey={workflowHealthRefresh} />

            <WorkflowDiffPanel />
          </div>

          <ToolSection id="settings-comfyui-lora-library" title="LoRA library">
            <LoraLibrarySettingsPanel
              library={settings.loraLibrary}
              comfyUrl={settings.apiUrl}
              onChange={loraLibrary => updateSettings({ loraLibrary })}
              onStatus={setStatus}
            />
          </ToolSection>

          <ToolSection
            id="settings-comfyui-lora-train"
            title="LoRA train loop"
            description="External trainer jobs — webhook or command — then register weights into the library."
          >
            <LoraTrainPanel onStatus={setStatus} />
          </ToolSection>
        </>
      ) : null}

      <ToolSection id="settings-comfyui-connection" title="ComfyUI connection & injection">
        {isDesktopShellClient() ||
        serverEnvFieldValue(health?.serverEnv, 'PROMPT_DESKTOP') === 'true' ? (
          <div className="mb-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Desktop app</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
              ComfyUI is not bundled. Leave <strong>Use server defaults</strong> on if ComfyUI is at{' '}
              <code className="ui-inline-code">http://127.0.0.1:8188</code>, or uncheck it and set
              the API URL below. Gallery, settings, and{' '}
              <code className="ui-inline-code">server.log</code> live in{' '}
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
                <button
                  type="button"
                  onClick={addCustomToken}
                  className="type-caption ui-text-link"
                >
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
                <DiffusersWorkflowSupportHint
                  workflowJson={settings.workflowJson}
                  className="mt-2"
                />
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
                  Test placeholder injection without queueing a ComfyUI job. Uses the current
                  settings above (save first if you changed them recently).
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
                  onChange={event =>
                    updateSettings({ autoRefineOnLowRating: event.target.checked })
                  }
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
                  onChange={event =>
                    updateSettings({ autoSaveHistoryOnQueue: event.target.checked })
                  }
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
                  onChange={event =>
                    updateSettings({ autoMutateOnHighRating: event.target.checked })
                  }
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
                {notificationPermission !== 'granted' &&
                  notificationPermission !== 'unsupported' && (
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
                Auto-tag completed and uploaded gallery images with vision LLM tags (also on LLM
                tab)
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

        <p className="text-xs text-[var(--text-muted)]">
          Export a workflow from ComfyUI (Save API format), put{' '}
          <code className="ui-inline-code">{settings.positiveToken ?? '{{POSITIVE}}'}</code> (and
          optionally{' '}
          <code className="ui-inline-code">{settings.negativeToken ?? '{{NEGATIVE}}'}</code>) in any
          string field where prompts should land—CLIP text inputs, custom node fields, filenames,
          etc.
        </p>
      </ToolSection>

      <ToolSection id="settings-comfyui-queue-params" title="Queue parameters">
        <QueueParamsPanel />
      </ToolSection>

      <SettingsPromptQualityPanel
        sharedSettings={sharedSettings}
        sharedMounted={sharedMounted}
        updateSharedSettings={updateSharedSettings}
        freeVramGb={
          typeof health?.comfyui.vram?.free === 'number' ? health.comfyui.vram.free / 1e9 : null
        }
        totalVramGb={
          typeof health?.comfyui.vram?.total === 'number' ? health.comfyui.vram.total / 1e9 : null
        }
      />

      <ToolSection id="settings-comfyui-hold-max" title="Queue Max hold">
        <p className="text-sm text-[var(--text-secondary)]">
          When on, Max Generate / re-queue / Upscale / Moiré / Refine wait until the ComfyUI queue
          is idle, then flush from Queue → Orchestration.
        </p>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.holdMaxUntilIdle === true}
            onChange={event => {
              updateSharedSettings({ holdMaxUntilIdle: event.target.checked });
              setStatus(
                event.target.checked
                  ? 'Hold Max until idle enabled.'
                  : 'Hold Max until idle disabled.'
              );
            }}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Hold Max until idle
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Avoid stacking Max enrich while ComfyUI is already busy. Also shown on Queue →
              Orchestration.
            </span>
          </span>
        </label>
      </ToolSection>

      {showAdvanced ? (
        <>
          <CollapsibleSection
            title="Sampler memory"
            summary="Per-model CFG/steps remembered from 4–5★ ratings."
            defaultOpen={false}
            persistKey="settings-comfyui-sampler-memory"
          >
            <ToolSection id="settings-comfyui-sampler-memory" title="Sampler memory">
              <p className="text-sm text-[var(--text-secondary)]">
                4–5★ gallery ratings remember per-model CFG / steps / sampler / scheduler for the
                next queue (Lightning and Rapid AIO stay CFG-1).
              </p>
              {(() => {
                const memory = sharedSettings.modelSamplerMemory ?? {};
                const entries = Object.entries(memory).sort(([a], [b]) => a.localeCompare(b));
                if (entries.length === 0) {
                  return (
                    <EmptyState
                      compact
                      icon="inbox"
                      title="No sampler memory yet"
                      description="Rate a completed gallery image 4–5★ to remember its sampler params for that model."
                    />
                  );
                }
                return (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          updateSharedSettings({ modelSamplerMemory: {} });
                          setStatus('Cleared all sampler memory.');
                        }}
                      >
                        Clear all
                      </Button>
                    </div>
                    <ul className="space-y-2">
                      {entries.map(([model, remembered]) => (
                        <li
                          key={model}
                          className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 px-3 py-2"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="truncate text-sm text-[var(--text-primary)]">{model}</p>
                            <p className="type-caption text-[var(--text-muted)]">
                              {[
                                remembered.cfg ? `CFG ${remembered.cfg}` : null,
                                remembered.steps ? `${remembered.steps} steps` : null,
                                remembered.samplerName,
                                remembered.scheduler,
                              ]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const next = { ...(sharedSettings.modelSamplerMemory ?? {}) };
                              delete next[model];
                              updateSharedSettings({ modelSamplerMemory: next });
                              setStatus(`Cleared sampler memory for ${model}.`);
                            }}
                          >
                            Clear
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </ToolSection>
          </CollapsibleSection>
        </>
      ) : null}
    </>
  );
}
