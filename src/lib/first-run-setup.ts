/**
 * Client-side first-run / Heal & ready helpers.
 * Enables system workflows and adapts loader maps from Comfy inventory when reachable.
 */

import {
  formatModelCheckpointMap,
  formatModelRefinerMap,
  formatModelVaeMap,
  mergeSuggestedLoaderMaps,
} from './model-checkpoint-map';
import { formatModelUpscaleMap } from './model-upscale-map';
import { formatModelControlNetMap } from './model-controlnet-map';
import { loadSettingsCache, saveSettingsCache, setUseSystemWorkflowsPref } from './settings-cache';
import { whenBrowserStorageReady, flushBrowserStorageNow } from './browser-storage';
import { loadComfyUiSettings } from './comfyui-settings';
import { fetchComfyObjectInfoCached } from './comfyui-object-info-cache';
import { syncLoaderMapsFromInventory } from './loader-map-inventory-sync';
import {
  markOnboardingComfyHealthOk,
  markOnboardingLlmHealthOk,
  markOnboardingSystemWorkflowsEnabled,
} from './onboarding-hooks';

export type FirstRunSetupResult = {
  ok: boolean;
  message: string;
  comfyOk: boolean;
  systemWorkflowsEnabled: boolean;
  mapsAdapted: boolean;
  llmOk?: boolean;
  nodesInstalled?: string[];
  nodesUnresolved?: string[];
  restartRequested?: boolean;
};

/** Turn on system workflows and adapt maps (suggested + live inventory when available). */
export async function enableSystemWorkflowsAndHeal(options?: {
  comfyUrl?: string;
}): Promise<FirstRunSetupResult> {
  await whenBrowserStorageReady();
  const cache = loadSettingsCache();
  const shared = {
    ...cache.shared,
    useSystemWorkflows: true,
    ...(cache.shared.queueQualityProfile === 'followSettings' ||
    cache.shared.queueQualityProfile == null
      ? { queueQualityProfile: 'final' as const }
      : {}),
  };

  const suggested = mergeSuggestedLoaderMaps({
    checkpointMap: shared.modelCheckpointMap,
    vaeMap: shared.modelVaeMap,
    refinerMap: shared.modelRefinerMap,
  });
  shared.modelCheckpointMap = suggested.modelCheckpointMap;
  shared.modelVaeMap = suggested.modelVaeMap;
  shared.modelRefinerMap = suggested.modelRefinerMap;

  await setUseSystemWorkflowsPref(true, {
    queueQualityProfile:
      cache.shared.queueQualityProfile === 'followSettings' ||
      cache.shared.queueQualityProfile == null
        ? 'final'
        : cache.shared.queueQualityProfile,
  });
  saveSettingsCache({
    ...loadSettingsCache(),
    shared: {
      ...loadSettingsCache().shared,
      modelCheckpointMap: shared.modelCheckpointMap,
      modelVaeMap: shared.modelVaeMap,
      modelRefinerMap: shared.modelRefinerMap,
    },
  });
  markOnboardingSystemWorkflowsEnabled();
  await flushBrowserStorageNow();

  const settings = loadComfyUiSettings();
  const comfyUrl = options?.comfyUrl?.trim() || settings.apiUrl?.trim() || undefined;

  try {
    const { scanAndAdaptSystemWorkflowInventory } = await import('./comfyui-runtime-for-model');
    const models = await scanAndAdaptSystemWorkflowInventory({
      comfyUrl,
      persist: true,
    });
    if (models) {
      const adapted = loadSettingsCache().shared;
      const objectInfo = await fetchComfyObjectInfoCached({
        comfyUrl,
        forceRefresh: true,
      });
      if (objectInfo?.models) {
        const synced = syncLoaderMapsFromInventory({
          models: objectInfo.models,
          checkpointMap: adapted.modelCheckpointMap,
          vaeMap: adapted.modelVaeMap,
          upscaleMap: adapted.modelUpscaleMap,
          controlNetMap: adapted.modelControlNetMap,
          healMissing: true,
        });
        const next = loadSettingsCache();
        saveSettingsCache({
          ...next,
          shared: {
            ...next.shared,
            modelCheckpointMap: synced.modelCheckpointMap,
            modelVaeMap: synced.modelVaeMap,
            modelUpscaleMap: synced.modelUpscaleMap,
            modelControlNetMap: synced.modelControlNetMap,
          },
        });
        await flushBrowserStorageNow();
      }
      const nodeHeal = await installMissingWorkflowNodePacks(comfyUrl);
      return {
        ok: true,
        comfyOk: true,
        systemWorkflowsEnabled: true,
        mapsAdapted: true,
        message: [
          'Saved — system workflows on. Loader maps adapted from ComfyUI inventory.',
          nodeHeal.message,
        ]
          .filter(Boolean)
          .join(' '),
        nodesInstalled: nodeHeal.installed,
        nodesUnresolved: nodeHeal.unresolved,
        restartRequested: nodeHeal.restartRequested,
      };
    }
  } catch {
    // fall through
  }

  return {
    ok: true,
    comfyOk: false,
    systemWorkflowsEnabled: true,
    mapsAdapted: false,
    message:
      'Saved — system workflows on. ComfyUI not reachable yet; maps adapt on next connection.',
  };
}

