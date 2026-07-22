"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/ViewState";
import { FieldLabel, TextInput } from "@/components/ui/Field";
import {
  loadComfyUiSettings,
  saveComfyUiSettings,
} from "@/lib/comfyui-settings";
import {
  buildLoraTrainValidationPrompt,
  createTrainJob,
  normalizeLoraTrainTrainerPrefs,
  normalizeTrainJobs,
  registerTrainJobLora,
  upsertTrainJob,
  type LoraTrainTrainerPrefs,
  type TrainJob,
} from "@/lib/lora-train-job";
import {
  loadSettingsCache,
  saveSharedSettings,
} from "@/lib/settings-cache";

type LoraTrainPanelProps = {
  onStatus?: (message: string) => void;
};

function mergeJobs(local: TrainJob[], remote: TrainJob[]): TrainJob[] {
  let next = normalizeTrainJobs(local);
  for (const job of remote) {
    next = upsertTrainJob(next, job);
  }
  return next;
}

function formatProgress(progress: number): string {
  return `${Math.round(clampPercent(progress))}%`;
}

function clampPercent(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }
  return Math.min(100, Math.max(0, progress * 100));
}

function statusTone(status: TrainJob["status"]): string {
  switch (status) {
    case "completed":
      return "text-emerald-300";
    case "error":
      return "text-rose-300";
    case "running":
      return "text-sky-300";
    case "manual":
      return "text-amber-200";
    default:
      return "text-zinc-400";
  }
}

