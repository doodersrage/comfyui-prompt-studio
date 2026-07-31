import type { EngineId, EngineOutputImage, EngineViewPathOptions } from './types';

/** Bounded per-URL cache to avoid re-allocating URLSearchParams across render passes. */
const _viewPathCacheMaxSize = 4096;
const _viewPathCache = new Map<string, string>();

function appendWidth(params: URLSearchParams, options?: EngineViewPathOptions): void {
  const width = options?.width;
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
    params.set('w', String(Math.min(Math.floor(width), 2048)));
  }
}

function buildCacheKey(
  engineId: EngineId | undefined,
  engineUrl: string,
  image: EngineOutputImage,
  width?: number
): string {
  return `${engineId ?? 'none'}::${engineUrl}::${image.filename}::${image.subfolder}::${image.type}::w=${width ?? -1}`;
}

/** Studio-proxied Diffusers view URL (mirrors Comfy view query shape). */
export function buildDiffusersViewPath(
  engineUrl: string,
  image: EngineOutputImage,
  options?: EngineViewPathOptions
): string {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
    engineUrl: engineUrl.replace(/\/+$/, ''),
  });
  appendWidth(params, options);
  return `/api/diffusers/view?${params.toString()}`;
}

export function buildEngineViewPath(
  engineId: EngineId | undefined,
  engineUrl: string,
  image: EngineOutputImage,
  options?: EngineViewPathOptions
): string {
  const cacheKey = buildCacheKey(engineId, engineUrl, image, options?.width);
  const cached = _viewPathCache.get(cacheKey);
  if (cached) return cached;

  let result: string;
  if (engineId === 'diffusers') {
    result = buildDiffusersViewPath(engineUrl, image, options);
  } else {
    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder,
      type: image.type,
      comfyUrl: engineUrl.replace(/\/+$/, ''),
    });
    appendWidth(params, options);
    result = `/api/comfyui/view?${params.toString()}`;
  }

  if (_viewPathCache.size >= _viewPathCacheMaxSize) {
    const half = Math.floor(_viewPathCacheMaxSize / 2);
    let evicted = 0;
    for (const k of _viewPathCache.keys()) {
      if (evicted >= half) break;
      _viewPathCache.delete(k);
      evicted += 1;
    }
  }
  _viewPathCache.set(cacheKey, result);
  return result;
}
