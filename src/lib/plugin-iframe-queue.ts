/**
 * Host-side handlers for plugin iframe postMessage queue / apply-prompt.
 */

import { requeueComfyJob } from './comfyui-requeue';
import { loadSettingsCache, saveSharedSettings } from './settings-cache';
import { rememberToolDraft } from './tool-draft-memory';
import { runPluginQueuePreflight } from './plugin-queue-hooks';
import { normalizeQueueQualityProfile } from './queue-quality-profile';
import { resolveSharedEffectiveSessionLoraIds } from './comfyui-settings';

export type PluginApplyPromptPayload = {
  prompt: string;
  negativePrompt?: string;
};

export type PluginQueuePayload = {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  denoise?: number;
  cfg?: number;
  qualityProfile?: 'draft' | 'final' | 'max' | 'followSettings';
};

export type PluginApplyModelPayload = {
  model: string;
};

export type PluginApplyQualityPayload = {
  qualityProfile: 'draft' | 'final' | 'max' | 'followSettings';
};

export async function applyPromptFromPlugin(
  pluginId: string,
  payload: PluginApplyPromptPayload
): Promise<{ ok: boolean; message: string }> {
  const prompt = payload.prompt?.trim();
  if (!prompt) {
    return { ok: false, message: 'Plugin apply-prompt requires a non-empty prompt.' };
  }
  rememberToolDraft({
    toolKey: `plugin:${pluginId}`,
    label: `Plugin · ${pluginId}`,
    href: `/plugins/${encodeURIComponent(pluginId)}`,
    text: prompt,
  });
  return { ok: true, message: 'Prompt applied — open Generate or Studio to continue.' };
}

export async function applyModelFromPlugin(
  payload: PluginApplyModelPayload
): Promise<{ ok: boolean; message: string }> {
  const model = payload.model?.trim();
  if (!model) {
    return { ok: false, message: 'Plugin apply-model requires a model id.' };
  }
  const shared = loadSettingsCache().shared;
  saveSharedSettings({ ...shared, model: model as typeof shared.model }, { notify: true });
  return { ok: true, message: `Model set to ${model}.` };
}

export async function applyQualityFromPlugin(
  payload: PluginApplyQualityPayload
): Promise<{ ok: boolean; message: string }> {
  const profile = normalizeQueueQualityProfile(payload.qualityProfile);
  const shared = loadSettingsCache().shared;
  saveSharedSettings({ ...shared, queueQualityProfile: profile }, { notify: true });
  return { ok: true, message: `Quality profile set to ${profile}.` };
}

export function buildPluginHostContextSnapshot(input: {
  pluginId: string;
  pluginLabel?: string;
  tool?: string;
  prompt?: string;
}): import('./plugin-iframe-host').PluginIframeHostContext {
  const shared = loadSettingsCache().shared;
  return {
    pluginId: input.pluginId,
    pluginLabel: input.pluginLabel,
    model: shared.model,
    tool: input.tool,
    prompt: input.prompt,
    qualityProfile: shared.queueQualityProfile,
    sessionActiveLoraIds: resolveSharedEffectiveSessionLoraIds(shared.model),
    selectedWorkflowFileId: shared.selectedWorkflowFileId,
  };
}

export async function queuePromptFromPlugin(
  pluginId: string,
  payload: PluginQueuePayload
): Promise<{ ok: boolean; message: string; promptId?: string }> {
  const prompt = payload.prompt?.trim();
  if (!prompt) {
    return { ok: false, message: 'Plugin queue requires a non-empty prompt.' };
  }

  const shared = loadSettingsCache().shared;
  const model = (payload.model?.trim() || shared.model) as string;

  const preflight = await runPluginQueuePreflight({
    event: 'queue-preflight',
    prompt,
    negativePrompt: payload.negativePrompt,
    model,
    tool: `plugin:${pluginId}`,
    denoise: payload.denoise,
    cfg: payload.cfg,
  });
  if (preflight.blocked) {
    return {
      ok: false,
      message:
        preflight.reason ||
        preflight.messages.join(' · ') ||
        'Plugin queue preflight blocked the job.',
    };
  }

  const queueParams: Record<string, string> = {};
  if (typeof payload.denoise === 'number' && Number.isFinite(payload.denoise)) {
    queueParams.denoise = String(payload.denoise);
  }
  if (typeof payload.cfg === 'number' && Number.isFinite(payload.cfg)) {
    queueParams.cfg = String(payload.cfg);
  }

  const result = await requeueComfyJob({
    prompt: preflight.payload.prompt || prompt,
    negativePrompt: preflight.payload.negativePrompt ?? payload.negativePrompt,
    model: preflight.payload.model || model,
    tool: `plugin:${pluginId}`,
    queueParams: Object.keys(queueParams).length > 0 ? queueParams : undefined,
    qualityProfile: payload.qualityProfile
      ? normalizeQueueQualityProfile(payload.qualityProfile)
      : undefined,
  });

  if (!result.ok) {
    return { ok: false, message: result.error ?? 'ComfyUI queue failed.' };
  }

  rememberToolDraft({
    toolKey: `plugin:${pluginId}`,
    label: `Plugin · ${pluginId}`,
    href: `/plugins/${encodeURIComponent(pluginId)}`,
    text: preflight.payload.prompt || prompt,
  });

  return {
    ok: true,
    message: result.held ? 'Max held until queue is idle.' : 'Queued from plugin.',
    promptId: result.promptId,
  };
}
