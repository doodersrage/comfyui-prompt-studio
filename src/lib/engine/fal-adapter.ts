'use client';

import { loadEngineSettings } from '@/lib/engine-settings';
import { loadSettingsCache } from '@/lib/settings-cache';
import { createComfyUiClientId } from '@/lib/comfyui-websocket';
import { FAL_QUEUE_HOST } from './capabilities';
import { buildFalViewPath } from './view-paths';
import type {
  EngineAdapter,
  EngineJobStatus,
  EngineOutputImage,
  EngineProgressSubscription,
  EngineQueueResult,
  EngineStatusResult,
  EngineSubscribeProgressInput,
  EngineUploadInput,
  EngineViewPathOptions,
} from './types';

function normalizeJobStatus(status: string | undefined): EngineJobStatus {
  if (
    status === 'pending' ||
    status === 'running' ||
    status === 'completed' ||
    status === 'error'
  ) {
    return status;
  }
  return 'unknown';
}

function createNoopSubscription(clientId: string): EngineProgressSubscription {
  return {
    close: () => undefined,
    ready: Promise.resolve(),
    setPromptId: () => undefined,
    clientId,
  };
}

function sessionFalApiKey(): string | undefined {
  const key = loadSettingsCache().shared.sessionFalApiKey?.trim();
  return key || undefined;
}

async function fetchFalStatusViaProxy(promptId: string): Promise<EngineStatusResult | null> {
  const params = new URLSearchParams({ promptId });
  const response = await fetch(`/api/fal/status?${params.toString()}`);
  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const resolvedUrl = (typeof raw.engineUrl === 'string' && raw.engineUrl.trim()) || FAL_QUEUE_HOST;
  if (response.status === 404) {
    return {
      promptId,
      status: 'error',
      statusMessage:
        typeof raw.error === 'string' && raw.error.trim() ? raw.error.trim() : 'Fal job not found.',
      engineUrl: resolvedUrl,
    };
  }
  if (!response.ok) {
    return null;
  }
  const images = Array.isArray(raw.images) ? (raw.images as EngineOutputImage[]) : undefined;
  return {
    promptId,
    status: normalizeJobStatus(typeof raw.status === 'string' ? raw.status : undefined),
    statusMessage: typeof raw.statusMessage === 'string' ? raw.statusMessage : undefined,
    engineUrl: resolvedUrl,
    images,
    queuePosition:
      typeof raw.queuePosition === 'number' || raw.queuePosition === null
        ? (raw.queuePosition as number | null)
        : undefined,
    progressValue: typeof raw.progressValue === 'number' ? raw.progressValue : undefined,
    progressMax: typeof raw.progressMax === 'number' ? raw.progressMax : undefined,
  };
}

