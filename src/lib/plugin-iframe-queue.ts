/**
 * Host-side handlers for plugin iframe postMessage queue / apply-prompt.
 */

import { requeueComfyJob } from './comfyui-requeue';
import { setComfyGalleryUserTags, loadComfyGallery } from './comfyui-gallery';
import { loadComfyUiSettings, saveComfyUiSettings } from './comfyui-settings';
import { normalizeEngineId, parseEngineId } from './engine/capabilities';
import { saveEngineSettings } from './engine-settings';
import { setSessionLoraIdsForModel } from './model-lora-map';
import { loadSettingsCache, saveSharedSettings } from './settings-cache';
import { rememberToolDraft } from './tool-draft-memory';
import { runPluginQueuePreflight } from './plugin-queue-hooks';
import { normalizeQueueQualityProfile } from './queue-quality-profile';
import { resolveSharedEffectiveSessionLoraIds } from './comfyui-settings';
import { normalizeCustomWorkflowTokens } from './comfyui-config';

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

export type PluginApplyEnginePayload = {
  engine: string;
};

export type PluginApplyLoraStackPayload = {
  loraIds: string[];
  model?: string;
};

export type PluginPatchWorkflowTokensPayload = {
  tokens: Array<{ token: string; value: string }>;
};

export type PluginWriteGalleryTagPayload = {
  tag: string;
  entryIds?: string[];
  mode?: 'add' | 'replace' | 'remove';
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

export async function applyEngineFromPlugin(
  payload: PluginApplyEnginePayload
): Promise<{ ok: boolean; message: string }> {
  const parsed = parseEngineId(payload.engine?.trim());
  if (!parsed) {
    return {
      ok: false,
      message: 'Plugin apply-engine requires a known engine id (comfyui, fal, replicate, …).',
    };
  }
  const engine = normalizeEngineId(parsed);
  saveEngineSettings({ engine });
  return { ok: true, message: `Inference engine set to ${engine}.` };
}

export async function applyLoraStackFromPlugin(
  payload: PluginApplyLoraStackPayload
): Promise<{ ok: boolean; message: string }> {
  if (!Array.isArray(payload.loraIds)) {
    return { ok: false, message: 'Plugin apply-lora-stack requires a loraIds array.' };
  }
  const ids = [
    ...new Set(
      payload.loraIds.map(id => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)
    ),
  ].slice(0, 48);
  const shared = loadSettingsCache().shared;
  const model = (payload.model?.trim() || shared.model || '').trim();
  if (!model) {
    return { ok: false, message: 'No active model — set a model before applying a LoRA stack.' };
  }
  saveSharedSettings(
    {
      ...shared,
      sessionActiveLoraIdsByModel: setSessionLoraIdsForModel(
        shared.sessionActiveLoraIdsByModel,
        model,
        ids
      ),
    },
    { notify: true }
  );
  return {
    ok: true,
    message: ids.length
      ? `LoRA stack set (${ids.length}) for ${model}.`
      : `LoRA stack cleared for ${model}.`,
  };
}

export async function patchWorkflowTokensFromPlugin(
  payload: PluginPatchWorkflowTokensPayload
): Promise<{ ok: boolean; message: string }> {
  if (!Array.isArray(payload.tokens) || payload.tokens.length === 0) {
    return { ok: false, message: 'Plugin patch-workflow-tokens requires a tokens array.' };
  }
  const incoming = normalizeCustomWorkflowTokens(
    payload.tokens
      .map(entry => ({
        token: typeof entry?.token === 'string' ? entry.token.trim() : '',
        value: typeof entry?.value === 'string' ? entry.value : String(entry?.value ?? ''),
      }))
      .filter(entry => entry.token)
      .slice(0, 64)
  );
  if (incoming.length === 0) {
    return { ok: false, message: 'No valid workflow tokens to patch.' };
  }
  const settings = loadComfyUiSettings();
  const byKey = new Map(
    (settings.customTokens ?? []).map(entry => [entry.token.replace(/^\{\{|\}\}$/g, ''), entry])
  );
  for (const entry of incoming) {
    const key = entry.token.replace(/^\{\{|\}\}$/g, '');
    byKey.set(key, {
      token: entry.token.includes('{{') ? entry.token : `{{${key}}}`,
      value: entry.value,
    });
  }
  saveComfyUiSettings({
    ...settings,
    customTokens: [...byKey.values()],
  });
  return { ok: true, message: `Patched ${incoming.length} workflow token(s).` };
}

export async function writeGalleryTagFromPlugin(
  payload: PluginWriteGalleryTagPayload
): Promise<{ ok: boolean; message: string }> {
  const tag = payload.tag?.trim();
  if (!tag) {
    return { ok: false, message: 'Plugin write-gallery-tag requires a tag.' };
  }
  const mode = payload.mode ?? 'add';
  let ids = (payload.entryIds ?? []).map(id => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    // Default: most recent gallery entry.
    const latest = loadComfyGallery()[0];
    if (!latest) {
      return { ok: false, message: 'Gallery is empty — nothing to tag.' };
    }
    ids = [latest.id];
  }
  setComfyGalleryUserTags(ids, [tag], mode);
  return {
    ok: true,
    message: `Tag “${tag}” ${mode === 'remove' ? 'removed from' : 'written on'} ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}.`,
  };
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
    engine: shared.inferenceEngine,
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
