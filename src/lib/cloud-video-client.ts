import 'server-only';

import { GEMINI_API_HOST, GROK_API_HOST, cloudEngineOption } from './engine/capabilities';
import { getLlmImageOutput, getLlmImageUpload, putLlmImageOutput } from './llm-image-cache';
import {
  cloudLlmModelToSubfolder,
  encodeCloudLlmPromptId,
  isAllowedGrokMediaUrl,
  newCloudLlmJobId,
  parseCloudLlmPromptId,
  providerErrorMessage,
  sanitizeCloudLlmModelId,
  type CloudLlmJobStatusName,
} from './llm-image-protocol';
import { resolveLlmImageApiToken, type LlmImageEngineId } from './llm-image-client';
import { DEFAULT_GEMINI_VIDEO_MODEL, DEFAULT_GROK_VIDEO_MODEL } from './cloud-video-models';

export {
  DEFAULT_GEMINI_VIDEO_MODEL,
  DEFAULT_GROK_VIDEO_MODEL,
  isCloudVideoModelId,
} from './cloud-video-models';

export type CloudVideoQueueInput = {
  prompt: string;
  model?: string;
  apiToken?: string;
  imageFilename?: string;
  width?: number;
  height?: number;
  durationSec?: number;
};

export type CloudVideoQueueResult = {
  ok: boolean;
  status: number;
  promptId?: string;
  engineUrl?: string;
  error?: string;
  raw: Record<string, unknown>;
};

type PendingVideoJob = {
  engineId: LlmImageEngineId;
  providerJobId: string;
  token: string;
  modelId: string;
  createdAt: number;
};

const pending = new Map<string, PendingVideoJob>();
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

function prunePending(): void {
  const now = Date.now();
  for (const [key, value] of pending) {
    if (now - value.createdAt > PENDING_TTL_MS) {
      pending.delete(key);
    }
  }
}

function hostFor(engineId: LlmImageEngineId): string {
  return (
    cloudEngineOption(engineId)?.host ?? (engineId === 'gemini' ? GEMINI_API_HOST : GROK_API_HOST)
  );
}

function defaultVideoModel(engineId: LlmImageEngineId): string {
  return engineId === 'gemini' ? DEFAULT_GEMINI_VIDEO_MODEL : DEFAULT_GROK_VIDEO_MODEL;
}

function isVideoEngine(id: string): id is Extract<LlmImageEngineId, 'grok' | 'gemini'> {
  return id === 'grok' || id === 'gemini';
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function imageDataUrl(filename: string): string | undefined {
  const name = filename.trim();
  if (!name) {
    return undefined;
  }
  const upload = getLlmImageUpload(name);
  return `data:${upload.mimeType};base64,${upload.bytes.toString('base64')}`;
}

export async function queueCloudVideo(
  engineId: LlmImageEngineId,
  input: CloudVideoQueueInput
): Promise<CloudVideoQueueResult> {
  if (!isVideoEngine(engineId)) {
    return {
      ok: false,
      status: 400,
      error: `${engineId} cannot queue clips.`,
      raw: {},
    };
  }
  const host = hostFor(engineId);
  let token: string;
  try {
    token = resolveLlmImageApiToken(engineId, input.apiToken);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'API key is required.',
      raw: {},
      engineUrl: host,
    };
  }
  let modelId: string;
  try {
    modelId = sanitizeCloudLlmModelId(
      input.model || defaultVideoModel(engineId),
      defaultVideoModel(engineId)
    );
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Invalid model id.',
      raw: {},
      engineUrl: host,
    };
  }

  try {
    const started =
      engineId === 'gemini'
        ? await startGeminiVideo(input, token, modelId)
        : await startGrokVideo(input, token, modelId);
    if (!started.ok || !started.providerJobId) {
      return {
        ok: false,
        status: started.status,
        error: started.error,
        raw: started.raw,
        engineUrl: host,
      };
    }
    const jobId = newCloudLlmJobId();
    const promptId = encodeCloudLlmPromptId(modelId, jobId);
    prunePending();
    pending.set(promptId, {
      engineId,
      providerJobId: started.providerJobId,
      token,
      modelId,
      createdAt: Date.now(),
    });
    return { ok: true, status: started.status, promptId, engineUrl: host, raw: started.raw };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'Video queue failed.',
      raw: {},
      engineUrl: host,
    };
  }
}

