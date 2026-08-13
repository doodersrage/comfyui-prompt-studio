/**
 * Browser-side ComfyUI-Manager install. Never import the server installer here.
 */

import { fetchComfyObjectInfoCached } from './comfyui-object-info-cache';
import {
  collectMissingNodeTypesFromIssues,
  collectMissingWorkflowNodeTypes,
  extractMissingNodeTypesFromMessage,
} from './workflow-node-type-audit';

export type ManagerInstallClientResult = {
  ok: boolean;
  installed: string[];
  unresolved: string[];
  restartRequested: boolean;
  missingManager?: boolean;
  message: string;
};

const emptyInstall = (): ManagerInstallClientResult => ({
  ok: true,
  installed: [],
  unresolved: [],
  restartRequested: false,
  message: '',
});

export async function requestComfyManagerInstall(input: {
  nodeTypes: string[];
  comfyUrl?: string;
  restart?: boolean;
}): Promise<ManagerInstallClientResult> {
  const nodeTypes = [...new Set(input.nodeTypes.map(type => type.trim()).filter(Boolean))];
  if (nodeTypes.length === 0) {
    return emptyInstall();
  }

  try {
    const response = await fetch('/api/comfyui/manager/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeTypes, comfyUrl: input.comfyUrl }),
    });
    const data = (await response.json().catch(() => null)) as {
      installed?: string[];
      unresolved?: string[];
      restartNeeded?: boolean;
      error?: string;
      missingManager?: boolean;
    } | null;
    const installed = data?.installed ?? [];
    const unresolved = data?.unresolved ?? nodeTypes;
    if (!response.ok) {
      return {
        ok: false,
        installed,
        unresolved,
        restartRequested: false,
        missingManager: data?.missingManager,
        message: data?.missingManager
          ? `Missing nodes: ${nodeTypes.join(', ')}. Install ComfyUI-Manager to auto-install packs.`
          : data?.error || `Could not install missing nodes: ${nodeTypes.join(', ')}.`,
      };
    }

    let restartRequested = false;
    if (input.restart !== false && data?.restartNeeded && installed.length > 0) {
      const { restartComfyUi } = await import('./comfyui-queue-control');
      const restart = await restartComfyUi(input.comfyUrl);
      restartRequested = restart.ok;
      if (restart.ok) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        await fetchComfyObjectInfoCached({
          comfyUrl: input.comfyUrl,
          forceRefresh: true,
        });
      }
    }

    const parts = [
      installed.length > 0 ? `Installed ${installed.join(', ')}.` : '',
      restartRequested ? 'ComfyUI restart requested.' : '',
      unresolved.length > 0 ? `Still missing: ${unresolved.join(', ')}.` : '',
    ].filter(Boolean);
    return {
      ok: true,
      installed,
      unresolved,
      restartRequested,
      message: parts.join(' '),
    };
  } catch (error) {
    return {
      ok: false,
      installed: [],
      unresolved: nodeTypes,
      restartRequested: false,
      message: error instanceof Error ? error.message : 'Custom node install failed.',
    };
  }
}

export async function installMissingWorkflowNodePacks(
  comfyUrl?: string
): Promise<ManagerInstallClientResult> {
  try {
    const { loadComfyWorkflowFiles } = await import('./comfyui-workflow-files');
    const objectInfo = await fetchComfyObjectInfoCached({
      comfyUrl,
      forceRefresh: true,
    });
    if (!objectInfo?.nodeTypes || objectInfo.nodeTypes.size === 0) {
      return emptyInstall();
    }
    const missing = collectMissingWorkflowNodeTypes(loadComfyWorkflowFiles(), objectInfo.nodeTypes);
    if (missing.length === 0) {
      return emptyInstall();
    }
    return requestComfyManagerInstall({ nodeTypes: missing, comfyUrl, restart: true });
  } catch {
    return emptyInstall();
  }
}

export async function resolveMissingNodeTypesForJob(entry: {
  id?: string;
  workflowJson?: string;
  statusMessage?: string;
  comfyUrl?: string;
}): Promise<string[]> {
  const fromMessage = extractMissingNodeTypesFromMessage(entry.statusMessage ?? '');
  let workflowJson = entry.workflowJson?.trim() || '';
  if (!workflowJson && entry.id) {
    try {
      const { getGalleryEntryById } = await import('./gallery-db-store');
      workflowJson = getGalleryEntryById(entry.id)?.workflowJson?.trim() || '';
    } catch {
      workflowJson = '';
    }
  }
  if (!workflowJson) {
    return fromMessage;
  }
  const objectInfo = await fetchComfyObjectInfoCached({ comfyUrl: entry.comfyUrl });
  if (objectInfo?.nodeTypes && objectInfo.nodeTypes.size > 0) {
    const missing = collectMissingWorkflowNodeTypes([{ workflowJson }], objectInfo.nodeTypes);
    return [...new Set([...missing, ...fromMessage])];
  }
  return fromMessage;
}

export async function tryInstallMissingNodesFromIssues(input: {
  issues: Array<{ message?: string; classType?: string }>;
  comfyUrl?: string;
}): Promise<ManagerInstallClientResult | null> {
  const nodeTypes = collectMissingNodeTypesFromIssues(input.issues);
  if (nodeTypes.length === 0) {
    return null;
  }
  return requestComfyManagerInstall({
    nodeTypes,
    comfyUrl: input.comfyUrl,
    restart: true,
  });
}

export async function listHealComfyUrls(primary?: string): Promise<string[]> {
  const { loadComfyUiSettings } = await import('./comfyui-settings');
  const { loadSettingsCache } = await import('./settings-cache');
  const { fetchComfyUiPoolUrlsForRetry } = await import('./oom-retry');
  const settings = loadComfyUiSettings();
  const extras = loadSettingsCache().shared.comfyPoolUrls ?? [];
  const fromHealth = await fetchComfyUiPoolUrlsForRetry();
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of [primary, settings.apiUrl, ...extras, ...fromHealth]) {
    const normalized = raw?.trim().replace(/\/+$/, '');
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    urls.push(normalized);
  }
  return urls;
}
