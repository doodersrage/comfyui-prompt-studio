import { spawn, type ChildProcess } from "node:child_process";
import { NextResponse } from "next/server";
import { apiError, apiJson } from "@/lib/api/response";
import {
  createTrainJob,
  normalizeTrainJob,
  registerTrainJobLora,
  type TrainJob,
} from "@/lib/lora-train-job";
import type { LoraLibraryEntry } from "@/lib/lora-stack";
import { assertSafeHttpUrl } from "@/lib/url-safety";

export const runtime = "nodejs";

type StartBody = {
  action?: "start";
  trigger?: string;
  outputPath?: string;
  datasetPath?: string;
  baseModel?: string;
  /** From Settings UI; env TRAINER_URL wins when set. */
  trainerUrl?: string;
  /** From Settings UI; env TRAINER_COMMAND wins when set. */
  trainerCommand?: string;
};

type CompleteBody = {
  action: "complete";
  jobId?: string;
  outputPath?: string;
  trigger?: string;
  progress?: number;
  error?: string;
  /** Current browser LoRA library — registration is pure and returned for the client to persist. */
  library?: LoraLibraryEntry[];
  sessionActiveLoraIds?: string[];
  activateInSession?: boolean;
  label?: string;
};

type ProgressBody = {
  action: "progress";
  jobId?: string;
  progress?: number;
  status?: TrainJob["status"];
  error?: string;
  outputPath?: string;
};

type LoraTrainBody = StartBody | CompleteBody | ProgressBody;

/** Process-local job map (app owns the loop; client also mirrors into settings-cache). */
const serverJobs = new Map<string, TrainJob>();
const childByJobId = new Map<string, ChildProcess>();