async function startGrokVideo(
  input: CloudVideoQueueInput,
  token: string,
  modelId: string
): Promise<{
  ok: boolean;
  status: number;
  providerJobId?: string;
  error?: string;
  raw: Record<string, unknown>;
}> {
  const duration = Math.max(1, Math.min(15, Math.round(input.durationSec ?? 8)));
  const body: Record<string, unknown> = {
    model: modelId,
    prompt: input.prompt.trim(),
    duration,
  };
  if (input.imageFilename?.trim()) {
    const url = imageDataUrl(input.imageFilename);
    if (url) {
      body.image = { url };
    }
  }
  const response = await fetch(`${GROK_API_HOST}/v1/videos/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const raw = await readJson(response);
  const requestId =
    (typeof raw.request_id === 'string' && raw.request_id.trim()) ||
    (typeof raw.id === 'string' && raw.id.trim()) ||
    '';
  if (!response.ok || !requestId) {
    return {
      ok: false,
      status: response.status || 502,
      error: providerErrorMessage(raw, `Grok video returned HTTP ${response.status}.`),
      raw,
    };
  }
  return { ok: true, status: response.status, providerJobId: requestId, raw };
}

async function startGeminiVideo(
  input: CloudVideoQueueInput,
  token: string,
  modelId: string
): Promise<{
  ok: boolean;
  status: number;
  providerJobId?: string;
  error?: string;
  raw: Record<string, unknown>;
}> {
  const instance: Record<string, unknown> = { prompt: input.prompt.trim() };
  if (input.imageFilename?.trim()) {
    const upload = getLlmImageUpload(input.imageFilename.trim());
    instance.image = {
      bytesBase64Encoded: upload.bytes.toString('base64'),
      mimeType: upload.mimeType,
    };
  }
  const response = await fetch(
    `${GEMINI_API_HOST}/v1beta/models/${encodeURIComponent(modelId)}:predictLongRunning?key=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [instance] }),
      signal: AbortSignal.timeout(60_000),
    }
  );
  const raw = await readJson(response);
  const name = (typeof raw.name === 'string' && raw.name.trim()) || '';
  if (!response.ok || !name) {
    return {
      ok: false,
      status: response.status || 502,
      error: providerErrorMessage(raw, `Gemini Veo returned HTTP ${response.status}.`),
      raw,
    };
  }
  return { ok: true, status: response.status, providerJobId: name, raw };
}

