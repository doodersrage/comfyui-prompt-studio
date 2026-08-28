'use client';

import type { SharedToolSettings } from '@/lib/settings-cache';
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
import FaceDetailerHealthChip from '@/components/settings/FaceDetailerHealthChip';
import IdentityPackHealthChips from '@/components/settings/IdentityPackHealthChips';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import { SETTINGS_TOOL_ACCENT } from '@/components/settings/tabs/settings-tool-shared';

const ACCENT = SETTINGS_TOOL_ACCENT;

export type SettingsLoaderMapsPanelProps = {
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

export default function SettingsLoaderMapsPanel({
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
}: SettingsLoaderMapsPanelProps) {
  return (
    <>
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
          Suggested maps are applied automatically on load. Use this button after clearing a map or
          on a new install — feedback appears here.
        </p>
      )}
      <p className="mb-2 mt-4 text-sm text-[var(--text-secondary)]">
        VAE map — override <code className="ui-inline-code">{'{{VAE}}'}</code> /{' '}
        <code className="ui-inline-code">VAELoader</code> filenames per model.{' '}
        <code className="ui-inline-code">ae.safetensors</code> is UltraReal Fine-Tune v4 only — do
        not set it as <code className="ui-inline-code">default</code> or on Qwen. FLUX Klein
        workflows need <code className="ui-inline-code">flux2-vae.safetensors</code>.
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
        <strong className="font-medium text-[var(--text-secondary)]">Final/Max</strong> SDXL queues
        (<code className="ui-inline-code">sd_xl_refiner_1.0.safetensors</code> by default). Inserts
        latent upscale + refiner KSampler before VAEDecode on single-pass base workflows.
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
        <code className="ui-inline-code">default=your-model.pth</code> only when the file exists in
        ComfyUI <code className="ui-inline-code">models/upscale_models/</code>. Patches{' '}
        <code className="ui-inline-code">UpscaleModel</code> nodes and replaces{' '}
        <code className="ui-inline-code">{'{{UPSCALE_MODEL}}'}</code> placeholders at queue time.
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
        <strong className="font-medium text-[var(--text-secondary)]">library ids</strong> from the
        LoRA library panel (not filenames). Empty value (
        <code className="ui-inline-code">modelId=</code>) means no LoRAs for that model. Applied
        when the session picker is still following defaults.
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
            When you change the target model, load that model&apos;s stored LoRA picks (or the map
            above). Explicit picks are remembered per model and never overwrite another model&apos;s
            stack.
          </span>
        </span>
      </label>
      <label className="mt-4 block space-y-2">
        <span className="block text-sm font-medium text-[var(--text-primary)]">
          Edit denoise strength
        </span>
        <span className="block text-xs text-[var(--text-muted)]">
          Applied when queueing with an input image or from Refine / Image → Prompt. FLUX Inpaint
          uses 0.75 by default; other edit flows use this value (0.05–1). Z-Image Turbo img2img and
          Boogu / Lightning / Klein instruction-edit ignore this slider.
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
          <code className="ui-inline-code">{'{{FACE_DETAIL_DENOISE}}'}</code> (0.05–1). Requires a
          pinned FaceDetailer/ReActor workflow.
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
    </>
  );
}
