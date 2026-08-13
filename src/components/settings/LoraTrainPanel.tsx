'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { FieldLabel, TextInput } from '@/components/ui/Field';
import { loadComfyUiSettings, saveComfyUiSettings } from '@/lib/comfyui-settings';
import {
  buildLoraTrainValidationPrompt,
  createTrainJob,
  normalizeLoraTrainTrainerPrefs,
  normalizeTrainJobs,
  registerTrainJobLora,
  upsertTrainJob,
  type LoraTrainTrainerPrefs,
  type TrainJob,
} from '@/lib/lora-train-job';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { useAuth } from '@/hooks/useAuth';

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

function statusTone(status: TrainJob['status']): string {
  switch (status) {
    case 'completed':
      return 'text-[var(--tint-success-text)]';
    case 'error':
      return 'text-[var(--tint-danger-text)]';
    case 'running':
      return 'text-[var(--tint-info-text)]';
    case 'manual':
      return 'text-[var(--tint-warning-text)]';
    default:
      return 'text-[var(--text-muted)]';
  }
}

export default function LoraTrainPanel({ onStatus }: LoraTrainPanelProps) {
  const formId = useId();
  const auth = useAuth();
  const canEditTrainer = !auth?.authEnabled || Boolean(auth?.isAdmin);
  const [prefs, setPrefs] = useState<LoraTrainTrainerPrefs>(() =>
    normalizeLoraTrainTrainerPrefs(loadSettingsCache().shared.loraTrainTrainerPrefs)
  );
  const [jobs, setJobs] = useState<TrainJob[]>(() =>
    normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs)
  );
  const [trigger, setTrigger] = useState(
    () => loadSettingsCache().shared.loraDatasetExportPrefs?.triggerWord ?? ''
  );
  const [outputPath, setOutputPath] = useState(() => prefs.outputDir ?? '');
  const [busy, setBusy] = useState(false);
  const [envFlags, setEnvFlags] = useState<{ envUrl: boolean; envCommand: boolean }>({
    envUrl: false,
    envCommand: false,
  });
  const [validationPrompt, setValidationPrompt] = useState<string | null>(null);

  const queueValidationByPrompt = useCallback(
    async (prompt: string) => {
      const { postComfyUiPrompt } = await import('@/lib/comfyui-queue-request');
      const { resolveQueueNegativePrompt } = await import('@/lib/queue-negative');
      const { resolveQueueParams } = await import('@/lib/queue-params-settings');
      const { resolveRuntimeForQueue } = await import('@/lib/comfyui-runtime-for-model');
      const { registerComfyGalleryJob } = await import('@/lib/comfyui-gallery-client');
      const { scheduleComfyGalleryPoll } = await import('@/lib/comfyui-gallery-poller');
      const { shared } = loadSettingsCache();
      const negativePrompt = await resolveQueueNegativePrompt({
        model: shared.model,
        tool: 'generate',
      });
      const runtime = resolveRuntimeForQueue(shared.model, 'generate');
      const params = resolveQueueParams({
        model: shared.model,
        tool: 'generate',
      });
      onStatus?.('Queueing LoRA validation…');
      const queued = await postComfyUiPrompt({
        prompts: [prompt],
        negativePrompt,
        paramsPerPrompt: [params],
        ...(runtime ? { comfy: runtime } : {}),
      });
      const data = queued.raw as {
        results?: Array<{ promptId?: string; comfyUrl?: string }>;
        comfyUrl?: string;
      };
      const result = data.results?.[0];
      if (queued.status < 400 && result?.promptId) {
        registerComfyGalleryJob({
          promptId: result.promptId,
          prompt,
          negativePrompt,
          tool: 'lora-validation',
          model: shared.model,
          comfyUrl: result.comfyUrl ?? data.comfyUrl ?? queued.comfyUrl ?? 'http://127.0.0.1:8188',
          clientId: queued.clientId,
          queueParams: params,
        });
        void scheduleComfyGalleryPoll(result.promptId, {
          comfyUrl: result.comfyUrl ?? data.comfyUrl ?? queued.comfyUrl ?? 'http://127.0.0.1:8188',
          clientId: queued.clientId,
        });
        onStatus?.('Validation queued — check Gallery for output.');
      } else {
        onStatus?.('Validation queue failed.');
      }
      queued.releaseLiveSocket();
    },
    [onStatus]
  );

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
      const response = await fetch('/api/lora-train');
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
    scheduleAfterCommit(() => {
      void refreshFromServer();
    });
    const timer = window.setInterval(() => {
      void refreshFromServer();
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [refreshFromServer]);

  const trainerHint = useMemo(() => {
    if (envFlags.envUrl) {
      return 'Server TRAINER_URL is set — start will POST that webhook.';
    }
    if (envFlags.envCommand) {
      return 'Server TRAINER_COMMAND is set — start will spawn that process (no shell).';
    }
    if (prefs.trainerUrl?.trim()) {
      return 'Using Settings trainer URL (no TRAINER_URL env).';
    }
    if (prefs.trainerCommand?.trim()) {
      return 'Using Settings trainer command (no TRAINER_COMMAND env).';
    }
    return 'No trainer URL/command — start records a manual job; mark complete when weights exist.';
  }, [envFlags, prefs.trainerCommand, prefs.trainerUrl]);

  const startJob = useCallback(async () => {
    setBusy(true);
    setValidationPrompt(null);
    try {
      const response = await fetch('/api/lora-train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          trigger: trigger.trim(),
          outputPath: outputPath.trim() || prefs.outputDir?.trim() || '',
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
        throw new Error(data.error || 'Failed to start train job.');
      }
      const local = normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs);
      const merged = mergeJobs(local, data.jobs ?? (data.job ? [data.job] : []));
      persistJobs(merged);
      const message =
        data.job?.status === 'manual'
          ? `Manual train job ${data.job.id} recorded — register when the weight is ready.`
          : `Train job ${data.job?.id ?? ''} started (${data.job?.status ?? 'pending'}).`;
      onStatus?.(message);
    } catch (error) {
      onStatus?.(error instanceof Error ? error.message : 'Failed to start train job.');
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
        const activate = prefs.activateOnRegister !== false;

        const response = await fetch('/api/lora-train', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete',
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
          throw new Error(data.error || 'Failed to complete train job.');
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
            }
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
          nextJob
        );
        persistJobs(nextJobs);

        const prompt = buildLoraTrainValidationPrompt(nextJob.trigger || trigger);
        setValidationPrompt(prompt);
        if (prefs.autoQueueValidation) {
          void queueValidationByPrompt(prompt);
        }
        onStatus?.(
          data.entry
            ? `Registered LoRA “${data.entry.label || data.entry.id}” with trigger “${data.entry.triggerPhrase || nextJob.trigger}”.`
            : `Train job ${nextJob.id} marked complete.`
        );
      } catch (error) {
        onStatus?.(error instanceof Error ? error.message : 'Failed to register LoRA.');
      } finally {
        setBusy(false);
      }
    },
    [onStatus, outputPath, persistJobs, prefs, queueValidationByPrompt, trigger]
  );

  const markManualComplete = useCallback(
    (job: TrainJob) => {
      const path = job.outputPath.trim() || outputPath.trim() || prefs.outputDir?.trim();
      if (!path) {
        onStatus?.('Set an output path (LoRA filename) before registering.');
        return;
      }
      void registerJob({
        ...job,
        outputPath: path,
        trigger: job.trigger || trigger.trim(),
      });
    },
    [onStatus, outputPath, prefs.outputDir, registerJob, trigger]
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--text-muted)]">
        GPU training runs out of process. This panel owns the loop: start an external trainer
        (webhook or command), track jobs, then register the weight into the LoRA library with its
        trigger.
      </p>

      <p className="type-caption text-[var(--text-muted)]">{trainerHint}</p>
      <p className="type-caption text-[var(--text-muted)]">
        Env <code className="ui-inline-code">TRAINER_URL</code> /{' '}
        <code className="ui-inline-code">TRAINER_COMMAND</code> win until the Next.js process
        restarts. Settings values apply only when those env vars are unset. Studio never spawns a
        trainer from the browser.
      </p>
      {!canEditTrainer ? (
        <p className="type-caption text-[var(--tint-warning-text)]">
          Admin sign-in required to edit trainer URL or command.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-url`}>Trainer URL</FieldLabel>
          <TextInput
            id={`${formId}-url`}
            value={prefs.trainerUrl ?? ''}
            onChange={event => persistPrefs({ ...prefs, trainerUrl: event.target.value })}
            placeholder="http://127.0.0.1:7860/train"
            disabled={envFlags.envUrl || !canEditTrainer}
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-cmd`}>Trainer command</FieldLabel>
          <TextInput
            id={`${formId}-cmd`}
            value={prefs.trainerCommand ?? ''}
            onChange={event => persistPrefs({ ...prefs, trainerCommand: event.target.value })}
            placeholder="/path/to/train_network.py --config …"
            disabled={envFlags.envCommand || !canEditTrainer}
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel htmlFor={`${formId}-out`}>Output path / LoRA file</FieldLabel>
          <TextInput
            id={`${formId}-out`}
            value={outputPath}
            onChange={event => {
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
            value={prefs.baseModel ?? ''}
            onChange={event => persistPrefs({ ...prefs, baseModel: event.target.value })}
            placeholder="qwen_image_2512_bf16.safetensors"
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-trigger`}>Trigger word</FieldLabel>
          <TextInput
            id={`${formId}-trigger`}
            value={trigger}
            onChange={event => setTrigger(event.target.value)}
            placeholder="ohwx person"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={prefs.activateOnRegister !== false}
          onChange={event => persistPrefs({ ...prefs, activateOnRegister: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
        />
        Activate in session LoRA stack on register
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={prefs.autoQueueValidation === true}
          onChange={event => persistPrefs({ ...prefs, autoQueueValidation: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
        />
        Auto-queue validation render when a train job registers
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
        <p className="text-xs text-[var(--text-muted)]">Jobs</p>
        {jobs.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title="No train jobs yet"
            description="Export a dataset from Gallery, then start a job here (or record a manual one)."
            action={{
              label: 'Start manual job',
              onClick: () => {
                const job = createTrainJob({
                  status: 'manual',
                  trigger: trigger.trim(),
                  outputPath: outputPath.trim(),
                  commandOrUrl: 'manual',
                });
                persistJobs(upsertTrainJob(jobs, job));
                onStatus?.(`Manual job ${job.id} recorded locally.`);
              },
            }}
          />
        ) : (
          <ul className="space-y-3">
            {jobs.map(job => (
              <li
                key={job.id}
                className="ui-surface-inset space-y-2 transition hover:border-[var(--border-subtle)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="type-heading truncate font-mono text-sm text-[var(--text-primary)]">
                      {job.id}
                    </p>
                    <p className={`type-caption ${statusTone(job.status)}`}>
                      {job.status} · {formatProgress(job.progress)}
                      {job.trigger ? ` · trigger “${job.trigger}”` : ''}
                    </p>
                    {job.outputPath ? (
                      <p className="type-caption truncate font-mono text-[var(--text-muted)]">
                        {job.outputPath}
                      </p>
                    ) : null}
                    {job.error ? (
                      <p className="type-caption text-[var(--tint-danger-text)]">{job.error}</p>
                    ) : null}
                    {job.loraLibraryId ? (
                      <p className="type-caption text-[var(--tint-success-text)]">
                        Library id: {job.loraLibraryId}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {job.status !== 'completed' || !job.loraLibraryId ? (
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
                <div className="ui-progress-track">
                  <div
                    className="ui-progress-fill"
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
          <p className="type-heading text-[var(--text-primary)]">Validation prompt</p>
          <p className="type-caption text-[var(--text-muted)]">
            Smoke-test the new LoRA with a short portrait prompt. Queue directly or copy into
            Generate / Refine.
          </p>
          <code className="block whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/60 px-3 py-2 text-sm text-[var(--text-primary)]">
            {validationPrompt}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="accent-outline"
              size="sm"
              onClick={() => {
                void queueValidationByPrompt(validationPrompt);
              }}
            >
              Queue validation
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(validationPrompt);
                  onStatus?.('Validation prompt copied.');
                } catch {
                  onStatus?.('Could not copy validation prompt.');
                }
              }}
            >
              Copy prompt
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
