'use client';

import CompactDraftSavesStatus from '@/components/settings/CompactDraftSavesStatus';
import ToolQualityProfilesSettings from '@/components/settings/ToolQualityProfilesSettings';
import SettingsLoaderMapsPanel from '@/components/settings/panels/SettingsLoaderMapsPanel';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { SETTINGS_TOOL_ACCENT } from '@/components/settings/tabs/settings-tool-shared';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';

const ACCENT = SETTINGS_TOOL_ACCENT;

export type SettingsWorkflowPatchingPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
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
  workflowHealthRefresh: number;
  applySuggestedLoaderMaps: () => void;
  syncLoaderMapsFromComfyInventory: () => void | Promise<void>;
};

export default function SettingsWorkflowPatchingPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
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
  workflowHealthRefresh,
  applySuggestedLoaderMaps,
  syncLoaderMapsFromComfyInventory,
}: SettingsWorkflowPatchingPanelProps) {
  return (
    <ToolSection id="settings-comfyui-workflow-patching" title="Workflow patching & checkpoints">
      <p className="text-sm text-[var(--text-secondary)]">
        Direct patching updates <code className="ui-inline-code">EmptyLatentImage</code> and loader
        nodes at queue time even when placeholders are missing. Disable to compare against raw
        workflow JSON.
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
            Patches latent size and checkpoint/UNET/VAE loader filenames from model defaults below.
            KSampler and model-sampling nodes are always patched when params are resolved.
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
            Overwrites hardcoded checkpoint/UNET/VAE/CLIP filenames with the target model at queue
            time. Use when switching model families on an imported workflow — otherwise leave off to
            preserve hand-picked weights inside the JSON.
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
            Auto-binds missing placeholders (prompt, latent, sampler, loaders) on imported workflows
            before injection — turns community JSON into app-controlled templates. Use{' '}
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
            On <strong className="font-medium text-[var(--text-secondary)]">Draft</strong>, rewrite
            SaveImage to a WebP-capable custom node when ComfyUI has one installed (e.g.
            SaveImageExtended).{' '}
            <strong className="font-medium text-[var(--text-secondary)]">Final/Max</strong> stay PNG
            for keepers. Stock SaveImage alone cannot emit WebP — install a save custom node to
            shrink draft files on disk.
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
            <code className="ui-inline-code">ModelSamplingFlux</code> or shift patch nodes when a
            loader connects directly to KSampler. On{' '}
            <strong className="font-medium text-[var(--text-secondary)]">Final/Max</strong>, SDXL
            may get a latent refiner pass and Flux a soft latent detail pass (vanilla Qwen skips
            that — anatomy guard); outputs then get neural or Lanczos upscale capped to ~1.25×/1.5×
            net (vanilla 2512 stays Lanczos-only; Max Lanczos polish + Max sharpen when enabled).
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
                Latent upscale + refiner KSampler before VAEDecode when a refiner map is configured.
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
                ImageSharpen after neural UpscaleModel on Max quality (not Lanczos-only). On by
                default for Max; uncheck if edges look waxy. Qwen/Klein use a lighter alpha.
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
                Gallery upscale actions use a mapped library workflow with UpscaleModel nodes when
                available instead of the minimal scaffold.
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
        <p className="text-sm font-medium text-[var(--text-primary)]">Per-tool queue quality</p>
        <p className="text-xs text-[var(--text-muted)]">
          Set default Fast / Good / Best profiles for individual tools. Overrides the global sidebar
          profile when that tool queues to ComfyUI.
        </p>
        <ToolQualityProfilesSettings
          profiles={sharedSettings.toolQueueQualityProfiles ?? {}}
          disabled={!sharedMounted}
          onChange={toolQueueQualityProfiles => updateSharedSettings({ toolQueueQualityProfiles })}
        />
      </div>
      <SettingsLoaderMapsPanel
        sharedSettings={sharedSettings}
        sharedMounted={sharedMounted}
        updateSharedSettings={updateSharedSettings}
        modelCheckpointMapText={modelCheckpointMapText}
        setModelCheckpointMapText={setModelCheckpointMapText}
        modelVaeMapText={modelVaeMapText}
        setModelVaeMapText={setModelVaeMapText}
        modelRefinerMapText={modelRefinerMapText}
        setModelRefinerMapText={setModelRefinerMapText}
        modelUpscaleMapText={modelUpscaleMapText}
        setModelUpscaleMapText={setModelUpscaleMapText}
        modelControlNetMapText={modelControlNetMapText}
        setModelControlNetMapText={setModelControlNetMapText}
        modelLoraMapText={modelLoraMapText}
        setModelLoraMapText={setModelLoraMapText}
        loaderMapMergeHint={loaderMapMergeHint}
        workflowHealthRefresh={workflowHealthRefresh}
        applySuggestedLoaderMaps={applySuggestedLoaderMaps}
        syncLoaderMapsFromComfyInventory={syncLoaderMapsFromComfyInventory}
      />
    </ToolSection>
  );
}
