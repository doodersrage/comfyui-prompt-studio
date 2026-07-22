import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import {
  assetIsDownloadable,
  getCatalogAsset,
  isAllowlistedAssetUrl,
} from "./comfy-asset-catalog";
import {
  getComfyUiRoot,
  resolveAssetDestinationPath,
} from "./comfy-asset-paths";

export type ComfyAssetJobStatus =
  | "queued"
  | "downloading"
  | "verifying"
  | "complete"
  | "error";

export type ComfyAssetJob = {
  id: string;
  assetId: string;
  label: string;
  filename: string;
  status: ComfyAssetJobStatus;
  progress: number;
  bytesReceived: number;
  bytesTotal: number | null;
  error?: string;
  attempt?: number;
  destPath?: string;
  createdAt: string;
  updatedAt: string;
};

const jobs = new Map<string, ComfyAssetJob>();

/** Keep the Node process from exiting while downloads run (dev + `after()`). */
const downloadHandles = new Set<Promise<void>>();

/** One Hugging Face transfer at a time — parallel installs trip 429s. */
let downloadQueue: Promise<void> = Promise.resolve();

const MAX_ATTEMPTS = 5;
const STALL_MS = 90_000;
const CONNECT_TIMEOUT_MS = 60_000;
const TOTAL_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export function listComfyAssetJobs(): ComfyAssetJob[] {
  return [...jobs.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function getComfyAssetJob(id: string): ComfyAssetJob | undefined {
  return jobs.get(id);
}

/** Test helper — clears in-memory jobs and the serial queue. */
export function __resetComfyAssetJobsForTests(): void {
  jobs.clear();
  downloadHandles.clear();
  downloadQueue = Promise.resolve();
  pendingDownloadParams.clear();
}

function saveJob(job: ComfyAssetJob): ComfyAssetJob {
  const next = { ...job, updatedAt: new Date().toISOString() };
  jobs.set(next.id, next);
  return next;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const handle = await fsp.open(filePath, "r");
  try {
    const stream = handle.createReadStream();
    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function withDownloadQuery(urlString: string): string {
  try {
    const url = new URL(urlString);
    if (!url.searchParams.has("download")) {
      url.searchParams.set("download", "true");
    }
    return url.toString();
  } catch {
    return urlString;
  }
}

function buildDownloadHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/octet-stream,*/*",
    "User-Agent": "ComfyPromptStudio/1.0 (+local; curated model install)",
  };
  const hfToken =
    process.env.HF_TOKEN?.trim() || process.env.HUGGING_FACE_HUB_TOKEN?.trim();
  if (hfToken) {
    headers.Authorization = `Bearer ${hfToken}`;
  }
  return headers;
}

function retryAfterMs(response: Response, attempt: number): number {
  const raw = response.headers.get("retry-after");
  if (raw) {
    const asSeconds = Number(raw);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) {
      return Math.min(120_000, Math.max(1_000, asSeconds * 1000));
    }
    const asDate = Date.parse(raw);
    if (!Number.isNaN(asDate)) {
      return Math.min(120_000, Math.max(1_000, asDate - Date.now()));
    }
  }
  // 429/503: exponential backoff with jitter, capped.
  const base = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
  return base + Math.floor(Math.random() * 500);
}

function httpErrorMessage(status: number, statusText: string): string {
  if (status === 429) {
    return `Hugging Face rate-limited this download (HTTP 429). Wait a bit, or set HF_TOKEN and retry one file at a time.`;
  }
  if (status === 503) {
    return `Hugging Face is temporarily unavailable (HTTP 503). Retry shortly.`;
  }
  if (status === 401 || status === 403) {
    return `Download failed with HTTP ${status} ${statusText}. Hugging Face may require HF_TOKEN for this file, or the URL is blocked.`;
  }
  return `Download failed with HTTP ${status} ${statusText}.`.trim();
}

export type StartComfyAssetDownloadOptions = {
  assetId: string;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
  root?: string | null;
  /**
   * When false, return the job without starting work (caller must invoke
   * `runComfyAssetDownloadJob`). Default starts immediately.
   */
  deferStart?: boolean;
};

/**
 * Start a curated weight download into COMFYUI_ROOT/models/….
 * Returns the job immediately; work continues in the background unless deferred.
 */
export function startComfyAssetDownload(
  options: StartComfyAssetDownloadOptions,
): ComfyAssetJob {
  const asset = getCatalogAsset(options.assetId);
  if (!asset) {
    throw new Error(`Unknown asset id: ${options.assetId}`);
  }
  if (!assetIsDownloadable(asset) || !asset.url) {
    throw new Error(
      `Asset “${asset.id}” has no allowlisted download URL — install the file manually.`,
    );
  }
  if (!isAllowlistedAssetUrl(asset.url)) {
    throw new Error("Download URL host is not allowlisted.");
  }

  const root = options.root !== undefined ? options.root : getComfyUiRoot();
  if (!root) {
    throw new Error(
      "COMFYUI_ROOT is not set. Point it at your ComfyUI install directory.",
    );
  }
  if (!fs.existsSync(root)) {
    throw new Error(`COMFYUI_ROOT does not exist: ${root}`);
  }

  const { destPath, partialPath, modelsDir } = resolveAssetDestinationPath({
    root,
    kind: asset.kind,
    filename: asset.filename,
  });

  if (fs.existsSync(destPath)) {
    const existing: ComfyAssetJob = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      label: asset.label,
      filename: asset.filename,
      status: "complete",
      progress: 1,
      bytesReceived: 0,
      bytesTotal: null,
      destPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return saveJob(existing);
  }

  // Reuse an in-flight job for the same asset instead of stacking duplicates.
  for (const existing of jobs.values()) {
    if (
      existing.assetId === asset.id &&
      (existing.status === "queued" ||
        existing.status === "downloading" ||
        existing.status === "verifying")
    ) {
      return existing;
    }
  }

  const job: ComfyAssetJob = {
    id: crypto.randomUUID(),
    assetId: asset.id,
    label: asset.label,
    filename: asset.filename,
    status: "queued",
    progress: 0,
    bytesReceived: 0,
    bytesTotal: asset.bytes ?? null,
    attempt: 0,
    destPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveJob(job);

  const params: DownloadParams = {
    url: asset.url,
    destPath,
    partialPath,
    modelsDir,
    expectedSha256: asset.sha256,
    expectedBytes: asset.bytes,
    fetchImpl: options.fetchImpl ?? fetch,
  };

  if (!options.deferStart) {
    scheduleComfyAssetDownloadJob(job.id, params);
  } else {
    pendingDownloadParams.set(job.id, params);
  }

  return job;
}

type DownloadParams = {
  url: string;
  destPath: string;
  partialPath: string;
  modelsDir: string;
  expectedSha256?: string;
  expectedBytes?: number;
  fetchImpl: typeof fetch;
};

const pendingDownloadParams = new Map<string, DownloadParams>();

/** Run a previously deferred job (used with Next.js `after()`). */
export function runComfyAssetDownloadJob(jobId: string): Promise<void> {
  const params = pendingDownloadParams.get(jobId);
  pendingDownloadParams.delete(jobId);
  if (!params) {
    const job = jobs.get(jobId);
    if (job && job.status === "queued") {
      saveJob({
        ...job,
        status: "error",
        error: "Download was deferred but parameters were lost.",
      });
    }
    return Promise.resolve();
  }
  return scheduleComfyAssetDownloadJob(jobId, params);
}

function scheduleComfyAssetDownloadJob(
  jobId: string,
  params: DownloadParams,
): Promise<void> {
  const run = () => runDownload({ jobId, ...params });
  const handle = downloadQueue
    .then(run, run)
    .finally(() => {
      downloadHandles.delete(handle);
    });
  downloadQueue = handle.catch(() => undefined);
  downloadHandles.add(handle);
  return handle;
}

async function fetchWithRetries(input: {
  jobId: string;
  url: string;
  fetchImpl: typeof fetch;
}): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const job = jobs.get(input.jobId);
    if (job) {
      saveJob({
        ...job,
        status: "downloading",
        attempt,
        error:
          attempt > 1
            ? `Retrying (attempt ${attempt}/${MAX_ATTEMPTS})…`
            : undefined,
      });
    }

    const connectController = new AbortController();
    const connectTimer = setTimeout(
      () => connectController.abort(),
      CONNECT_TIMEOUT_MS,
    );
    const overallTimer = setTimeout(
      () => connectController.abort(),
      TOTAL_TIMEOUT_MS,
    );

    try {
      const response = await input.fetchImpl(withDownloadQuery(input.url), {
        redirect: "follow",
        headers: buildDownloadHeaders(),
        signal: connectController.signal,
      });
      clearTimeout(connectTimer);

      if (response.ok) {
        clearTimeout(overallTimer);
        // Caller owns the body; keep overall timer tied via stall watchdog instead.
        // Clear overall here — body read has its own stall detection.
        return response;
      }

      // Drain error bodies so sockets free promptly.
      try {
        await response.arrayBuffer();
      } catch {
        // ignore
      }

      if (
        (response.status === 429 || response.status === 503) &&
        attempt < MAX_ATTEMPTS
      ) {
        const waitMs = retryAfterMs(response, attempt);
        const waiting = jobs.get(input.jobId);
        if (waiting) {
          saveJob({
            ...waiting,
            status: "downloading",
            attempt,
            progress: 0,
            error: `HTTP ${response.status} — waiting ${Math.ceil(waitMs / 1000)}s before retry ${attempt + 1}/${MAX_ATTEMPTS}…`,
          });
        }
        clearTimeout(overallTimer);
        await sleep(waitMs);
        continue;
      }

      clearTimeout(overallTimer);
      throw new Error(httpErrorMessage(response.status, response.statusText));
    } catch (error) {
      clearTimeout(connectTimer);
      clearTimeout(overallTimer);
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.name === "TimeoutError" ||
          /aborted|timeout/i.test(error.message));
      lastError =
        error instanceof Error
          ? aborted
            ? new Error(
                `Connection stalled or timed out talking to Hugging Face (attempt ${attempt}/${MAX_ATTEMPTS}).`,
              )
            : error
          : new Error("Download failed.");

      if (aborted && attempt < MAX_ATTEMPTS) {
        const waiting = jobs.get(input.jobId);
        if (waiting) {
          saveJob({
            ...waiting,
            status: "downloading",
            attempt,
            error: `${lastError.message} Retrying…`,
          });
        }
        await sleep(retryAfterMs(new Response(null, { status: 503 }), attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("Download failed after retries.");
}

async function runDownload(input: {
  jobId: string;
  url: string;
  destPath: string;
  partialPath: string;
  modelsDir: string;
  expectedSha256?: string;
  expectedBytes?: number;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const current = jobs.get(input.jobId);
  if (!current) {
    return;
  }

  let received = 0;
  let total: number | null = input.expectedBytes ?? null;
  let lastProgressWrite = 0;
  let contentLength = 0;

  try {
    await fsp.mkdir(path.dirname(input.destPath), { recursive: true });
    await fsp.mkdir(input.modelsDir, { recursive: true });

    saveJob({
      ...current,
      status: "downloading",
      progress: 0,
      error: undefined,
      attempt: 1,
    });

    // Resume-friendly: drop any leftover partial before a fresh attempt chain.
    try {
      await fsp.unlink(input.partialPath);
    } catch {
      // ignore
    }

    const response = await fetchWithRetries({
      jobId: input.jobId,
      url: input.url,
      fetchImpl: input.fetchImpl,
    });

    if (!response.body) {
      throw new Error("Download response had no body.");
    }

    contentLength = Number(response.headers.get("content-length") || 0);
    const linkedSize = Number(response.headers.get("x-linked-size") || 0);
    total =
      contentLength > 0
        ? contentLength
        : linkedSize > 0
          ? linkedSize
          : (input.expectedBytes ?? null);

    const started = jobs.get(input.jobId);
    if (started) {
      saveJob({
        ...started,
        status: "downloading",
        error: undefined,
        bytesTotal: total,
      });
    }

    const file = fs.createWriteStream(input.partialPath);
    const reader = response.body.getReader();

    try {
      while (true) {
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
              stallTimer = setTimeout(() => {
                reject(new Error("stall"));
              }, STALL_MS);
            }),
          ]);
        } catch (error) {
          if (error instanceof Error && error.message === "stall") {
            try {
              await reader.cancel("stall");
            } catch {
              // ignore
            }
            throw new Error(
              `Download stalled — no data for ${Math.round(STALL_MS / 1000)}s. Retry the install.`,
            );
          }
          throw error;
        } finally {
          if (stallTimer) {
            clearTimeout(stallTimer);
          }
        }

        const { done, value } = result;
        if (done) {
          break;
        }
        if (!value?.byteLength) {
          continue;
        }
        received += value.byteLength;
        const now = Date.now();
        if (now - lastProgressWrite >= 250) {
          lastProgressWrite = now;
          const job = jobs.get(input.jobId);
          if (job) {
            const progress =
              total && total > 0
                ? Math.min(0.99, received / total)
                : Math.min(0.95, 0.05 + received / (500 * 1024 * 1024));
            saveJob({
              ...job,
              status: "downloading",
              bytesReceived: received,
              bytesTotal: total,
              progress,
              error: undefined,
            });
          }
        }
        const ok = file.write(Buffer.from(value));
        if (!ok) {
          await new Promise<void>((resolve) => file.once("drain", () => resolve()));
        }
      }
    } finally {
      file.end();
      await finished(file);
    }

    const verifying = jobs.get(input.jobId);
    if (!verifying) {
      return;
    }
    saveJob({
      ...verifying,
      status: "verifying",
      progress: 0.99,
      bytesReceived: received,
      bytesTotal: total,
      error: undefined,
    });

    if (
      input.expectedBytes != null &&
      contentLength <= 0 &&
      received !== input.expectedBytes
    ) {
      throw new Error(
        `Size mismatch: expected ${input.expectedBytes} bytes, got ${received}.`,
      );
    }
    if (input.expectedSha256) {
      const digest = await sha256File(input.partialPath);
      if (digest.toLowerCase() !== input.expectedSha256.toLowerCase()) {
        throw new Error("SHA-256 mismatch after download.");
      }
    }

    await fsp.rename(input.partialPath, input.destPath);
    const done = jobs.get(input.jobId);
    if (done) {
      saveJob({
        ...done,
        status: "complete",
        progress: 1,
        bytesReceived: received,
        bytesTotal: total ?? received,
        destPath: input.destPath,
        error: undefined,
      });
    }
  } catch (error) {
    try {
      await fsp.unlink(input.partialPath);
    } catch {
      // ignore cleanup errors
    }
    const failed = jobs.get(input.jobId);
    if (failed) {
      const message =
        error instanceof Error ? error.message : "Download failed.";
      saveJob({
        ...failed,
        status: "error",
        bytesReceived: received,
        bytesTotal: total,
        error: message,
      });
    }
  }
}
