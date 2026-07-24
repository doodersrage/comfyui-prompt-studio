import type { ComfyGalleryJobStatus } from "./comfyui-gallery";

export type ComfyUiJobTrackerState = {
  promptId: string;
  status: ComfyGalleryJobStatus;
  statusMessage?: string;
  comfyUrl?: string;
  /** Which backend queued this job (drives status copy). */
  engineId?: import("./engine/types").EngineId;
  /** 1-based position in ComfyUI pending queue; 0 means running now. */
  queuePosition?: number | null;
  imageCount?: number;
  /** Current sampler/node progress value from ComfyUI WebSocket. */
  progressValue?: number;
  /** Progress denominator (e.g. total steps). */
  progressMax?: number;
  /** Active ComfyUI node id when known. */
  progressNode?: string | null;
  /** Object URL for the latest live latent preview frame. */
  previewUrl?: string | null;
};

export function comfyUiJobEngineLabel(
  job: Pick<ComfyUiJobTrackerState, "engineId" | "statusMessage">,
): string {
  if (job.engineId === "diffusers") {
    return "Diffusers";
  }
  if (job.statusMessage?.toLowerCase().includes("diffusers")) {
    return "Diffusers";
  }
  return "ComfyUI";
}

export function isComfyUiJobProcessing(
  job: ComfyUiJobTrackerState | null | undefined,
): boolean {
  return job?.status === "pending" || job?.status === "running";
}

export function comfyUiJobProgressPercent(
  job: Pick<ComfyUiJobTrackerState, "progressValue" | "progressMax"> | null | undefined,
): number | null {
  const value = job?.progressValue;
  const max = job?.progressMax;
  if (value == null || max == null || !(max > 0)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

export function formatComfyUiJobProgressLabel(
  job: Pick<
    ComfyUiJobTrackerState,
    "progressValue" | "progressMax" | "progressNode"
  > | null | undefined,
): string | null {
  const value = job?.progressValue;
  const max = job?.progressMax;
  if (value == null || max == null || !(max > 0)) {
    return null;
  }
  const safeMax = Math.max(1, Math.floor(max));
  const safeValue = Math.max(0, Math.min(Math.floor(value), safeMax));
  const step = `${safeValue}/${safeMax}`;
  return job?.progressNode ? `${step} · node ${job.progressNode}` : step;
}

export function formatComfyUiJobStatusLine(job: ComfyUiJobTrackerState): string {
  const parts: string[] = [];

  if (job.status === "running") {
    const progress = formatComfyUiJobProgressLabel(job);
    const engine = comfyUiJobEngineLabel(job);
    parts.push(progress ? `Running · ${progress}` : `Running in ${engine}`);
  } else if (job.status === "pending") {
    if (job.queuePosition != null && job.queuePosition > 0) {
      parts.push(`Queued · position ${job.queuePosition}`);
    } else {
      parts.push("Queued");
    }
  } else if (job.status === "completed") {
    parts.push("Completed");
    if (job.imageCount != null && job.imageCount > 0) {
      parts.push(`${job.imageCount} image(s)`);
    }
  } else if (job.status === "error") {
    parts.push("Error");
  }

  if (job.statusMessage?.trim()) {
    const normalized = job.statusMessage.trim();
    if (!parts.some((part) => normalized.toLowerCase().includes(part.toLowerCase()))) {
      parts.push(normalized);
    }
  }

  parts.push(`prompt_id ${job.promptId}`);
  if (job.comfyUrl?.trim()) {
    parts.push(job.comfyUrl.trim());
  }

  return parts.filter(Boolean).join(" · ");
}

export function comfyUiJobStatusLabel(job: ComfyUiJobTrackerState): string {
  if (job.status === "running") {
    const percent = comfyUiJobProgressPercent(job);
    if (percent != null) {
      return `Running · ${percent}%`;
    }
    if (job.progressValue != null && job.progressMax != null && job.progressMax > 0) {
      return `Running · ${job.progressValue}/${job.progressMax}`;
    }
    return "Running";
  }
  if (job.status === "pending") {
    if (job.queuePosition != null && job.queuePosition > 0) {
      return `Queued · #${job.queuePosition}`;
    }
    return "Queued";
  }
  if (job.status === "completed") {
    return "Completed";
  }
  return "Failed";
}