export async function fetchCloudVideoJobStatus(
  engineId: LlmImageEngineId,
  promptId: string
): Promise<{
  promptId: string;
  status: CloudLlmJobStatusName;
  statusMessage?: string;
  engineUrl: string;
  images?: Array<{ filename: string; subfolder: string; type: string; format?: string }>;
  progressValue?: number;
  progressMax?: number;
  queuePosition?: number | null;
} | null> {
  prunePending();
  const job = pending.get(promptId);
  const parsed = parseCloudLlmPromptId(promptId);
  if (!parsed) {
    return null;
  }
  const host = hostFor(engineId);
  const subfolder = cloudLlmModelToSubfolder(parsed.modelId);
  const cached = getLlmImageOutput(engineId, subfolder, `${parsed.jobId}.mp4`);
  if (cached) {
    return {
      promptId,
      status: 'completed',
      statusMessage: `Completed on ${cloudEngineOption(engineId)?.shortLabel ?? engineId}`,
      engineUrl: host,
      images: [{ filename: `${parsed.jobId}.mp4`, subfolder, type: 'output', format: 'video/mp4' }],
      progressValue: 1,
      progressMax: 1,
      queuePosition: null,
    };
  }
  if (!job || job.engineId !== engineId) {
    return null;
  }

  if (engineId === 'grok') {
    const response = await fetch(
      `${GROK_API_HOST}/v1/videos/${encodeURIComponent(job.providerJobId)}`,
      {
        headers: { Authorization: `Bearer ${job.token}` },
        signal: AbortSignal.timeout(45_000),
      }
    );
    const raw = await readJson(response);
    const status = String(raw.status ?? '').toLowerCase();
    if (status === 'done' || status === 'completed') {
      const video =
        raw.video && typeof raw.video === 'object' ? (raw.video as { url?: unknown }) : {};
      const url =
        typeof video.url === 'string' ? video.url : typeof raw.url === 'string' ? raw.url : '';
      if (!url || !isAllowedGrokMediaUrl(url)) {
        return {
          promptId,
          status: 'error',
          statusMessage: 'Grok finished without a video URL on an allowed host.',
          engineUrl: host,
        };
      }
      const download = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (!download.ok) {
        return {
          promptId,
          status: 'error',
          statusMessage: `Could not download Grok video (HTTP ${download.status}).`,
          engineUrl: host,
        };
      }
      const bytes = Buffer.from(await download.arrayBuffer());
      putLlmImageOutput({
        engineId,
        subfolder,
        filename: `${parsed.jobId}.mp4`,
        bytes,
        mimeType: 'video/mp4',
      });
      pending.delete(promptId);
      return {
        promptId,
        status: 'completed',
        engineUrl: host,
        images: [
          { filename: `${parsed.jobId}.mp4`, subfolder, type: 'output', format: 'video/mp4' },
        ],
        progressValue: 1,
        progressMax: 1,
        queuePosition: null,
      };
    }
    if (status === 'failed' || status === 'expired' || !response.ok) {
      pending.delete(promptId);
      return {
        promptId,
        status: 'error',
        statusMessage: providerErrorMessage(raw, `Grok video ${status || 'failed'}.`),
        engineUrl: host,
      };
    }
    return {
      promptId,
      status: status === 'pending' ? 'pending' : 'running',
      engineUrl: host,
      progressValue: 0,
      progressMax: 1,
      queuePosition: null,
    };
  }

  const response = await fetch(
    `${GEMINI_API_HOST}/v1beta/${job.providerJobId.replace(/^\/+/, '')}?key=${encodeURIComponent(job.token)}`,
    { signal: AbortSignal.timeout(45_000) }
  );
  const raw = await readJson(response);
  if (raw.done === true) {
    const videoB64 = extractGeminiVideoBase64(raw);
    if (!videoB64) {
      pending.delete(promptId);
      return {
        promptId,
        status: 'error',
        statusMessage: 'Gemini Veo finished without video bytes.',
        engineUrl: host,
      };
    }
    putLlmImageOutput({
      engineId,
      subfolder,
      filename: `${parsed.jobId}.mp4`,
      bytes: videoB64,
      mimeType: 'video/mp4',
    });
    pending.delete(promptId);
    return {
      promptId,
      status: 'completed',
      engineUrl: host,
      images: [{ filename: `${parsed.jobId}.mp4`, subfolder, type: 'output', format: 'video/mp4' }],
      progressValue: 1,
      progressMax: 1,
      queuePosition: null,
    };
  }
  if (raw.error && typeof raw.error === 'object') {
    pending.delete(promptId);
    return {
      promptId,
      status: 'error',
      statusMessage: providerErrorMessage(raw, 'Gemini Veo failed.'),
      engineUrl: host,
    };
  }
  return {
    promptId,
    status: 'running',
    engineUrl: host,
    progressValue: 0,
    progressMax: 1,
    queuePosition: null,
  };
}

function extractGeminiVideoBase64(raw: Record<string, unknown>): Buffer | null {
  const response =
    raw.response && typeof raw.response === 'object'
      ? (raw.response as Record<string, unknown>)
      : raw;
  const generated = (response.generatedVideos ?? response.generated_videos) as unknown;
  const first = Array.isArray(generated) ? generated[0] : undefined;
  const video =
    first && typeof first === 'object'
      ? ((first as { video?: { bytesBase64Encoded?: unknown; data?: unknown } }).video ?? first)
      : undefined;
  if (video && typeof video === 'object') {
    const b64 =
      (typeof (video as { bytesBase64Encoded?: unknown }).bytesBase64Encoded === 'string' &&
        (video as { bytesBase64Encoded: string }).bytesBase64Encoded) ||
      (typeof (video as { data?: unknown }).data === 'string' &&
        (video as { data: string }).data) ||
      '';
    if (b64) {
      return Buffer.from(b64, 'base64');
    }
  }
  return null;
}