function listServerJobs(): TrainJob[] {
  return [...serverJobs.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

function saveJob(job: TrainJob): TrainJob {
  const normalized = normalizeTrainJob(job)!;
  serverJobs.set(normalized.id, normalized);
  return normalized;
}

function resolveTrainerTargets(body: StartBody): {
  url: string;
  command: string;
} {
  const envUrl = process.env.TRAINER_URL?.trim() ?? "";
  const envCommand = process.env.TRAINER_COMMAND?.trim() ?? "";
  return {
    url: envUrl || body.trainerUrl?.trim() || "",
    command: envCommand || body.trainerCommand?.trim() || "",
  };
}

/** Split a command string into argv without invoking a shell. */
function splitCommandArgv(command: string): string[] {
  const matches = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return matches.map((part) => {
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'"))
    ) {
      return part.slice(1, -1);
    }
    return part;
  });
}

async function postTrainerWebhook(
  url: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const safeUrl = assertSafeHttpUrl(url, {
    // Local kohya / sd-scripts runners are almost always on LAN or loopback.
    allowPrivate: true,
  });
  const response = await fetch(safeUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Trainer webhook returned HTTP ${response.status}.`);
  }
}

function spawnTrainerCommand(
  command: string,
  job: TrainJob,
  extras: { datasetPath?: string; baseModel?: string },
): void {
  const argv = splitCommandArgv(command);
  const bin = argv[0];
  if (!bin) {
    throw new Error("Trainer command is empty.");
  }
  const args = [
    ...argv.slice(1),
    ...(extras.datasetPath ? ["--dataset", extras.datasetPath] : []),
    ...(job.outputPath ? ["--output", job.outputPath] : []),
    ...(job.trigger ? ["--trigger", job.trigger] : []),
    ...(extras.baseModel ? ["--base-model", extras.baseModel] : []),
    "--job-id",
    job.id,
  ];

  const child = spawn(bin, args, {
    shell: false,
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  childByJobId.set(job.id, child);

  child.on("error", (error) => {
    saveJob({
      ...job,
      status: "error",
      error: error.message || "Failed to spawn trainer process.",
    });
    childByJobId.delete(job.id);
  });

  child.on("exit", (code, signal) => {
    childByJobId.delete(job.id);
    const current = serverJobs.get(job.id);
    if (!current || current.status === "completed" || current.status === "error") {
      return;
    }
    if (code === 0) {
      saveJob({
        ...current,
        status: "completed",
        progress: 1,
      });
    } else {
      saveJob({
        ...current,
        status: "error",
        error: `Trainer exited with code ${code ?? "null"}${
          signal ? ` (signal ${signal})` : ""
        }.`,
      });
    }
  });
}

async function handleStart(body: StartBody) {
  const { url, command } = resolveTrainerTargets(body);
  const trigger = body.trigger?.trim() ?? "";
  const outputPath = body.outputPath?.trim() ?? "";
  const commandOrUrl = url || command || "manual";

  let job = createTrainJob({
    trigger,
    outputPath,
    commandOrUrl,
    status: "pending",
    progress: 0,
  });

  if (url) {
    job = saveJob({ ...job, status: "running", progress: 0.05 });
    try {
      await postTrainerWebhook(url, {
        jobId: job.id,
        trigger: job.trigger,
        outputPath: job.outputPath,
        datasetPath: body.datasetPath?.trim() || undefined,
        baseModel: body.baseModel?.trim() || undefined,
        callbackHint: "POST /api/lora-train with action=complete when finished",
      });
      job = saveJob({ ...job, status: "running", progress: 0.1 });
    } catch (error) {
      job = saveJob({
        ...job,
        status: "error",
        error:
          error instanceof Error ? error.message : "Trainer webhook failed.",
      });
    }
    return job;
  }

  if (command) {
    job = saveJob({ ...job, status: "running", progress: 0.05 });
    try {
      spawnTrainerCommand(command, job, {
        datasetPath: body.datasetPath?.trim(),
        baseModel: body.baseModel?.trim(),
      });
    } catch (error) {
      job = saveJob({
        ...job,
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to spawn trainer command.",
      });
    }
    return job;
  }

  // Neither TRAINER_URL nor TRAINER_COMMAND — record a manual job awaiting POST complete.
  return saveJob({
    ...job,
    status: "manual",
    progress: 0,
    commandOrUrl: "manual",
  });
}

function handleProgress(body: ProgressBody) {
  const jobId = body.jobId?.trim();
  if (!jobId) {
    throw new Error("jobId is required.");
  }
  const existing = serverJobs.get(jobId);
  if (!existing) {
    throw new Error(`Unknown train job: ${jobId}`);
  }
  return saveJob({
    ...existing,
    progress:
      typeof body.progress === "number" ? body.progress : existing.progress,
    status: body.status ?? existing.status,
    outputPath: body.outputPath?.trim() || existing.outputPath,
    error: body.error?.trim() || existing.error,
  });
}

function handleComplete(body: CompleteBody) {
  const jobId = body.jobId?.trim();
  if (!jobId) {
    throw new Error("jobId is required.");
  }
  const existing = serverJobs.get(jobId) ?? createTrainJob({ id: jobId });
  if (body.error?.trim()) {
    const failed = saveJob({
      ...existing,
      status: "error",
      error: body.error.trim(),
      outputPath: body.outputPath?.trim() || existing.outputPath,
      trigger: body.trigger?.trim() || existing.trigger,
    });
    return { job: failed, registered: false as const };
  }

  const ready = saveJob({
    ...existing,
    status: "completed",
    progress: 1,
    outputPath: body.outputPath?.trim() || existing.outputPath,
    trigger: body.trigger?.trim() || existing.trigger,
    error: undefined,
  });

  if (!ready.outputPath.trim()) {
    return { job: ready, registered: false as const };
  }

  const registered = registerTrainJobLora(body.library, ready, {
    activateInSession: body.activateInSession === true,
    sessionActiveLoraIds: body.sessionActiveLoraIds,
    label: body.label,
  });
  saveJob(registered.job);
  return {
    job: registered.job,
    registered: true as const,
    entry: registered.entry,
    library: registered.library,
    sessionActiveLoraIds: registered.sessionActiveLoraIds,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("id")?.trim();
  const envUrl = Boolean(process.env.TRAINER_URL?.trim());
  const envCommand = Boolean(process.env.TRAINER_COMMAND?.trim());

  if (jobId) {
    const job = serverJobs.get(jobId);
    if (!job) {
      return apiError(`Unknown train job: ${jobId}`, 404);
    }
    return apiJson({
      job,
      trainer: { envUrl, envCommand },
    });
  }

  return apiJson({
    jobs: listServerJobs(),
    trainer: { envUrl, envCommand },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoraTrainBody;
    const action = body.action ?? "start";

    if (action === "start") {
      const job = await handleStart(body as StartBody);
      return apiJson({ ok: true, job, jobs: listServerJobs() });
    }

    if (action === "progress") {
      const job = handleProgress(body as ProgressBody);
      return apiJson({ ok: true, job, jobs: listServerJobs() });
    }

    if (action === "complete") {
      const result = handleComplete(body as CompleteBody);
      return apiJson({ ok: true, ...result, jobs: listServerJobs() });
    }

    return apiError(`Unknown action: ${String(action)}`, 400);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "LoRA train request failed.",
      400,
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

