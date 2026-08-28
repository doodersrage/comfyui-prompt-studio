'use client';

import { useCallback } from 'react';
import { runBatchLintGate } from '@/lib/batch-lint-gate';
import { registerComfyGalleryJob } from '@/lib/comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import { postComfyUiPrompt } from '@/lib/comfyui-queue-request';
import { resolveRuntimeForQueue } from '@/lib/comfyui-runtime-for-model';
import { resolveQueueNegativePrompt } from '@/lib/queue-negative';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { runWorkflowPreflight } from '@/lib/workflow-preflight';
import type { VariationGridInit } from '@/hooks/variation-grid/useVariationGridInit';

export function useVariationGridQueue(init: VariationGridInit) {
  const {
    shared,
    toolSettings,
    results,
    setQueueLoading,
    setComfyStatus,
    setQueueProgress,
    setLintSummary,
    setLintLoading,
  } = init;

  const executeQueue = useCallback(
    async (prompts: string[]) => {
      if (prompts.length === 0) {
        return;
      }

      setQueueLoading(true);
      setComfyStatus('Queueing variation grid…');
      setQueueProgress({
        phase: 'preflight',
        current: 0,
        total: prompts.length,
        message: 'Validating workflow…',
      });

      try {
        const negativePrompt = await resolveQueueNegativePrompt({
          model: shared.model,
          hints: toolSettings.hints?.trim(),
          tool: 'variations',
        });
        const preflight = await runWorkflowPreflight({
          model: shared.model,
          prompts,
          negativePrompt,
          tool: 'variations',
        });
        if (!preflight.ok) {
          throw new Error(
            preflight.issues
              .filter(issue => issue.severity === 'error')
              .map(issue => issue.message)
              .join(' · ') || 'Workflow pre-flight failed.'
          );
        }

        const { guardQueueQualityForVram } = await import('@/lib/vram-queue-guard');
        const { maybeHoldMaxGenerateJobs } = await import('@/lib/held-max-queue');
        const { toastHeldMax } = await import('@/lib/app-toast');
        const baseRuntime = resolveRuntimeForQueue(shared.model, 'variations');
        const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
        const runtime = vramGuard.runtime ?? baseRuntime;
        setQueueProgress({
          phase: 'queueing',
          current: 0,
          total: prompts.length,
        });
        const paramsPerPrompt = prompts.map((_, index) =>
          resolveQueueParams({
            model: shared.model,
            tool: 'variations',
            base: { seed: String(Math.floor(Math.random() * 2 ** 32) + index) },
            qualityProfile: vramGuard.profile,
          })
        );
        const held = await maybeHoldMaxGenerateJobs({
          profile: vramGuard.profile,
          jobs: prompts.map((prompt, index) => ({
            prompt,
            negativePrompt,
            model: shared.model,
            tool: 'variations',
            params: paramsPerPrompt[index],
            comfy: runtime,
          })),
        });
        if (held.held) {
          setQueueProgress(null);
          toastHeldMax({
            text: 'Max variations held until ComfyUI queue is idle',
            count: held.count,
          });
          return;
        }
        const queued = await postComfyUiPrompt({
          prompts,
          negativePrompt,
          paramsPerPrompt,
          ...(runtime ? { comfy: runtime } : {}),
        });

        const data = queued.raw as {
          queued?: number;
          error?: string;
          comfyUrl?: string;
          results?: Array<{ promptId?: string; comfyUrl?: string }>;
        };

        if (queued.status >= 400) {
          queued.releaseLiveSocket();
          throw new Error(queued.error ?? data.error ?? 'ComfyUI batch queue failed.');
        }

        for (const [index, result] of (data.results ?? []).entries()) {
          if (!result.promptId) {
            continue;
          }
          const comfyUrl =
            result.comfyUrl ?? data.comfyUrl ?? queued.comfyUrl ?? 'http://127.0.0.1:8188';
          registerComfyGalleryJob({
            promptId: result.promptId,
            prompt: prompts[index] ?? '',
            negativePrompt,
            tool: 'variations',
            model: shared.model,
            comfyUrl,
            clientId: queued.clientId,
            queueParams: paramsPerPrompt[index],
            queueQualityProfile: runtime.queueQualityProfile,
          });
          void scheduleComfyGalleryPoll(result.promptId, {
            comfyUrl,
            clientId: queued.clientId,
          });
        }
        queued.releaseLiveSocket();

        const queuedCount = data.queued ?? (data.results ?? []).filter(r => r.promptId).length;
        const failures = (data.results ?? [])
          .map((result, index) =>
            result.promptId
              ? null
              : {
                  label: results[index]?.rowLabel ?? `Row ${index + 1}`,
                  message: 'No promptId returned',
                }
          )
          .filter(Boolean) as Array<{ label: string; message: string }>;

        setQueueProgress({
          phase: 'done',
          current: queuedCount,
          total: prompts.length,
          message: `Queued ${queuedCount}/${prompts.length}`,
          failures: failures.length > 0 ? failures : undefined,
        });

        setComfyStatus(
          `Queued ${queuedCount}/${prompts.length} · ${data.comfyUrl ?? queued.comfyUrl ?? ''}`.trim()
        );
        setLintSummary(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'ComfyUI queue failed.';
        setQueueProgress({
          phase: 'error',
          current: 0,
          total: prompts.length,
          message,
        });
        setComfyStatus(message);
      } finally {
        setQueueLoading(false);
      }
    },
    [
      results,
      setComfyStatus,
      setLintSummary,
      setQueueLoading,
      setQueueProgress,
      shared.model,
      toolSettings.hints,
    ]
  );

  const queueGrid = useCallback(async () => {
    const prompts = results.map(entry => entry.prompt.trim()).filter(Boolean);
    if (prompts.length === 0) {
      return;
    }

    setLintLoading(true);
    try {
      const summary = await runBatchLintGate(
        results.map(entry => ({ prompt: entry.prompt, topic: entry.rowLabel })),
        toolSettings.hints
      );
      setLintSummary(summary);
    } finally {
      setLintLoading(false);
    }
  }, [results, setLintLoading, setLintSummary, toolSettings.hints]);

  return { executeQueue, queueGrid };
}