/** Fal cloud adapter: txt2img / img2img via `/api/fal`. No workflow graph. */
export const falEngineAdapter: EngineAdapter = {
  id: 'fal',

  async postPrompt(body: Record<string, unknown>): Promise<EngineQueueResult> {
    const settings = loadEngineSettings();
    const clientId =
      (typeof body.clientId === 'string' && body.clientId.trim()) || createComfyUiClientId();
    const falApiKey =
      (typeof body.falApiKey === 'string' && body.falApiKey.trim()) || sessionFalApiKey();
    const params =
      body.params && typeof body.params === 'object' && !Array.isArray(body.params)
        ? (body.params as Record<string, unknown>)
        : {};

    const payload = {
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      model: typeof body.model === 'string' ? body.model : settings.falModel,
      img2imgModel: settings.falImg2ImgModel,
      falApiKey,
      clientId,
      hasInputImage: body.hasInputImage === true,
      inputImageFilename:
        (typeof body.inputImageFilename === 'string' && body.inputImageFilename.trim()) ||
        (typeof params.inputImageFilename === 'string' && params.inputImageFilename.trim()) ||
        undefined,
      params: {
        seed: params.seed,
        width: params.width,
        height: params.height,
        steps: params.steps,
        cfg: params.cfg,
        denoise: params.denoise,
      },
    };

    try {
      const response = await fetch('/api/fal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const promptId = typeof raw.promptId === 'string' ? raw.promptId.trim() : undefined;
      const engineUrl =
        (typeof raw.engineUrl === 'string' && raw.engineUrl.trim()) || FAL_QUEUE_HOST;

      if (!response.ok || !promptId) {
        return {
          ok: false,
          status: response.status,
          error: typeof raw.error === 'string' ? raw.error : 'Fal queue failed.',
          href:
            typeof raw.href === 'string'
              ? raw.href
              : '/settings?tab=comfyui&section=inference-engine',
          engineUrl,
          engineId: 'fal',
          raw,
          releaseLiveSocket: () => undefined,
        };
      }

      return {
        ok: true,
        status: response.status,
        promptId,
        clientId: (typeof raw.clientId === 'string' && raw.clientId.trim()) || clientId,
        engineUrl,
        engineId: 'fal',
        workflowSource: 'fal',
        raw,
        releaseLiveSocket: () => undefined,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Fal queue failed.',
        engineId: 'fal',
        raw: {},
        releaseLiveSocket: () => undefined,
      };
    }
  },

  async fetchJobStatus(promptId: string): Promise<EngineStatusResult | null> {
    return fetchFalStatusViaProxy(promptId);
  },

  buildViewPath(
    engineUrl: string,
    image: EngineOutputImage,
    options?: EngineViewPathOptions
  ): string {
    return buildFalViewPath(engineUrl, image, options);
  },

  async uploadInputImage(input: EngineUploadInput) {
    const { compressImageForEngineUpload } = await import('@/lib/browser-compress-image');
    const prepared = await compressImageForEngineUpload(input.file, {
      maxEdge: 2048,
      maxBytes: 3_500_000,
      quality: 0.9,
    });
    const formData = new FormData();
    formData.append('image', prepared, prepared.name);
    const response = await fetch('/api/fal/upload', {
      method: 'POST',
      body: formData,
    });
    const data = (await response.json()) as {
      name?: string;
      subfolder?: string;
      type?: string;
      error?: string;
    };
    if (!response.ok || !data.name?.trim()) {
      throw new Error(data.error ?? 'Fal image upload failed.');
    }
    return {
      name: data.name.trim(),
      subfolder: data.subfolder?.trim() || undefined,
      type: data.type?.trim() || undefined,
    };
  },

  subscribeProgress(input: EngineSubscribeProgressInput): EngineProgressSubscription {
    const clientId = input.clientId?.trim() || createComfyUiClientId();
    let promptId = input.promptId?.trim() || '';
    let closed = false;

    const poll = async () => {
      if (closed || !promptId) {
        return;
      }
      try {
        const status = await fetchFalStatusViaProxy(promptId);
        if (!status || closed) {
          return;
        }
        if (status.status === 'running' || status.status === 'pending') {
          input.onProgress({
            promptId,
            status: 'progress',
            message: status.statusMessage,
            value: status.progressValue,
            max: status.progressMax,
          });
          return;
        }
        if (status.status === 'completed') {
          input.onProgress({
            promptId,
            status: 'finished',
            message: status.statusMessage ?? 'Completed',
          });
          closed = true;
          clearInterval(timer);
          return;
        }
        if (status.status === 'error') {
          input.onProgress({
            promptId,
            status: 'error',
            message: status.statusMessage ?? 'Fal job failed.',
          });
          input.onError?.(status.statusMessage ?? 'Fal job failed.');
          closed = true;
          clearInterval(timer);
        }
      } catch (error) {
        input.onError?.(error instanceof Error ? error.message : 'Fal progress poll failed.');
      }
    };

    const timer = setInterval(() => {
      void poll();
    }, 1200);
    void poll();

    return {
      close: () => {
        closed = true;
        clearInterval(timer);
      },
      ready: Promise.resolve(),
      setPromptId: next => {
        promptId = next.trim();
      },
      clientId,
    };
  },

  async openProgressBeforeQueue(input) {
    return createNoopSubscription(input.clientId);
  },
};