export default function LoraTrainPanel({ onStatus }: LoraTrainPanelProps) {
  const formId = useId();
  const [prefs, setPrefs] = useState<LoraTrainTrainerPrefs>(() =>
    normalizeLoraTrainTrainerPrefs(
      loadSettingsCache().shared.loraTrainTrainerPrefs,
    ),
  );
  const [jobs, setJobs] = useState<TrainJob[]>(() =>
    normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs),
  );
  const [trigger, setTrigger] = useState(
    () => loadSettingsCache().shared.loraDatasetExportPrefs?.triggerWord ?? "",
  );
  const [outputPath, setOutputPath] = useState(
    () => prefs.outputDir ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [envFlags, setEnvFlags] = useState<{ envUrl: boolean; envCommand: boolean }>(
    { envUrl: false, envCommand: false },
  );
  const [validationPrompt, setValidationPrompt] = useState<string | null>(null);

  const persistJobs = useCallback((nextJobs: TrainJob[]) => {
    const shared = loadSettingsCache().shared;
    saveSharedSettings({ ...shared, loraTrainJobs: nextJobs });
    setJobs(nextJobs);
  }, []);

  const persistPrefs = useCallback((next: LoraTrainTrainerPrefs) => {
    const normalized = normalizeLoraTrainTrainerPrefs(next);
    const shared = loadSettingsCache().shared;
    saveSharedSettings({ ...shared, loraTrainTrainerPrefs: normalized });
    setPrefs(normalized);
  }, []);

  const refreshFromServer = useCallback(async () => {
    try {
      const response = await fetch("/api/lora-train");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        jobs?: TrainJob[];
        trainer?: { envUrl?: boolean; envCommand?: boolean };
      };
      setEnvFlags({
        envUrl: Boolean(data.trainer?.envUrl),
        envCommand: Boolean(data.trainer?.envCommand),
      });
      const local = normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs);
      const merged = mergeJobs(local, data.jobs ?? []);
      persistJobs(merged);
    } catch {
      // offline / server cold — keep local jobs
    }
  }, [persistJobs]);

  useEffect(() => {
    void refreshFromServer();
    const timer = window.setInterval(() => {
      void refreshFromServer();
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [refreshFromServer]);

  const trainerHint = useMemo(() => {
    if (envFlags.envUrl) {
      return "Server TRAINER_URL is set — start will POST that webhook.";
    }
    if (envFlags.envCommand) {
      return "Server TRAINER_COMMAND is set — start will spawn that process (no shell).";
    }
    if (prefs.trainerUrl?.trim()) {
      return "Using Settings trainer URL (no TRAINER_URL env).";
    }
    if (prefs.trainerCommand?.trim()) {
      return "Using Settings trainer command (no TRAINER_COMMAND env).";
    }
    return "No trainer URL/command — start records a manual job; mark complete when weights exist.";
  }, [envFlags, prefs.trainerCommand, prefs.trainerUrl]);

  const startJob = useCallback(async () => {
    setBusy(true);
    setValidationPrompt(null);
    try {
      const response = await fetch("/api/lora-train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          trigger: trigger.trim(),
          outputPath: outputPath.trim() || prefs.outputDir?.trim() || "",
          baseModel: prefs.baseModel?.trim() || undefined,
          trainerUrl: prefs.trainerUrl?.trim() || undefined,
          trainerCommand: prefs.trainerCommand?.trim() || undefined,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        job?: TrainJob;
        jobs?: TrainJob[];
      };
      if (!response.ok) {
        throw new Error(data.error || "Failed to start train job.");
      }
      const local = normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs);
      const merged = mergeJobs(local, data.jobs ?? (data.job ? [data.job] : []));
      persistJobs(merged);
      const message =
        data.job?.status === "manual"
          ? `Manual train job ${data.job.id} recorded — register when the weight is ready.`
          : `Train job ${data.job?.id ?? ""} started (${data.job?.status ?? "pending"}).`;
      onStatus?.(message);
    } catch (error) {
      onStatus?.(
        error instanceof Error ? error.message : "Failed to start train job.",
      );
    } finally {
      setBusy(false);
    }
  }, [onStatus, outputPath, persistJobs, prefs, trigger]);

  const registerJob = useCallback(
    async (job: TrainJob) => {
      setBusy(true);
      setValidationPrompt(null);
      try {
        const settings = loadComfyUiSettings();
        const shared = loadSettingsCache().shared;
        const activate =
          prefs.activateOnRegister !== false;

        const response = await fetch("/api/lora-train", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "complete",
            jobId: job.id,
            outputPath: job.outputPath || outputPath.trim() || prefs.outputDir,
            trigger: job.trigger || trigger.trim(),
            library: settings.loraLibrary,
            sessionActiveLoraIds: shared.sessionActiveLoraIds,
            activateInSession: activate,
          }),
        });
        const data = (await response.json()) as {
          error?: string;
          job?: TrainJob;
          registered?: boolean;
          entry?: { id: string; label: string; triggerPhrase: string };
          library?: typeof settings.loraLibrary;
          sessionActiveLoraIds?: string[];
        };
        if (!response.ok) {
          throw new Error(data.error || "Failed to complete train job.");
        }

        let nextJob = data.job ?? job;
        if (data.registered && data.library) {
          saveComfyUiSettings({
            ...settings,
            loraLibrary: data.library,
          });
          if (activate && data.sessionActiveLoraIds) {
            saveSharedSettings({
              ...shared,
              sessionActiveLoraIds: data.sessionActiveLoraIds,
            });
          }
        } else if (job.outputPath.trim() || outputPath.trim()) {
          // Client-side register fallback when API did not return a library patch.
          const registered = registerTrainJobLora(
            settings.loraLibrary,
            {
              ...job,
              outputPath: job.outputPath || outputPath.trim(),
              trigger: job.trigger || trigger.trim(),
            },
            {
              activateInSession: activate,
              sessionActiveLoraIds: shared.sessionActiveLoraIds,
            },
          );
          saveComfyUiSettings({
            ...settings,
            loraLibrary: registered.library,
          });
          if (activate && registered.sessionActiveLoraIds) {
            saveSharedSettings({
              ...loadSettingsCache().shared,
              sessionActiveLoraIds: registered.sessionActiveLoraIds,
            });
          }
          nextJob = registered.job;
        }

        const nextJobs = upsertTrainJob(
          normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs),
          nextJob,
        );
        persistJobs(nextJobs);

        const prompt = buildLoraTrainValidationPrompt(
          nextJob.trigger || trigger,
        );
        setValidationPrompt(prompt);
        onStatus?.(
          data.entry
            ? `Registered LoRA “${data.entry.label || data.entry.id}” with trigger “${data.entry.triggerPhrase || nextJob.trigger}”.`
            : `Train job ${nextJob.id} marked complete.`,
        );
      } catch (error) {
        onStatus?.(
          error instanceof Error ? error.message : "Failed to register LoRA.",
        );
      } finally {
        setBusy(false);
      }
    },
    [onStatus, outputPath, persistJobs, prefs, trigger],
  );

  const markManualComplete = useCallback(
    (job: TrainJob) => {
      const path = job.outputPath.trim() || outputPath.trim() || prefs.outputDir?.trim();
      if (!path) {
        onStatus?.("Set an output path (LoRA filename) before registering.");
        return;
      }
      void registerJob({
        ...job,
        outputPath: path,
        trigger: job.trigger || trigger.trim(),
      });
    },
    [onStatus, outputPath, prefs.outputDir, registerJob, trigger],
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-400">
        GPU training runs out of process. This panel owns the loop: start an external
        trainer (webhook or command), track jobs, then register the weight into the
        LoRA library with its trigger.
      </p>

      <p className="type-caption text-zinc-500">{trainerHint}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-url`}>Trainer URL</FieldLabel>
          <TextInput
            id={`${formId}-url`}
            value={prefs.trainerUrl ?? ""}
            onChange={(event) =>
              persistPrefs({ ...prefs, trainerUrl: event.target.value })
            }
            placeholder="http://127.0.0.1:7860/train"
            disabled={envFlags.envUrl}
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-cmd`}>Trainer command</FieldLabel>
          <TextInput
            id={`${formId}-cmd`}
            value={prefs.trainerCommand ?? ""}
            onChange={(event) =>
              persistPrefs({ ...prefs, trainerCommand: event.target.value })
            }
            placeholder="/path/to/train_network.py --config …"
            disabled={envFlags.envCommand}
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel htmlFor={`${formId}-out`}>Output path / LoRA file</FieldLabel>
          <TextInput
            id={`${formId}-out`}
            value={outputPath}
            onChange={(event) => {
              setOutputPath(event.target.value);
              persistPrefs({ ...prefs, outputDir: event.target.value });
            }}
            placeholder="my_character_v1.safetensors"
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel htmlFor={`${formId}-base`}>Base model (optional)</FieldLabel>
          <TextInput
            id={`${formId}-base`}
            value={prefs.baseModel ?? ""}
            onChange={(event) =>
              persistPrefs({ ...prefs, baseModel: event.target.value })
            }
            placeholder="qwen_image_2512_bf16.safetensors"
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-trigger`}>Trigger word</FieldLabel>
          <TextInput
            id={`${formId}-trigger`}
            value={trigger}
            onChange={(event) => setTrigger(event.target.value)}
            placeholder="ohwx person"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={prefs.activateOnRegister !== false}
          onChange={(event) =>
            persistPrefs({ ...prefs, activateOnRegister: event.target.checked })
          }
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-[var(--accent)]"
        />
        Activate in session LoRA stack on register
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={busy}
          onClick={() => void startJob()}
        >
          Start train job
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void refreshFromServer()}
        >
          Refresh status
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-zinc-400">Jobs</p>
        {jobs.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title="No train jobs yet"
            description="Export a dataset from Gallery, then start a job here (or record a manual one)."
            action={{
              label: "Start manual job",
              onClick: () => {
                const job = createTrainJob({
                  status: "manual",
                  trigger: trigger.trim(),
                  outputPath: outputPath.trim(),
                  commandOrUrl: "manual",
                });
                persistJobs(upsertTrainJob(jobs, job));
                onStatus?.(`Manual job ${job.id} recorded locally.`);
              },
            }}
          />
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="ui-surface-inset space-y-2 transition hover:border-[var(--border-subtle)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="type-heading truncate font-mono text-sm text-zinc-200">
                      {job.id}
                    </p>
                    <p className={`type-caption ${statusTone(job.status)}`}>
                      {job.status} · {formatProgress(job.progress)}
                      {job.trigger ? ` · trigger “${job.trigger}”` : ""}
                    </p>
                    {job.outputPath ? (
                      <p className="type-caption truncate font-mono text-zinc-500">
                        {job.outputPath}
                      </p>
                    ) : null}
                    {job.error ? (
                      <p className="type-caption text-rose-300">{job.error}</p>
                    ) : null}
                    {job.loraLibraryId ? (
                      <p className="type-caption text-emerald-300/90">
                        Library id: {job.loraLibraryId}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {job.status !== "completed" || !job.loraLibraryId ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => markManualComplete(job)}
                      >
                        Register LoRA
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900/80">
                  <div
                    className="h-full rounded-full bg-[var(--accent-muted)] transition-[width] duration-500"
                    style={{ width: `${clampPercent(job.progress)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {validationPrompt ? (
        <div className="ui-surface-inset space-y-2">
          <p className="type-heading text-zinc-200">Validation prompt (stub)</p>
          <p className="type-caption text-zinc-500">
            Optional smoke-test: queue this short prompt with the new LoRA enabled to
            confirm the trigger fires. Copy into Generate / Refine when ready.
          </p>
          <code className="block whitespace-pre-wrap rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200">
            {validationPrompt}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(validationPrompt);
                onStatus?.("Validation prompt copied.");
              } catch {
                onStatus?.("Could not copy validation prompt.");
              }
            }}
          >
            Copy prompt
          </Button>
        </div>
      ) : null}
    </div>
  );
}
