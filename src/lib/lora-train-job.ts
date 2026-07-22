import {
  createLoraLibraryEntryFromFilename,
  type LoraLibraryEntry,
} from "./lora-stack";

export type TrainJobStatus =
  | "pending"
  | "running"
  | "manual"
  | "completed"
  | "error";

export type TrainJob = {
  id: string;
  status: TrainJobStatus;
  /** 0–1 progress fraction. */
  progress: number;
  trigger: string;
  outputPath: string;
  commandOrUrl: string;
  createdAt: string;
  error?: string;
  loraLibraryId?: string;
};

export type LoraTrainTrainerPrefs = {
  trainerUrl?: string;
  trainerCommand?: string;
  outputDir?: string;
  baseModel?: string;
  /** When registering a completed job, also pin it into sessionActiveLoraIds. */
  activateOnRegister?: boolean;
};

export type LoraDatasetExportPrefs = {
  triggerWord?: string;
  captionMode?: "prompt" | "tags" | "vision";
};

const TRAIN_JOB_STATUSES = new Set<TrainJobStatus>([
  "pending",
  "running",
  "manual",
  "completed",
  "error",
]);

export function clampTrainProgress(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function normalizeTrainJobStatus(value: unknown): TrainJobStatus {
  if (typeof value === "string" && TRAIN_JOB_STATUSES.has(value as TrainJobStatus)) {
    return value as TrainJobStatus;
  }
  return "pending";
}

/** Normalize a raw job record; returns null when `id` is missing. */
export function normalizeTrainJob(raw: unknown): TrainJob | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) {
    return null;
  }
  const status = normalizeTrainJobStatus(record.status);
  const progress = clampTrainProgress(record.progress);
  const trigger = typeof record.trigger === "string" ? record.trigger.trim() : "";
  const outputPath =
    typeof record.outputPath === "string" ? record.outputPath.trim() : "";
  const commandOrUrl =
    typeof record.commandOrUrl === "string" ? record.commandOrUrl.trim() : "";
  const createdAt =
    typeof record.createdAt === "string" && record.createdAt.trim()
      ? record.createdAt.trim()
      : new Date(0).toISOString();
  const error =
    typeof record.error === "string" && record.error.trim()
      ? record.error.trim()
      : undefined;
  const loraLibraryId =
    typeof record.loraLibraryId === "string" && record.loraLibraryId.trim()
      ? record.loraLibraryId.trim()
      : undefined;

  return {
    id,
    status,
    progress: status === "completed" ? 1 : progress,
    trigger,
    outputPath,
    commandOrUrl,
    createdAt,
    ...(error ? { error } : {}),
    ...(loraLibraryId ? { loraLibraryId } : {}),
  };
}

export function normalizeTrainJobs(raw: unknown): TrainJob[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const jobs: TrainJob[] = [];
  for (const entry of raw) {
    const job = normalizeTrainJob(entry);
    if (job) {
      jobs.push(job);
    }
  }
  return jobs;
}

export function createTrainJob(input: {
  id?: string;
  status?: TrainJobStatus;
  progress?: number;
  trigger?: string;
  outputPath?: string;
  commandOrUrl?: string;
  createdAt?: string;
  error?: string;
}): TrainJob {
  const id =
    input.id?.trim() ||
    `train-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return normalizeTrainJob({
    id,
    status: input.status ?? "pending",
    progress: input.progress ?? 0,
    trigger: input.trigger ?? "",
    outputPath: input.outputPath ?? "",
    commandOrUrl: input.commandOrUrl ?? "",
    createdAt: input.createdAt ?? new Date().toISOString(),
    error: input.error,
  })!;
}

export function upsertTrainJob(jobs: TrainJob[], job: TrainJob): TrainJob[] {
  const normalized = normalizeTrainJob(job);
  if (!normalized) {
    return normalizeTrainJobs(jobs);
  }
  const next = normalizeTrainJobs(jobs).filter((entry) => entry.id !== normalized.id);
  next.unshift(normalized);
  return next.slice(0, 40);
}

/**
 * Register a completed train job's weight into the LoRA library.
 * Pure — callers persist library / session ids / updated job themselves.
 */
export function registerTrainJobLora(
  library: LoraLibraryEntry[] | undefined,
  job: TrainJob,
  options?: {
    activateInSession?: boolean;
    sessionActiveLoraIds?: string[];
    label?: string;
  },
): {
  library: LoraLibraryEntry[];
  entry: LoraLibraryEntry;
  job: TrainJob;
  sessionActiveLoraIds?: string[];
} {
  const existing = library ?? [];
  const filename = job.outputPath.trim();
  if (!filename) {
    throw new Error("Train job has no outputPath to register.");
  }

  const entry = createLoraLibraryEntryFromFilename(filename, existing);
  entry.triggerPhrase = job.trigger.trim();
  entry.enabled = true;
  if (options?.label?.trim()) {
    entry.label = options.label.trim();
  }

  const nextLibrary = [...existing, entry];
  const nextJob: TrainJob = {
    ...normalizeTrainJob(job)!,
    status: "completed",
    progress: 1,
    loraLibraryId: entry.id,
    error: undefined,
  };

  let sessionActiveLoraIds = options?.sessionActiveLoraIds;
  if (options?.activateInSession) {
    const current = sessionActiveLoraIds ?? [];
    sessionActiveLoraIds = current.includes(entry.id)
      ? current
      : [...current, entry.id];
  }

  return {
    library: nextLibrary,
    entry,
    job: nextJob,
    ...(sessionActiveLoraIds !== undefined ? { sessionActiveLoraIds } : {}),
  };
}

/**
 * Short stub prompt for a post-train validation queue.
 * Includes the trigger so the new LoRA can be visually smoke-tested.
 */
export function buildLoraTrainValidationPrompt(trigger: string): string {
  const word = trigger.trim() || "subject";
  return `${word}, standing portrait, soft studio light, sharp focus, natural skin`;
}

export function normalizeLoraDatasetExportPrefs(
  raw: unknown,
): LoraDatasetExportPrefs {
  if (!raw || typeof raw !== "object") {
    return { captionMode: "prompt" };
  }
  const record = raw as Record<string, unknown>;
  const triggerWord =
    typeof record.triggerWord === "string" ? record.triggerWord.trim() : "";
  const modeRaw =
    typeof record.captionMode === "string"
      ? record.captionMode.trim().toLowerCase()
      : "prompt";
  const captionMode =
    modeRaw === "tags" || modeRaw === "vision" ? modeRaw : "prompt";
  return {
    ...(triggerWord ? { triggerWord } : {}),
    captionMode,
  };
}

export function normalizeLoraTrainTrainerPrefs(
  raw: unknown,
): LoraTrainTrainerPrefs {
  if (!raw || typeof raw !== "object") {
    return { activateOnRegister: true };
  }
  const record = raw as Record<string, unknown>;
  return {
    trainerUrl:
      typeof record.trainerUrl === "string" ? record.trainerUrl.trim() : "",
    trainerCommand:
      typeof record.trainerCommand === "string"
        ? record.trainerCommand.trim()
        : "",
    outputDir:
      typeof record.outputDir === "string" ? record.outputDir.trim() : "",
    baseModel:
      typeof record.baseModel === "string" ? record.baseModel.trim() : "",
    activateOnRegister: record.activateOnRegister !== false,
  };
}