/** Refresh health + enable/heal in one shot for Settings Overview / welcome. */
export async function runHealAndReady(options?: {
  comfyUrl?: string;
}): Promise<FirstRunSetupResult> {
  let llmOk = false;
  let comfyOk = false;
  try {
    const params = new URLSearchParams();
    if (options?.comfyUrl?.trim()) {
      params.set('comfyUrl', options.comfyUrl.trim());
    }
    const query = params.toString();
    const response = await fetch(query ? `/api/health?${query}` : '/api/health');
    const health = (await response.json()) as {
      llm?: { ok?: boolean };
      comfyui?: { ok?: boolean };
    };
    llmOk = Boolean(health.llm?.ok);
    comfyOk = Boolean(health.comfyui?.ok);
    if (llmOk) {
      markOnboardingLlmHealthOk();
    }
    if (comfyOk) {
      markOnboardingComfyHealthOk();
    }
  } catch {
    // continue heal attempt
  }

  const heal = await enableSystemWorkflowsAndHeal(options);
  return {
    ...heal,
    comfyOk: heal.comfyOk || comfyOk,
    llmOk,
    message: [
      llmOk ? 'LLM ok' : 'LLM not ready',
      heal.comfyOk || comfyOk ? 'ComfyUI ok' : 'ComfyUI unreachable',
      heal.message,
    ].join(' · '),
  };
}

/** Refresh Settings textareas after heal. */
export function readAdaptedLoaderMapTexts(): {
  checkpoint: string;
  vae: string;
  refiner: string;
  upscale: string;
  controlNet: string;
} {
  const shared = loadSettingsCache().shared;
  return {
    checkpoint: formatModelCheckpointMap(shared.modelCheckpointMap),
    vae: formatModelVaeMap(shared.modelVaeMap),
    refiner: formatModelRefinerMap(shared.modelRefinerMap),
    upscale: formatModelUpscaleMap(shared.modelUpscaleMap),
    controlNet: formatModelControlNetMap(shared.modelControlNetMap),
  };
}

async function installMissingWorkflowNodePacks(comfyUrl?: string): Promise<{
  message: string;
  installed: string[];
  unresolved: string[];
  restartRequested: boolean;
}> {
  try {
    const { loadComfyWorkflowFiles } = await import('./comfyui-workflow-files');
    const { collectMissingWorkflowNodeTypes } = await import('./workflow-node-type-audit');
    const objectInfo = await fetchComfyObjectInfoCached({
      comfyUrl,
      forceRefresh: true,
    });
    if (!objectInfo?.nodeTypes || objectInfo.nodeTypes.size === 0) {
      return { message: '', installed: [], unresolved: [], restartRequested: false };
    }
    const missing = collectMissingWorkflowNodeTypes(loadComfyWorkflowFiles(), objectInfo.nodeTypes);
    if (missing.length === 0) {
      return { message: '', installed: [], unresolved: [], restartRequested: false };
    }

    const response = await fetch('/api/comfyui/manager/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeTypes: missing, comfyUrl }),
    });
    const data = (await response.json().catch(() => null)) as {
      installed?: string[];
      unresolved?: string[];
      restartNeeded?: boolean;
      error?: string;
      missingManager?: boolean;
    } | null;
    const installed = data?.installed ?? [];
    const unresolved = data?.unresolved ?? missing;
    if (!response.ok) {
      return {
        message: data?.missingManager
          ? `Missing nodes: ${missing.join(', ')}. Install ComfyUI-Manager to auto-install packs.`
          : data?.error || `Could not install missing nodes: ${missing.join(', ')}.`,
        installed,
        unresolved,
        restartRequested: false,
      };
    }

    let restartRequested = false;
    if (data?.restartNeeded && installed.length > 0) {
      const { restartComfyUi } = await import('./comfyui-queue-control');
      const restart = await restartComfyUi(comfyUrl);
      restartRequested = restart.ok;
      if (restart.ok) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        await fetchComfyObjectInfoCached({ comfyUrl, forceRefresh: true });
      }
    }

    const parts = [
      installed.length > 0 ? `Installed ${installed.join(', ')}.` : '',
      restartRequested ? 'ComfyUI restart requested.' : '',
      unresolved.length > 0 ? `Still missing: ${unresolved.join(', ')}.` : '',
    ].filter(Boolean);
    return {
      message: parts.join(' '),
      installed,
      unresolved,
      restartRequested,
    };
  } catch {
    return { message: '', installed: [], unresolved: [], restartRequested: false };
  }
}
