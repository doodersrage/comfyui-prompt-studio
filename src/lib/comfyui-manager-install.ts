import type { ComfyManagerPackSpec } from './comfyui-custom-node-registry';
import {
  parseComfyManagerMappings,
  parseComfyManagerNodeList,
  resolvePacksForMissingNodeTypes,
} from './comfyui-manager-mappings';

const MANAGER_PREFIXES = ['/api/manager', '/manager'] as const;
const CUSTOMNODE_PREFIXES = ['/api/customnode', '/customnode'] as const;

export type ComfyUiManagerInstallResult = {
  ok: boolean;
  installed: string[];
  unresolved: string[];
  restartNeeded: boolean;
  missingManager?: boolean;
  error?: string;
};

async function managerFetch(
  origin: string,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch
): Promise<Response | null> {
  try {
    return await fetchImpl(`${origin}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(20_000),
      redirect: 'manual',
    });
  } catch {
    return null;
  }
}

async function firstOkJson(
  origin: string,
  paths: string[],
  init: RequestInit,
  fetchImpl: typeof fetch
): Promise<unknown | null> {
  for (const path of paths) {
    const response = await managerFetch(origin, path, init, fetchImpl);
    if (response?.ok) {
      return await response.json().catch(() => null);
    }
  }
  return null;
}

async function firstOkPost(
  origin: string,
  paths: string[],
  body: unknown,
  fetchImpl: typeof fetch
): Promise<boolean> {
  for (const path of paths) {
    const response = await managerFetch(
      origin,
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      fetchImpl
    );
    if (response && (response.ok || response.status === 202)) {
      return true;
    }
  }
  return false;
}

function queueIdle(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') {
    return false;
  }
  const record = raw as {
    is_processing?: boolean;
    total_count?: number;
    done_count?: number;
    in_progress_count?: number;
  };
  if (record.is_processing === true) {
    return false;
  }
  if ((record.in_progress_count ?? 0) > 0) {
    return false;
  }
  const total = record.total_count ?? 0;
  const done = record.done_count ?? 0;
  return total === 0 || done >= total;
}

async function waitForManagerQueueIdle(
  origin: string,
  fetchImpl: typeof fetch,
  timeoutMs = 60_000
): Promise<boolean> {
  const started = Date.now();
  const statusPaths = MANAGER_PREFIXES.map(prefix => `${prefix}/queue/status`);
  while (Date.now() - started < timeoutMs) {
    const status = await firstOkJson(origin, statusPaths, { method: 'GET' }, fetchImpl);
    if (status && queueIdle(status)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return false;
}

/**
 * Resolve missing node class types to Manager packs, queue install, and wait.
 * Caller should reboot ComfyUI after a successful install.
 */
export async function installComfyUiMissingNodePacks(input: {
  baseUrl: string;
  classTypes: string[];
  fetchImpl?: typeof fetch;
}): Promise<ComfyUiManagerInstallResult> {
  const origin = input.baseUrl.replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl ?? fetch;
  const classTypes = [...new Set(input.classTypes.map(type => type.trim()).filter(Boolean))];
  if (classTypes.length === 0) {
    return { ok: true, installed: [], unresolved: [], restartNeeded: false };
  }

  const mappingsRaw = await firstOkJson(
    origin,
    CUSTOMNODE_PREFIXES.map(prefix => `${prefix}/getmappings?mode=local`),
    { method: 'GET' },
    fetchImpl
  );
  const listRaw = await firstOkJson(
    origin,
    CUSTOMNODE_PREFIXES.map(prefix => `${prefix}/getlist?mode=local&skip_update=true`),
    { method: 'GET' },
    fetchImpl
  );

  if (mappingsRaw == null && listRaw == null) {
    const knownOnly = resolvePacksForMissingNodeTypes({
      classTypes,
      mappings: new Map(),
      catalog: [],
    });
    if (knownOnly.packs.length === 0) {
      return {
        ok: false,
        installed: [],
        unresolved: classTypes,
        restartNeeded: false,
        missingManager: true,
        error: 'ComfyUI-Manager is not available on this host.',
      };
    }
  }

  const resolved = resolvePacksForMissingNodeTypes({
    classTypes,
    mappings: parseComfyManagerMappings(mappingsRaw),
    catalog: parseComfyManagerNodeList(listRaw),
  });

  if (resolved.packs.length === 0) {
    return {
      ok: resolved.unresolved.length === 0,
      installed: [],
      unresolved: resolved.unresolved,
      restartNeeded: false,
      error:
        resolved.unresolved.length > 0
          ? `No Manager pack found for: ${resolved.unresolved.join(', ')}`
          : undefined,
    };
  }

  const installed: string[] = [];
  for (const pack of resolved.packs) {
    const queued = await firstOkPost(
      origin,
      MANAGER_PREFIXES.map(prefix => `${prefix}/queue/install`),
      packToInstallBody(pack),
      fetchImpl
    );
    const direct =
      queued ||
      (await firstOkPost(
        origin,
        CUSTOMNODE_PREFIXES.map(prefix => `${prefix}/install`),
        packToInstallBody(pack),
        fetchImpl
      ));
    if (direct) {
      installed.push(pack.title || pack.name);
    }
  }

  if (installed.length === 0) {
    return {
      ok: false,
      installed: [],
      unresolved: resolved.unresolved,
      restartNeeded: false,
      error: 'ComfyUI-Manager refused the install queue (security_level or missing Manager).',
    };
  }

  await firstOkPost(
    origin,
    MANAGER_PREFIXES.map(prefix => `${prefix}/queue/start`),
    {},
    fetchImpl
  );
  await waitForManagerQueueIdle(origin, fetchImpl);

  return {
    ok: true,
    installed,
    unresolved: resolved.unresolved,
    restartNeeded: true,
  };
}

function packToInstallBody(pack: ComfyManagerPackSpec): Record<string, unknown> {
  return {
    ...(pack.id ? { id: pack.id } : {}),
    name: pack.name,
    ...(pack.title ? { title: pack.title } : {}),
    files: pack.files,
    install_type: pack.install_type,
  };
}
